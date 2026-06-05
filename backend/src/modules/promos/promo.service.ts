import { supabaseAdmin, supabase } from '../../config/supabaseClient.js';

const client = () => supabaseAdmin || supabase;

export async function getAllPromos() {
  const { data, error } = await client()
    .from('member_promos')
    .select('*')
    .order('created_at', { ascending: false });

  if (data) {
    data.forEach((p: any) => {
      if (p.conditions && typeof p.conditions === 'object' && p.conditions.scope) {
        p.scope = p.conditions.scope;
      } else {
        p.scope = 'ALL';
      }
    });
  }

  return { ok: !error, data, error };
}

export async function createPromo(payload: any) {
  const targetType = payload.target_user_ids && payload.target_user_ids.length > 0
    ? 'SPECIFIC'
    : 'ALL';

  const insertData: any = {
    code: payload.code,
    discount_type: payload.discount_type,
    discount_value: Number(payload.discount_value),
    min_purchase: payload.min_purchase ? Number(payload.min_purchase) : null,
    expires_at: payload.expires_at || null,
    is_used: false,
    user_id: payload.user_id || null,
    event_name: payload.event_name || null,
    max_discount: payload.max_discount ? Number(payload.max_discount) : null,
    usage_limit: payload.usage_limit ? Number(payload.usage_limit) : null,
    usage_count: 0,
    per_user_limit: payload.per_user_limit ? Number(payload.per_user_limit) : null,
    starts_at: payload.starts_at || null,
    conditions: {
      ...(payload.conditions || {}),
      scope: payload.scope || 'ALL',
    },
    is_active: payload.is_active !== undefined ? payload.is_active : true,
    target_type: targetType,
  };

  const { data, error } = await client()
    .from('member_promos')
    .insert([insertData])
    .select()
    .single();

  if (error || !data) return { ok: false, data: null, error };

  // Insert target users if SPECIFIC
  if (targetType === 'SPECIFIC' && payload.target_user_ids?.length > 0) {
    const targetRows = payload.target_user_ids.map((uid: string) => ({
      promo_id: data.id,
      user_id: uid,
    }));
    await client().from('promo_target_users').insert(targetRows);
  }

  return { ok: true, data, error: null };
}

export async function getPromoById(id: string) {
  const { data, error } = await client()
    .from('member_promos')
    .select('*, promo_target_users(user_id)')
    .eq('id', id)
    .single();
    
  if (error || !data) return { ok: false, data: null, error };
  
  // Transform the payload slightly to return target_user_ids flat array
  const target_user_ids = data.promo_target_users?.map((t: any) => t.user_id) || [];
  delete data.promo_target_users;
  
  if (data.conditions && typeof data.conditions === 'object' && data.conditions.scope) {
    data.scope = data.conditions.scope;
  } else {
    data.scope = 'ALL';
  }
  
  return { ok: true, data: { ...data, target_user_ids }, error: null };
}

export async function updatePromo(id: string, payload: any) {
  const targetType = payload.target_user_ids && payload.target_user_ids.length > 0
    ? 'SPECIFIC'
    : 'ALL';

  const updateData: any = {
    code: payload.code,
    discount_type: payload.discount_type,
    discount_value: Number(payload.discount_value),
    min_purchase: payload.min_purchase ? Number(payload.min_purchase) : null,
    expires_at: payload.expires_at || null,
    event_name: payload.event_name || null,
    max_discount: payload.max_discount ? Number(payload.max_discount) : null,
    usage_limit: payload.usage_limit ? Number(payload.usage_limit) : null,
    per_user_limit: payload.per_user_limit ? Number(payload.per_user_limit) : null,
    starts_at: payload.starts_at || null,
    conditions: {
      ...(payload.conditions || {}),
      scope: payload.scope || 'ALL',
    },
    target_type: targetType,
  };

  const { data, error } = await client()
    .from('member_promos')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) return { ok: false, data: null, error };

  // Always delete old specific targets and re-insert if SPECIFIC
  await client().from('promo_target_users').delete().eq('promo_id', id);

  if (targetType === 'SPECIFIC' && payload.target_user_ids?.length > 0) {
    const targetRows = payload.target_user_ids.map((uid: string) => ({
      promo_id: id,
      user_id: uid,
    }));
    await client().from('promo_target_users').insert(targetRows);
  }

  return { ok: true, data, error: null };
}

export async function deletePromo(id: string) {
  const { error } = await client()
    .from('member_promos')
    .delete()
    .eq('id', id);
  return { ok: !error, error };
}

/**
 * Check if a specific user is allowed to use this promo.
 * Returns true if target_type = 'ALL' or user is in promo_target_users.
 */
export async function isUserTargeted(promoId: string, userId: string | null): Promise<boolean> {
  // First get the promo target_type
  const { data: promo } = await client()
    .from('member_promos')
    .select('target_type')
    .eq('id', promoId)
    .maybeSingle();

  if (!promo) return false;
  if (promo.target_type === 'ALL') return true;
  if (!userId) return false; // SPECIFIC but no user

  const { count } = await client()
    .from('promo_target_users')
    .select('*', { count: 'exact', head: true })
    .eq('promo_id', promoId)
    .eq('user_id', userId);

  return (count || 0) > 0;
}
