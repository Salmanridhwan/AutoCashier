import { createClient } from '@supabase/supabase-js';
import { env } from './environment.js';

const supabaseUrl = env.supabaseUrl;
const supabaseAnonKey = env.supabaseAnonKey;
const supabaseServiceRoleKey = env.supabaseServiceRoleKey;

// If supabase env not provided, provide a lightweight stub so the server can run
class QueryStub {
  from(_table: string) { return this; }
  select() { return this; }
  eq() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve({ data: null, error: new Error('Supabase not configured') }); }
  insert() { return Promise.resolve({ data: null, error: new Error('Supabase not configured') }); }
  update() { return Promise.resolve({ data: null, error: new Error('Supabase not configured') }); }
  delete() { return Promise.resolve({ data: null, error: new Error('Supabase not configured') }); }
}

let supabase: any;
let supabaseAdmin: any | null = null;

if (!supabaseUrl || !supabaseAnonKey) {
  supabase = new QueryStub();
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

if (supabaseUrl && supabaseServiceRoleKey) {
  try {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    console.log('[Supabase] 🛡️  Admin client initialized with Service Role Key');
  } catch (e) {
    console.error('[Supabase] ❌ Failed to initialize Admin client:', e);
    supabaseAdmin = supabase;
  }
} else {
  console.warn('[Supabase] ⚠️  Service Role Key missing. Admin features will be disabled.');
  supabaseAdmin = supabase;
}

export { supabase, supabaseAdmin };
