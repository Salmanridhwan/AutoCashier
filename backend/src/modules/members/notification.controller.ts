import { Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../../config/supabaseClient.js';

/**
 * Get notifications for the authenticated member.
 * Fetches from a notifications table filtered by user_id, or broadcasts visible to all members.
 */
async function getNotifications(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID not found in token' });
    }

    const client = supabaseAdmin || supabase;

    // Try fetching from notifications table (user-specific notifications)
    const { data: userNotifications, error: notifError } = await client
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    // If notifications table doesn't exist, fall back to broadcasts
    if (notifError && notifError.code === '42P01') {
      // Table doesn't exist — try broadcasts as fallback
      const { data: broadcasts, error: broadcastError } = await client
        .from('broadcasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (broadcastError && broadcastError.code === '42P01') {
        // Neither table exists, return empty
        return res.json({ success: true, data: [] });
      }

      if (broadcastError) throw broadcastError;

      const mapped = (broadcasts || []).map((b: any) => ({
        id: b.id,
        title: b.title || 'Notifikasi',
        message: b.message || b.content,
        type: 'broadcast',
        is_read: false,
        created_at: b.created_at,
      }));

      return res.json({ success: true, data: mapped });
    }

    if (notifError) throw notifError;

    res.json({ success: true, data: userNotifications || [] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch notifications' });
  }
}

export default { getNotifications };
