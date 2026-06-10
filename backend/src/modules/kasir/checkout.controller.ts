import { Request, Response } from 'express';
import { supabaseAdmin as supabase } from '../../config/supabaseClient.js';
import { applyBranchStockSale, prepareBranchStockSale } from './checkoutStock.service.js';

const POINTS_EARN_RATE = 0.01; // 1% of total paid

/**
 * Upload a base64-encoded receipt image to Supabase Storage.
 * Returns the public URL on success, or null on failure.
 */
async function uploadReceiptImage(base64: string, invoiceNumber: string): Promise<string | null> {
  try {
    const rawBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(rawBase64, 'base64');
    const fileName = `receipt-${invoiceNumber}-${Date.now()}.jpg`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });

    if (uploadError) {
      console.error('[CHECKOUT] Failed to upload receipt:', uploadError);
      return null;
    }

    const { data: publicUrlData } = supabase.storage.from('receipts').getPublicUrl(uploadData.path);
    return publicUrlData.publicUrl;
  } catch (err) {
    console.error('[CHECKOUT] Error processing receipt image:', err);
    return null;
  }
}

/**
 * Process loyalty points for a member after checkout:
 * marks promo as used, calculates earned points, updates balance, logs transactions.
 * Uses supabaseAdmin (service role) to bypass RLS.
 */
async function processLoyaltyPoints(
  memberId: string,
  transactionId: string,
  invoiceNumber: string,
  totalPaid: number,
  pointsUsed: number,
  promoId?: string
): Promise<void> {
  console.log(`[LOYALTY] Starting for member=${memberId}, total=${totalPaid}, pointsUsed=${pointsUsed}, promo=${promoId}`);

  // Mark promo as used
  if (promoId) {
    const { error: promoErr } = await supabase
      .from('member_promos')
      .update({ is_used: true })
      .eq('id', promoId);
    if (promoErr) console.error('[LOYALTY] Failed to mark promo as used:', promoErr);
  }

  const earnedPoints = Math.floor(totalPaid * POINTS_EARN_RATE);
  console.log(`[LOYALTY] Earned points = ${earnedPoints} (${totalPaid} × ${POINTS_EARN_RATE})`);

  // Fetch current balance
  const { data: currentPoints, error: fetchErr } = await supabase
    .from('member_points')
    .select('balance')
    .eq('user_id', memberId)
    .maybeSingle();

  if (fetchErr) console.error('[LOYALTY] Failed to fetch current balance:', fetchErr);

  const currentBalance = currentPoints?.balance || 0;
  const newBalance = Math.max(0, currentBalance - pointsUsed + earnedPoints);
  console.log(`[LOYALTY] Balance: ${currentBalance} - ${pointsUsed} + ${earnedPoints} = ${newBalance}`);

  // Upsert member points balance
  const { error: upsertErr } = await supabase.from('member_points').upsert(
    { user_id: memberId, balance: newBalance, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (upsertErr) console.error('[LOYALTY] Failed to upsert member_points:', upsertErr);
  else console.log(`[LOYALTY] ✅ member_points updated → balance=${newBalance}`);

  // Log point transactions
  const pointLogs: any[] = [];
  if (pointsUsed > 0) {
    pointLogs.push({
      user_id: memberId,
      transaction_id: transactionId,
      type: 'redeem',
      points: -pointsUsed,
      note: `Poin digunakan untuk transaksi ${invoiceNumber}`,
    });
  }
  if (earnedPoints > 0) {
    pointLogs.push({
      user_id: memberId,
      transaction_id: transactionId,
      type: 'earn',
      points: earnedPoints,
      note: `1% dari Rp${totalPaid.toLocaleString('id-ID')}`,
    });
  }
  if (pointLogs.length > 0) {
    const { error: logErr } = await supabase.from('point_transactions').insert(pointLogs);
    if (logErr) console.error('[LOYALTY] Failed to insert point_transactions:', logErr);
    else console.log(`[LOYALTY] ✅ point_transactions logged (${pointLogs.length} entries)`);
  }

  console.log(`[LOYALTY] ✅ Done: member=${memberId} -${pointsUsed}pts +${earnedPoints}pts → balance=${newBalance}pts`);
}

async function removeIncompleteTransaction(transactionId: string): Promise<void> {
  const { error: itemError } = await supabase
    .from('transaction_items')
    .delete()
    .eq('transaction_id', transactionId);
  if (itemError) console.error('[CHECKOUT] Failed to remove incomplete transaction items:', itemError);

  const { error: transactionError } = await supabase
    .from('transactions')
    .delete()
    .eq('id', transactionId);
  if (transactionError) console.error('[CHECKOUT] Failed to remove incomplete transaction:', transactionError);
}

/**
 * POST /api/kasir/checkout
 * Process a POS checkout: create transaction, insert items, update stock, handle loyalty points.
 */
export async function checkout(req: Request, res: Response): Promise<void> {
  try {
    const { header, items, receiptBase64 } = req.body;
    if (!header) {
      res.status(400).json({ success: false, code: 'INVALID_CHECKOUT', message: 'Data checkout tidak lengkap' });
      return;
    }

    const user = (req as any).user;
    const branchId = user?.branch_id || header?.branch_id;

    // Validate promo if provided
    if (header.promo_id) {
      const { data: promo, error: promoErr } = await supabase
        .from('member_promos')
        .select('*')
        .eq('id', header.promo_id)
        .maybeSingle();

      if (promoErr || !promo) {
        res.status(400).json({ success: false, code: 'INVALID_PROMO', message: 'Promo tidak ditemukan' });
        return;
      }

      if (promo.is_active === false) {
        res.status(400).json({ success: false, code: 'PROMO_INACTIVE', message: 'Promo tidak aktif' });
        return;
      }

      const now = new Date();
      if (promo.starts_at && new Date(promo.starts_at) > now) {
        res.status(400).json({ success: false, code: 'PROMO_NOT_STARTED', message: 'Promo belum dimulai' });
        return;
      }
      if (promo.expires_at && new Date(promo.expires_at) < now) {
        res.status(400).json({ success: false, code: 'PROMO_EXPIRED', message: 'Promo telah berakhir' });
        return;
      }

      // Branch scope check
      const promoScope = promo.conditions?.scope || 'ALL';
      if (promoScope !== 'ALL' && branchId && promoScope !== branchId) {
        res.status(400).json({ success: false, code: 'PROMO_BRANCH_MISMATCH', message: 'Promo tidak berlaku di cabang ini' });
        return;
      }

      // Minimum purchase check
      if (promo.min_purchase && Number(header.total_price) < Number(promo.min_purchase)) {
        res.status(400).json({ success: false, code: 'MIN_PURCHASE_NOT_MET', message: 'Minimal pembelian tidak terpenuhi' });
        return;
      }

      // Usage limit check
      if (promo.usage_limit && (promo.usage_count || 0) >= promo.usage_limit) {
        res.status(400).json({ success: false, code: 'PROMO_QUOTA_FULL', message: 'Kuota promo sudah habis' });
        return;
      }

      // Per-user usage limit check
      if (promo.per_user_limit && header.member_id) {
        const { count } = await supabase
          .from('promo_usages')
          .select('*', { count: 'exact', head: true })
          .eq('promo_id', promo.id)
          .eq('user_id', header.member_id);

        if (count && count >= promo.per_user_limit) {
          res.status(400).json({ success: false, code: 'USER_PROMO_LIMIT_REACHED', message: 'Batas penggunaan promo per user telah tercapai' });
          return;
        }
      }

      // Individual user check
      if (promo.user_id && (promo.user_id !== header.member_id || promo.is_used)) {
        res.status(400).json({ success: false, code: 'PROMO_USER_MISMATCH', message: 'Promo tidak berlaku untuk pengguna ini atau sudah digunakan' });
        return;
      }

      // Targeted user check
      if (promo.target_type === 'SPECIFIC') {
        const { count } = await supabase
          .from('promo_target_users')
          .select('*', { count: 'exact', head: true })
          .eq('promo_id', promo.id)
          .eq('user_id', header.member_id || '');
        if (!count || count === 0) {
          res.status(403).json({ success: false, code: 'USER_NOT_TARGETED', message: 'Promo ini tidak berlaku untuk pengguna ini' });
          return;
        }
      }
    }

    const stockPlanResult = await prepareBranchStockSale(branchId, items);
    if (!stockPlanResult.ok) {
      res.status(400).json({
        success: false,
        code: stockPlanResult.code,
        message: stockPlanResult.message,
      });
      return;
    }

    const invoiceNumber = header?.invoice_number || `AC-${Date.now()}`;
    const receiptUrl = receiptBase64 ? await uploadReceiptImage(receiptBase64, invoiceNumber) : null;

    // Insert transaction header
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert([
        {
          invoice_number: invoiceNumber,
          branch_id: branchId,
          cashier_id: user?.id || user?.sub || header.cashier_id || null,
          member_id: header.member_id || null,
          total_price: header.total_price,
          payment_method: header.payment_method,
          receipt_url: receiptUrl,
          payment_status: 'pending_verification',
        },
      ])
      .select()
      .single();

    if (txError) throw txError;

    // Insert line items and decrement stock
    for (const item of items) {
      const qty = item.qty ?? item.quantity ?? 1;
      const productId = item.id || item.product_id;

      const { error: itemError } = await supabase.from('transaction_items').insert([
        {
          transaction_id: transaction.id,
          product_id: productId,
          unit_price: item.price,
          quantity: qty,
          subtotal: item.price * qty,
        },
      ]);

      if (itemError) {
        console.error(`[CHECKOUT] Failed to insert transaction_item for product ${productId}:`, itemError);
        await removeIncompleteTransaction(transaction.id);
        throw itemError;
      }
    }

    const stockUpdateResult = await applyBranchStockSale(stockPlanResult.data, {
      invoiceNumber,
      performedBy: user?.sub || user?.id || null,
    });
    if (!stockUpdateResult.ok) {
      await removeIncompleteTransaction(transaction.id);
      res.status(409).json({
        success: false,
        code: stockUpdateResult.code,
        message: stockUpdateResult.message,
      });
      return;
    }

    // Process loyalty points if member transaction
    if (header.member_id) {
      await processLoyaltyPoints(
        header.member_id,
        transaction.id,
        invoiceNumber,
        Number(header.total_price),
        Number(header.points_used || 0),
        header.promo_id
      );
    }

    res.json({ success: true, transaction });
  } catch (error: any) {
    console.error('[CHECKOUT] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Checkout failed',
      error: error?.message || String(error),
    });
  }
}
