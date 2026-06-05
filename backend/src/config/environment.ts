import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from monorepo root (backend/src/config → backend/src → backend → root)
const envPath = path.resolve(__dirname, '../../../.env');
const result = dotenv.config({ path: envPath });
if (result.error) {
  // Fallback: try relative to process.cwd()
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
}

export const env = {
  port: process.env.PORT || '5000',
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  jwtSecret: process.env.JWT_SECRET || 'change_this',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3010,http://localhost:3011,http://localhost:3012',
  visionServerUrl: process.env.VISION_SERVER_URL || 'http://localhost:5002',
};
