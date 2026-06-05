import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin, ArrowRight, ArrowLeft, Loader2, AlertTriangle,
  CheckCircle2, AlertCircle, TrendingDown, Package, History,
  RefreshCw, ChevronDown, ChevronUp, Boxes, Wallet, ShieldCheck,
  BarChart3, Clock, User, Plus, Minus, Edit3
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { fetchBackend, BACKEND_URL } from '@/shared/lib/api';
import { AdjustStockModal } from '@/shared/components/layout/AdjustStockModal';
import { toast } from 'sonner';
import { useLanguage } from '@/shared/context/LanguageContext';

function formatRp(val: number) {
  return 'Rp ' + val.toLocaleString('id-ID');
}

export default function BranchInventoryPage() {
  const { t, language } = useLanguage();

  const STATUS_CONFIG = {
    critical: { label: language === 'id' ? 'Kritis' : 'Critical', color: 'bg-rose-50 text-rose-600 border-rose-200', icon: AlertCircle, bar: 'bg-rose-500' },
    warning:  { label: language === 'id' ? 'Perlu Restock' : 'Need Restock', color: 'bg-amber-50 text-amber-600 border-amber-200', icon: AlertTriangle, bar: 'bg-amber-400' },
    healthy:  { label: language === 'id' ? 'Aman' : 'Healthy', color: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: CheckCircle2, bar: 'bg-emerald-500' },
    overstock:{ label: 'Overstock', color: 'bg-blue-50 text-blue-600 border-blue-200', icon: TrendingDown, bar: 'bg-blue-400' },
  };

  const MOVE_TYPE_CONFIG: Record<string, { label: string; color: string; Icon: any }> = {
    RESTOCK:    { label: 'Restock', color: 'text-emerald-600 bg-emerald-50', Icon: Plus },
    SALE:       { label: language === 'id' ? 'Penjualan' : 'Sale', color: 'text-blue-600 bg-blue-50', Icon: Minus },
    DAMAGE:     { label: language === 'id' ? 'Kerusakan' : 'Damage', color: 'text-rose-600 bg-rose-50', Icon: AlertCircle },
    ADJUSTMENT: { label: language === 'id' ? 'Penyesuaian' : 'Adjustment', color: 'text-purple-600 bg-purple-50', Icon: Edit3 },
  };

  const [branches, setBranches] = useState<any[]>([]);
  const [summary, setSummary] = useState({ totalBranches: 0, criticalProducts: 0, totalStockValue: 0, healthScore: 100 });
  const [selectedBranch, setSelectedBranch] = useState<any | null>(null);
  const [inventory, setInventory] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'inventory' | 'history'>('inventory');
  const [loading, setLoading] = useState(true);
  const [adjustItem, setAdjustItem] = useState<any>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const loadSummaries = async () => {
    setLoading(true);
    try {
      const res = await fetchBackend('getBranchSummaries');
      if (res.status === 'success') {
        setBranches(res.data.branches);
        setSummary(res.data.summary);
      }
    } catch { toast.error(language === 'id' ? 'Gagal memuat data cabang' : 'Failed to load branch data'); }
    finally { setLoading(false); }
  };

  const viewBranch = async (branch: any) => {
    setSelectedBranch(branch);
    setActiveTab('inventory');
    setLoading(true);
    try {
      const res = await fetchBackend('getBranchInventoryDetails', { id: branch.id });
      if (res.status === 'success') setInventory(res.data);
      const mRes = await fetchBackend('getInventoryMovements', { id: branch.id });
      if (mRes.status === 'success') setMovements(mRes.data);
    } catch { toast.error(language === 'id' ? 'Gagal memuat detail inventaris' : 'Failed to load inventory details'); }
    finally { setLoading(false); }
  };

  const submitAdjustment = async (payload: any) => {
    setIsAdjusting(true);
    try {
      const res = await fetchBackend('adjustInventory', payload);
      if (res.status === 'success') {
        toast.success(language === 'id' ? 'Stok berhasil diperbarui' : 'Stock updated successfully');
        setAdjustItem(null);
        if (selectedBranch) viewBranch(selectedBranch);
      } else { toast.error(language === 'id' ? 'Gagal memperbarui stok' : 'Failed to update stock'); }
    } catch { toast.error(language === 'id' ? 'Error koneksi API' : 'API connection error'); }
    finally { setIsAdjusting(false); }
  };

  useEffect(() => { loadSummaries(); }, []);

  // ─── LOADING ───
  if (loading && !selectedBranch) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
          <p className="text-sm font-semibold text-gray-400">{language === 'id' ? 'Memuat data inventaris...' : 'Loading inventory data...'}</p>
        </div>
      </div>
    );
  }

  // ─── DETAIL VIEW ───
  if (selectedBranch) {
    const criticals = inventory.filter(i => i.status === 'critical' || i.status === 'warning');
    const totalValue = inventory.reduce((a, i) => a + (i.stockValue || 0), 0);

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-2">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20 text-white flex-shrink-0">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tighter">{selectedBranch.name}</h2>
              <p className="text-gray-500 font-medium text-sm mt-0.5">
                {language === 'id' ? 'Monitoring stok dan riwayat pergerakan inventaris' : 'Monitor stock and inventory movement history'}
              </p>
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={() => setSelectedBranch(null)} 
            className="h-11 px-5 rounded-2xl border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors font-bold gap-2 text-xs"
          >
            <ArrowLeft className="w-4 h-4" /> {t('common.back')}
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total SKU', value: inventory.length, icon: Boxes, color: 'text-indigo-600 bg-indigo-50' },
            { label: language === 'id' ? 'Perlu Perhatian' : 'Needs Attention', value: criticals.length, icon: AlertTriangle, color: criticals.length > 0 ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50' },
            { label: language === 'id' ? 'Nilai Stok' : 'Stock Value', value: formatRp(totalValue), icon: Wallet, color: 'text-amber-600 bg-amber-50' },
            { label: language === 'id' ? 'Kesehatan' : 'Health', value: `${selectedBranch.healthScore}%`, icon: ShieldCheck, color: selectedBranch.healthScore >= 80 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50' },
          ].map(s => (
            <Card key={s.label} className="border-none shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn('p-2.5 rounded-xl', s.color)}><s.icon className="w-4 h-4" /></div>
                <div>
                  <p className="text-xs text-gray-400 font-semibold">{s.label}</p>
                  <p className="text-lg font-black text-gray-900 tracking-tight">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Critical Alert Banner */}
        {criticals.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-5 py-4">
            <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0" />
            <p className="text-sm font-bold text-rose-700">
              <span className="font-black">{language === 'id' ? `${criticals.length} produk` : `${criticals.length} products`}</span> {language === 'id' ? 'memerlukan perhatian segera' : 'require immediate attention'} —{' '}
              {criticals.slice(0, 3).map(c => c.name).join(', ')}{criticals.length > 3 ? (language === 'id' ? ` dan ${criticals.length - 3} lainnya` : ` and ${criticals.length - 3} others`) : ''}.
            </p>
          </motion.div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-100 pb-0">
          {(['inventory', 'history'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={cn('px-4 py-2.5 text-xs font-black uppercase tracking-wider rounded-t-xl transition-all',
                activeTab === tab ? 'bg-white text-indigo-600 border border-b-white border-gray-100 shadow-sm -mb-px' : 'text-gray-400 hover:text-gray-600'
              )}>
              {tab === 'inventory' ? <><Package className="w-3.5 h-3.5 inline mr-1.5" />{language === 'id' ? 'Stok Produk' : 'Product Stock'}</> : <><History className="w-3.5 h-3.5 inline mr-1.5" />{language === 'id' ? 'Riwayat Pergerakan' : 'Movement History'}</>}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'inventory' ? (
          <Card className="border-none shadow-sm overflow-hidden rounded-2xl">
            <CardContent className="p-0">
              {loading ? (
                <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>
              ) : inventory.length === 0 ? (
                <div className="py-20 text-center">
                  <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 font-semibold text-sm">{language === 'id' ? 'Belum ada produk di cabang ini' : 'No products in this branch yet'}</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      <th className="py-4 pl-6">{language === 'id' ? 'Produk' : 'Product'}</th>
                      <th className="py-4">{t('common.stock')}</th>
                      <th className="py-4">{language === 'id' ? 'Nilai Stok' : 'Stock Value'}</th>
                      <th className="py-4">{t('common.status')}</th>
                      <th className="py-4">{t('monitor.lastUpdated')}</th>
                      <th className="py-4 pr-6 text-right">{t('common.action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {inventory.map((item) => {
                      const cfg = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.healthy;
                      const Icon = cfg.icon;
                      const isExpanded = expandedRow === item.id;
                      return (
                        <React.Fragment key={item.id}>
                          <tr className="group hover:bg-gray-50/50 transition-all cursor-pointer" onClick={() => setExpandedRow(isExpanded ? null : item.id)}>
                            <td className="py-4 pl-6">
                              <div className="flex items-center gap-3">
                                {item.image_url ? (
                                  <img src={item.image_url.startsWith('http') ? item.image_url : `${BACKEND_URL}${item.image_url}`} className="w-10 h-10 rounded-xl object-cover border border-gray-100" />
                                ) : (
                                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                                    <Package className="w-4 h-4 text-gray-300" />
                                  </div>
                                )}
                                <div>
                                  <p className="font-bold text-gray-900 text-sm leading-tight">{item.name}</p>
                                  <p className="text-xs text-gray-400">{item.category}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4">
                              <div className="flex flex-col gap-1.5 w-32">
                                <div className="flex items-baseline gap-1">
                                  <span className={cn('text-2xl font-black font-mono tracking-tighter', item.status === 'critical' ? 'text-rose-500' : item.status === 'warning' ? 'text-amber-500' : 'text-gray-900')}>
                                    {item.stock}
                                  </span>
                                  <span className="text-[10px] text-gray-400 font-bold">unit</span>
                                </div>
                                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className={cn('h-full rounded-full transition-all', cfg.bar)} style={{ width: `${item.fillPercent}%` }} />
                                </div>
                                <p className="text-[10px] text-gray-400">Min {item.minStockLevel} / Max {item.maxStockLevel}</p>
                              </div>
                            </td>
                            <td className="py-4">
                              <div>
                                <p className="font-bold text-gray-900 text-sm">{formatRp(item.stockValue || 0)}</p>
                                <p className="text-[10px] text-gray-400">@ {formatRp(item.price)}/unit</p>
                              </div>
                            </td>
                            <td className="py-4">
                              <Badge className={cn('border text-[10px] font-black uppercase tracking-wider px-2.5 py-1', cfg.color)}>
                                <Icon className="w-3 h-3 inline mr-1" />{cfg.label}
                              </Badge>
                            </td>
                            <td className="py-4">
                              <div className="flex items-center gap-1.5 text-gray-400">
                                <Clock className="w-3 h-3" />
                                <span className="text-xs">{item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '-'}</span>
                              </div>
                            </td>
                            <td className="py-4 pr-6 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); setAdjustItem(item); }}
                                  className="h-8 px-3 text-xs font-black rounded-xl border-gray-200 hover:border-indigo-400 hover:text-indigo-600 transition-all">
                                  Adjust
                                </Button>
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-300" /> : <ChevronDown className="w-4 h-4 text-gray-300" />}
                              </div>
                            </td>
                          </tr>
                          {/* Expanded Row */}
                          {isExpanded && (
                            <tr key={`${item.id}-expanded`} className="bg-indigo-50/30">
                              <td colSpan={6} className="px-6 py-4">
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                  <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Reorder Point</p>
                                    <p className="font-bold text-gray-700">{item.reorderPoint} unit</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{language === 'id' ? 'Pemasok' : 'Supplier'}</p>
                                    <p className="font-bold text-gray-700">{item.supplierName || '—'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{language === 'id' ? 'Restock Terakhir' : 'Last Restock'}</p>
                                    <p className="font-bold text-gray-700">{item.lastRestockDate ? new Date(item.lastRestockDate).toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US') : '—'}</p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        ) : (
          /* HISTORY TAB */
          <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
            <CardContent className="p-0">
              {movements.length === 0 ? (
                <div className="py-20 text-center">
                  <History className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 font-semibold text-sm">{language === 'id' ? 'Belum ada riwayat pergerakan stok' : 'No stock movement history yet'}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {movements.map(m => {
                    const cfg = MOVE_TYPE_CONFIG[m.type] || MOVE_TYPE_CONFIG.ADJUSTMENT;
                    return (
                      <div key={m.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 transition-all">
                        <div className={cn('p-2.5 rounded-xl flex-shrink-0', cfg.color)}>
                          <cfg.Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-gray-900 text-sm">{m.productName}</span>
                            <Badge className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border-0', cfg.color)}>{cfg.label}</Badge>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{m.reason || (language === 'id' ? 'Tidak ada keterangan' : 'No description')}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="flex items-center gap-2 justify-end">
                            {m.stockBefore != null && (
                              <span className="text-xs text-gray-400">{m.stockBefore} →</span>
                            )}
                            <span className={cn('font-black text-sm', m.type === 'RESTOCK' ? 'text-emerald-600' : 'text-rose-600')}>
                              {m.type === 'RESTOCK' ? '+' : m.type === 'ADJUSTMENT' ? '=' : '-'}{m.quantity}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 justify-end mt-1">
                            <User className="w-3 h-3 text-gray-300" />
                            <span className="text-[10px] text-gray-400">{m.performedBy}</span>
                          </div>
                          <p className="text-[10px] text-gray-300 mt-0.5">{new Date(m.createdAt).toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <AdjustStockModal isOpen={!!adjustItem} onOpenChange={o => !o && setAdjustItem(null)}
          onConfirm={submitAdjustment} item={adjustItem} isLoading={isAdjusting} />
      </div>
    );
  }

  // ─── BRANCH LIST VIEW ───
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-amber-100 rounded-xl flex items-center justify-center">
            <MapPin className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{language === 'id' ? 'Monitor stok dan distribusi produk seluruh cabang' : 'Monitor product stock and distribution across all branches'}</p>
            <p className="text-xs text-gray-400 mt-0.5">{language === 'id' ? `${branches.length} cabang terdaftar` : `${branches.length} branches registered`}</p>
          </div>
        </div>
        <Button onClick={loadSummaries} variant="outline" className="gap-2 rounded-xl font-bold">
          <RefreshCw className="w-4 h-4" /> {t('common.refresh')}
        </Button>
      </div>

      {/* Network Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('monitor.totalBranches'), value: summary.totalBranches, icon: MapPin, color: 'text-indigo-600 bg-indigo-50' },
          { label: language === 'id' ? 'Produk Kritis' : 'Critical Products', value: summary.criticalProducts, icon: AlertTriangle, color: summary.criticalProducts > 0 ? 'text-rose-600 bg-rose-50' : 'text-gray-400 bg-gray-50' },
          { label: language === 'id' ? 'Total Nilai Stok' : 'Total Stock Value', value: formatRp(summary.totalStockValue), icon: Wallet, color: 'text-amber-600 bg-amber-50' },
          { label: language === 'id' ? 'Skor Kesehatan' : 'Health Score', value: `${summary.healthScore}%`, icon: BarChart3, color: summary.healthScore >= 80 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50' },
        ].map(s => (
          <Card key={s.label} className="border-none shadow-sm">
            <CardContent className="p-5 flex items-center gap-3">
              <div className={cn('p-2.5 rounded-xl', s.color)}><s.icon className="w-5 h-5" /></div>
              <div>
                <p className="text-xs text-gray-400 font-semibold">{s.label}</p>
                <p className="text-xl font-black text-gray-900 tracking-tight">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Branch Cards */}
      {branches.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="py-20 text-center">
            <MapPin className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold">{language === 'id' ? 'Belum ada cabang terdaftar' : 'No branches registered yet'}</p>
            <p className="text-xs text-gray-300 mt-1">{language === 'id' ? 'Tambahkan data cabang di tabel branches terlebih dahulu' : 'Add branch data in the branches table first'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {branches.map((b, idx) => (
            <motion.div key={b.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.08 }}>
              <Card onClick={() => viewBranch(b)}
                className="group cursor-pointer border-none shadow-sm hover:shadow-lg transition-all duration-300 rounded-2xl overflow-hidden">
                <CardContent className="p-6">
                  {/* Branch Header */}
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-black text-gray-900 text-lg tracking-tight">{b.name}</h3>
                        <p className="text-[10px] text-gray-400 font-mono">{b.id.slice(0, 12)}...</p>
                      </div>
                    </div>
                    <div className={cn('px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider',
                      b.healthScore >= 80 ? 'bg-emerald-50 text-emerald-600' : b.healthScore >= 60 ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600')}>
                      {language === 'id' ? `${b.healthScore}% sehat` : `${b.healthScore}% healthy`}
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-gray-900">{b.totalSKU}</p>
                      <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">{t('inventory.skuCount')}</p>
                    </div>
                    <div className={cn('rounded-xl p-3 text-center', b.criticalCount > 0 ? 'bg-rose-50' : 'bg-gray-50')}>
                      <p className={cn('text-2xl font-black', b.criticalCount > 0 ? 'text-rose-600' : 'text-gray-900')}>{b.criticalCount}</p>
                      <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">{language === 'id' ? 'Kritis' : 'Critical'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-gray-900">{b.healthyCount}</p>
                      <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">{language === 'id' ? 'Aman' : 'Healthy'}</p>
                    </div>
                  </div>

                  {/* Stock Value */}
                  <div className="bg-indigo-50/50 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-bold text-indigo-500">{language === 'id' ? 'Nilai Stok' : 'Stock Value'}</span>
                    </div>
                    <span className="font-black text-indigo-700 text-sm">{formatRp(b.stockValue)}</span>
                  </div>

                  {/* Stock Health Bar */}
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
                    <div className={cn('h-full rounded-full transition-all',
                      b.healthScore >= 80 ? 'bg-emerald-500' : b.healthScore >= 60 ? 'bg-amber-400' : 'bg-rose-500')}
                      style={{ width: `${b.healthScore}%` }} />
                  </div>

                  <Button variant="ghost" className="w-full h-10 rounded-xl text-xs font-black uppercase tracking-wider text-gray-500 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-all">
                    {language === 'id' ? 'Lihat Detail' : 'View Details'} <ArrowRight className="ml-1.5 w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
