import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Plus, Tag, MapPin, Trash2, Edit3, CircleCheck, Sparkles, Loader2, Calendar, Users, Zap, Lock, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/shared/context/AuthContext';
import { useLocation } from '@/shared/context/LocationContext';
import { fetchBackend, BACKEND_URL } from '@/shared/lib/api';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';
import { useLanguage } from '@/shared/context/LanguageContext';
import PageTransition from '@/shared/components/ui/PageTransition';
import { StaggerList, StaggerItem } from '@/shared/components/ui/StaggerList';

export default function PromoPage() {
  const navigate = useNavigate();
  const { currentLocation, allBranches } = useLocation();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  
  const locationName = allBranches?.find((b: any) => b.id === currentLocation)?.name || (language === 'id' ? 'Cabang Ini' : 'This Branch');

  const [promos, setPromos] = useState<any[]>([]);
  const [insights, setInsights] = useState({
    totalRedemption: 0,
    growthWoW: '+0% WoW',
    campaignReach: '0% Effectiveness',
    reachPercentage: 0,
    history: [] as any[],
    campaignStats: [] as { code: string; total: number; used: number }[],
  });
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isSuperAdmin = user?.role === 'super_admin';

  const loadData = async () => {
    setLoading(true);
    try {
      const [promosRes, insightsRes] = await Promise.all([
        fetchBackend('getPromos'),
        fetchBackend('getPromoInsights'),
      ]);
      if (promosRes.status === 'success') setPromos(promosRes.data);
      if (insightsRes.status === 'success') setInsights(insightsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filteredPromos = isSuperAdmin
    ? promos
    : promos.filter(p => p.scope === 'ALL' || p.scope === currentLocation);

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      const res = await fetchBackend('deletePromo', { id: confirmDeleteId });
      if (res.status === 'success') {
        toast.info(t('promo.deleteSuccess'));
        setConfirmDeleteId(null);
        loadData();
      } else {
        toast.error(t('promo.deleteFailed'));
      }
    } catch {
      toast.error(language === 'id' ? 'Kesalahan Jaringan' : 'Network error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
        <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">
          {language === 'id' ? 'Memuat Campaigns...' : 'Loading Campaigns...'}
        </p>
      </div>
    );
  }

  return (
    <PageTransition className="space-y-8">

      {/* ── DELETE CONFIRMATION OVERLAY ── */}
      {confirmDeleteId && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={() => setConfirmDeleteId(null)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          {/* Dialog */}
          <div
            className="relative bg-white rounded-[32px] shadow-2xl w-full max-w-sm p-8 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 bg-rose-50 rounded-3xl flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-rose-500" />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-xl tracking-tighter">{t('promo.deleteCampaign')}</h3>
                <p className="text-gray-400 text-sm font-medium mt-1 leading-relaxed">
                  {t('promo.deleteDesc')}
                </p>
              </div>
              <div className="flex gap-3 w-full pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 h-12 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-100 text-gray-500"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 h-12 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-rose-500 hover:bg-rose-600 text-white border-none shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deleting ? t('promo.deleting') : t('promo.confirmDelete')}
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-rose-100 rounded-xl flex items-center justify-center">
            <Tag className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{t('promo.subtitle')}</p>
            <p className="text-xs text-gray-400 mt-0.5">{t('promo.subtitleDesc')}</p>
          </div>
        </div>
        <Button
          onClick={() => navigate('/promo/create')}
          className="bg-indigo-600 hover:bg-indigo-700 h-14 px-8 rounded-2xl shadow-xl shadow-indigo-600/20 font-black uppercase tracking-widest text-xs border-none transition-all hover:scale-[1.02] flex items-center gap-3"
        >
          <Plus className="w-5 h-5" /> {t('promo.launchCampaign')}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: t('promo.totalCampaign'), value: filteredPromos.length, sub: t('promo.activeArchive'), icon: Tag, color: 'text-indigo-600', iconBg: 'bg-indigo-50 text-indigo-600' },
          { label: t('promo.totalRedemption'), value: insights.totalRedemption.toLocaleString(), sub: insights.growthWoW, icon: CircleCheck, color: 'text-emerald-600', iconBg: 'bg-emerald-50 text-emerald-600' },
          { label: t('promo.campaignReach'), value: insights.campaignReach, sub: t('promo.effectiveness'), icon: Zap, color: 'text-violet-600', iconBg: 'bg-violet-50 text-violet-600' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className={cn('p-3 rounded-xl flex-shrink-0', stat.iconBg)}>
              <stat.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">{stat.label}</p>
              <p className={cn('text-2xl font-black tracking-tight font-mono', stat.color)}>{stat.value}</p>
              <p className="text-[10px] font-semibold text-gray-400 mt-0.5">{stat.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Promo Cards */}
        <div className="lg:col-span-2 space-y-6">
          <StaggerList className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {filteredPromos.length === 0 ? (
              <div className="col-span-2 flex flex-col items-center justify-center py-20 gap-4 bg-white rounded-[40px] border border-dashed border-gray-200">
                <div className="w-16 h-16 bg-gray-50 rounded-3xl flex items-center justify-center">
                  <Tag className="w-8 h-8 text-gray-300" />
                </div>
                <div className="text-center">
                  <p className="font-black text-gray-400 text-sm uppercase tracking-widest">{t('promo.noCampaign')}</p>
                  <p className="text-gray-300 text-xs font-medium mt-1">{t('promo.noCampaignDesc')}</p>
                </div>
                <Button onClick={() => navigate('/promo/create')} className="bg-indigo-600 h-11 px-6 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-600/20 text-white flex items-center gap-2 mt-2">
                  <Plus className="w-4 h-4" /> {t('promo.createCampaign')}
                </Button>
              </div>
            ) : filteredPromos.map(promo => {
              const isSelected = confirmDeleteId === promo.id;
              const canManagePromo = isSuperAdmin || user?.role === 'branch_admin' || user?.role === 'admin' || promo.scope === currentLocation;
              return (
                <StaggerItem
                  key={promo.id}
                  className="rounded-[32px] group shadow-lg shadow-black/[0.04] border border-gray-100 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500 hover:-translate-y-1 bg-white p-6 flex flex-col gap-5"
                >
                  {/* Header: Event tag, active status and target scope */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex gap-1.5 flex-wrap">
                        <span className={cn(
                          'px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border',
                          promo.is_active === false 
                            ? 'bg-gray-100 border-gray-200 text-gray-400' 
                            : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                        )}>
                          {promo.is_active === false ? t('common.inactive') : t('common.active')}
                        </span>
                        {promo.target_type === 'SPECIFIC' && (
                          <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-violet-50 border border-violet-200 text-violet-600">
                            {t('promo.exclusive')}
                          </span>
                        )}
                      </div>
                      {promo.event_name && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                          <Zap className="w-2.5 h-2.5" />{promo.event_name}
                        </span>
                      )}
                    </div>
                    <h3 className="text-gray-900 font-black text-xl tracking-tighter leading-tight group-hover:text-indigo-600 transition-colors">
                      {promo.title || promo.code}
                    </h3>
                  </div>

                  {/* Top: Discount & Code */}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{t('promo.discountValue')}</p>
                      <div className="flex items-baseline gap-1">
                        <span className="font-black text-3xl tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-indigo-600 to-violet-600">
                          {promo.discount_type === 'Percentage' ? `${promo.discount_value}%` : `Rp ${Number(promo.discount_value).toLocaleString()}`}
                        </span>
                      </div>
                      {promo.max_discount && promo.discount_type === 'Percentage' && (
                        <p className="text-[10px] text-indigo-600 font-bold mt-0.5">
                          {(language === 'id' ? 'Maks. Rp ' : 'Max Rp ') + Number(promo.max_discount).toLocaleString()}
                        </p>
                      )}
                    </div>
                    
                    <div className="text-right">
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{t('promo.voucherCode')}</p>
                      <div className="inline-flex items-center justify-center px-3 py-1.5 bg-indigo-50/50 border border-indigo-100 rounded-xl border-dashed">
                        <span className="font-mono font-black text-indigo-600 text-sm tracking-widest">
                          {promo.code}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Quota (if exists) */}
                  {promo.usage_limit && (
                    <div className="p-3 bg-gray-50/80 rounded-2xl border border-gray-100 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-gray-400" /> {t('promo.quotaUsed')}
                        </span>
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-100/50 px-2 py-0.5 rounded-md">
                          {promo.usage_count || 0} / {promo.usage_limit}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-200/50 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all duration-1000', (promo.usage_count || 0) >= promo.usage_limit ? 'bg-rose-500' : 'bg-gradient-to-r from-indigo-500 to-violet-500')}
                          style={{ width: `${Math.min(100, ((promo.usage_count || 0) / promo.usage_limit) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Bottom: Meta Info Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 p-2 rounded-xl bg-gray-50 border border-gray-100/50">
                      <div className="w-7 h-7 rounded-[10px] bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{t('promo.validAt')}</span>
                        <span className="text-[10px] font-bold text-gray-700 truncate">
                          {promo.scope === 'ALL' ? (language === 'id' ? 'Semua Cabang' : 'All Branches') : (allBranches?.find((b: any) => b.id === promo.scope)?.name || promo.scope)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-2 rounded-xl bg-gray-50 border border-gray-100/50">
                      <div className="w-7 h-7 rounded-[10px] bg-indigo-50 flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{t('promo.expiration')}</span>
                        <span className="text-[10px] font-bold text-gray-700 truncate font-mono">
                          {promo.expires_at ? new Date(promo.expires_at).toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US', { day: '2-digit', month: 'short' }) : '∞'}
                        </span>
                      </div>
                    </div>
                    
                    {promo.per_user_limit && (
                      <div className="col-span-2 flex items-center gap-2 p-2.5 rounded-xl bg-amber-50/50 border border-amber-100/50">
                        <div className="w-7 h-7 rounded-[10px] bg-amber-100 flex items-center justify-center flex-shrink-0">
                          <Lock className="w-3.5 h-3.5 text-amber-600" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[8px] font-black text-amber-600/70 uppercase tracking-widest">{t('promo.usageLimit')}</span>
                          <span className="text-[10px] font-bold text-amber-800">{t('promo.usageLimitDesc').replace('{n}', String(promo.per_user_limit))}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  {canManagePromo && (
                    <div className="flex gap-2 pt-2 border-t border-gray-100">
                      <Button
                        variant="ghost"
                        onClick={() => navigate(`/promo/edit/${promo.id}`)}
                        className="flex-1 h-10 rounded-2xl font-black text-[10px] uppercase tracking-widest text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all flex items-center justify-center gap-2"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> {t('common.edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setConfirmDeleteId(promo.id)}
                        className="flex-1 h-10 rounded-2xl font-black text-[10px] uppercase tracking-widest text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-all flex items-center justify-center gap-2 border border-rose-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> {t('common.delete')}
                      </Button>
                    </div>
                  )}
                </StaggerItem>
              );
            })}
          </StaggerList>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Insights Card */}
          <Card className="rounded-3xl border border-gray-100 shadow-sm bg-white p-8 group">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl text-indigo-600 flex items-center justify-center transition-transform group-hover:rotate-12">
                <Sparkles className="w-7 h-7" />
              </div>
              <div>
                <h3 className="font-black text-gray-900 tracking-tighter text-2xl uppercase">{t('promo.insights')}</h3>
                <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">{t('promo.globalAnalytics')}</p>
              </div>
            </div>

            <div className="space-y-8">
              <div className="p-6 bg-gray-50 rounded-[32px] border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('promo.totalRedemption')}</span>
                  <div className="w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center">
                    <CircleCheck className="w-4 h-4 text-emerald-500" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono font-black text-gray-900 text-4xl">{insights.totalRedemption.toLocaleString()}</span>
                  <span className="text-emerald-500 text-[10px] font-bold">{insights.growthWoW}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <span>{t('promo.campaignReach')}</span>
                  <span className="text-indigo-600">{insights.campaignReach}</span>
                </div>
                <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-600 rounded-full shadow-lg shadow-indigo-600/20" style={{ width: `${insights.reachPercentage}%` }} />
                </div>
              </div>

              <div className="p-8 bg-indigo-600 rounded-[40px] text-white relative overflow-hidden shadow-2xl shadow-indigo-600/30">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl rounded-full" />
                <h4 className="font-black text-lg tracking-tight mb-3 flex items-center gap-2">
                  <Sparkles className="w-5 h-5" /> {t('promo.powerTip')}
                </h4>
                <p className="text-indigo-50 text-xs font-medium leading-relaxed mb-4">
                  {t('promo.powerTipDesc')}
                </p>
                <div className="absolute -bottom-6 -right-6 opacity-10">
                  <Tag className="w-24 h-24 transform rotate-45" />
                </div>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </PageTransition>
  );
}
