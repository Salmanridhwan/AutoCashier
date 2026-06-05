import { Request, Response } from 'express';
import * as promoService from '../promos/promo.service.js';
import { supabaseAdmin, supabase } from '../../config/supabaseClient.js';

export async function listPromos(req: Request, res: Response) {
  const result = await promoService.getAllPromos();
  if (!result.ok) return res.status(500).json({ status: 'error', error: result.error });
  return res.json({ status: 'success', data: result.data });
}

export async function createPromoController(req: Request, res: Response) {
  const { title, code, discount_type, discount_value, min_purchase, expires_at, user_id } = req.body;
  
  if (!code || !discount_value || !discount_type) {
    return res.status(400).json({ status: 'error', error: 'Missing required fields: code, discount_type, discount_value' });
  }

  const result = await promoService.createPromo({
    title: req.body.title || code,
    code,
    discount_type,
    discount_value: Number(discount_value),
    min_purchase: min_purchase ? Number(min_purchase) : null,
    expires_at: expires_at || null,
    user_id: user_id || null,
    event_name: req.body.event_name || null,
    max_discount: req.body.max_discount || null,
    usage_limit: req.body.usage_limit || null,
    per_user_limit: req.body.per_user_limit || null,
    starts_at: req.body.starts_at || null,
    conditions: req.body.conditions || null,
    scope: req.body.scope || 'ALL',
    is_active: req.body.is_active !== undefined ? req.body.is_active : true,
    target_user_ids: req.body.target_user_ids || [],
  });

  if (!result.ok) return res.status(500).json({ status: 'error', error: result.error });
  return res.status(201).json({ status: 'success', data: result.data });
}

export async function getPromoByIdController(req: Request, res: Response) {
  const { id } = req.params;
  const result = await promoService.getPromoById(id);
  if (!result.ok) return res.status(404).json({ status: 'error', error: 'Promo not found' });
  return res.json({ status: 'success', data: result.data });
}

export async function updatePromoController(req: Request, res: Response) {
  const { id } = req.params;
  const { title, code, discount_type, discount_value } = req.body;
  
  if (!code || !discount_value || !discount_type) {
    return res.status(400).json({ status: 'error', error: 'Missing required fields' });
  }

  const result = await promoService.updatePromo(id, {
    title: title || code,
    code,
    discount_type,
    discount_value: Number(discount_value),
    min_purchase: req.body.min_purchase ? Number(req.body.min_purchase) : null,
    expires_at: req.body.expires_at || null,
    event_name: req.body.event_name || null,
    max_discount: req.body.max_discount || null,
    usage_limit: req.body.usage_limit || null,
    per_user_limit: req.body.per_user_limit || null,
    starts_at: req.body.starts_at || null,
    conditions: req.body.conditions || null,
    scope: req.body.scope,
    target_user_ids: req.body.target_user_ids || [],
  });

  if (!result.ok) return res.status(500).json({ status: 'error', error: result.error });
  return res.json({ status: 'success', data: result.data });
}

export async function deletePromoController(req: Request, res: Response) {
  const { id } = req.params;
  const result = await promoService.deletePromo(id);
  if (!result.ok) return res.status(500).json({ status: 'error', error: result.error });
  return res.json({ status: 'success' });
}

export async function getPromoInsights(req: Request, res: Response) {
  try {
    const client = supabaseAdmin || supabase;
    
    // Get total used promos (Total Redemption)
    const { count: usedCount, error: usedErr } = await client
      .from('member_promos')
      .select('*', { count: 'exact', head: true })
      .eq('is_used', true);
      
    if (usedErr) throw usedErr;
    
    // Get total sent promos
    const { count: totalCount, error: totalErr } = await client
      .from('member_promos')
      .select('*', { count: 'exact', head: true });
      
    if (totalErr) throw totalErr;
    
    const totalRedemption = usedCount || 0;
    const totalSent = totalCount || 0;
    
    // Calculate reach effectiveness
    let reachPercentage = 0;
    if (totalSent > 0) {
      reachPercentage = Math.round((totalRedemption / totalSent) * 100);
    }
    
    // Fetch recent member promos to show who got what and if it's used
    const { data: history, error: historyErr } = await client
      .from('member_promos')
      .select(`
        *,
        user:user_id (
          username,
          email,
          full_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (historyErr) {
      console.error('Error fetching member_promos history:', historyErr);
    }

    // Aggregate by code to find top campaigns
    const { data: allPromos, error: allErr } = await client
      .from('member_promos')
      .select('code, is_used');
      
    const campaignStatsMap: Record<string, { code: string, total: number, used: number }> = {};
    if (allPromos) {
      allPromos.forEach((p: any) => {
        const code = p.code.toUpperCase();
        if (!campaignStatsMap[code]) {
          campaignStatsMap[code] = { code, total: 0, used: 0 };
        }
        campaignStatsMap[code].total += 1;
        if (p.is_used) {
          campaignStatsMap[code].used += 1;
        }
      });
    }
    
    // Sort by most used, then by total
    const campaignStats = Object.values(campaignStatsMap).sort((a, b) => {
      if (b.used !== a.used) return b.used - a.used;
      return b.total - a.total;
    }).slice(0, 5);
    
    return res.json({
      status: 'success',
      data: {
        totalRedemption,
        growthWoW: 'Real-time',
        campaignReach: `${reachPercentage}% Effectiveness`,
        reachPercentage: reachPercentage,
        history: history || [],
        campaignStats
      }
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
}

/**
 * POST /api/promos/validate
 * Validates a promo code before checkout and returns discount info.
 * Body: { code, total_price, user_id? }
 */
export async function validatePromoController(req: Request, res: Response) {
  try {
    const client = supabaseAdmin || supabase;
    const { code, total_price, user_id } = req.body;

    if (!code || total_price === undefined) {
      return res.status(400).json({ status: 'error', error: 'MISSING_FIELDS' });
    }

    const { data: promo, error } = await client
      .from('member_promos')
      .select('*')
      .eq('code', code.toUpperCase())
      .maybeSingle();

    if (error || !promo) {
      return res.status(404).json({ status: 'error', error: 'PROMO_NOT_FOUND' });
    }

    if (promo.is_active === false) {
      return res.status(400).json({ status: 'error', error: 'PROMO_INACTIVE' });
    }

    const now = new Date();
    if (promo.starts_at && new Date(promo.starts_at) > now) {
      return res.status(400).json({
        status: 'error',
        error: 'PROMO_NOT_STARTED',
        starts_at: promo.starts_at
      });
    }

    if (promo.expires_at && new Date(promo.expires_at) < now) {
      return res.status(400).json({ status: 'error', error: 'PROMO_EXPIRED' });
    }

    if (promo.min_purchase && Number(total_price) < Number(promo.min_purchase)) {
      return res.status(400).json({
        status: 'error',
        error: 'MIN_PURCHASE_NOT_MET',
        min_purchase: promo.min_purchase
      });
    }

    if (promo.usage_limit && (promo.usage_count || 0) >= promo.usage_limit) {
      return res.status(400).json({ status: 'error', error: 'PROMO_QUOTA_FULL' });
    }

    if (promo.per_user_limit && user_id) {
      const { count } = await client
        .from('promo_usages')
        .select('*', { count: 'exact', head: true })
        .eq('promo_id', promo.id)
        .eq('user_id', user_id);

      if (count && count >= promo.per_user_limit) {
        return res.status(400).json({ status: 'error', error: 'USER_PROMO_LIMIT_REACHED' });
      }
    }

    // Check if promo is targeted to specific users
    const isTargeted = await promoService.isUserTargeted(promo.id, user_id || null);
    if (!isTargeted) {
      return res.status(403).json({ status: 'error', error: 'USER_NOT_TARGETED' });
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (promo.discount_type === 'Percentage') {
      discountAmount = Math.floor(Number(total_price) * (Number(promo.discount_value) / 100));
      if (promo.max_discount) {
        discountAmount = Math.min(discountAmount, Number(promo.max_discount));
      }
    } else {
      discountAmount = Number(promo.discount_value);
    }

    return res.json({
      status: 'success',
      data: {
        promo_id: promo.id,
        code: promo.code,
        event_name: promo.event_name,
        discount_type: promo.discount_type,
        discount_value: promo.discount_value,
        discount_amount: discountAmount,
        final_price: Math.max(0, Number(total_price) - discountAmount),
      }
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
}
