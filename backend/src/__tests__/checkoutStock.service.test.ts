import { describe, expect, it, vi } from 'vitest';
import { applyBranchStockSale, prepareBranchStockSale } from '../modules/kasir/checkoutStock.service.js';

function createLookupDb(rows: any[]) {
  const inMock = vi.fn().mockResolvedValue({ data: rows, error: null });
  const eqMock = vi.fn(() => ({ in: inMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));

  return { db: { from: fromMock }, fromMock, inMock };
}

describe('checkout branch stock service', () => {
  it('aggregates duplicate cart items and prepares stock from the selected branch', async () => {
    const { db, fromMock, inMock } = createLookupDb([
      { id: 'inventory-1', product_id: 'product-1', stock: 5 },
    ]);

    const result = await prepareBranchStockSale('branch-1', [
      { id: 'product-1', qty: 2 },
      { product_id: 'product-1', quantity: 1 },
    ], db);

    expect(result).toEqual({
      ok: true,
      data: {
        branchId: 'branch-1',
        items: [{
          inventoryId: 'inventory-1',
          productId: 'product-1',
          quantity: 3,
          stockBefore: 5,
          stockAfter: 2,
        }],
      },
    });
    expect(fromMock).toHaveBeenCalledWith('branch_inventory');
    expect(inMock).toHaveBeenCalledWith('product_id', ['product-1']);
  });

  it('rejects checkout when branch stock is insufficient', async () => {
    const { db } = createLookupDb([
      { id: 'inventory-1', product_id: 'product-1', stock: 1 },
    ]);

    const result = await prepareBranchStockSale('branch-1', [{ id: 'product-1', qty: 2 }], db);

    expect(result).toMatchObject({
      ok: false,
      code: 'INSUFFICIENT_BRANCH_STOCK',
    });
  });

  it('updates branch inventory and records a SALE movement', async () => {
    const updateMock = vi.fn();
    const movementInsertMock = vi.fn().mockResolvedValue({ error: null });
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: { id: 'inventory-1' }, error: null });
    const updateChain: any = {
      eq: vi.fn(() => updateChain),
      select: vi.fn(() => ({ maybeSingle: maybeSingleMock })),
    };

    const db = {
      from: vi.fn((table: string) => {
        if (table === 'branch_inventory') {
          return {
            update: (payload: any) => {
              updateMock(payload);
              return updateChain;
            },
          };
        }
        if (table === 'inventory_movements') {
          return { insert: movementInsertMock };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const result = await applyBranchStockSale({
      branchId: 'branch-1',
      items: [{
        inventoryId: 'inventory-1',
        productId: 'product-1',
        quantity: 2,
        stockBefore: 5,
        stockAfter: 3,
      }],
    }, {
      invoiceNumber: 'AC-001',
      performedBy: 'cashier-1',
    }, db);

    expect(result).toEqual({ ok: true, data: null });
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ stock: 3 }));
    expect(movementInsertMock).toHaveBeenCalledWith([expect.objectContaining({
      branch_id: 'branch-1',
      product_id: 'product-1',
      type: 'SALE',
      quantity: 2,
      stock_before: 5,
      stock_after: 3,
      reason: 'Penjualan AC-001',
      performed_by: 'cashier-1',
    })]);
  });
});
