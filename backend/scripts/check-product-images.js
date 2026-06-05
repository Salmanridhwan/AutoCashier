import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Try inserting a test row to see what error we get
  const testRow = {
    product_id: '00000000-0000-0000-0000-000000000000',
    angle: 'front_mirror',
    filename: 'test.jpg',
    storage_path: 'test/path.jpg',
    image_url: 'https://example.com/test.jpg'
  };

  console.log('Testing insert with angle "front_mirror"...');
  const { data, error } = await supabase.from('product_images').insert([testRow]).select();
  
  if (error) {
    console.log('ERROR:', JSON.stringify(error, null, 2));
    
    // Check if it's a column issue - try without some fields
    console.log('\nChecking table columns...');
    const { data: sample, error: sampleErr } = await supabase.from('product_images').select('*').limit(1);
    if (sampleErr) {
      console.log('Sample query error:', JSON.stringify(sampleErr, null, 2));
    } else if (sample && sample.length > 0) {
      console.log('Existing columns:', Object.keys(sample[0]));
    } else {
      console.log('Table is empty. Trying to get column info from empty select...');
      const { data: d2 } = await supabase.from('product_images').select('*').limit(0);
      console.log('Empty result:', d2);
    }
  } else {
    console.log('SUCCESS - row inserted:', data);
    // Clean up test row
    await supabase.from('product_images').delete().eq('product_id', '00000000-0000-0000-0000-000000000000');
    console.log('Test row cleaned up.');
  }
}

main().catch(console.error);
