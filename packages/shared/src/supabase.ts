import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolves environment variables for Supabase configuration.
 * Supports both frontend (import.meta.env with VITE_ prefix) and backend (process.env).
 */
function getEnvVar(viteName: string, nodeName: string): string | undefined {
  // Frontend (Vite) — import.meta.env is available at build time
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const value = import.meta.env[viteName];
    if (value) return value;
  }

  // Backend (Node.js) — process.env is available at runtime
  if (typeof process !== 'undefined' && process.env) {
    const value = process.env[nodeName];
    if (value) return value;
  }

  return undefined;
}

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL', 'SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[@autocashier/shared] Supabase URL or Anon Key not found in environment variables. ' +
    'Ensure VITE_SUPABASE_URL / SUPABASE_URL and VITE_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY are set.'
  );
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
);
