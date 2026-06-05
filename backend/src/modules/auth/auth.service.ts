import { supabaseAdmin as supabase } from '../../config/supabaseClient.js';
import { comparePassword, hashPassword } from '../../utils/passwords.js';
import { signToken } from '../../utils/jwt.js';

export async function loginWithUsername(usernameOrPhone: string, password: string) {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, email, full_name, role, created_at, whatsapp, password, avatar_url, branch_id')
    .or(`username.eq.${usernameOrPhone},whatsapp.eq.${usernameOrPhone}`)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: 'INVALID_CREDENTIALS' };
  }

  const hash = data.password;
  const match = hash ? await comparePassword(password, hash) : false;
  if (!match) return { ok: false, error: 'INVALID_CREDENTIALS' };

  const token = signToken({ sub: data.id, role: data.role, username: data.username, branch_id: data.branch_id || null });

  // Return safe user (no password)
  const { password: _pw, ...safeUser } = data;

  return { ok: true, token, user: safeUser };
}

export async function registerMember(username: string, email: string, phone: string, password: string) {
  try {
    // 1. Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .or(`username.eq.${username},email.eq.${email},whatsapp.eq.${phone}`)
      .maybeSingle();

    if (existingUser) {
      return { ok: false, error: 'USER_ALREADY_EXISTS' };
    }

    // 2. Hash password
    const hashedPassword = await hashPassword(password);

    // 3. Insert new member
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        username,
        email,
        full_name: username,
        whatsapp: phone,
        password: hashedPassword,
        role: 'member',
        branch_id: null
      })
      .select('id, username, email, full_name, role, created_at, whatsapp, avatar_url')
      .single();

    if (insertError || !newUser) {
      console.error('[AUTH SERVICE] Insert error:', insertError);
      return { ok: false, error: 'REGISTRATION_FAILED' };
    }

    // 4. Initialize member points for loyalty
    await supabase.from('member_points').insert({
      user_id: newUser.id,
      balance: 0
    });

    return { ok: true };
  } catch (err: any) {
    console.error('[AUTH SERVICE] registerMember exception:', err);
    return { ok: false, error: 'SERVER_ERROR' };
  }
}

export async function verifyMemberOtp(email: string, otp: string) {
  try {
    // Retrieve user by email
    const { data: member, error } = await supabase
      .from('users')
      .select('id, username, email, full_name, role, created_at, whatsapp, avatar_url, branch_id')
      .eq('email', email)
      .maybeSingle();

    if (error || !member) {
      return { ok: false, error: 'USER_NOT_FOUND' };
    }

    // Sign token
    const token = signToken({ sub: member.id, role: member.role, username: member.username, branch_id: member.branch_id || null });

    return { ok: true, token, user: member };
  } catch (err: any) {
    console.error('[AUTH SERVICE] verifyMemberOtp exception:', err);
    return { ok: false, error: 'SERVER_ERROR' };
  }
}
