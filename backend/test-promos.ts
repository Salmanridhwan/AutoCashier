import { supabaseAdmin } from './src/config/supabaseClient.js';
async function test() {
  const { data, error } = await supabaseAdmin.from('member_promos').update({ starts_at: '2026-06-10T07:35:00.000Z' }).eq('code', 'TEST').select();
  console.log('Updated:', data);
  if (error) console.error(error);
}
test();
