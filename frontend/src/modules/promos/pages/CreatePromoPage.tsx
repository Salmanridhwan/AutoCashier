import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Tag, Banknote, Calendar, Users, User, Percent, Zap, Lock, Loader2, CircleCheck, Sparkles, MapPin, Store } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { toast } from 'sonner';
import { fetchBackend, BACKEND_URL } from '@/shared/lib/api';
import { useAuth } from '@/shared/context/AuthContext';
import { useLocation } from '@/shared/context/LocationContext';
import { cn } from '@/shared/lib/utils';
import { useLanguage } from '@/shared/context/LanguageContext';
import PageTransition from '@/shared/components/ui/PageTransition';

export default function CreatePromoPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id;
  const { user } = useAuth();
  const { allBranches, currentLocation } = useLocation();
  const isSuperAdmin = user?.role === 'super_admin';
  const { t, language } = useLanguage();

  const formatDots = (numStr: string) => {
    if (!numStr) return '';
    const clean = numStr.replace(/\D/g, '');
    return clean ? Number(clean).toLocaleString('id-ID') : '';
  };

  const [isLoading, setIsLoading] = useState(false);
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [branchTargetType, setBranchTargetType] = useState('ALL');
  const [userTargetType, setUserTargetType] = useState<'ALL' | 'SPECIFIC'>('ALL');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [form, setForm] = useState({
    title: '', code: '', eventName: '',
    discount: '', maxDiscount: '', minPurchase: '',
    startsAt: '', expiresAt: '',
    usageLimit: '', perUserLimit: '',
    scope: 'ALL',
  });

  useEffect(() => {
    setLoadingUsers(true);
    fetchBackend('getUsers').then(res => {
      if (res.status === 'success' && res.data) {
        const membersOnly = res.data.filter((u: any) => (u.role || '').toLowerCase() === 'member');
        setUsersList(membersOnly);
      }
    }).finally(() => setLoadingUsers(false));
  }, []);

  useEffect(() => {
    if (isEditMode && id) {
      setIsLoading(true);
      let token = '';
      try {
        const saved = localStorage.getItem('autocashier_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.token) token = parsed.token;
        }
      } catch (e) {}

      fetch(`${BACKEND_URL}/api/admin/promos/${id}`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      })
        .then(res => res.json())
        .then(res => {
          if (res.status === 'success' && res.data) {
            const d = res.data;
            setForm({
              title: d.title || d.code, // title might not exist if added to DB manually, fallback to code
              code: d.code,
              eventName: d.event_name || '',
              discount: d.discount_value?.toString() || '',
              maxDiscount: d.max_discount?.toString() || '',
              minPurchase: d.min_purchase?.toString() || '',
              startsAt: d.starts_at ? new Date(new Date(d.starts_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16) : '',
              expiresAt: d.expires_at ? new Date(new Date(d.expires_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16) : '',
              usageLimit: d.usage_limit?.toString() || '',
              perUserLimit: d.per_user_limit?.toString() || '',
              scope: d.scope || 'ALL',
            });
            setDiscountType(d.discount_type === 'Percentage' ? 'PERCENTAGE' : 'FIXED');
            setBranchTargetType(d.scope === 'ALL' ? 'ALL' : 'SPECIFIC');
            setUserTargetType(d.target_type || 'ALL');
            if (d.target_user_ids) {
              setSelectedUserIds(d.target_user_ids);
            }
          } else {
            toast.error(language === 'id' ? 'Gagal mengambil data campaign' : 'Failed to retrieve campaign data');
            navigate('/promo');
          }
        })
        .catch(() => {
          toast.error(language === 'id' ? 'Kesalahan Jaringan' : 'Network error');
          navigate('/promo');
        })
        .finally(() => setIsLoading(false));
    }
  }, [id, isEditMode, navigate, language]);

  const handleSubmit = async () => {
    if (!form.code || !form.discount) {
      toast.error(language === 'id' ? 'Wajib isi Kode Voucher dan Nilai Diskon.' : 'Voucher Code and Discount Value are required.');
      return;
    }
    const scope = isSuperAdmin
      ? (branchTargetType === 'ALL' ? 'ALL' : form.scope)
      : 'ALL';

    setIsLoading(true);
    try {
      const payload = {
        title: form.code,
        code: form.code,
        event_name: form.eventName || undefined,
        discount_type: discountType === 'PERCENTAGE' ? 'Percentage' : 'Fixed',
        discount_value: Number(form.discount),
        max_discount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
        min_purchase: form.minPurchase ? Number(form.minPurchase) : undefined,
        starts_at: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
        expires_at: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
        usage_limit: form.usageLimit ? Number(form.usageLimit) : undefined,
        per_user_limit: form.perUserLimit ? Number(form.perUserLimit) : undefined,
        scope,
        target_user_ids: userTargetType === 'SPECIFIC' ? selectedUserIds : [],
      };

      let token = '';
      try {
        const saved = localStorage.getItem('autocashier_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.token) token = parsed.token;
        }
      } catch (e) {}

      let res;
      if (isEditMode && id) {
        res = await fetch(`${BACKEND_URL}/api/admin/promos/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload)
        }).then(r => r.json());
      } else {
        res = await fetchBackend('createPromo', payload);
      }

      if (res.status === 'success') {
        toast.success(isEditMode 
          ? (language === 'id' ? 'Campaign berhasil diperbarui!' : 'Campaign updated successfully!') 
          : (language === 'id' ? 'Campaign berhasil dibuat!' : 'Campaign created successfully!'));
        navigate('/promo');
      } else {
        const errorMsg = typeof res.error === 'string' ? res.error : (res.error?.message || (language === 'id' ? 'Gagal memproses campaign.' : 'Failed to process campaign.'));
        toast.error(errorMsg);
      }
    } catch {
      toast.error(language === 'id' ? 'Kesalahan Jaringan.' : 'Network error.');
    } finally {
      setIsLoading(false);
    }
  };

  const SectionHeader = ({ icon: Icon, label }: { icon: any; label: string }) => (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-7 h-7 bg-indigo-50 rounded-xl flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-indigo-600" />
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">{label}</p>
    </div>
  );

  return (
    <PageTransition
      className="min-h-screen -m-6 bg-[#F8FAFC] p-6 lg:p-10 font-sans"
    >
      <div className="mx-auto max-w-5xl space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xl shadow-indigo-600/20">
              <Tag className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-gray-900">
                {isEditMode ? (language === 'id' ? 'Edit Campaign' : 'Edit Campaign') : (language === 'id' ? 'Buat Campaign Baru' : 'Create New Campaign')}
              </h1>
              <p className="text-sm font-medium text-gray-500 mt-1">
                {isEditMode 
                  ? (language === 'id' ? 'Perbarui konfigurasi voucher promo' : 'Update promo voucher configuration') 
                  : (language === 'id' ? 'Konfigurasi voucher, syarat, dan target penerima' : 'Configure voucher, requirements, and target recipients')}
              </p>
            </div>
          </div>
          
          <Button
            onClick={() => navigate('/promo')}
            variant="outline"
            className="h-10 rounded-xl border-gray-200 bg-white px-4 font-bold text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all shadow-sm"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back')}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">

            {/* SECTION 1: Identitas */}
            <div className="bg-white rounded-[28px] border border-gray-100 shadow-sm p-6">
              <SectionHeader icon={Tag} label={language === 'id' ? 'Identitas Campaign' : 'Campaign Identity'} />
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      {language === 'id' ? 'Nama Event ' : 'Event Name '}
                      <span className="text-gray-300 normal-case font-semibold">({language === 'id' ? 'opsional' : 'optional'})</span>
                    </Label>
                    <Input placeholder={language === 'id' ? 'Misal: Idul Fitri 1446H' : 'e.g. Eid Al-Fitr'} className="rounded-2xl h-11 bg-gray-50 border-gray-100 px-4 font-bold text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all" value={form.eventName} onChange={e => setForm({ ...form, eventName: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      {language === 'id' ? 'Kode Voucher *' : 'Voucher Code *'}
                    </Label>
                    <Input placeholder="LEBARAN25" className="rounded-2xl h-11 bg-gray-50 border-gray-100 px-4 font-black uppercase font-mono text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all tracking-widest" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} />
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 2: Nilai Diskon */}
            <div className="bg-white rounded-[28px] border border-gray-100 shadow-sm p-6">
              <SectionHeader icon={Banknote} label={t('promo.discountValue')} />
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 p-1 bg-gray-50 rounded-2xl border border-gray-100">
                  <button
                    onClick={() => setDiscountType('PERCENTAGE')}
                    className={cn('flex items-center justify-center gap-2 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all', discountType === 'PERCENTAGE' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-gray-400 hover:text-gray-600')}
                  >
                    <Percent className="w-3.5 h-3.5" /> {language === 'id' ? 'Persentase (%)' : 'Percentage (%)'}
                  </button>
                  <button
                    onClick={() => setDiscountType('FIXED')}
                    className={cn('flex items-center justify-center gap-2 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all', discountType === 'FIXED' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-gray-400 hover:text-gray-600')}
                  >
                    <Banknote className="w-3.5 h-3.5" /> {language === 'id' ? 'Nominal Tetap (Rp)' : 'Fixed Amount (Rp)'}
                  </button>
                </div>
                 <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      {discountType === 'PERCENTAGE' 
                        ? (language === 'id' ? 'Besar Diskon (%) *' : 'Discount Percentage (%) *') 
                        : (language === 'id' ? 'Nominal Diskon (Rp) *' : 'Discount Amount (Rp) *')}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-black text-sm">{discountType === 'PERCENTAGE' ? '%' : 'Rp'}</span>
                      <Input 
                        type={discountType === 'PERCENTAGE' ? 'number' : 'text'} 
                        placeholder={discountType === 'PERCENTAGE' ? '20' : '15.000'} 
                        className="rounded-2xl h-11 bg-gray-50 border-gray-100 pl-9 pr-4 font-bold text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all" 
                        value={discountType === 'PERCENTAGE' ? form.discount : formatDots(form.discount)} 
                        onChange={e => {
                          const val = discountType === 'PERCENTAGE' ? e.target.value : e.target.value.replace(/\D/g, '');
                          setForm({ ...form, discount: val });
                        }} 
                      />
                    </div>
                  </div>
                  {discountType === 'PERCENTAGE' && (
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                        {language === 'id' ? 'Maks. Diskon (Rp) ' : 'Max Discount (Rp) '}
                        <span className="text-gray-300 font-semibold normal-case">({language === 'id' ? 'opsional' : 'optional'})</span>
                      </Label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-black text-sm">Rp</span>
                        <Input 
                          type="text" 
                          placeholder="50.000" 
                          className="rounded-2xl h-11 bg-gray-50 border-gray-100 pl-9 pr-4 font-bold text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all" 
                          value={formatDots(form.maxDiscount)} 
                          onChange={e => {
                            const val = e.target.value.replace(/\D/g, '');
                            setForm({ ...form, maxDiscount: val });
                          }} 
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    {language === 'id' ? 'Min. Pembelian (Rp) ' : 'Min. Purchase (Rp) '}
                    <span className="text-gray-300 font-semibold normal-case">({language === 'id' ? 'opsional' : 'optional'})</span>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-black text-sm">Rp</span>
                    <Input 
                      type="text" 
                      placeholder="100.000" 
                      className="rounded-2xl h-11 bg-gray-50 border-gray-100 pl-9 pr-4 font-bold text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all" 
                      value={formatDots(form.minPurchase)} 
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '');
                        setForm({ ...form, minPurchase: val });
                      }} 
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 3: Jadwal & Kuota */}
            <div className="bg-white rounded-[28px] border border-gray-100 shadow-sm p-6">
              <SectionHeader icon={Calendar} label={language === 'id' ? 'Jadwal & Kuota' : 'Schedule & Quota'} />
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      {language === 'id' ? 'Mulai Berlaku' : 'Start Date'}
                    </Label>
                    <Input type="datetime-local" className="rounded-2xl h-11 bg-gray-50 border-gray-100 px-4 font-bold text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all" value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      {language === 'id' ? 'Berakhir Pada' : 'Expiry Date'}
                    </Label>
                    <Input type="datetime-local" className="rounded-2xl h-11 bg-gray-50 border-gray-100 px-4 font-bold text-xs focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      {language === 'id' ? 'Kuota Total ' : 'Total Quota '}
                      <span className="text-gray-300 font-semibold normal-case">({language === 'id' ? 'kosong = tak terbatas' : 'empty = unlimited'})</span>
                    </Label>
                    <div className="relative">
                      <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                      <Input type="number" placeholder="100" className="rounded-2xl h-11 bg-gray-50 border-gray-100 pl-10 pr-4 font-bold text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all" value={form.usageLimit} onChange={e => setForm({ ...form, usageLimit: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      {language === 'id' ? 'Maks. per User ' : 'Max per User '}
                      <span className="text-gray-300 font-semibold normal-case">({language === 'id' ? 'opsional' : 'optional'})</span>
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                      <Input type="number" placeholder="1" className="rounded-2xl h-11 bg-gray-50 border-gray-100 pl-10 pr-4 font-bold text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all" value={form.perUserLimit} onChange={e => setForm({ ...form, perUserLimit: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">

            {/* SECTION 4: Target Penerima */}
            <div className="bg-white rounded-[28px] border border-gray-100 shadow-sm p-6">
              <SectionHeader icon={User} label={language === 'id' ? 'Target Penerima' : 'Target Recipients'} />
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => { setUserTargetType('ALL'); setSelectedUserIds([]); }}
                    className={cn('flex items-center gap-3 h-12 px-4 rounded-2xl border-2 text-left transition-all', userTargetType === 'ALL' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200')}
                  >
                    <Users className="w-4 h-4 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest">{language === 'id' ? 'Semua User' : 'All Users'}</p>
                      <p className="text-[9px] font-medium text-current opacity-60">{language === 'id' ? 'Siapapun bisa menggunakan voucher ini' : 'Anyone can use this voucher'}</p>
                    </div>
                    {userTargetType === 'ALL' && <CircleCheck className="w-4 h-4 ml-auto text-indigo-500" />}
                  </button>
                  <button
                    onClick={() => setUserTargetType('SPECIFIC')}
                    className={cn('flex items-center gap-3 h-12 px-4 rounded-2xl border-2 text-left transition-all', userTargetType === 'SPECIFIC' ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200')}
                  >
                    <Lock className="w-4 h-4 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest">{language === 'id' ? 'User Tertentu' : 'Specific Users'}</p>
                      <p className="text-[9px] font-medium text-current opacity-60">{language === 'id' ? 'Hanya user yang dipilih' : 'Only selected users'}</p>
                    </div>
                    {userTargetType === 'SPECIFIC' && <CircleCheck className="w-4 h-4 ml-auto text-violet-500" />}
                  </button>
                </div>

                {userTargetType === 'SPECIFIC' && (
                  <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">{language === 'id' ? 'Pilih Penerima:' : 'Select Recipients:'}</p>
                    {loadingUsers ? (
                      <div className="flex items-center justify-center h-20 gap-2 text-gray-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-widest">{t('common.loading')}</span>
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto rounded-2xl border border-gray-100 divide-y divide-gray-50">
                        {usersList.map((u: any) => {
                          const isSel = selectedUserIds.includes(u.id);
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => setSelectedUserIds(prev => isSel ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                              className={cn('w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all', isSel ? 'bg-violet-50' : 'hover:bg-gray-50')}
                            >
                              <div className={cn('w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all', isSel ? 'bg-violet-600 border-violet-600' : 'border-gray-200')}>
                                {isSel && <span className="text-white text-[9px] font-black">✓</span>}
                              </div>
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0 overflow-hidden">
                                {u.profile_picture ? (
                                  <img src={u.profile_picture} alt={u.username} className="w-full h-full object-cover" />
                                ) : (
                                  (u.full_name || u.username || '?').charAt(0).toUpperCase()
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-black text-gray-900 truncate">{u.full_name || u.username}</p>
                                <p className="text-[10px] text-gray-400 font-medium truncate">
                                  {u.username ? `@${u.username}` : u.role}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {selectedUserIds.length > 0 && (
                      <div className="flex items-center gap-2 pt-1">
                        <div className="w-2 h-2 bg-violet-500 rounded-full" />
                        <span className="text-[10px] font-black text-violet-600">
                          {selectedUserIds.length} {language === 'id' ? 'user dipilih' : 'users selected'}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 5: Target Cabang (Super Admin only) */}
            {isSuperAdmin && (
              <div className="bg-white rounded-[28px] border border-gray-100 shadow-sm p-6">
                <SectionHeader icon={MapPin} label={language === 'id' ? 'Target Cabang' : 'Target Branch'} />
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => { setBranchTargetType('ALL'); setForm({...form, scope: 'ALL'}); }}
                      className={cn('flex items-center gap-3 h-12 px-4 rounded-2xl border-2 text-left transition-all', branchTargetType === 'ALL' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200')}
                    >
                      <MapPin className="w-4 h-4 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest">{t('promo.allBranches')}</p>
                        <p className="text-[9px] font-medium text-current opacity-60">{language === 'id' ? 'Promo berlaku di seluruh outlet' : 'Promo valid at all outlets'}</p>
                      </div>
                      {branchTargetType === 'ALL' && <CircleCheck className="w-4 h-4 ml-auto text-indigo-500" />}
                    </button>
                    <button
                      onClick={() => setBranchTargetType('SPECIFIC')}
                      className={cn('flex items-center gap-3 h-12 px-4 rounded-2xl border-2 text-left transition-all', branchTargetType === 'SPECIFIC' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200')}
                    >
                      <Store className="w-4 h-4 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest">{t('promo.specificBranch')}</p>
                        <p className="text-[9px] font-medium text-current opacity-60">{language === 'id' ? 'Pilih cabang spesifik' : 'Select specific branch'}</p>
                      </div>
                      {branchTargetType === 'SPECIFIC' && <CircleCheck className="w-4 h-4 ml-auto text-amber-500" />}
                    </button>
                  </div>

                  {branchTargetType === 'SPECIFIC' && (
                    <div className="mt-4 animate-in slide-in-from-top-2 duration-300">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">{language === 'id' ? 'Pilih Outlet:' : 'Select Outlet:'}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {allBranches.filter(l => l.id !== 'ALL').map(loc => {
                          const isSelected = form.scope === loc.id;
                          return (
                            <button
                              key={loc.id}
                              onClick={() => setForm({ ...form, scope: loc.id })}
                              className={cn(
                                "flex flex-col p-3 rounded-2xl border-2 text-left transition-all",
                                isSelected 
                                  ? "border-amber-500 bg-amber-50 shadow-sm shadow-amber-200" 
                                  : "border-gray-100 bg-white hover:border-gray-200"
                              )}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white", isSelected ? "bg-amber-500" : "bg-gray-200")}>
                                  {loc.name.charAt(0).toUpperCase()}
                                </div>
                                {isSelected && <CircleCheck className="w-3.5 h-3.5 text-amber-500" />}
                              </div>
                              <p className={cn("text-xs font-bold mt-1", isSelected ? "text-amber-900" : "text-gray-700")}>{loc.name}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Summary Preview */}
            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-[28px] p-6 text-white relative overflow-hidden">
              <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 blur-3xl rounded-full" />
              <h3 className="text-sm font-black uppercase tracking-widest mb-4">{language === 'id' ? 'Pratinjau' : 'Preview'}</h3>
              <div className="space-y-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-white/60 font-semibold">{language === 'id' ? 'Kode' : 'Code'}</span>
                  <span className="font-black font-mono">{form.code || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60 font-semibold">{language === 'id' ? 'Diskon' : 'Discount'}</span>
                  <span className="font-black">{form.discount ? (discountType === 'PERCENTAGE' ? `${form.discount}%` : `Rp ${Number(form.discount).toLocaleString()}`) : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60 font-semibold">{language === 'id' ? 'Kuota' : 'Quota'}</span>
                  <span className="font-black">
                    {form.usageLimit 
                      ? `${form.usageLimit} ${language === 'id' ? 'pengguna' : 'users'}` 
                      : 'Unlimited'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60 font-semibold">Target</span>
                  <span className="font-black">
                    {userTargetType === 'ALL' 
                      ? (language === 'id' ? 'Semua User' : 'All Users') 
                      : `${selectedUserIds.length} ${language === 'id' ? 'User' : 'Users'}`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="pt-4 pb-12">
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="h-16 w-full rounded-2xl bg-indigo-600 text-base font-black text-white shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-60 transition-all"
          >
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin mr-3" />
            ) : (
              <Zap className="h-6 w-6 mr-3" />
            )}
            {isLoading 
              ? t('common.loading') 
              : (isEditMode 
                ? (language === 'id' ? 'Simpan Perubahan' : 'Save Changes') 
                : (language === 'id' ? 'Aktifkan Campaign' : 'Activate Campaign'))}
          </Button>
        </div>
      </div>
    </PageTransition>
  );
}
