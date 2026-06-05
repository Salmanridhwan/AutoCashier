import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Check if table exists by querying it
  const { data, error } = await supabase.from('product_requests').select('id').limit(1);
  
  if (error) {
    console.log('❌ Table product_requests does not exist or error:', error.message);
    console.log('\n📋 Please run the SQL in backend/scripts/create-product-requests-table.sql in Supabase SQL Editor');
  } else {
    console.log('✅ Table product_requests exists');
    console.log('   Records:', data?.length || 0);
  }
}

main().catch(console.error);
