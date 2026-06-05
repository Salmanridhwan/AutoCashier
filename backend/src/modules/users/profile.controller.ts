import { Request, Response } from 'express';
import { supabaseAdmin as supabase } from '../../config/supabaseClient.js';
import { hashPassword, comparePassword } from '../../utils/passwords.js';

// GET current user profile + member points balance
export async function getProfileController(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user || !user.sub) return res.status(401).json({ status: 'error', error: 'UNAUTHORIZED' });

    // Fetch user data
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, full_name, role, created_at, whatsapp')
      .eq('id', user.sub)
      .single();

    if (error || !data) {
      console.error('Error fetching profile:', error);
      return res.status(404).json({ status: 'error', error: 'USER_NOT_FOUND' });
    }

    // Fetch member points balance
    const { data: pointsData } = await supabase
      .from('member_points')
      .select('balance, updated_at')
      .eq('user_id', user.sub)
      .maybeSingle();

    return res.json({
      status: 'success',
      data: {
        ...data,
        member_points: pointsData?.balance ?? 0,
        points_updated_at: pointsData?.updated_at ?? null,
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ status: 'error', error: 'INTERNAL_SERVER_ERROR' });
  }
}

// PUT update profile info (full_name, email, whatsapp)
export async function updateProfileController(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user || !user.sub) return res.status(401).json({ status: 'error', error: 'UNAUTHORIZED' });

    const { full_name, email, whatsapp, username } = req.body;

    // Build update object with only provided fields
    const updateData: Record<string, any> = {};
    if (full_name !== undefined) updateData.full_name = full_name;
    if (email !== undefined) updateData.email = email;
    if (whatsapp !== undefined) updateData.whatsapp = whatsapp;
    if (username !== undefined) updateData.username = username;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ status: 'error', error: 'NO_FIELDS_TO_UPDATE' });
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', user.sub)
      .select('id, username, email, full_name, role, created_at, whatsapp')
      .single();

    if (error || !data) {
      console.error('Error updating profile:', error);
      if (error?.code === '23505') {
        return res.status(400).json({ status: 'error', error: 'USERNAME_TAKEN' });
      }
      return res.status(500).json({ status: 'error', error: 'FAILED_TO_UPDATE_PROFILE' });
    }

    // Also fetch member points
    const { data: pointsData } = await supabase
      .from('member_points')
      .select('balance')
      .eq('user_id', user.sub)
      .maybeSingle();

    return res.json({
      status: 'success',
      data: {
        ...data,
        member_points: pointsData?.balance ?? 0,
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ status: 'error', error: 'INTERNAL_SERVER_ERROR' });
  }
}

// PUT update password
export async function updatePasswordController(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user || !user.sub) return res.status(401).json({ status: 'error', error: 'UNAUTHORIZED' });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ status: 'error', error: 'INVALID_INPUT' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ status: 'error', error: 'PASSWORD_TOO_SHORT' });
    }

    // Fetch the user's current password
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('password')
      .eq('id', user.sub)
      .single();

    if (fetchError || !userData) {
      return res.status(404).json({ status: 'error', error: 'USER_NOT_FOUND' });
    }

    const hash = userData.password;
    if (!hash) {
      return res.status(500).json({ status: 'error', error: 'NO_PASSWORD_SET' });
    }

    // Verify current password
    const match = await comparePassword(currentPassword, hash);
    if (!match) {
      return res.status(401).json({ status: 'error', error: 'INCORRECT_CURRENT_PASSWORD' });
    }

    // Hash new password
    const newHash = await hashPassword(newPassword);

    // Update password in database
    const { error: updateError } = await supabase
      .from('users')
      .update({ password: newHash })
      .eq('id', user.sub);

    if (updateError) {
      console.error('Error updating password:', updateError);
      return res.status(500).json({ status: 'error', error: 'FAILED_TO_UPDATE_PASSWORD' });
    }

    return res.json({ status: 'success', message: 'Password berhasil diperbarui' });
  } catch (error) {
    console.error('Update password error:', error);
    return res.status(500).json({ status: 'error', error: 'INTERNAL_SERVER_ERROR' });
  }
}

// GET member points balance for a user_id
export async function getMemberPointsController(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user || !user.sub) return res.status(401).json({ status: 'error', error: 'UNAUTHORIZED' });

    const { data, error } = await supabase
      .from('member_points')
      .select('balance, updated_at')
      .eq('user_id', user.sub)
      .maybeSingle();

    return res.json({
      status: 'success',
      data: {
        user_id: user.sub,
        balance: data?.balance ?? 0,
        updated_at: data?.updated_at ?? null,
      }
    });
  } catch (error) {
    console.error('Get member points error:', error);
    return res.status(500).json({ status: 'error', error: 'INTERNAL_SERVER_ERROR' });
  }
}

// POST upload profile photo
export async function uploadProfilePhotoController(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user || !user.sub) return res.status(401).json({ status: 'error', error: 'UNAUTHORIZED' });

    if (!req.file) {
      return res.status(400).json({ status: 'error', error: 'NO_FILE_PROVIDED' });
    }

    // Get current avatar_url to delete old file from storage
    try {
      const { data: currentUser } = await supabase
        .from('users')
        .select('avatar_url')
        .eq('id', user.sub)
        .maybeSingle();

      if (currentUser?.avatar_url) {
        // Extract storage path from the public URL
        const urlParts = currentUser.avatar_url.split('/avatars/');
        if (urlParts.length > 1) {
          const oldPath = urlParts[1];
          await supabase.storage.from('avatars').remove([oldPath]);
          console.log(`[Profile] 🗑️ Deleted old avatar: ${oldPath}`);
        }
      }
    } catch (delErr) {
      console.warn('[Profile] ⚠️ Failed to delete old avatar:', delErr);
    }

    const fileExt = req.file.originalname.split('.').pop();
    const fileName = `${user.sub}_${Date.now()}.${fileExt}`;

    // Upload to Supabase Storage 'avatars' bucket
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return res.status(500).json({ status: 'error', error: 'FAILED_TO_UPLOAD_PHOTO' });
    }

    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    const photoUrl = publicUrlData.publicUrl;

    // Update users table with new avatar_url
    try {
      await supabase
        .from('users')
        .update({ avatar_url: photoUrl })
        .eq('id', user.sub);
    } catch (dbErr) {
      // Ignored: schema might not have avatar_url yet
    }

    return res.json({
      status: 'success',
      data: { avatar_url: photoUrl }
    });
  } catch (error) {
    console.error('Upload profile photo error:', error);
    return res.status(500).json({ status: 'error', error: 'INTERNAL_SERVER_ERROR' });
  }
}
