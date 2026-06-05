/**
 * Database initialization module (Refactored for Backend)
 * Checks connectivity to the backend API
 */

import { fetchBackend } from './api';

export async function initializeDatabase() {
  console.log('🔄 Checking backend connectivity...');
  
  try {
    const res = await fetchBackend('getMasterCatalog');

    if (res.status === 'error') {
      console.warn('⚠️ Backend connection warning:', res.message);
      return { connected: false, message: res.message };
    }

    console.log('✅ Backend connection successful');
    return { connected: true, message: 'Backend connected successfully' };
  } catch (error) {
    console.error('❌ Connectivity check error:', error);
    return { connected: false, message: String(error) };
  }
}

export async function createSupabaseTablesIfNotExists() {
  // This is now handled by backend migrations/scripts
  console.log('🔍 Database schema is managed by backend services.');
  return true;
}
