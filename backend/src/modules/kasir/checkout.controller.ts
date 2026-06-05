import { Request, Response } from 'express';
import { supabaseAdmin as supabase } from '../../config/supabaseClient.js';

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

/**
 * POST /api/kasir/checkout
 * Process a POS checkout: create transaction, insert items, update stock, handle loyalty points.
 */
export async function checkout(req: Request, res: Response): Promise<void> {
  try {
    const { header, items, receiptBase64 } = req.body;

    const invoiceNumber = header.invoice_number || `AC-${Date.now()}`;
    const receiptUrl = receiptBase64 ? await uploadReceiptImage(receiptBase64, invoiceNumber) : null;

    // Insert transaction header
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert([
        {
          invoice_number: invoiceNumber,
          branch_id: header.branch_id || null,
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
      }

      // Decrement stock
      const { data: product } = await supabase.from('products').select('stock').eq('id', productId).single();
      if (product) {
        await supabase.from('products').update({ stock: product.stock - qty }).eq('id', productId);
      }
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
