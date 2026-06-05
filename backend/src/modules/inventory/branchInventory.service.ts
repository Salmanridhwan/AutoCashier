import { supabaseAdmin, supabase } from '../../config/supabaseClient.js';

const client = () => supabaseAdmin || supabase;

export async function getBranchSummaries() {
  const db = client();
  
  try {
    // 1. Get all branches
    const { data: branches, error: bErr } = await db.from('branches').select('id, name');
    if (bErr) return { ok: false, error: bErr };

    if (!branches || branches.length === 0) {
      return { 
        ok: true, 
        data: { 
          branches: [], 
          summary: { totalBranches: 0, criticalProducts: 0, totalStockValue: 0, healthScore: 100 } 
        } 
      };
    }

    // 2. Get stock data with product info
    const { data: inventory } = await db
      .from('branch_inventory')
      .select(`
        branch_id, 
        stock,
        min_stock_level,
        max_stock_level,
        reorder_point,
        cost_price,
        products (id, name, price, category)
      `);

    // 3. Aggregate per branch
    let totalCritical = 0;
    let totalStockValue = 0;

    const summaries = branches.map((b: any) => {
      const branchItems = (inventory || []).filter((i: any) => i.branch_id === b.id);
      const totalSKU = branchItems.length;
      const criticalCount = branchItems.filter((i: any) => (i.stock || 0) <= (i.reorder_point || i.min_stock_level || 15)).length;
      const overstockCount = branchItems.filter((i: any) => (i.stock || 0) >= (i.max_stock_level || 100)).length;
      
      // Value = stock * cost_price (jika ada), jika tidak pakai harga jual
      const branchValue = branchItems.reduce((acc: number, i: any) => {
        const priceToUse = i.cost_price || Number(i.products?.price || 0);
        return acc + ((i.stock || 0) * priceToUse);
      }, 0);
      
      totalCritical += criticalCount;
      totalStockValue += branchValue;

      const healthScore = totalSKU > 0 ? Math.round(((totalSKU - criticalCount) / totalSKU) * 100) : 100;

      return {
        id: b.id,
        name: b.name,
        totalSKU,
        criticalCount,
        overstockCount,
        healthyCount: totalSKU - criticalCount - overstockCount,
        stockValue: branchValue,
        healthScore,
      };
    });

    const summary = {
      totalBranches: branches.length,
      criticalProducts: totalCritical,
      totalStockValue,
      healthScore: summaries.length > 0 
        ? Math.round(summaries.reduce((a: number, b: any) => a + b.healthScore, 0) / summaries.length)
        : 100
    };

    return { ok: true, data: { branches: summaries, summary } };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export async function getBranchInventory(branchId: string) {
  const db = client();
  
  const { data, error } = await db
    .from('branch_inventory')
    .select(`
      id,
      branch_id,
      stock,
      min_stock_level,
      max_stock_level,
      reorder_point,
      cost_price,
      supplier_name,
      last_restock_date,
      last_updated,
      products (
        id,
        name,
        category,
        price,
        image_url
      )
    `)
    .eq('branch_id', branchId)
    .order('last_updated', { ascending: false });
  
  if (error) return { ok: false, error };

  const formatted = (data || []).map((item: any) => {
    const product = item.products;
    if (!product) return null;
    
    const stock = item.stock || 0;
    const minLevel = item.min_stock_level || 10;
    const maxLevel = item.max_stock_level || 100;
    const reorderPoint = item.reorder_point || 15;
    const pricePerUnit = item.cost_price || Number(product.price) || 0;
    const stockValue = stock * pricePerUnit;
    const fillPercent = maxLevel > 0 ? Math.min(100, Math.round((stock / maxLevel) * 100)) : 0;

    let status: 'critical' | 'warning' | 'healthy' | 'overstock';
    if (stock <= minLevel) status = 'critical';
    else if (stock <= reorderPoint) status = 'warning';
    else if (stock >= maxLevel) status = 'overstock';
    else status = 'healthy';

    return {
      id: product.id,
      inventory_id: item.id,
      name: product.name,
      category: product.category,
      stock,
      minStockLevel: minLevel,
      maxStockLevel: maxLevel,
      reorderPoint,
      fillPercent,
      status,
      price: Number(product.price) || 0,
      costPrice: pricePerUnit,
      stockValue,
      supplierName: item.supplier_name,
      lastRestockDate: item.last_restock_date,
      branch_id: item.branch_id,
      image_url: product.image_url,
      lastUpdated: item.last_updated,
    };
  }).filter(Boolean);

  return { ok: true, data: formatted };
}

export async function getInventoryMovements(branchId: string, productId?: string) {
  const db = client();
  
  let query = db
    .from('inventory_movements')
    .select(`
      id,
      type,
      quantity,
      stock_before,
      stock_after,
      reason,
      created_at,
      products (name),
      users (full_name)
    `)
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (productId) {
    query = query.eq('product_id', productId);
  }

  const { data, error } = await query;
  if (error) return { ok: false, error };

  return { 
    ok: true, 
    data: (data || []).map((m: any) => ({
      id: m.id,
      type: m.type,
      quantity: m.quantity,
      stockBefore: m.stock_before,
      stockAfter: m.stock_after,
      reason: m.reason,
      productName: m.products?.name || 'Unknown',
      performedBy: m.users?.full_name || 'System',
      createdAt: m.created_at,
    }))
  };
}

export async function addItem(payload: any) {
  const db = client();
  const { catalogId, location_id, stock } = payload;
  
  const { data, error } = await db.from('branch_inventory').insert({
    product_id: catalogId,
    branch_id: location_id,
    stock: Number(stock),
    last_updated: new Date().toISOString()
  }).select().single();

  if (error) return { ok: false, error };
  return { ok: true, data };
}

export async function updateItem(payload: any) {
  const db = client();
  const { id, stock } = payload;
  
  const { data, error } = await db.from('branch_inventory')
    .update({ stock: Number(stock), last_updated: new Date().toISOString() })
    .match({ product_id: payload.catalogId || id, branch_id: payload.location_id })
    .select();

  if (error) return { ok: false, error };
  return { ok: true, data };
}

export async function deleteItem(id: string, branchId?: string) {
  const db = client();
  let result;
  if (branchId) {
    result = await db.from('branch_inventory').delete().match({ product_id: id, branch_id: branchId });
  } else {
    result = await db.from('branch_inventory').delete().eq('id', id);
  }
  if (result.error) return { ok: false, error: result.error };
  return { ok: true };
}

export async function adjustStock(payload: any) {
  const db = client();
  const { inventoryId, branchId, productId, type, quantity, reason, performedBy } = payload;
  
  // 1. Get current stock
  const { data: current, error: getErr } = await db
    .from('branch_inventory')
    .select('stock')
    .eq('id', inventoryId)
    .single();
    
  if (getErr) return { ok: false, error: getErr };
  
  const stockBefore = current.stock;
  const newStock = 
    type === 'RESTOCK' ? stockBefore + Number(quantity) 
    : type === 'SALE' || type === 'DAMAGE' ? stockBefore - Number(quantity)
    : type === 'ADJUSTMENT' ? Number(quantity) 
    : stockBefore;

  // 2. Update stock
  const { error: updErr } = await db
    .from('branch_inventory')
    .update({ 
      stock: Math.max(0, newStock), 
      last_updated: new Date().toISOString(),
      ...(type === 'RESTOCK' ? { last_restock_date: new Date().toISOString() } : {})
    })
    .eq('id', inventoryId);
    
  if (updErr) return { ok: false, error: updErr };

  // 3. Record movement
  try {
    await db.from('inventory_movements').insert({
      branch_id: branchId,
      product_id: productId,
      type,
      quantity: Number(quantity),
      stock_before: stockBefore,
      stock_after: Math.max(0, newStock),
      reason: reason || '',
      performed_by: performedBy || null,
    });
  } catch (e) {
    console.warn('[branchInventoryService] inventory_movements not ready:', e);
  }

  return { ok: true, newStock: Math.max(0, newStock) };
}
