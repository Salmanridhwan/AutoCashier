import { Request, Response } from 'express';
import { supabaseAdmin, supabase } from '../../config/supabaseClient.js';
import { isUserTargeted } from '../promos/promo.service.js';

const db = supabaseAdmin || supabase;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns current time formatted as a WIB (UTC+7) timestamp string. */
function getWIBTimestamp(): string {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${wib.getFullYear()}-${pad(wib.getMonth() + 1)}-${pad(wib.getDate())} ` +
    `${pad(wib.getHours())}:${pad(wib.getMinutes())}:${pad(wib.getSeconds())}`
  );
}

/** Generates a prefixed transaction code, e.g. INV-260517-4821. */
function generateTransactionCode(prefix: string): string {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${yy}${mm}${dd}-${rand}`;
}

/** Upserts the member_points balance, crediting 1% of the purchase total. */
async function creditMemberPoints(userId: string, totalPrice: number): Promise<void> {
  if (!userId || totalPrice <= 0) return;

  const pointsEarned = Math.floor(totalPrice * 0.01);
  if (pointsEarned <= 0) return;

  const { data: existing } = await db
    .from('member_points')
    .select('id, balance')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    await db
      .from('member_points')
      .update({ balance: existing.balance + pointsEarned, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
  } else {
    await db
      .from('member_points')
      .insert({ user_id: userId, balance: pointsEarned, updated_at: new Date().toISOString() });
  }
}

/** Deducts points from the member's balance. Returns an error if balance is insufficient. */
async function debitMemberPoints(
  userId: string,
  points: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!userId || points <= 0) return { ok: true };

  const { data: existing } = await db
    .from('member_points')
    .select('id, balance')
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing || existing.balance < points) {
    return { ok: false, error: 'INSUFFICIENT_POINTS' };
  }

  await db
    .from('member_points')
    .update({ balance: existing.balance - points, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  return { ok: true };
}

// ─── GET /api/transactions ────────────────────────────────────────────────────

/**
 * Returns a paginated list of transactions.
 * - branch_admin: automatically scoped to their branch via JWT.
 * - super_admin: all branches, optionally filtered by ?branch_id=.
 */
export async function getTransactions(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const {
      branch_id,
      status,
      payment_method,
      start_date,
      end_date,
      sort,
      search,
      page = '1',
      limit = '50',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 50));
    const offset = (pageNum - 1) * limitNum;

    // sort: 'desc' (terbaru) | 'asc' (terlama) | 'highest' (terbesar) | 'lowest' (terkecil)
    const sortField     = (sort === 'highest' || sort === 'lowest') ? 'total_price' : 'created_at';
    const ascending     = (sort === 'asc' || sort === 'lowest');

    let query = db
      .from('transactions')
      .select(
        `
        id,
        order_number,
        invoice_number,
        total_price,
        payment_method,
        status,
        payment_status,
        cashier_id,
        member_id,
        receipt_url,
        branch_id,
        created_at,
        cashier:cashier_id ( id, username, full_name ),
        member:member_id   ( id, username, full_name ),
        transaction_items (
          id, quantity, unit_price, subtotal, product_id,
          products ( id, name, sku, category )
        )
      `,
        { count: 'exact' },
      )
      .order(sortField, { ascending });

    // Role-based branch scoping
    if (user.role === 'branch_admin') {
      if (!user.branch_id) {
        return res.status(403).json({
          status: 'error',
          message: 'Branch ID not found in token. Please log in again.',
        });
      }
      query = query.eq('branch_id', user.branch_id);
    } else if (user.role === 'super_admin' && branch_id && branch_id !== 'ALL') {
      query = query.eq('branch_id', branch_id as string);
    }

    // Optional filters
    if (status)          query = query.eq('status', status as string);
    if (payment_method)  query = query.eq('payment_method', payment_method as string);
    if (start_date)      query = query.gte('created_at', start_date as string);
    if (end_date)        query = query.lte('created_at', end_date as string);
    if (search) {
      query = query.or(
        `invoice_number.ilike.%${search}%,order_number.ilike.%${search}%`,
      );
    }

    query = query.range(offset, offset + limitNum - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return res.json({
      status: 'success',
      data: data ?? [],
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limitNum),
      },
    });
  } catch (err: any) {
    console.error('[getTransactions]', err);
    return res.status(500).json({ status: 'error', error: err.message });
  }
}

// ─── POST /api/checkout ───────────────────────────────────────────────────────

export async function checkout(req: Request, res: Response) {
  try {
    const { header, items } = req.body;
    const memberId: string | null = header.member_user_id || null;
    const pointsUsed: number = header.points_used || 0;

    // Deduct member points if used
    if (memberId && pointsUsed > 0) {
      const debitResult = await debitMemberPoints(memberId, pointsUsed);
      if (!debitResult.ok) {
        return res.status(400).json({ status: 'error', error: debitResult.error });
      }
    }

    const invoiceNumber = header.invoice_number || generateTransactionCode('INV');
    const orderNumber   = header.order_number   || generateTransactionCode('ORD');

    // Validate promo if provided
    const promoId: string | null = header.promo_id || null;
    let validatedPromo: any = null;

    if (promoId) {
      const { data: promo, error: promoErr } = await db
        .from('member_promos')
        .select('*')
        .eq('id', promoId)
        .maybeSingle();

      if (promoErr || !promo) {
        return res.status(400).json({ status: 'error', error: 'INVALID_PROMO' });
      }

      const now = new Date();

      if (promo.is_active === false) {
        return res.status(400).json({ status: 'error', error: 'PROMO_INACTIVE' });
      }
      if (promo.starts_at && new Date(promo.starts_at) > now) {
        return res.status(400).json({ status: 'error', error: 'PROMO_NOT_STARTED' });
      }
      if (promo.expires_at && new Date(promo.expires_at) < now) {
        return res.status(400).json({ status: 'error', error: 'PROMO_EXPIRED' });
      }
      if (promo.min_purchase && header.total_price < promo.min_purchase) {
        return res.status(400).json({ status: 'error', error: 'MIN_PURCHASE_NOT_MET' });
      }
      if (promo.usage_limit && promo.usage_count >= promo.usage_limit) {
        return res.status(400).json({ status: 'error', error: 'PROMO_QUOTA_FULL' });
      }

      if (promo.per_user_limit && memberId) {
        const { count } = await db
          .from('promo_usages')
          .select('*', { count: 'exact', head: true })
          .eq('promo_id', promoId)
          .eq('user_id', memberId);

        if (count && count >= promo.per_user_limit) {
          return res.status(400).json({ status: 'error', error: 'USER_PROMO_LIMIT_REACHED' });
        }
      }

      const isTargeted = await isUserTargeted(promoId, memberId);
      if (!isTargeted) {
        return res.status(403).json({ status: 'error', error: 'USER_NOT_TARGETED' });
      }

      validatedPromo = promo;
    }

    // Insert transaction header
    const { data: transaction, error: txError } = await db
      .from('transactions')
      .insert({
        order_number:   orderNumber,
        invoice_number: invoiceNumber,
        total_price:    header.total_price,
        payment_method: header.payment_method,
        status:         header.status || 'completed',
        cashier_id:     header.cashier_id || null,
        member_id:      memberId,
        receipt_url:    header.receipt_url || null,
        payment_status: header.payment_status || 'paid',
        created_at:     getWIBTimestamp(),
      })
      .select()
      .single();

    if (txError) {
      console.error('[checkout] transaction insert:', txError);
      throw txError;
    }

    // Insert transaction items
    const itemRows = items.map((item: any) => ({
      transaction_id: transaction.id,
      product_id:     item.product_id,
      quantity:       item.quantity,
      unit_price:     item.unit_price ?? item.price ?? 0,
      subtotal:       item.subtotal ?? item.quantity * (item.unit_price ?? item.price ?? 0),
      created_at:     getWIBTimestamp(),
    }));

    const { error: itemsError } = await db.from('transaction_items').insert(itemRows);
    if (itemsError) {
      console.error('[checkout] items insert:', itemsError);
      throw itemsError;
    }

    // Deduct stock for each item
    for (const item of items) {
      await db.rpc('deduct_stock', { p_id: item.product_id, qty: item.quantity });
    }

    // Credit member points (1% of total)
    if (memberId && header.total_price > 0) {
      await creditMemberPoints(memberId, header.total_price);
    }

    // Record promo usage
    if (validatedPromo) {
      await db.from('promo_usages').insert({
        promo_id: validatedPromo.id,
        user_id:  memberId ?? null,
        order_id: transaction.id,
      });
      await db.rpc('increment_promo_usage', { p_promo_id: validatedPromo.id });
    }

    const pointsEarned = memberId ? Math.floor((header.total_price || 0) * 0.01) : 0;

    return res.json({
      status: 'success',
      data: { ...transaction, points_earned: pointsEarned, points_used: pointsUsed },
    });
  } catch (err: any) {
    console.error('[checkout]', err);
    return res.status(500).json({ status: 'error', error: err.message });
  }
}

// ─── GET /api/store-settings ──────────────────────────────────────────────────

export async function getStoreSettings(_req: Request, res: Response) {
  return res.json({
    status: 'success',
    data: {
      store_name:           'AutoCashier AI Store',
      currency:             'IDR',
      points_rate:          0.01, // 1% of purchase total
      points_currency_rate: 1,    // 1 point = Rp 1
    },
  });
}
