import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zhghwaypdgpxlznkammt.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoZ2h3YXlwZGdweGx6bmthbW10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0ODYyMjEsImV4cCI6MjA5MzA2MjIyMX0.YBZzHYeOCAC5YMvSP8Vrh0It2nzCltP8oQPW85QVauw';

// Initialize Supabase client (only once to avoid multiple instances)
let supabaseInstance: any = null;

function getSupabaseClient() {
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseInstance;
}

export const supabase = getSupabaseClient();

// Test connection
export async function testSupabaseConnection() {
  try {
    const { data, error } = await supabase.from('master_catalog').select('count()', { count: 'exact' });
    if (error) {
      console.error('Supabase connection error:', error);
      return false;
    }
    console.log('✅ Supabase connection successful');
    return true;
  } catch (err) {
    console.error('Connection test failed:', err);
    return false;
  }
}
