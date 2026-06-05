import app from './app.js';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`[server] AutoCashier Backend running on port ${PORT}`);
  console.log(`[server] Supabase: ${process.env.SUPABASE_URL ? '✅ configured' : '❌ NOT SET'}`);
  console.log(`[server] Environment: ${process.env.NODE_ENV || 'development'}`);
});
