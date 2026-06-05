/**
 * Script untuk debug login: cek apakah user ada di database
 * Jalankan: npx tsx scripts/check_user.ts <username>
 *
 * Contoh: npx tsx scripts/check_user.ts kasir1
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

const username = process.argv[2];

if (!username) {
  console.error('Usage: npx tsx scripts/check_user.ts <username>');
  process.exit(1);
}

const { data, error } = await supabase
  .from('users')
  .select('id, username, email, full_name, role, branch_id, password')
  .eq('username', username)
  .maybeSingle();

if (error) {
  console.error('❌ DB Error:', error.message);
  process.exit(1);
}

if (!data) {
  console.log(`❌ User "${username}" tidak ditemukan di database`);
  console.log('\nSemua user yang ada:');
  const { data: allUsers } = await supabase
    .from('users')
    .select('id, username, role, full_name')
    .limit(20);
  console.table(allUsers);
} else {
  console.log(`✅ User "${username}" ditemukan:`);
  console.log(`   - ID: ${data.id}`);
  console.log(`   - Role: ${data.role}`);
  console.log(`   - Full name: ${data.full_name}`);
  console.log(`   - Branch ID: ${data.branch_id}`);
  console.log(`   - Password hash: ${data.password ? '✅ ada (bcrypt)' : '❌ KOSONG - tidak bisa login!'}`);
}
