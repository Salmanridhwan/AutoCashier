import { supabaseAdmin, supabase } from '../../config/supabaseClient.js';

export async function getAllBroadcasts() {
  try {
    const db = supabaseAdmin || supabase;
    const { data, error } = await db
      .from('broadcasts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
       console.error('[broadcastService] Error fetching broadcasts:', error.message);
       return { ok: false, error: error.message };
    }
    return { ok: true, data };
  } catch (err: any) {
    console.error('[broadcastService] Exception fetching broadcasts:', err);
    return { ok: false, error: err.message };
  }
}

export async function createBroadcast(broadcastData: any) {
  try {
    const db = supabaseAdmin || supabase;
    const payload = {
      subject: broadcastData.subject,
      body: broadcastData.message,
      audience: broadcastData.audience,
      target_id: broadcastData.targetId || null,
      created_at: new Date().toISOString()
    };

    const { data, error } = await db
      .from('broadcasts')
      .insert([payload])
      .select()
      .single();

    if (error) {
       console.error('[broadcastService] Error creating broadcast:', error.message);
       return { ok: false, error: error.message };
    }
    return { ok: true, data };
  } catch (err: any) {
    console.error('[broadcastService] Exception creating broadcast:', err);
    return { ok: false, error: err.message };
  }
}
