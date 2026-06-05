// Check what env vars the backend actually sees at runtime
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simulate what environment.ts does
const envPath = path.resolve(__dirname, '../../.env');
console.log('Loading .env from:', envPath);
const result = dotenv.config({ path: envPath });
console.log('dotenv result error:', result.error || 'none');
console.log('');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ set' : '❌ NOT SET');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✅ set' : '❌ NOT SET');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ set' : '❌ NOT SET');
console.log('');

// Now check: does the backend dev script use --env-file=.env?
// That loads from CWD which is 'backend/' folder - there's no .env there!
console.log('⚠️  Backend dev script uses: tsx watch --env-file=.env');
console.log('   This loads .env from CWD (backend/ folder)');
console.log('   But .env is in the ROOT folder!');

import fs from 'fs';
const backendEnvExists = fs.existsSync(path.resolve(__dirname, '../.env'));
console.log(`\n   backend/.env exists: ${backendEnvExists ? '✅' : '❌ MISSING!'}`);
