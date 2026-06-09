import { supabaseAdmin as supabase } from '../../config/supabaseClient.js';

interface SaleItem {
  productId: string;
  quantity: number;
}

interface BranchStockItem extends SaleItem {
  inventoryId: string;
  stockBefore: number;
  stockAfter: number;
}

export interface BranchStockSalePlan {
  branchId: string;
  items: BranchStockItem[];
}

type StockResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

function aggregateSaleItems(items: any[]): StockResult<SaleItem[]> {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, code: 'EMPTY_CART', message: 'Keranjang belanja masih kosong' };
  }

  const quantities = new Map<string, number>();

  for (const item of items) {
    const productId = item?.id || item?.product_id;
    const quantity = Number(item?.qty ?? item?.quantity ?? 1);

    if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, code: 'INVALID_ITEM', message: 'Data produk pada keranjang tidak valid' };
    }

    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }

  return {
    ok: true,
    data: Array.from(quantities, ([productId, quantity]) => ({ productId, quantity })),
  };
}

export async function prepareBranchStockSale(
  branchId: string,
  items: any[],
  db: any = supabase
): Promise<StockResult<BranchStockSalePlan>> {
  if (!branchId || branchId === 'ALL') {
    return { ok: false, code: 'BRANCH_REQUIRED', message: 'Cabang transaksi wajib dipilih' };
  }

  const saleItems = aggregateSaleItems(items);
  if (!saleItems.ok) return saleItems;

  const productIds = saleItems.data.map((item) => item.productId);
  const { data: inventoryRows, error } = await db
    .from('branch_inventory')
    .select('id, product_id, stock')
    .eq('branch_id', branchId)
    .in('product_id', productIds);

  if (error) {
    return { ok: false, code: 'STOCK_LOOKUP_FAILED', message: error.message || 'Gagal memeriksa stok cabang' };
  }

  const inventoryByProduct = new Map(
    (inventoryRows || []).map((row: any) => [row.product_id, row])
  );
  const planItems: BranchStockItem[] = [];

  for (const item of saleItems.data) {
    const inventory = inventoryByProduct.get(item.productId) as any;
    if (!inventory) {
      return {
        ok: false,
        code: 'PRODUCT_NOT_IN_BRANCH',
        message: 'Salah satu produk belum terdaftar pada inventori cabang ini',
      };
    }

    const stockBefore = Number(inventory.stock) || 0;
    if (stockBefore < item.quantity) {
      return {
        ok: false,
        code: 'INSUFFICIENT_BRANCH_STOCK',
        message: `Stok cabang tidak cukup untuk salah satu produk (tersedia ${stockBefore}, dibutuhkan ${item.quantity})`,
      };
    }

    planItems.push({
      ...item,
      inventoryId: inventory.id,
      stockBefore,
      stockAfter: stockBefore - item.quantity,
    });
  }

  return { ok: true, data: { branchId, items: planItems } };
}

async function rollbackAppliedStock(appliedItems: BranchStockItem[], db: any): Promise<void> {
  for (const item of [...appliedItems].reverse()) {
    const { error } = await db
      .from('branch_inventory')
      .update({ stock: item.stockBefore, last_updated: new Date().toISOString() })
      .eq('id', item.inventoryId)
      .eq('stock', item.stockAfter);

    if (error) {
      console.error(`[CHECKOUT] Failed to rollback branch stock for product ${item.productId}:`, error);
    }
  }
}

export async function applyBranchStockSale(
  plan: BranchStockSalePlan,
  metadata: { invoiceNumber: string; performedBy?: string | null },
  db: any = supabase
): Promise<StockResult<null>> {
  const appliedItems: BranchStockItem[] = [];
  const updatedAt = new Date().toISOString();

  for (const item of plan.items) {
    const { data, error } = await db
      .from('branch_inventory')
      .update({ stock: item.stockAfter, last_updated: updatedAt })
      .eq('id', item.inventoryId)
      .eq('stock', item.stockBefore)
      .select('id')
      .maybeSingle();

    if (error || !data) {
      await rollbackAppliedStock(appliedItems, db);
      return {
        ok: false,
        code: 'BRANCH_STOCK_CHANGED',
        message: 'Stok cabang berubah saat checkout. Silakan periksa keranjang dan coba lagi.',
      };
    }

    appliedItems.push(item);
  }

  const movementRows = plan.items.map((item) => ({
    branch_id: plan.branchId,
    product_id: item.productId,
    type: 'SALE',
    quantity: item.quantity,
    stock_before: item.stockBefore,
    stock_after: item.stockAfter,
    reason: `Penjualan ${metadata.invoiceNumber}`,
    performed_by: metadata.performedBy || null,
  }));

  const { error: movementError } = await db.from('inventory_movements').insert(movementRows);
  if (movementError) {
    console.warn('[CHECKOUT] Branch stock updated, but inventory movement could not be recorded:', movementError);
  }

  return { ok: true, data: null };
}
