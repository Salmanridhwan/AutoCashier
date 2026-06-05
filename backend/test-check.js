import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars', supabaseUrl, supabaseKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const phone = '082320908035';
  let cleanPhone = phone.replace(/\D/g, '');
  let format0 = cleanPhone;
  let format62 = cleanPhone;
  let formatPlus62 = '+' + cleanPhone;

  if (cleanPhone.startsWith('0')) {
    format62 = '62' + cleanPhone.slice(1);
    formatPlus62 = '+62' + cleanPhone.slice(1);
  } else if (cleanPhone.startsWith('62')) {
    format0 = '0' + cleanPhone.slice(2);
    formatPlus62 = '+' + cleanPhone;
  }

  const checkPhones = [phone, format0, format62, formatPlus62];
  console.log('Checking phones:', checkPhones);

  const { data: member, error } = await supabase
    .from('users')
    .select('id, full_name, role, whatsapp')
    .in('whatsapp', checkPhones)
    .limit(1)
    .maybeSingle();

  console.log('Result:', member, error);
}

test();
