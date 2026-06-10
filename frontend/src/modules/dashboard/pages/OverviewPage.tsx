import React, {useState, useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import {Card, CardContent} from '@/shared/components/ui/card';
import {motion} from 'motion/react';
import {
  ShoppingBag, 
  Store, 
  ArrowUpRight, 
  ArrowDownRight,
  CircleDollarSign,
  Loader2,
  Package,
  FileDown,
  Info,
  ChevronDown,
  MapPin,
  Globe,
  Tag,
  Search,
  AlertTriangle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';

function formatRp(val: number) {
  return 'Rp ' + val.toLocaleString('id-ID');
}

function getWeeksForDropdown(year: number, monthName: string): string[] {
  const monthsList = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthIdx = monthsList.indexOf(monthName);
  if (monthIdx === -1) return [];

  const weeks: string[] = [];
  const jan1 = new Date(year, 0, 1);
  for (let w = 1; w <= 53; w++) {
    const start = new Date(jan1.getTime() + (w - 1) * 7 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
    if (start.getMonth() === monthIdx || end.getMonth() === monthIdx) {
      weeks.push(`Week ${w}`);
    }
  }
  return weeks;
}

const COLORS = ['#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6'];
import {useAuth} from '@/shared/context/AuthContext';
import {useLocation} from '@/shared/context/LocationContext';
import {fetchBackend} from '@/shared/lib/api';
import {cn} from '@/shared/lib/utils';
import {Button} from '@/shared/components/ui/button';
import {supabase} from '@/shared/lib/supabase';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { toast } from 'sonner';

import { BranchSelector } from '@/shared/components/layout/BranchSelector';
import { ExportConfirmationModal } from '@/shared/components/layout/ExportConfirmationModal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {useLanguage} from '@/shared/context/LanguageContext';
import PageTransition from '@/shared/components/ui/PageTransition';
import { StaggerList, StaggerItem } from '@/shared/components/ui/StaggerList';

export default function OverviewPage() {
  const {user} = useAuth();
  const {currentLocation, locationName} = useLocation();
  const {t, language} = useLanguage();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<'weekly' | 'monthly' | 'yearly'>('weekly');
  
  // Dynamic Date Selectors State
  const monthsList = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const now = new Date();
  const currentYearStr = now.getFullYear().toString();
  const currentMonthStr = monthsList[now.getMonth()];
  
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const currentWeekNumber = Math.floor((now.getTime() - jan1.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  const currentWeekStr = `Week ${currentWeekNumber}`;
  const yearsList = Array.from({length: 5}, (_, i) => (now.getFullYear() - 2 + i).toString());

  const [selectedYear, setSelectedYear] = useState(currentYearStr);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [selectedWeek, setSelectedWeek] = useState(currentWeekStr);
  const [isExporting, setIsExporting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [topProductsLimit, setTopProductsLimit] = useState(5);
  const [categoryFilter, setCategoryFilter] = useState('all');
  useEffect(() => {
    const fetchLowStock = async () => {
      if (user?.role === 'branch_admin' && currentLocation) {
        try {
          const res = await fetchBackend('getInventory', { location_id: currentLocation });
          if (res.status === 'success' && Array.isArray(res.data)) {
            const low = res.data.filter((item: any) => Number(item.stock ?? 0) < 10);
            setLowStockItems(low);
          }
        } catch (err) {
          console.error(err);
        }
      }
    };
    fetchLowStock();
  }, [user, currentLocation]);

  useEffect(() => {
    const loadOverview = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchBackend('getOverview', { 
          location_id: currentLocation,
          timeframe: timeframe,
          year: selectedYear,
          month: selectedMonth,
          week: selectedWeek
        });
        if (res.status === 'success' && res.data) {
          setData(res.data);
        } else {
          setError(res.message || 'Failed to sync enterprise data');
        }
      } catch (err) {
        setError('A critical connection error occurred');
      } finally {
        setLoading(false);
      }
    };
    
    loadOverview();

    // Set up Real-time Subscription for Enterprise Overview
    const channel = supabase.channel('realtime-overview')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        console.log('Real-time update: transactions changed on overview');
        loadOverview();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        console.log('Real-time update: products changed on overview');
        loadOverview();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'branch_inventory' }, () => {
        console.log('Real-time update: branch_inventory changed on overview');
        loadOverview();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentLocation, timeframe, selectedYear, selectedMonth, selectedWeek]);

  // Auto-adjust week if it doesn't belong to the selected month
  useEffect(() => {
    if (timeframe === 'weekly') {
      const validWeeks = getWeeksForDropdown(Number(selectedYear), selectedMonth);
      if (validWeeks.length > 0 && !validWeeks.includes(selectedWeek)) {
        setSelectedWeek(validWeeks[0]);
      }
    }
  }, [selectedYear, selectedMonth, timeframe, selectedWeek]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
         <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
         <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">{t('overview.syncingData')}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
         <div className="w-20 h-20 bg-rose-50 rounded-[32px] flex items-center justify-center border border-rose-100 shadow-sm">
            <Package className="w-10 h-10 text-rose-500" />
         </div>
         <div className="space-y-2">
            <h3 className="text-2xl font-black text-gray-900 tracking-tighter">{t('overview.systemDesync')}</h3>
            <p className="text-gray-500 font-medium max-w-xs">{error || t('overview.noDataFound')}</p>
         </div>
         <Button 
           variant="outline" 
           onClick={() => window.location.reload()}
           className="rounded-2xl px-8 h-12 font-bold border-gray-200 hover:bg-gray-50"
         >
           {t('overview.retryConnection')}
         </Button>
      </div>
    );
  }

  const isSuperAdmin = user?.role === 'super_admin';

  const handleExportPDF = () => {
    setIsModalOpen(false);
    setIsExporting(true);

    // Snapshot the current data into sessionStorage so ReportPage can read it
    const snapshot = {
      data,
      branchName:    locationName,
      timeframe,
      selectedMonth,
      selectedYear,
      selectedWeek,
      generatedAt:   new Date().toLocaleString('id-ID', {
        day:    '2-digit',
        month:  'long',
        year:   'numeric',
        hour:   '2-digit',
        minute: '2-digit',
      }),
    };
    sessionStorage.setItem('report_snapshot', JSON.stringify(snapshot));

    setTimeout(() => {
      setIsExporting(false);
      navigate('/report');
    }, 600);
  };

  const getVsLabel = () => {
    switch(timeframe) {
      case 'weekly': return t('overview.vsLastWeek');
      case 'monthly': return t('overview.vsLastMonth');
      case 'yearly': return t('overview.vsLastYear');
      default: return t('overview.vsLastCycle');
    }
  };

  interface StatCard {
    label: string;
    displayLabel?: React.ReactNode;
    description?: string | null;
    value: string | number;
    trend?: string | null;
    vsLabel?: string;
    isUp: boolean;
    icon: React.ComponentType<any>;
    glow: string;
    iconBox: string;
    accentOrb: string;
    textColor: string;
    path: string | null;
  }

  const statCards: StatCard[] = [
    { 
      label: t('overview.totalRevenue'),
      displayLabel: (
        <span className="flex items-center gap-1.5 text-gray-400 group-hover:text-emerald-600 transition-colors duration-500">
          {t('overview.totalRevenue')}
          {currentLocation !== 'ALL' && (
            <span className="text-gray-400 font-medium lowercase tracking-normal">({locationName})</span>
          )}
        </span>
      ),
      description: null,
      value: `Rp ${(data?.revenue || 0).toLocaleString()}`, 
      trend: `${(data?.revenueChange ?? 0) >= 0 ? '+' : ''}${data?.revenueChange ?? 0}%`, 
      vsLabel: getVsLabel(),
      isUp: (data?.revenueChange ?? 0) >= 0, 
      icon: CircleDollarSign, 
      glow: 'shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgba(16,185,129,0.15)] border-gray-100 hover:border-emerald-200',
      iconBox: 'bg-emerald-50 text-emerald-600 border-transparent group-hover:bg-emerald-500 group-hover:text-white group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-[0_8px_20px_rgba(16,185,129,0.3)]',
      accentOrb: 'bg-emerald-100',
      textColor: 'text-gray-900 group-hover:text-emerald-950',
      path: null
    },
    { 
      label: t('overview.totalProducts'), 
      value: data?.inventoryCount || 0, 
      trend: null, 
      isUp: true, 
      icon: ShoppingBag, 
      glow: 'shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgba(99,102,241,0.15)] border-gray-100 hover:border-indigo-200',
      iconBox: 'bg-indigo-50 text-indigo-600 border-transparent group-hover:bg-indigo-500 group-hover:text-white group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-[0_8px_20px_rgba(99,102,241,0.3)]',
      accentOrb: 'bg-indigo-100',
      textColor: 'text-gray-900 group-hover:text-indigo-950',
      path: isSuperAdmin ? '/catalog' : '/inventory'
    },
    { 
      label: isSuperAdmin ? t('overview.totalBranches') : t('overview.activePromos'), 
      value: isSuperAdmin ? (data?.locations || 0) : (data?.promos || 0), 
      trend: null, 
      isUp: true, 
      icon: isSuperAdmin ? Store : Tag, 
      glow: isSuperAdmin ? 'shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgba(245,158,11,0.15)] border-gray-100 hover:border-amber-200' : 'shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgba(244,63,94,0.15)] border-gray-100 hover:border-rose-200',
      iconBox: isSuperAdmin ? 'bg-amber-50 text-amber-600 border-transparent group-hover:bg-amber-500 group-hover:text-white group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-[0_8px_20px_rgba(245,158,11,0.3)]' : 'bg-rose-50 text-rose-600 border-transparent group-hover:bg-rose-500 group-hover:text-white group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-[0_8px_20px_rgba(244,63,94,0.3)]',
      accentOrb: isSuperAdmin ? 'bg-amber-100' : 'bg-rose-100',
      textColor: 'text-gray-900 group-hover:text-gray-900',
      path: isSuperAdmin ? '/monitor' : '/promo'
    },
    { 
      label: t('overview.stockStatus'), 
      value: (data?.totalStock || 0) > 50 ? t('overview.healthy') : t('overview.lowStock'), 
      trend: (data?.totalStock || 0) > 50 ? t('overview.normal') : t('overview.critical'), 
      isUp: (data?.totalStock || 0) > 50, 
      icon: Package, 
      glow: (data?.totalStock || 0) > 50 ? 'shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgba(16,185,129,0.15)] border-gray-100 hover:border-emerald-200' : 'shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgba(244,63,94,0.15)] border-gray-100 hover:border-rose-200',
      iconBox: (data?.totalStock || 0) > 50 ? 'bg-emerald-50 text-emerald-600 border-transparent group-hover:bg-emerald-500 group-hover:text-white group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-[0_8px_20px_rgba(16,185,129,0.3)]' : 'bg-rose-50 text-rose-600 border-transparent group-hover:bg-rose-500 group-hover:text-white group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-[0_8px_20px_rgba(244,63,94,0.3)]',
      accentOrb: (data?.totalStock || 0) > 50 ? 'bg-emerald-100' : 'bg-rose-100',
      textColor: 'text-gray-900 group-hover:text-gray-900',
      path: isSuperAdmin ? '/monitor' : '/inventory'
    }
  ];

  return (
    <PageTransition className="space-y-8 pb-12 w-full max-w-full overflow-x-hidden">

      {/* Header Info */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-indigo-100 rounded-xl flex items-center justify-center">
            <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full shadow-[0_0_8px_#4F46E5] animate-pulse" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{t('overview.subtitle')}</p>
            <p className="text-xs text-gray-400 mt-0.5">{t('overview.dataUpdated')} • {t('overview.healthScore')}: <span className="text-indigo-600 font-bold">{data?.healthScore || 0}/100</span></p>
          </div>
        </div>
        <div className="flex items-center gap-3">
            {isSuperAdmin && <BranchSelector />}
            <Button 
              onClick={() => setIsModalOpen(true)}
              disabled={isExporting}
              variant="outline"
              className="h-11 px-5 rounded-xl font-bold border-gray-200 text-sm gap-2"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              {isExporting ? t('overview.generating') : t('overview.exportReport')}
            </Button>
        </div>
      </div>

      <ExportConfirmationModal 
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        onConfirm={handleExportPDF}
        isLoading={isExporting}
        branchName={locationName}
      />

      {/* Peringatan Stok Rendah Banner */}
      {user?.role === 'branch_admin' && lowStockItems.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-rose-50 border border-rose-100 rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-500 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md shadow-rose-500/20">
              <AlertTriangle className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h4 className="text-sm font-black text-rose-900 uppercase tracking-tight">{t('overview.lowStockAlert')}</h4>
              <p className="text-xs text-rose-700 font-semibold mt-1">
                {language === 'id' ? (
                  <>Terdapat <span className="underline font-bold">{lowStockItems.length} produk</span> dengan kuantitas stok di bawah 10 pcs. Segera lakukan penambahan stok!</>
                ) : (
                  <>There are <span className="underline font-bold">{lowStockItems.length} products</span> with stock quantity below 10 pcs. Please replenish stock immediately!</>
                )}
              </p>
            </div>
          </div>
          <Button 
            onClick={() => navigate('/inventory')}
            className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wider px-5 py-3 shadow-lg shadow-rose-600/20 border-none shrink-0"
          >
            {t('overview.manageStock')}
          </Button>
        </motion.div>
      )}

      <StaggerList className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, i) => {
          const isClickable = !!stat.path;
          const CardWrapper = isClickable ? (
            ({ children }: { children: React.ReactNode }) => (
              <Tooltip>
                <TooltipTrigger render={children as React.ReactElement} />
                <TooltipContent className="bg-indigo-600 text-white border-none rounded-xl px-4 py-2 shadow-xl">
                  <p className="text-xs font-black uppercase tracking-widest">{t('overview.clickViewDetails')}</p>
                </TooltipContent>
              </Tooltip>
            )
          ) : (
            ({ children }: { children: React.ReactNode }) => <>{children}</>
          );

          return (
            <StaggerItem
              key={stat.label}
              className="flex w-full"
            >
              <CardWrapper>
                <Card 
                  onClick={() => isClickable && navigate(stat.path!)}
                  className={cn(
                    "w-full rounded-2xl border border-gray-100 bg-white relative group transition-all duration-500 ease-out",
                    "hover:shadow-lg hover:-translate-y-1",
                    isClickable ? "cursor-pointer" : "cursor-default"
                  )}
                >
                  {/* Subtle top border gradient replacement or reflection */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                  
                  {/* Soft colorful orb background */}
                  <div className={cn(
                    "absolute -top-24 -right-24 w-48 h-48 rounded-full blur-[70px] opacity-40 group-hover:opacity-70 transition-all duration-700 ease-out pointer-events-none group-hover:scale-[2]",
                    stat.accentOrb
                  )} />

                  <CardContent className="p-6 sm:p-8 relative z-10 flex flex-col h-full justify-between">
                    <div className="flex justify-between items-start mb-8">
                      <div className={cn("p-4 rounded-2xl border transition-all duration-500", stat.iconBox)}>
                        <stat.icon className="w-6 h-6" />
                      </div>
                      {stat.trend && (
                        <div className="flex flex-col items-end gap-1">
                          <div className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black border transition-colors duration-500 shadow-sm",
                            stat.isUp ? "bg-emerald-50 text-emerald-600 border-emerald-100 group-hover:bg-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100 group-hover:bg-rose-100"
                          )}>
                            <Tooltip>
                              <TooltipTrigger render={<div className="flex items-center gap-1 cursor-help" />}>
                                {stat.isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                                {stat.trend}
                              </TooltipTrigger>
                              <TooltipContent className="bg-[#0F172A] text-white border-none rounded-xl p-3 shadow-2xl max-w-[200px]">
                                <p className="text-[10px] font-bold leading-relaxed">
                                  {t('overview.growthInfo')}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          {stat.vsLabel && (
                            <span className="text-[9px] font-bold text-gray-400 italic pr-1">
                              {stat.vsLabel}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 mt-auto">
                      <div className="text-[10px] font-black uppercase tracking-widest font-mono">
                        {stat.displayLabel || <span className="text-gray-400 group-hover:text-indigo-600 transition-colors duration-500">{stat.label}</span>}
                      </div>
                      <p className={cn("text-4xl font-black tracking-tighter leading-none font-mono transition-colors duration-500", stat.textColor)}>
                        {stat.value}
                      </p>
                      {stat.description && (
                        <p className="text-[10px] font-bold text-indigo-500 mt-2 leading-tight italic">
                          {stat.description}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </CardWrapper>
            </StaggerItem>
          );
        })}
      </StaggerList>

      {/* Main Analytics Chart - FULL WIDTH */}
      <Card className="rounded-3xl border-none shadow-sm bg-[#0F172A] text-white p-6 md:p-8 lg:p-10 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-indigo-600/20 blur-[100px] rounded-full" />
        <div className="relative z-10 space-y-12">
          <div className="flex justify-between items-center gap-4 flex-col md:flex-row pb-6 border-b border-white/5">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <h3 className="text-xl font-black tracking-tighter text-white uppercase">
                  {isSuperAdmin ? t('overview.enterpriseSalesVelocity') : t('overview.velocityPerformance')}
                </h3>
              </div>
              <p className="text-white/30 text-[11px] font-bold uppercase tracking-widest">
                {isSuperAdmin 
                  ? t('overview.consolidatedDesc')
                  : `${t('overview.realtimeDesc')} ${locationName} ${t('overview.operationalGroup')}`
                }
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden lg:flex items-center gap-2">
                    {/* Year Selector */}
                    <Select value={selectedYear} onValueChange={(v) => { if (v) setSelectedYear(v); }}>
                      <SelectTrigger className="h-10 bg-[#1E293B] border-none text-white min-w-[90px] rounded-xl hover:bg-[#2D3B4E] transition-all text-[10px] font-black uppercase tracking-widest ring-0 focus:ring-0">
                        <SelectValue placeholder="YEAR" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1E293B] border-white/5 text-white rounded-2xl">
                        {yearsList.map(y => (
                          <SelectItem key={y} value={y} className="focus:bg-white/10 focus:text-white rounded-xl text-[10px] font-bold">{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
 
                    {timeframe !== 'yearly' && (
                      <Select value={selectedMonth} onValueChange={(v) => { if (v) setSelectedMonth(v); }}>
                        <SelectTrigger className="h-10 bg-[#1E293B] border-none text-white min-w-[110px] rounded-xl hover:bg-[#2D3B4E] transition-all text-[10px] font-black uppercase tracking-widest ring-0 focus:ring-0">
                          <SelectValue placeholder="MONTH" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1E293B] border-white/5 text-white rounded-2xl">
                          {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                            <SelectItem key={m} value={m} className="focus:bg-white/10 focus:text-white rounded-xl text-[10px] font-bold uppercase">{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {timeframe === 'weekly' && (
                      <Select value={selectedWeek} onValueChange={(v) => { if (v) setSelectedWeek(v); }}>
                        <SelectTrigger className="h-10 bg-[#1E293B] border-none text-white min-w-[100px] rounded-xl hover:bg-[#2D3B4E] transition-all text-[10px] font-black uppercase tracking-widest ring-0 focus:ring-0">
                          <SelectValue placeholder="WEEK" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1E293B] border-white/5 text-white rounded-2xl">
                          {getWeeksForDropdown(Number(selectedYear), selectedMonth).map(w => (
                            <SelectItem key={w} value={w} className="focus:bg-white/10 focus:text-white rounded-xl text-[10px] font-bold uppercase">{w}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
              </div>

              <div className="flex gap-1 p-1 bg-[#1E293B] rounded-xl border border-white/5 shadow-2xl backdrop-blur-md">
                <button 
                  onClick={() => setTimeframe('weekly')}
                  className={cn(
                    "px-6 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all duration-300",
                    timeframe === 'weekly' ? "bg-white text-blue-600 shadow-xl scale-[1.05]" : "text-white/40 hover:text-white/60"
                  )}
                >
                  WEEK
                </button>
                <button 
                  onClick={() => {
                    setTimeframe('monthly');
                    if (!selectedMonth) setSelectedMonth('April');
                  }}
                  className={cn(
                    "px-6 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all duration-300",
                    timeframe === 'monthly' ? "bg-white text-blue-600 shadow-xl scale-[1.05]" : "text-white/40 hover:text-white/60"
                  )}
                >
                  MONTH
                </button>
                <button 
                  onClick={() => setTimeframe('yearly')}
                  className={cn(
                    "px-6 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all duration-300",
                    timeframe === 'yearly' ? "bg-white text-blue-600 shadow-xl scale-[1.05]" : "text-white/40 hover:text-white/60"
                  )}
                >
                  YEAR
                </button>
              </div>
            </div>
          </div>

          <div className="h-[400px] w-full mt-8">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart 
                data={data?.chartData || []}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#475569', fontSize: 10, fontWeight: 800}}
                  dy={15}
                />
                <YAxis 
                   axisLine={false} 
                   tickLine={false} 
                   tick={{fill: '#475569', fontSize: 10, fontWeight: 800}}
                   allowDecimals={false}
                   tickFormatter={(value) => {
                     if (typeof value !== 'number' || value === 0) return 'Rp0';
                     if (value >= 1000000) return `Rp${(value / 1000000).toFixed(1)}M`;
                     if (value >= 1000) return `Rp${Math.floor(value / 1000)}k`;
                     return `Rp${value}`;
                   }}
                   dx={-10}
                />
                <RechartsTooltip 
                   contentStyle={{
                     backgroundColor: '#0F172A', 
                     border: '1px solid rgba(255,255,255,0.1)', 
                     borderRadius: '24px', 
                     color: '#fff', 
                     fontSize: '12px', 
                     fontWeight: 'bold',
                     padding: '20px',
                     boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                   }}
                   cursor={{stroke: '#3b82f6', strokeWidth: 2}}
                />
                <Area 
                  type="monotone" 
                  dataKey="total" 
                  stroke="#3b82f6" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorTotal)" 
                  animationDuration={1000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      {/* ── Visual Analytics Section: Top Products & Category Contribution ── */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-gray-400">
          {t('overview.showingData')}: <span className="text-indigo-600">{timeframe === 'weekly' ? `${selectedWeek}, ${selectedMonth} ${selectedYear}` : timeframe === 'monthly' ? `${selectedMonth} ${selectedYear}` : selectedYear}</span>
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Products Sales Chart */}
        <Card className="border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.03)] rounded-3xl p-6 md:p-8 space-y-6 bg-white">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-lg font-black text-gray-900 tracking-tight">{t('overview.topProductsSales')}</h4>
              <p className="text-xs text-gray-400 font-medium">{t('overview.topProductsDesc')}</p>
            </div>
            <select
              value={topProductsLimit}
              onChange={(e) => setTopProductsLimit(Number(e.target.value))}
              className="text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value={5}>Top 5</option>
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
            </select>
          </div>
          <div className="h-[300px] w-full">
            {data?.topProducts && data.topProducts.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                   data={data.topProducts.slice(0, topProductsLimit)}
                  margin={{ top: 20, right: 10, left: 10, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                    tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : `${v/1000}k`}
                  />
                  <RechartsTooltip
                    cursor={{ fill: '#f8fafc' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const p = payload[0].payload;
                        return (
                          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl space-y-1 text-white">
                            <p className="text-xs font-black leading-none mb-1 text-slate-400 uppercase tracking-widest">{p.category}</p>
                            <p className="text-sm font-black">{p.name}</p>
                            <p className="text-xs font-bold text-slate-300">Revenue: {formatRp(p.revenue)}</p>
                            <p className="text-xs text-indigo-400 font-bold">Qty Sold: {p.quantitySold} unit</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="revenue" radius={[10, 10, 0, 0]} barSize={24}>
                    {data.topProducts.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm font-semibold text-gray-400">{t('overview.noSalesData')}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Category Contribution Progress Bars */}
        <Card className="border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.03)] rounded-3xl p-6 md:p-8 bg-white space-y-6">
          <div className="space-y-1">
            <h4 className="text-lg font-black text-gray-900 tracking-tight">{t('overview.categoryContribution')}</h4>
            <p className="text-xs text-gray-400 font-medium">{t('overview.categoryDesc')}</p>
          </div>
          <div className="space-y-6 overflow-y-auto max-h-[300px] pr-2">
            {data?.categorySalesBreakdown && data.categorySalesBreakdown.length > 0 ? (
              data.categorySalesBreakdown.map((cat: any, index: number) => {
                const percentage = (data?.revenue || 0) > 0 ? (cat.value / data.revenue) * 100 : 0;
                return (
                  <div key={cat.name} className="space-y-2">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="font-bold text-gray-800 capitalize">{cat.name}</span>
                      <span className="font-black text-indigo-600">{percentage.toFixed(1)}% ({formatRp(cat.value)})</span>
                    </div>
                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-12 flex items-center justify-center">
                <p className="text-sm font-semibold text-gray-400">{t('overview.noCategoryData')}</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── Sold Products Table Card ── */}
      <Card className="border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.03)] rounded-3xl p-6 md:p-8 bg-white space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="text-lg font-black text-gray-900 tracking-tight">{t('overview.productSalesTable')}</h4>
            <p className="text-xs text-gray-400 font-medium">{t('overview.productSalesTableDesc')}</p>
          </div>
          {/* Search Bar + Category Filter */}
          <div className="flex items-center gap-3 w-full sm:max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t('overview.searchProduct')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-semibold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-300"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="all">{t('overview.allCategories')}</option>
              {[...new Set((data?.productsList || []).map((p: any) => p.category).filter(Boolean))].map((cat: any) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('overview.productInfo')}</th>
                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('common.category')}</th>
                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('overview.basePrice')}</th>
                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('overview.qtySold')}</th>
                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">{t('overview.totalRevenue2')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(() => {
                const filteredProducts = (data?.productsList || []).filter((p: any) =>
                  (categoryFilter === 'all' || p.category === categoryFilter) &&
                  (p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  p.category.toLowerCase().includes(searchQuery.toLowerCase()))
                );
                return filteredProducts.length > 0 ? (
                  filteredProducts.map((p: any) => (
                    <tr key={p.id} className="group hover:bg-slate-50/40 transition-colors duration-300">
                      <td className="p-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-extrabold text-sm text-gray-900 group-hover:text-indigo-600 transition-colors duration-300">{p.name}</span>
                          <span className="text-[10px] font-bold text-gray-400">SKU: {p.sku}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-black rounded-full capitalize">{p.category}</span>
                      </td>
                      <td className="p-4 font-bold text-xs text-gray-600">
                        {formatRp(p.price)}
                      </td>
                      <td className="p-4">
                        <span className="font-extrabold text-gray-900 bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-lg text-xs">
                          {p.quantitySold} unit
                        </span>
                      </td>
                      <td className="p-4 font-black text-sm text-gray-900 text-right">
                        {formatRp(p.revenue)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-xs font-semibold text-gray-400">
                      {t('overview.noProductMatch')}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </Card>
    </PageTransition>
  );
}
