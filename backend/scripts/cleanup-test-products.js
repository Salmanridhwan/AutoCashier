import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Find all test products with name "asdasd"
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name')
    .ilike('name', '%asdasd%');

  if (error) { console.error('Error:', error); return; }
  if (!products || products.length === 0) { console.log('No test products found'); return; }

  console.log(`Found ${products.length} test products to delete:`);
  products.forEach(p => console.log(`  - ${p.id}: ${p.name}`));

  for (const p of products) {
    // Delete product_images
    await supabase.from('product_images').delete().eq('product_id', p.id);
    // Delete branch_inventory
    await supabase.from('branch_inventory').delete().eq('product_id', p.id);
    // Delete product
    const { error: delErr } = await supabase.from('products').delete().eq('id', p.id);
    if (delErr) console.error(`  ❌ Failed to delete ${p.id}:`, delErr.message);
    else console.log(`  ✅ Deleted ${p.name}`);
  }

  // Also clean up storage folder
  console.log('\n✅ Cleanup complete');
}

main().catch(console.error);
