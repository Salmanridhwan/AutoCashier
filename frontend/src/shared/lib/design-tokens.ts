/**
 * AutoCashier Design System Tokens
 * ─────────────────────────────────
 * Gunakan konstanta ini di seluruh halaman agar desain konsisten.
 */

// ─── CARD ─────────────────────────────────────────────────────
export const card = {
  /** Stat mini card: compact, di dashboard / ringkasan atas halaman */
  stat: 'bg-white rounded-2xl border border-gray-100 shadow-sm p-5',
  /** Content card: kartu konten utama */
  base: 'bg-white rounded-3xl border border-gray-100 shadow-sm',
  /** Table card: wrapper tabel data */
  table: 'bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden',
  /** Feature card: kartu aksi / highlight (promo, branch) */
  feature: 'bg-white rounded-[32px] border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer',
  /** Dark hero card: chart / stat highlight besar */
  dark: 'bg-[#0F172A] rounded-3xl shadow-sm overflow-hidden relative',
};

// ─── TABLE ────────────────────────────────────────────────────
export const table = {
  /** thead row */
  head: 'bg-gray-50/60 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]',
  /** th cell standard (left-padded) */
  th: 'py-4 pl-6',
  /** th cell right-aligned */
  thRight: 'py-4 pr-6 text-right',
  /** tbody row */
  row: 'group hover:bg-indigo-50/20 transition-all duration-200',
  /** td cell standard */
  td: 'py-4 pl-6',
  /** td cell right-aligned */
  tdRight: 'py-4 pr-6 text-right',
  /** tbody divider */
  divider: 'divide-y divide-gray-50',
};

// ─── TYPOGRAPHY ───────────────────────────────────────────────
export const text = {
  /** Page title */
  pageTitle: 'text-3xl font-black text-gray-900 tracking-tight',
  /** Page subtitle */
  pageSubtitle: 'text-sm text-gray-500 mt-1',
  /** Section label (small caps) */
  label: 'text-[10px] font-black uppercase tracking-widest text-gray-400',
  /** Big number in stat */
  statValue: 'text-2xl font-black text-gray-900 tracking-tight font-mono',
  /** Large feature number */
  bigValue: 'text-4xl font-black text-gray-900 tracking-tighter leading-none font-mono',
};

// ─── ICON BOX ─────────────────────────────────────────────────
export const iconBox = {
  indigo: 'p-2.5 bg-indigo-50 text-indigo-600 rounded-xl',
  emerald: 'p-2.5 bg-emerald-50 text-emerald-600 rounded-xl',
  amber: 'p-2.5 bg-amber-50 text-amber-600 rounded-xl',
  rose: 'p-2.5 bg-rose-50 text-rose-600 rounded-xl',
  gray: 'p-2.5 bg-gray-100 text-gray-500 rounded-xl',
};

// ─── BADGE / STATUS ───────────────────────────────────────────
export const badge = {
  critical: 'bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg',
  warning: 'bg-amber-50 text-amber-600 border border-amber-200 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg',
  healthy: 'bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg',
  info: 'bg-indigo-50 text-indigo-600 border border-indigo-200 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg',
  neutral: 'bg-gray-100 text-gray-500 border border-gray-200 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg',
};

// ─── BUTTON ───────────────────────────────────────────────────
export const btn = {
  primary: 'bg-indigo-600 hover:bg-indigo-700 text-white h-10 px-5 rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/20 transition-all hover:scale-[1.02]',
  danger: 'bg-rose-500 hover:bg-rose-600 text-white h-10 px-5 rounded-xl font-bold text-xs shadow-lg shadow-rose-500/20 transition-all',
  ghost: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 h-10 px-4 rounded-xl font-bold text-xs transition-all',
  outline: 'border border-gray-200 text-gray-700 hover:bg-gray-50 h-10 px-4 rounded-xl font-bold text-xs transition-all',
  iconAction: 'rounded-xl h-9 w-9 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all',
};

// ─── PAGE SECTION ─────────────────────────────────────────────
export const section = {
  /** Standard horizontal header row between title and action button */
  header: 'flex flex-col md:flex-row md:items-center justify-between gap-4',
  /** Stats mini cards row */
  statsRow: 'grid grid-cols-2 md:grid-cols-4 gap-4',
  /** Main content grid (single col) */
  content: 'space-y-6',
};
