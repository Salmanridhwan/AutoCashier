// Direct test of loginWithUsername function
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testLogin() {
  const username = 'kasir_bdg';
  const password = 'kasir123';

  console.log(`Testing login for: ${username}`);
  console.log(`Supabase URL: ${process.env.SUPABASE_URL}`);
  console.log('');

  // Query exactly like auth.service.ts does
  const { data, error } = await supabase
    .from('users')
    .select('id, username, email, full_name, role, created_at, whatsapp, password, avatar_url, branch_id')
    .eq('username', username)
    .limit(1)
    .maybeSingle();

  console.log('Query error:', error);
  console.log('Query data:', data ? { ...data, password: data.password?.substring(0, 20) + '...' } : null);

  if (!data) {
    console.log('\n❌ User not found! Check if username column matches exactly.');
    return;
  }

  const hash = data.password;
  console.log(`\nPassword hash starts with: ${hash?.substring(0, 10)}`);
  console.log(`Hash length: ${hash?.length}`);

  const match = hash ? await bcrypt.compare(password, hash) : false;
  console.log(`Password match: ${match ? '✅' : '❌'}`);
}

testLogin().catch(console.error);
