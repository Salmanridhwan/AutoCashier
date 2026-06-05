// Shared User types for all AutoCashier apps

export type UserRole = 'super_admin' | 'branch_admin' | 'admin' | 'kasir' | 'member';

export interface User {
  id: string;
  username: string;
  full_name: string;
  email?: string | null;
  whatsapp?: string | null;
  role: UserRole;
  branch_id?: string | null;
  avatar_url?: string | null;
  points?: number;
  is_active: boolean;
  created_at: string;
}

export type RedirectPath = '/admin' | '/kasir' | '/member';

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
  redirect?: RedirectPath;
}

/**
 * Maps a user role to the appropriate redirect path after login.
 * - super_admin / branch_admin / admin → /admin
 * - kasir → /kasir
 * - member → /member
 */
export function getRedirectForRole(role: UserRole): RedirectPath {
  switch (role) {
    case 'super_admin':
    case 'branch_admin':
    case 'admin':
      return '/admin';
    case 'kasir':
      return '/kasir';
    case 'member':
      return '/member';
  }
}
