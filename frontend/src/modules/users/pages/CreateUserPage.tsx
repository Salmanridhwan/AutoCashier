import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, UserPlus, Loader2, User, Mail, Lock, MapPin } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Card } from '@/shared/components/ui/card';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { fetchBackend } from '@/shared/lib/api';
import { useAuth } from '@/shared/context/AuthContext';
import { useLocation } from '@/shared/context/LocationContext';
import { useLanguage } from '@/shared/context/LanguageContext';
import PageTransition from '@/shared/components/ui/PageTransition';

const ALL_ROLES = ['super_admin', 'branch_admin', 'kasir', 'member'];

export default function CreateUserPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { allBranches } = useLocation();
  const { t, language } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);

  // Branch admin hanya bisa buat kasir dan member
  const isSuperAdmin = user?.role === 'super_admin';
  const availableRoles = isSuperAdmin ? ALL_ROLES : ['kasir', 'member'];

  // Auto-assign branch untuk admin cabang
  const userBranchId = (user as any)?.location_id || '';

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'kasir',
    branchId: isSuperAdmin ? '' : userBranchId,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      toast.error(language === 'id' ? 'Nama, email, dan password wajib diisi' : 'Name, email, and password are required');
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error(language === 'id' ? 'Password dan konfirmasi password tidak cocok' : 'Password and confirm password do not match');
      return;
    }
    if (form.password.length < 6) {
      toast.error(language === 'id' ? 'Password minimal 6 karakter' : 'Password must be at least 6 characters');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetchBackend('createUser', form);
      if (res.status === 'success') {
        toast.success(language === 'id' ? '✅ Pengguna berhasil dibuat!' : '✅ User created successfully!');
        setTimeout(() => navigate('/users'), 1000);
      } else {
        toast.error(res.message || res.error || (language === 'id' ? 'Gagal membuat pengguna' : 'Failed to create user'));
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PageTransition className="min-h-screen -m-6 bg-[#F8FAFC] p-6 lg:p-10 font-sans">
      <div className="mx-auto max-w-2xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xl shadow-indigo-600/20">
              <UserPlus className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-gray-900">{t('createUser.title')}</h1>
              <p className="text-sm font-medium text-gray-500 mt-1">{t('createUser.subtitle')}</p>
            </div>
          </div>
          <Button onClick={() => navigate('/users')} variant="outline" className="h-10 rounded-xl border-gray-200 bg-white px-4 font-bold text-gray-600">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t('common.back')}
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="overflow-hidden rounded-[32px] border-none bg-white shadow-[0_8px_40px_rgba(0,0,0,0.06)] p-8">
            <div className="space-y-2 mb-8">
              <h3 className="text-lg font-black text-gray-900">{language === 'id' ? 'Informasi Akun' : 'Account Information'}</h3>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{language === 'id' ? 'Data login pengguna baru' : 'New user login credentials'}</p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('users.fullName')} *</Label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input placeholder={t('users.enterFullName')} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className="h-14 rounded-2xl bg-gray-50/50 font-bold pl-12 focus:bg-white focus:ring-2 focus:ring-indigo-100 border-gray-200" required />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('common.email')} *</Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input type="email" placeholder={language === 'id' ? 'email@contoh.com' : 'email@example.com'} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    className="h-14 rounded-2xl bg-gray-50/50 font-bold pl-12 focus:bg-white focus:ring-2 focus:ring-indigo-100 border-gray-200" required />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('common.password')} *</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input type="password" placeholder={language === 'id' ? 'Min. 6 karakter' : 'Min. 6 characters'} value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    className="h-14 rounded-2xl bg-gray-50/50 font-bold pl-12 focus:bg-white focus:ring-2 focus:ring-indigo-100 border-gray-200" required />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{language === 'id' ? 'Konfirmasi Password *' : 'Confirm Password *'}</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input type="password" placeholder={language === 'id' ? 'Ulangi password' : 'Repeat password'} value={form.confirmPassword} onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
                    className={`h-14 rounded-2xl bg-gray-50/50 font-bold pl-12 focus:bg-white focus:ring-2 border-gray-200 ${form.confirmPassword && form.password !== form.confirmPassword ? 'border-rose-300 focus:ring-rose-100' : 'focus:ring-indigo-100'}`} required />
                </div>
                {form.confirmPassword && form.password !== form.confirmPassword && (
                  <p className="text-xs text-rose-500 ml-1">{language === 'id' ? 'Password tidak cocok' : 'Password mismatch'}</p>
                )}
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('common.role')} *</Label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                  className="w-full h-14 rounded-2xl bg-gray-50/50 font-bold px-4 border border-gray-200 focus:bg-white focus:ring-2 focus:ring-indigo-100 text-sm">
                  {availableRoles.map(r => <option key={r} value={r}>{r === 'super_admin' ? 'Super Admin' : r === 'branch_admin' ? (language === 'id' ? 'Admin Cabang' : 'Branch Admin') : r === 'kasir' ? (language === 'id' ? 'Kasir' : 'Cashier') : 'Member'}</option>)}
                </select>
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('common.branch')}</Label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  {isSuperAdmin ? (
                    <select value={form.branchId} onChange={e => setForm(p => ({ ...p, branchId: e.target.value }))}
                      className="w-full h-14 rounded-2xl bg-gray-50/50 font-bold pl-12 pr-4 border border-gray-200 focus:bg-white focus:ring-2 focus:ring-indigo-100 text-sm"
                      disabled={form.role === 'super_admin' || form.role === 'member'}>
                      <option value="">{language === 'id' ? 'Pilih cabang...' : 'Select branch...'}</option>
                      {(allBranches || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  ) : (
                    <div className="w-full h-14 rounded-2xl bg-gray-100 font-bold pl-12 pr-4 border border-gray-200 flex items-center text-sm text-gray-700">
                      {(allBranches || []).find((b: any) => b.id === userBranchId)?.name || (language === 'id' ? 'Cabang Anda' : 'Your Branch')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <div className="pt-4 pb-12">
            <Button type="submit" disabled={isLoading || !form.name || !form.email || !form.password}
              className="h-16 w-full rounded-2xl bg-indigo-600 text-base font-black text-white shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-60 transition-all">
              {isLoading ? <Loader2 className="h-6 w-6 animate-spin mr-3" /> : <UserPlus className="h-6 w-6 mr-3" />}
              {isLoading ? (language === 'id' ? 'Membuat Akun...' : 'Creating Account...') : t('createUser.create')}
            </Button>
          </div>
        </form>
      </div>
    </PageTransition>
  );
}
