// Script to check and fix kasir user passwords
// Run: node backend/scripts/fix-kasir-password.js

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

const KASIR_PASSWORD = 'kasir123';

async function main() {
  console.log('🔍 Checking kasir users...\n');

  // Get all kasir users
  const { data: users, error } = await supabase
    .from('users')
    .select('id, username, role, password')
    .eq('role', 'kasir');

  if (error) {
    console.error('❌ Error fetching users:', error.message);
    process.exit(1);
  }

  if (!users || users.length === 0) {
    console.log('⚠️  No kasir users found in database!');
    process.exit(0);
  }

  console.log(`Found ${users.length} kasir user(s):\n`);

  const newHash = await bcrypt.hash(KASIR_PASSWORD, 10);

  for (const user of users) {
    const pw = user.password;
    const isBcrypt = pw && (pw.startsWith('$2a$') || pw.startsWith('$2b$'));
    
    let passwordValid = false;
    if (isBcrypt) {
      passwordValid = await bcrypt.compare(KASIR_PASSWORD, pw);
    }

    console.log(`  👤 ${user.username}`);
    console.log(`     Password is bcrypt hash: ${isBcrypt ? '✅' : '❌ (plain text or invalid)'}`);
    console.log(`     Password matches 'kasir123': ${passwordValid ? '✅' : '❌'}`);

    if (!passwordValid) {
      // Update password
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: newHash })
        .eq('id', user.id);

      if (updateError) {
        console.log(`     ❌ Failed to update: ${updateError.message}`);
      } else {
        console.log(`     ✅ Password updated to 'kasir123'`);
      }
    }
    console.log('');
  }

  console.log('✅ Done! Try logging in with username: kasir_bdg, password: kasir123');
}

main().catch(console.error);
