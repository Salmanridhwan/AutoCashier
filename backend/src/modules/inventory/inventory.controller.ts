import { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabaseClient.js';

// ─── GET /api/inventory ──────────────────────────────────────────────────────
// Returns all products in this branch's branch_inventory (joined with products)
export const getInventory = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const branchId: string | null = user.branch_id;

    if (!branchId) {
      return res.status(403).json({ status: 'error', message: 'Branch ID not found in token. Please log in again.' });
    }

    const { search } = req.query;

    let query = supabaseAdmin
      .from('branch_inventory')
      .select(`
        id,
        branch_id,
        stock,
        cost_price,
        min_stock_level,
        reorder_point,
        last_updated,
        products (
          id,
          name,
          sku,
          category,
          price,
          image_url,
          ai_label
        )
      `)
      .eq('branch_id', branchId)
      .order('last_updated', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    const formatted = (data || [])
      .filter((item: any) => item.products)
      .filter((item: any) => {
        if (!search) return true;
        const q = (search as string).toLowerCase();
        return (
          item.products.name?.toLowerCase().includes(q) ||
          item.products.sku?.toLowerCase().includes(q) ||
          item.products.category?.toLowerCase().includes(q)
        );
      })
      .map((item: any) => ({
        inventory_id: item.id,
        id: item.products.id,
        name: item.products.name,
        sku: item.products.sku,
        category: item.products.category,
        price: item.cost_price ?? item.products.price ?? 0,
        stock: item.stock ?? 0,
        image_url: item.products.image_url,
        ai_label: item.products.ai_label,
        description: '',
        unit: 'pcs',
        min_stock_level: item.min_stock_level ?? 5,
        reorder_point: item.reorder_point ?? 10,
        branch_id: item.branch_id,
        last_updated: item.last_updated,
      }));

    res.json({ status: 'success', data: formatted, count: formatted.length });
  } catch (err: any) {
    console.error('[inventory.getInventory]', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ─── POST /api/inventory ─────────────────────────────────────────────────────
export const createProduct = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const branchId: string | null = user.branch_id;

    if (!branchId) {
      return res.status(403).json({ status: 'error', message: 'Branch ID not found in token. Please log in again.' });
    }

    const { name, category, price, stock, sku, description, image_url, unit, cost_price, product_id, _link_existing } = req.body;

    // ── MODE 1: Link existing master-catalog product ──────────────────────────
    if (_link_existing && product_id) {
      const { data: existing } = await supabaseAdmin
        .from('branch_inventory')
        .select('id')
        .eq('product_id', product_id)
        .eq('branch_id', branchId)
        .maybeSingle();

      if (existing) {
        return res.status(409).json({ status: 'error', message: 'Produk sudah ada di inventori cabang ini' });
      }

      const { data: invData, error: invError } = await supabaseAdmin
        .from('branch_inventory')
        .insert([{ product_id, branch_id: branchId, stock: Number(stock) || 0, cost_price: price ? Number(price) : null, last_updated: new Date().toISOString() }])
        .select().single();

      if (invError) throw invError;
      return res.status(201).json({ status: 'success', data: invData });
    }

    // ── MODE 2: Create brand new product ─────────────────────────────────────
    if (!name || !price) {
      return res.status(400).json({ status: 'error', message: 'Name and price are required.' });
    }

    const finalSku = sku || `SKU-${Date.now()}`;
    const finalPrice = Number(price) || 0;
    const finalStock = Number(stock) || 0;

    // 1. Create the product in master products table
    const { data: productData, error: productError } = await supabaseAdmin
      .from('products')
      .insert([{
        sku: finalSku,
        name: name.trim(),
        category: category || 'Uncategorized',
        price: finalPrice,
        image_url: image_url || null,
      }])
      .select()
      .single();

    if (productError) throw productError;

    // 2. Link to branch via branch_inventory
    const { data: invData, error: invError } = await supabaseAdmin
      .from('branch_inventory')
      .insert([{
        product_id: productData.id,
        branch_id: branchId,
        stock: finalStock,
        cost_price: cost_price ? Number(cost_price) : finalPrice,
        last_updated: new Date().toISOString(),
      }])
      .select()
      .single();

    if (invError) {
      // Rollback product creation if branch_inventory insert fails
      await supabaseAdmin.from('products').delete().eq('id', productData.id);
      throw invError;
    }

    res.status(201).json({
      status: 'success',
      data: {
        ...productData,
        inventory_id: invData.id,
        stock: finalStock,
        branch_id: branchId,
      }
    });
  } catch (err: any) {
    console.error('[inventory.createProduct]', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ─── PUT /api/inventory/:id ──────────────────────────────────────────────────
export const updateProduct = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const branchId: string | null = user.branch_id;
    const productId = req.params.id;

    if (!branchId) {
      return res.status(403).json({ status: 'error', message: 'Branch ID not found in token. Please log in again.' });
    }

    const { name, category, price, stock, image_url, cost_price } = req.body;

    // Verify that the product is actually in this branch's inventory before updating
    const { data: existingInv, error: checkErr } = await supabaseAdmin
      .from('branch_inventory')
      .select('id')
      .eq('product_id', productId)
      .eq('branch_id', branchId)
      .maybeSingle();

    if (checkErr) throw checkErr;
    if (!existingInv) {
      return res.status(404).json({ status: 'error', message: 'Product not found in this branch inventory.' });
    }

    // Build product update payload
    const productUpdates: any = {};
    if (name !== undefined) productUpdates.name = name.trim();
    if (category !== undefined) productUpdates.category = category;
    if (price !== undefined) productUpdates.price = Number(price);
    if (image_url !== undefined) productUpdates.image_url = image_url;

    // Build branch_inventory update payload
    const invUpdates: any = { last_updated: new Date().toISOString() };
    if (stock !== undefined) invUpdates.stock = Number(stock);
    if (cost_price !== undefined) invUpdates.cost_price = Number(cost_price);
    else if (price !== undefined) invUpdates.cost_price = Number(price);

    // Update products table if we have anything to update
    if (Object.keys(productUpdates).length > 0) {
      const { error: pErr } = await supabaseAdmin
        .from('products')
        .update(productUpdates)
        .eq('id', productId);
      if (pErr) throw pErr;
    }

    // Update branch_inventory
    const { error: iErr } = await supabaseAdmin
      .from('branch_inventory')
      .update(invUpdates)
      .eq('product_id', productId)
      .eq('branch_id', branchId);
    if (iErr) throw iErr;

    res.json({ status: 'success', message: 'Product updated successfully.' });
  } catch (err: any) {
    console.error('[inventory.updateProduct]', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ─── DELETE /api/inventory/:id ───────────────────────────────────────────────
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const branchId: string | null = user.branch_id;
    const productId = req.params.id;

    if (!branchId) {
      return res.status(403).json({ status: 'error', message: 'Branch ID not found in token. Please log in again.' });
    }

    const { error } = await supabaseAdmin
      .from('branch_inventory')
      .delete()
      .eq('product_id', productId)
      .eq('branch_id', branchId);

    if (error) throw error;

    res.json({ status: 'success', message: 'Product removed from branch inventory.' });
  } catch (err: any) {
    console.error('[inventory.deleteProduct]', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};
