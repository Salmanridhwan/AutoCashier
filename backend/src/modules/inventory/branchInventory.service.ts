import { supabaseAdmin, supabase } from '../../config/supabaseClient.js';

const client = () => supabaseAdmin || supabase;

export async function getBranchSummaries(branchId?: string) {
  const db = client();
  
  try {
    // 1. Get all branches
    let branchesQuery = db.from('branches').select('id, name');
    if (branchId) branchesQuery = branchesQuery.eq('id', branchId);
    const { data: branches, error: bErr } = await branchesQuery;
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
    let inventoryQuery = db
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
    if (branchId) inventoryQuery = inventoryQuery.eq('branch_id', branchId);
    const { data: inventory } = await inventoryQuery;

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
  const { catalogId, location_id, stock, price, cost_price } = payload;
  
  const { data, error } = await db.from('branch_inventory').insert({
    product_id: catalogId,
    branch_id: location_id,
    stock: Number(stock),
    cost_price: price !== undefined ? Number(price) : (cost_price !== undefined ? Number(cost_price) : null),
    last_updated: new Date().toISOString()
  }).select().single();

  if (error) return { ok: false, error };
  return { ok: true, data };
}

export async function updateItem(payload: any) {
  const db = client();
  const { id, stock, price, cost_price, name, category } = payload;
  
  const invUpdates: any = { last_updated: new Date().toISOString() };
  if (stock !== undefined) invUpdates.stock = Number(stock);
  if (price !== undefined) invUpdates.cost_price = Number(price);
  else if (cost_price !== undefined) invUpdates.cost_price = Number(cost_price);

  const { data, error } = await db.from('branch_inventory')
    .update(invUpdates)
    .match({ product_id: payload.catalogId || id, branch_id: payload.location_id })
    .select();

  if (error) return { ok: false, error };

  // Also update master products table if name or category is modified
  const productUpdates: any = {};
  if (name !== undefined) productUpdates.name = name.trim();
  if (category !== undefined) productUpdates.category = category;

  if (Object.keys(productUpdates).length > 0) {
    const productId = payload.catalogId || id;
    await db.from('products').update(productUpdates).eq('id', productId);
  }

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

  const validTypes = ['RESTOCK', 'SALE', 'DAMAGE', 'ADJUSTMENT'];
  const numericQuantity = Number(quantity);

  if (!inventoryId || !branchId || !productId) {
    return { ok: false, error: 'Data inventori tidak lengkap' };
  }
  if (!validTypes.includes(type)) {
    return { ok: false, error: 'Tipe perubahan stok tidak valid' };
  }
  const hasInvalidQuantity = !Number.isFinite(numericQuantity)
    || (type === 'ADJUSTMENT' ? numericQuantity < 0 : numericQuantity <= 0);
  if (hasInvalidQuantity) {
    return { ok: false, error: 'Jumlah stok tidak valid' };
  }
  
  // 1. Get current stock
  const { data: current, error: getErr } = await db
    .from('branch_inventory')
    .select('stock, branch_id, product_id')
    .eq('id', inventoryId)
    .single();
    
  if (getErr) return { ok: false, error: getErr };
  if (!current || current.branch_id !== branchId || current.product_id !== productId) {
    return { ok: false, error: 'Produk tidak ditemukan pada inventori cabang ini' };
  }
  
  const stockBefore = Number(current.stock) || 0;
  const newStock = 
    type === 'RESTOCK' ? stockBefore + numericQuantity
    : type === 'SALE' || type === 'DAMAGE' ? stockBefore - numericQuantity
    : type === 'ADJUSTMENT' ? numericQuantity
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
    const { error: movementError } = await db.from('inventory_movements').insert({
      branch_id: branchId,
      product_id: productId,
      type,
      quantity: numericQuantity,
      stock_before: stockBefore,
      stock_after: Math.max(0, newStock),
      reason: reason || '',
      performed_by: performedBy || null,
    });
    if (movementError) {
      console.warn('[branchInventoryService] Failed to record inventory movement:', movementError);
    }
  } catch (e) {
    console.warn('[branchInventoryService] inventory_movements not ready:', e);
  }

  return { ok: true, newStock: Math.max(0, newStock) };
}
