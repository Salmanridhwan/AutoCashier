import { useState, useEffect, useCallback } from 'react';
import {
  ShoppingCart,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Receipt,
  CreditCard,
  Calendar,
  Eye,
  X,
  Check,
  ChevronsUpDown,
  MapPin,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/components/ui/command';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { useAuth } from '@/shared/context/AuthContext';
import { useLocation } from '@/shared/context/LocationContext';
import { fetchBackend } from '@/shared/lib/api';
import { cn } from '@/shared/lib/utils';
import { useLanguage } from '@/shared/context/LanguageContext';
import PageTransition from '@/shared/components/ui/PageTransition';
import { StaggerList, StaggerItem } from '@/shared/components/ui/StaggerList';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TransactionItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  products?: {
    id: string;
    name: string;
    sku: string;
    category: string;
  };
}

interface UserRef {
  id: string;
  username: string;
  full_name?: string | null;
}

interface Transaction {
  id: string;
  order_number: string;
  invoice_number: string;
  total_price: number;
  payment_method: string;
  status: string;
  payment_status: string;
  cashier_id: string | null;
  member_id: string | null;
  cashier?: UserRef | null;
  member?: UserRef | null;
  receipt_url: string | null;
  branch_id: string | null;
  created_at: string;
  transaction_items?: TransactionItem[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Stats {
  totalRevenue: number;
  totalCount: number;
  avgOrder: number;
  completedCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string, lang: string): string {
  return new Date(dateStr).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pending:   'bg-amber-100  text-amber-700  border-amber-200',
  cancelled: 'bg-rose-100   text-rose-700   border-rose-200',
  refunded:  'bg-purple-100 text-purple-700 border-purple-200',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const { user } = useAuth();
  const { allBranches } = useLocation();
  const { t, language } = useLanguage();
  const isSuperAdmin = user?.role === 'super_admin';
  const branches = allBranches.filter((b) => b.id !== 'ALL');

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<Stats>({ totalRevenue: 0, totalCount: 0, avgOrder: 0, completedCount: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [branchOpen, setBranchOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc' | 'highest' | 'lowest'>('desc');

  const hasActiveFilters = !!(search || branchFilter !== 'ALL' || startDate || endDate || sortOrder !== 'desc');
  const loadTransactions = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page,
        limit: pagination.limit,
        sort: sortOrder,
      };

      if (isSuperAdmin && branchFilter !== 'ALL') params.branch_id = branchFilter;
      if (search.trim()) params.search = search.trim();
      if (startDate) params.start_date = new Date(startDate).toISOString();
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        params.end_date = end.toISOString();
      }

      const res = await fetchBackend('getTransactions', params);
      if (res.status !== 'success') return;

      const data: Transaction[] = res.data ?? [];
      const revenue = data.reduce((sum, t) => sum + Number(t.total_price), 0);

      setTransactions(data);
      setPagination((prev) => ({ ...prev, ...(res.pagination ?? {}), page }));

      setStats({
        totalRevenue:   revenue,
        totalCount:     res.pagination?.total ?? data.length,
        avgOrder:       data.length > 0 ? revenue / data.length : 0,
        completedCount: data.filter((t) => t.status === 'completed').length,
      });
    } finally {
      setLoading(false);
    }
  }, [branchFilter, sortOrder, search, startDate, endDate, isSuperAdmin, pagination.limit]);

  useEffect(() => { loadTransactions(1); }, [branchFilter, sortOrder, startDate, endDate]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => loadTransactions(1), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const handlePageChange = (page: number) => {
    if (page < 1 || page > pagination.totalPages) return;
    loadTransactions(page);
  };

  const clearFilters = () => {
    setSearch('');
    setBranchFilter('ALL');
    setStartDate('');
    setEndDate('');
    setSortOrder('desc');
  };

  const statCards = [
    { label: t('transactions.totalTransactions'),  value: stats.totalCount.toLocaleString(language === 'id' ? 'id-ID' : 'en-US'),    icon: ShoppingCart, color: 'text-indigo-600',  bg: 'bg-indigo-50' },
    { label: t('transactions.totalRevenue'), value: formatRupiah(stats.totalRevenue),             icon: TrendingUp,   color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: t('transactions.avgOrder'),  value: formatRupiah(stats.avgOrder),                 icon: Receipt,      color: 'text-amber-600',   bg: 'bg-amber-50' },
    { label: t('transactions.completed'),          value: stats.completedCount.toLocaleString(language === 'id' ? 'id-ID' : 'en-US'), icon: CreditCard,   color: 'text-purple-600',  bg: 'bg-purple-50' },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <PageTransition className="space-y-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-indigo-100 rounded-xl flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{t('transactions.subtitle')}</p>
            <p className="text-xs text-gray-400 mt-0.5">{t('transactions.subtitleDesc')}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadTransactions(pagination.page)}
          className="gap-2 rounded-xl self-start"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          {t('common.refresh')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.label} className="rounded-[28px] border-none shadow-sm bg-white">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0', card.bg)}>
                <card.icon className={cn('w-5 h-5', card.color)} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest truncate">{card.label}</p>
                <p className="text-lg font-black text-gray-900 truncate mt-0.5">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">

        {/* Search */}
        <div className="relative flex-1">
          <div className="absolute left-5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center pointer-events-none">
            <Search className="w-4 h-4 text-white" />
          </div>
          <Input
            placeholder={t('transactions.searchInvoice')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-16 pr-5 rounded-2xl border-none shadow-sm bg-white h-14 text-sm font-medium placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">

          {/* Branch picker — super admin only */}
          {isSuperAdmin && (
            <Popover open={branchOpen} onOpenChange={setBranchOpen}>
              <PopoverTrigger
                render={
                  <button className={cn(
                    'flex items-center gap-2 h-14 px-4 rounded-2xl text-sm font-bold shadow-sm transition-all',
                    branchFilter !== 'ALL' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:text-indigo-600',
                  )}>
                    <MapPin className="w-4 h-4 shrink-0" />
                    <span className="max-w-[120px] truncate">
                      {branchFilter === 'ALL'
                        ? t('transactions.allBranches')
                        : (branches.find((b) => b.id === branchFilter)?.name ?? t('common.branch'))}
                    </span>
                    <ChevronsUpDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
                  </button>
                }
              />
              <PopoverContent className="w-56 p-0 rounded-2xl shadow-xl font-sans" align="end">
                <Command>
                  <CommandInput placeholder={t('transactions.searchBranch')} className="h-9" />
                  <CommandList>
                    <CommandEmpty>{t('transactions.branchNotFound')}</CommandEmpty>
                    <CommandGroup>
                      <CommandItem value="ALL" onSelect={() => { setBranchFilter('ALL'); setBranchOpen(false); }}>
                        <Check className={cn('mr-2 h-4 w-4', branchFilter === 'ALL' ? 'opacity-100' : 'opacity-0')} />
                        {t('transactions.allBranches')}
                      </CommandItem>
                      {branches.map((b) => (
                        <CommandItem key={b.id} value={b.id} onSelect={() => { setBranchFilter(b.id); setBranchOpen(false); }}>
                          <Check className={cn('mr-2 h-4 w-4', branchFilter === b.id ? 'opacity-100' : 'opacity-0')} />
                          {b.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}

          {/* Date range */}
          <div className="flex items-center gap-1 bg-white rounded-2xl shadow-sm px-4 h-14">
            <Calendar className="w-4 h-4 text-indigo-400 shrink-0 mr-1" />
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border-none shadow-none h-8 w-32 text-xs font-semibold p-0 focus-visible:ring-0 text-gray-600"
            />
            <span className="text-gray-300 font-bold mx-1">|</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border-none shadow-none h-8 w-32 text-xs font-semibold p-0 focus-visible:ring-0 text-gray-600"
            />
          </div>

          {/* Sort — 4 options */}
          <div className="flex items-center bg-white rounded-2xl shadow-sm p-1.5 gap-1 h-14">
            {([
              { v: 'desc',    label: t('transactions.newest'),   icon: ArrowDown },
              { v: 'asc',     label: t('transactions.oldest'),   icon: ArrowUp },
              { v: 'highest', label: t('transactions.highest'),  icon: TrendingUp },
              { v: 'lowest',  label: t('transactions.lowest'),  icon: TrendingDown },
            ] as const).map(({ v, label, icon: Icon }) => (
              <button
                key={v}
                onClick={() => setSortOrder(v)}
                className={cn(
                  'flex items-center gap-1.5 h-full px-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap',
                  sortOrder === v
                    ? v === 'highest' ? 'bg-emerald-600 text-white shadow-sm'
                    : v === 'lowest'  ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Reset — only shown when filters are active */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors shadow-sm"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <Card className="rounded-[40px] border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="px-8 py-6 border-b border-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="font-black text-gray-900 text-base">{t('transactions.list')}</p>
              <p className="text-xs text-gray-400 font-medium mt-0.5">
                {pagination.total.toLocaleString(language === 'id' ? 'id-ID' : 'en-US')} {t('transactions.found')}
              </p>
            </div>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-2xl animate-spin" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center">
                <ShoppingCart className="w-7 h-7 text-gray-300" />
              </div>
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                {t('transactions.noTransactions')}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm font-sans">
              <thead>
                <tr className="border-b border-gray-100">
                  {[
                    t('transactions.invoice'),
                    t('transactions.date'),
                    ...(isSuperAdmin ? [t('transactions.branch')] : []),
                    t('transactions.total'),
                    t('transactions.status'),
                    t('transactions.customer'),
                    t('transactions.items'),
                    ''
                  ].map((h) => (
                    <th key={h} className="px-6 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <StaggerList as={motion.tbody} className="divide-y divide-gray-50">
                {transactions.map((tx, i) => {
                  const itemCount = tx.transaction_items?.reduce((s, item) => s + item.quantity, 0) ?? 0;
                  const branchName = isSuperAdmin && tx.branch_id
                    ? (branches.find((b) => b.id === tx.branch_id)?.name ?? `${tx.branch_id.slice(0, 8)}…`)
                    : null;

                  return (
                    <StaggerItem
                      as={motion.tr}
                      key={tx.id}
                      className="border-b border-gray-50 hover:bg-indigo-50/30 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                          {tx.invoice_number || '—'}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-gray-600 font-medium text-xs">
                        {formatDate(tx.created_at, language)}
                      </td>

                      {isSuperAdmin && (
                        <td className="px-6 py-4">
                          {branchName
                            ? <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded-lg">{branchName}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                      )}

                      <td className="px-6 py-4 font-black text-gray-900">
                        {formatRupiah(Number(tx.total_price))}
                      </td>

                      <td className="px-6 py-4">
                        <span className={cn(
                          'text-[11px] font-black uppercase tracking-wide px-3 py-1 rounded-full border',
                          STATUS_STYLES[tx.status] ?? 'bg-gray-100 text-gray-600 border-gray-200',
                        )}>
                          {tx.status === 'completed' ? t('transactions.completed') : tx.status}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        {tx.member ? (
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-indigo-700">{tx.member.username}</span>
                            {tx.member.full_name && (
                              <span className="text-[11px] text-gray-400 font-medium">{tx.member.full_name}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-center">
                        <span className="text-xs font-bold text-gray-500 bg-gray-100 w-7 h-7 rounded-full inline-flex items-center justify-center">
                          {itemCount}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity hover:bg-indigo-100 hover:text-indigo-600"
                          onClick={() => setSelectedTx(tx)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                    </StaggerItem>
                  );
                })}
              </StaggerList>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-8 py-5 border-t border-gray-50 flex items-center justify-between gap-4">
            <p className="text-xs font-bold text-gray-400">
              {t('transactions.page')} {pagination.page} {t('transactions.of')} {pagination.totalPages} &bull;{' '}
              {pagination.total.toLocaleString(language === 'id' ? 'id-ID' : 'en-US')} total
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="icon"
                className="w-8 h-8 rounded-xl"
                disabled={pagination.page <= 1}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, idx) => {
                const p = Math.max(1, pagination.page - 2) + idx;
                if (p > pagination.totalPages) return null;
                return (
                  <Button
                    key={p}
                    variant={p === pagination.page ? 'default' : 'outline'}
                    size="icon"
                    className={cn('w-8 h-8 rounded-xl text-xs font-bold', p === pagination.page && 'bg-indigo-600 hover:bg-indigo-700')}
                    onClick={() => handlePageChange(p)}
                  >
                    {p}
                  </Button>
                );
              })}

              <Button
                variant="outline" size="icon"
                className="w-8 h-8 rounded-xl"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!selectedTx} onOpenChange={(open) => !open && setSelectedTx(null)}>
        <DialogContent className="max-w-lg rounded-[32px] font-sans bg-white border-none shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-black text-gray-900 text-lg">
              <Receipt className="w-5 h-5 text-indigo-600" />
              {t('transactions.detail')}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs text-gray-400 mt-1">
              {selectedTx?.invoice_number}
            </DialogDescription>
          </DialogHeader>

          {selectedTx && (
            <div className="space-y-5 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: t('transactions.invoice'), value: selectedTx.invoice_number },
                  { label: t('transactions.date'), value: formatDate(selectedTx.created_at, language) },
                  {
                    label: t('transactions.status'),
                    value: (
                      <span className={cn(
                        'text-[11px] font-black uppercase tracking-wide px-2.5 py-0.5 rounded-full border',
                        STATUS_STYLES[selectedTx.status] ?? 'bg-gray-100 text-gray-600 border-gray-200',
                      )}>
                        {selectedTx.status === 'completed' ? t('transactions.completed') : selectedTx.status}
                      </span>
                    ),
                  },
                  ...(selectedTx.member ? [{
                    label: t('transactions.customer'),
                    value: selectedTx.member.full_name
                      ? `${selectedTx.member.username} (${selectedTx.member.full_name})`
                      : selectedTx.member.username,
                  }] : []),
                  ...(isSuperAdmin && selectedTx.branch_id ? [{
                    label: t('transactions.branch'),
                    value: branches.find((b) => b.id === selectedTx.branch_id)?.name ?? selectedTx.branch_id,
                  }] : []),
                ].map((row) => (
                  <div key={row.label} className="bg-gray-50 rounded-2xl p-3">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{row.label}</p>
                    <p className="font-bold text-gray-800 text-xs">{row.value as any}</p>
                  </div>
                ))}
              </div>

              {selectedTx.transaction_items && selectedTx.transaction_items.length > 0 && (
                <div>
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">
                    {t('transactions.items')} ({selectedTx.transaction_items.length})
                  </p>
                  <ScrollArea className="max-h-52">
                    <div className="space-y-2">
                      {selectedTx.transaction_items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate">{item.products?.name ?? 'Produk'}</p>
                            <p className="text-[11px] text-gray-400 font-medium mt-0.5">
                              {formatRupiah(item.unit_price)} × {item.quantity}
                            </p>
                          </div>
                          <p className="text-xs font-black text-gray-900 ml-4 shrink-0">
                            {formatRupiah(item.subtotal)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              <div className="flex items-center justify-between bg-indigo-50 rounded-2xl px-5 py-4 border border-indigo-100">
                <span className="text-sm font-black text-indigo-700 uppercase tracking-wide">{t('transactions.total')}</span>
                <span className="text-xl font-black text-indigo-700">{formatRupiah(Number(selectedTx.total_price))}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
