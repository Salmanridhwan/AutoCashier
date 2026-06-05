import { supabase, supabaseAdmin } from '../../config/supabaseClient.js';
import bcrypt from 'bcryptjs';

export async function getAllUsers() {
  try {
    const db = supabaseAdmin || supabase;
    // Fetch users from the 'users' table
    const { data, error } = await db
      .from('users')
      .select(`
        id,
        full_name,
        email,
        role,
        username,
        avatar_url,
        branch_id,
        branches (
          name
        ),
        member_points (
          balance
        )
      `)
      .order('full_name');

    if (error) {
      // If error occurs (likely because branch_id doesn't exist yet), fallback
      console.warn('[userService] Failed to fetch users with branches, falling back...', error);
    }
    
    // Fallback if the query above fails due to missing branch_id column
    const resultData = error ? (await db
      .from('users')
      .select(`
        id,
        full_name,
        email,
        role,
        username,
        avatar_url,
        member_points (
          balance
        )
      `)
      .order('full_name')).data : data;

    return { 
      ok: true, 
      data: (resultData || []).map((u: any) => ({
        id: u.id,
        name: u.full_name || u.username,
        full_name: u.full_name,
        username: u.username,
        profile_picture: u.avatar_url,
        email: u.email,
        role: u.role === 'super_admin' ? 'Super Admin' : (u.role === 'branch_admin' ? 'Branch Admin' : (u.role === 'member' ? 'Member' : u.role)),
        branchId: u.branch_id,
        location: u.branches?.name || 'All Branches',
        status: 'Active',
        points: u.member_points ? (Array.isArray(u.member_points) ? (u.member_points[0]?.balance || 0) : (u.member_points.balance || 0)) : 0
      }))
    };
  } catch (err) {
    console.error('[userService] ❌ Error fetching users:', err);
    return { ok: false, error: err };
  }
}

export async function createUser(userData: any) {
  try {
    const db = supabaseAdmin || supabase;
    
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(userData.password, salt);

    let roleEnum = 'member';
    const roleLower = String(userData.role || '').toLowerCase();
    if (roleLower === 'super_admin' || roleLower === 'super admin') {
      roleEnum = 'super_admin';
    } else if (roleLower === 'branch_admin' || roleLower === 'branch admin') {
      roleEnum = 'branch_admin';
    } else if (roleLower === 'kasir' || roleLower === 'cashier') {
      roleEnum = 'kasir';
    } else if (roleLower === 'member') {
      roleEnum = 'member';
    }
    
    const insertPayload: any = {
      username: userData.email.split('@')[0], // Use email prefix as default username
      email: userData.email,
      password: hash,
      full_name: userData.name,
      role: roleEnum
    };
    
    if ((roleEnum === 'branch_admin' || roleEnum === 'kasir') && userData.branchId) {
      insertPayload.branch_id = userData.branchId;
    }

    const { data, error } = await db
      .from('users')
      .insert([insertPayload])
      .select()
      .single();

    if (error) throw error;

    return { ok: true, data };
  } catch (err) {
    console.error('[userService] ❌ Error creating user:', err);
    return { ok: false, error: err };
  }
}

export async function updateUser(userId: string, updates: any) {
  try {
    const db = supabaseAdmin || supabase;
    let roleEnum = 'member';
    const roleLower = String(updates.role || '').toLowerCase();
    if (roleLower === 'super_admin' || roleLower === 'super admin') {
      roleEnum = 'super_admin';
    } else if (roleLower === 'branch_admin' || roleLower === 'branch admin') {
      roleEnum = 'branch_admin';
    } else if (roleLower === 'kasir' || roleLower === 'cashier') {
      roleEnum = 'kasir';
    } else if (roleLower === 'member') {
      roleEnum = 'member';
    }
    
    const updatePayload: any = {
      full_name: updates.name,
      role: roleEnum,
      email: updates.email
    };
    
    if ((roleEnum === 'branch_admin' || roleEnum === 'kasir') && updates.branchId) {
      updatePayload.branch_id = updates.branchId;
    } else if (roleEnum !== 'branch_admin' && roleEnum !== 'kasir') {
      updatePayload.branch_id = null; // Remove branch assignment if no longer branch admin or kasir
    }
    
    const { error } = await db
      .from('users')
      .update(updatePayload)
      .eq('id', userId);

    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error('[userService] ❌ Error updating user:', err);
    return { ok: false, error: err };
  }
}

export async function deleteUser(userId: string) {
  try {
    const db = supabaseAdmin || supabase;
    const { error } = await db
      .from('users')
      .delete()
      .eq('id', userId);
      
    if (error) throw error;
    
    return { ok: true };
  } catch (err) {
    console.error('[userService] ❌ Error deleting user:', err);
    return { ok: false, error: err };
  }
}

export async function assignMemberPromo(userId: string, promoData: any) {
  try {
    const db = supabaseAdmin || supabase;
    const { data, error } = await db
      .from('member_promos')
      .insert([{
        user_id: userId,
        code: promoData.code,
        discount_type: promoData.discount_type,
        discount_value: promoData.discount_value,
        min_purchase: promoData.min_purchase || 0,
        expires_at: promoData.expires_at || null,
        is_used: false
      }])
      .select()
      .single();

    if (error) throw error;
    return { ok: true, data };
  } catch (err) {
    console.error('[userService] ❌ Error assigning member promo:', err);
    return { ok: false, error: err };
  }
}
