import {useState, useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import {Card, CardContent} from '@/shared/components/ui/card';
import {Button} from '@/shared/components/ui/button';
import {Avatar, AvatarFallback, AvatarImage} from '@/shared/components/ui/avatar';
import {Shield, UserPlus, Search, Edit2, ShieldAlert, CircleCheck, Trash2, Mail, Lock, User, MapPin, Loader2, Gift, Tag, Percent, Banknote, Users2, RefreshCw} from 'lucide-react';
import {cn} from '@/shared/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {Input} from '@/shared/components/ui/input';
import {toast} from 'sonner';
import {fetchBackend, BACKEND_URL} from '@/shared/lib/api';
import {useAuth} from '@/shared/context/AuthContext';
import {useLanguage} from '@/shared/context/LanguageContext';
import PageTransition from '@/shared/components/ui/PageTransition';
import { StaggerList, StaggerItem } from '@/shared/components/ui/StaggerList';
import { motion } from 'motion/react';

export default function UsersPage() {
  const navigate = useNavigate();
  const {user} = useAuth();
  const {t, language} = useLanguage();
  const isSuperAdmin = user?.role === 'super_admin';

  const getAvatarUrl = (user: any) => {
    const avatarStr = user?.profile_picture || user?.avatar_url;
    if (!avatarStr || avatarStr === 'null' || avatarStr === '') {
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=4f46e5&color=fff&bold=true`;
    }
    if (avatarStr.startsWith('http')) return avatarStr;
    return `${BACKEND_URL}${avatarStr}`;
  };

  const [roleFilter, setRoleFilter] = useState(isSuperAdmin ? 'ALL' : 'Member');
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const [selectedMemberForVoucher, setSelectedMemberForVoucher] = useState<any>(null);
  const [voucherForm, setVoucherForm] = useState({
    code: '',
    discount_type: 'percent',
    discount_value: '',
    min_purchase: ''
  });
  
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [uRes, bRes] = await Promise.all([
        fetchBackend('getUsers'),
        fetchBackend('getBranches')
      ]);
      
      if (uRes.status === 'success') setUsers(uRes.data);
      if (bRes.status === 'success') setBranches(bRes.data || []);
    } catch (err) {
      toast.error(language === 'id' ? 'Gagal menyinkronkan identitas jaringan' : 'Failed to sync network identities');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredUsers = users.filter(user => {
    const matchesRole = roleFilter === 'ALL' || (user.role && user.role.toLowerCase() === roleFilter.toLowerCase());
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         user.email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesRole && matchesSearch;
  });

  const handleEditUser = async () => {
    if (!editingUser.name || !editingUser.email) {
      toast.error(language === 'id' ? 'Nama dan Email wajib diisi' : 'Name and Email are required');
      return;
    }

    try {
      const res = await fetchBackend('updateUser', editingUser);
      if (res.status === 'success') {
        toast.success(t('users.identityUpdated'));
        setIsEditModalOpen(false);
        loadData();
      } else {
        toast.error(res.message || (language === 'id' ? 'Gagal memperbarui identitas' : 'Failed to update identity'));
      }
    } catch (err) {
      toast.error(language === 'id' ? 'Kesalahan koneksi jaringan' : 'Network connection error');
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      const res = await fetchBackend('deleteUser', { id: userToDelete.id });
      if (res.status === 'success') {
        toast.success(t('users.identityRevoked').replace('{name}', userToDelete.name));
        setIsDeleteModalOpen(false);
        loadData();
      } else {
        toast.error(res.message || (language === 'id' ? 'Gagal mencabut akses identitas' : 'Failed to revoke identity'));
      }
    } catch (err) {
      toast.error(language === 'id' ? 'Kesalahan koneksi jaringan' : 'Network connection error');
    }
  };

  const handleAssignVoucher = async () => {
    if (!voucherForm.code || !voucherForm.discount_value) {
      toast.error(language === 'id' ? 'Kode dan Nilai Diskon wajib diisi' : 'Code and Discount Value are required');
      return;
    }

    try {
      const res = await fetchBackend('assignMemberPromo', {
        userId: selectedMemberForVoucher.id,
        code: voucherForm.code.toUpperCase(),
        discount_type: voucherForm.discount_type,
        discount_value: Number(voucherForm.discount_value),
        min_purchase: Number(voucherForm.min_purchase) || 0
      });

      if (res.status === 'success') {
        toast.success(t('users.voucherSent').replace('{name}', selectedMemberForVoucher.name));
        setIsVoucherModalOpen(false);
        setVoucherForm({ code: '', discount_type: 'percent', discount_value: '', min_purchase: '' });
      } else {
        toast.error(res.message || (language === 'id' ? 'Gagal mengirimkan voucher' : 'Failed to assign voucher'));
      }
    } catch (err) {
      toast.error(language === 'id' ? 'Kesalahan koneksi jaringan' : 'Network connection error');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
         <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
         <p className="text-gray-400 font-black uppercase tracking-widest text-[10px]">{t('users.syncingIdentities')}</p>
      </div>
    );
  }

  const superAdminCount = users.filter(u => (u.role || '').toLowerCase() === 'super admin' || (u.role || '').toLowerCase() === 'super_admin').length;
  const branchAdminCount = users.filter(u => (u.role || '').toLowerCase() === 'branch admin' || (u.role || '').toLowerCase() === 'branch_admin').length;
  const memberCount = users.filter(u => (u.role || '').toLowerCase() === 'member').length;
  const activeCount = users.filter(u => (u.status || '').toLowerCase() === 'active').length;

  return (
    <PageTransition className="space-y-6 pb-20">

      {/* ── PAGE HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-violet-100 rounded-xl flex items-center justify-center">
            <Users2 className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{t('users.subtitle')}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {language === 'id' ? `${users.length} pengguna terdaftar` : `${users.length} users registered`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadData} className="h-11 px-4 rounded-xl border-gray-200 text-gray-500 hover:bg-gray-50 font-bold gap-2 text-xs">
            <RefreshCw className="w-4 h-4" /> {t('common.refresh')}
          </Button>
          <Button onClick={() => navigate('/users/create')} className="bg-indigo-600 hover:bg-indigo-700 h-11 px-6 rounded-xl shadow-lg shadow-indigo-600/20 font-black uppercase tracking-widest text-[11px] border-none transition-all hover:scale-[1.02]">
            <UserPlus className="w-4 h-4 mr-2" /> {t('users.addUser')}
          </Button>
        </div>
      </div>

      {/* ── STAT MINI CARDS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isSuperAdmin ? (
          [
            { label: t('users.superAdmin'), value: superAdminCount, icon: Shield, iconBg: 'bg-indigo-50 text-indigo-600' },
            { label: t('users.branchAdmin'), value: branchAdminCount, icon: ShieldAlert, iconBg: 'bg-amber-50 text-amber-600' },
            { label: t('users.member'), value: memberCount, icon: Users2, iconBg: 'bg-violet-50 text-violet-600' },
            { label: t('users.activeUsers'), value: activeCount, icon: CircleCheck, iconBg: 'bg-emerald-50 text-emerald-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
              <div className={cn('p-3 rounded-xl flex-shrink-0', s.iconBg)}><s.icon className="w-5 h-5" /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">{s.label}</p>
                <p className="text-2xl font-black text-gray-900 tracking-tight font-mono">{s.value.toString().padStart(2, '0')}</p>
              </div>
            </div>
          ))
        ) : (
          [
            { label: t('users.totalMember'), value: memberCount, icon: Users2, iconBg: 'bg-violet-50 text-violet-600' },
            { label: t('users.activeMember'), value: users.filter(u => (u.role || '').toLowerCase() === 'member' && (u.status || '').toLowerCase() === 'active').length, icon: CircleCheck, iconBg: 'bg-emerald-50 text-emerald-600' },
            { label: t('users.totalMemberPoints'), value: users.filter(u => (u.role || '').toLowerCase() === 'member').reduce((sum, u) => sum + (u.points || 0), 0), icon: Tag, iconBg: 'bg-amber-50 text-amber-600', isMono: true },
            { label: t('users.serverStatus'), value: 'ONLINE', icon: Shield, iconBg: 'bg-emerald-50 text-emerald-600', isText: true },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
              <div className={cn('p-3 rounded-xl flex-shrink-0', s.iconBg)}><s.icon className="w-5 h-5" /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">{s.label}</p>
                <p className={cn("text-2xl font-black tracking-tight", s.isMono ? "font-mono text-amber-600" : "text-gray-900", s.isText ? "text-sm text-emerald-600" : "")}>
                  {s.isText ? s.value : (s.isMono ? s.value.toLocaleString() : s.value.toString().padStart(2, '0'))}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── FILTER BAR ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <input
            type="text"
            placeholder={t('users.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 h-11 bg-white border border-gray-100 rounded-xl text-sm font-medium placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-200 transition-all outline-none shadow-sm"
          />
        </div>
        {isSuperAdmin && (
          <Select value={roleFilter} onValueChange={(v) => { if (v) setRoleFilter(v); }}>
            <SelectTrigger className="w-full sm:w-48 bg-white border border-gray-100 rounded-xl h-11 px-4 shadow-sm font-bold text-xs transition-all hover:bg-gray-50">
              <SelectValue placeholder={t('users.allRoles')} />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-100 rounded-2xl shadow-xl p-2 font-sans">
              <SelectItem value="ALL" className="rounded-xl p-3 focus:bg-indigo-50 cursor-pointer text-xs font-bold">{t('users.allRoles')}</SelectItem>
              <SelectItem value="Super Admin" className="rounded-xl p-3 focus:bg-indigo-50 cursor-pointer text-xs font-bold">{t('users.superAdmin')}</SelectItem>
              <SelectItem value="Branch Admin" className="rounded-xl p-3 focus:bg-indigo-50 cursor-pointer text-xs font-bold">{t('users.branchAdmin')}</SelectItem>
              <SelectItem value="Kasir" className="rounded-xl p-3 focus:bg-indigo-50 cursor-pointer text-xs font-bold">{t('users.cashier')}</SelectItem>
              <SelectItem value="Member" className="rounded-xl p-3 focus:bg-indigo-50 cursor-pointer text-xs font-bold">{t('users.member')}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ── TABLE CARD ── */}
      <Card className="rounded-3xl border border-gray-100 shadow-sm bg-white overflow-hidden w-full">
         <CardContent className="p-0">
            <div className="overflow-x-auto">
               <table className="w-full text-left font-sans">
                  <thead>
                     <tr className="bg-gray-50/60 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                        <th className="py-4 pl-6">{t('users.tableUser')}</th>
                        <th className="py-4">{t('users.tableRole')}</th>
                        <th className="py-4">{t('users.tableBranch')}</th>
                        <th className="py-4">{t('users.tableStatus')}</th>
                        <th className="py-4">{t('users.tablePoints')}</th>
                        <th className="py-4 text-right pr-6">{t('users.tableAction')}</th>
                     </tr>
                  </thead>
                  <StaggerList as={motion.tbody} className="divide-y divide-gray-50">
                     {filteredUsers.length > 0 ? filteredUsers.map((user) => (
                        <StaggerItem as={motion.tr} key={user.id} className="group hover:bg-indigo-50/20 transition-all duration-200">
                             <td className="py-4 pl-6">
                                <div className="flex items-center gap-3">
                                   <Avatar className="w-12 h-12 rounded-2xl border-2 border-white shadow-md ring-2 ring-gray-100 flex-shrink-0">
                                      <AvatarImage src={getAvatarUrl(user)} alt={user.name} />
                                      <AvatarFallback className="bg-indigo-600 text-white capitalize font-black text-sm">{user.name[0]}</AvatarFallback>
                                   </Avatar>
                                   <div className="flex flex-col space-y-0.5">
                                      <span className="font-black text-gray-900 text-sm">{user.name}</span>
                                      <span className="text-xs font-medium text-gray-400">{user.email}</span>
                                   </div>
                                </div>
                             </td>
                             <td className="py-8">
                                <div className="flex items-center gap-2.5">
                                   <div className={cn(
                                     "p-2 rounded-xl shadow-sm",
                                    (user.role || '').toLowerCase() === 'super admin' || (user.role || '').toLowerCase() === 'super_admin' ? "bg-indigo-50 text-indigo-600" :
                                    (user.role || '').toLowerCase() === 'branch admin' || (user.role || '').toLowerCase() === 'branch_admin' ? "bg-amber-50 text-amber-600" :
                                    user.role?.toLowerCase() === 'kasir' ? "bg-emerald-50 text-emerald-600" :
                                    "bg-gray-100 text-gray-500"
                                   )}>
                                      <Shield className="w-4 h-4" />
                                   </div>
                                   <span className="text-xs font-black uppercase text-gray-700 tracking-wide">
                                       {user.role?.toLowerCase() === 'kasir' ? t('users.roleCashier') : ((user.role || '').toLowerCase() === 'branch admin' || (user.role || '').toLowerCase() === 'branch_admin') ? t('users.roleBranchAdmin') : user.role}
                                   </span>
                                </div>
                             </td>
                             <td className="py-4">
                                <div className="flex items-center gap-2">
                                   <div className="bg-gray-50 text-gray-400 p-1.5 rounded-lg">
                                      <MapPin className="w-3.5 h-3.5" />
                                   </div>
                                   <span className="text-xs font-bold text-gray-700">
                                      {user.location || '-'}
                                   </span>
                                </div>
                             </td>
                             <td className="py-4">
                                <div className="flex items-center gap-2">
                                   <div className={cn(
                                      "w-2 h-2 rounded-full",
                                      (user.status || '').toLowerCase() === 'active' ? "bg-emerald-500 animate-pulse" : "bg-gray-300"
                                   )} />
                                   <span className="text-xs font-black text-gray-900 capitalize">
                                      {(user.status || '').toLowerCase() === 'active' ? t('users.statusActive') : t('users.statusInactive')}
                                   </span>
                                </div>
                             </td>
                             <td className="py-4">
                                {(user.role || '').toLowerCase() === 'member' ? (
                                  <div className="flex items-center gap-1.5">
                                   <div className="bg-amber-50 text-amber-600 p-1.5 rounded-lg shadow-sm">
                                     <Tag className="w-3.5 h-3.5" />
                                   </div>
                                   <span className="font-mono font-black text-amber-600 text-sm">
                                     {user.points || 0} Pts
                                   </span>
                                 </div>
                               ) : (
                                 <span className="text-gray-300 text-xs font-bold">-</span>
                               )}
                             </td>
                             <td className="py-4 text-right pr-6">
                                <div className="flex items-center justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition-all duration-200">
                                  {(user.role || '').toLowerCase() === 'member' && (
                                    <Button 
                                       onClick={() => {
                                         setSelectedMemberForVoucher(user);
                                         setIsVoucherModalOpen(true);
                                       }}
                                       variant="ghost" 
                                       size="icon" 
                                       className="bg-white hover:bg-emerald-50 shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-[18px] text-emerald-600 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(16,185,129,0.15)] transition-all duration-300 h-12 w-12 flex items-center justify-center animate-in zoom-in-50 duration-300"
                                     >
                                       <Gift className="w-5 h-5" strokeWidth={2.5} />
                                    </Button>
                                  )}
                                  {(user.role || '').toLowerCase() !== 'member' && (
                                    <Button 
                                      onClick={() => {
                                        setEditingUser({...user});
                                        setIsEditModalOpen(true);
                                      }}
                                      variant="ghost" 
                                      size="icon" 
                                      className="bg-white hover:bg-indigo-50 shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-[18px] text-indigo-600 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(79,70,229,0.15)] transition-all duration-300 h-12 w-12 flex items-center justify-center"
                                    >
                                      <Edit2 className="w-5 h-5" strokeWidth={2.5} />
                                    </Button>
                                  )}
                                  <button 
                                     onClick={() => {
                                       setUserToDelete(user);
                                       setIsDeleteModalOpen(true);
                                     }}
                                     className="bg-white hover:bg-rose-50 shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-[18px] text-rose-500 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(244,63,94,0.15)] transition-all duration-300 h-12 w-12 flex items-center justify-center"
                                   >
                                     <Trash2 className="w-5 h-5" strokeWidth={2.5} />
                                  </button>
                                </div>
                             </td>
                         </StaggerItem>
                      )) : (
                        <tr className="border-none">
                          <td colSpan={6} className="py-20 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                                <Search className="w-8 h-8 text-gray-300" />
                              </div>
                              <p className="text-gray-400 font-bold tracking-tight">{t('users.noMatch')}</p>
                              <Button variant="link" onClick={() => {setRoleFilter('ALL'); setSearchQuery('');}} className="text-indigo-600 font-black uppercase tracking-widest text-[10px]">
                                {t('users.clearAllFilters')}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                   </StaggerList>
                </table>
            </div>
         </CardContent>
      </Card>

      {/* Edit Identity Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="rounded-[32px] sm:max-w-[480px] p-8 border-none shadow-2xl bg-white font-sans">
          <DialogHeader className="space-y-2">
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-2">
              <Edit2 className="w-6 h-6 text-indigo-600" />
            </div>
            <DialogTitle className="text-2xl font-black text-gray-900 tracking-tight">{t('users.editIdentity')}</DialogTitle>
            <DialogDescription className="text-sm text-gray-500 font-medium">{t('users.editDesc')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-6 font-sans">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('users.fullName')}</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input 
                  placeholder={t('users.enterFullName')} 
                  value={editingUser?.name || ''}
                  onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                  className="bg-gray-50 border-gray-100 rounded-2xl h-14 pl-12 focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all font-medium" 
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('users.emailAddress')}</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input 
                  type="email"
                  placeholder="name@company.com" 
                  value={editingUser?.email || ''}
                  onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                  className="bg-gray-50 border-gray-100 rounded-2xl h-14 pl-12 focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all font-medium" 
                />
              </div>
            </div>

            {editingUser?.role === 'Branch Admin' && (
              <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('users.locationAssignment')}</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
                  <Select 
                    value={editingUser?.branchId} 
                    onValueChange={(val) => setEditingUser({...editingUser, branchId: val})}
                  >
                    <SelectTrigger className="bg-gray-50 border-gray-100 rounded-2xl h-14 pl-12 pr-4 font-medium transition-all focus:ring-4 focus:ring-indigo-100 ring-offset-0">
                      <SelectValue placeholder={t('users.selectLocation')} />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-100 rounded-2xl shadow-xl p-2 font-sans">
                      {branches.map(loc => (
                        <SelectItem key={loc.id} value={loc.id} className="rounded-xl p-3 focus:bg-indigo-50 cursor-pointer">
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('users.userRole')}</label>
              <div className="px-5 py-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">{editingUser?.role}</span>
                <ShieldAlert className="w-4 h-4 text-gray-400" />
              </div>
              <p className="text-[10px] text-gray-400 italic ml-1">{t('users.roleImmutable')}</p>
            </div>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-3 pt-4 font-sans">
            <Button 
              variant="ghost" 
              onClick={() => setIsEditModalOpen(false)}
              className="h-14 rounded-2xl font-bold flex-1 text-gray-500 hover:bg-gray-50"
            >
              {t('users.discardChanges')}
            </Button>
            <Button 
              onClick={handleEditUser}
              className="bg-indigo-600 hover:bg-indigo-700 h-14 rounded-2xl font-black uppercase tracking-widest text-[11px] flex-1 text-white shadow-lg shadow-indigo-100 transition-all hover:scale-[1.02]"
            >
              {t('users.updateIdentity')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="rounded-[32px] sm:max-w-[420px] p-8 border-none shadow-2xl bg-white font-sans">
          <DialogHeader className="space-y-2">
            <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-2">
              <Trash2 className="w-6 h-6 text-rose-600" />
            </div>
            <DialogTitle className="text-2xl font-black text-gray-900 tracking-tight">{t('users.revokeAccess')}</DialogTitle>
            <DialogDescription className="text-sm text-gray-500 font-medium leading-relaxed">
              {language === 'id' ? (
                <>Apakah Anda yakin ingin mencabut akses untuk <span className="text-gray-900 font-black">{userToDelete?.name}</span>? Ini akan menghapus akun dan akses terminal mereka secara permanen.</>
              ) : (
                <>Are you sure you want to revoke access for <span className="text-gray-900 font-black">{userToDelete?.name}</span>? This will permanently delete their account and terminal access.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-3 pt-6 font-sans">
            <Button 
              variant="ghost" 
              onClick={() => setIsDeleteModalOpen(false)}
              className="h-14 rounded-2xl font-bold flex-1 text-gray-500 hover:bg-gray-50"
            >
              {t('users.keepUser')}
            </Button>
            <Button 
              onClick={handleDeleteUser}
              className="bg-rose-600 hover:bg-rose-700 h-14 rounded-2xl font-black uppercase tracking-widest text-[11px] flex-1 text-white shadow-lg shadow-rose-100 transition-all hover:scale-[1.02]"
            >
              {t('users.revokeNow')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Give Voucher Modal */}
      <Dialog open={isVoucherModalOpen} onOpenChange={setIsVoucherModalOpen}>
        <DialogContent className="rounded-[32px] sm:max-w-[480px] p-8 border-none shadow-2xl bg-white font-sans">
          <DialogHeader className="space-y-2">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-2">
              <Gift className="w-6 h-6 text-emerald-600" />
            </div>
            <DialogTitle className="text-2xl font-black text-gray-900 tracking-tight">{t('users.sendVoucher')}</DialogTitle>
            <DialogDescription className="text-sm text-gray-500 font-medium">
              {language === 'id' ? (
                <>Berikan kode promo khusus langsung ke <span className="text-gray-900 font-bold">{selectedMemberForVoucher?.name}</span>.</>
              ) : (
                <>Gift a special promo code directly to <span className="text-gray-900 font-bold">{selectedMemberForVoucher?.name}</span>.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-6 font-sans">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('users.voucherCode')}</label>
              <div className="relative">
                <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input 
                  placeholder="e.g. VIP50" 
                  value={voucherForm.code}
                  onChange={(e) => setVoucherForm({...voucherForm, code: e.target.value.toUpperCase()})}
                  className="bg-gray-50 border-gray-100 rounded-2xl h-14 pl-12 focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all font-mono font-bold uppercase" 
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('users.discountType')}</label>
                <div className="flex bg-gray-50 p-1 border border-gray-100 rounded-2xl h-14">
                  <button 
                    onClick={() => setVoucherForm({...voucherForm, discount_type: 'percent'})}
                    className={cn("flex-1 flex items-center justify-center gap-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all", voucherForm.discount_type === 'percent' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-400")}
                  >
                    <Percent className="w-3 h-3" /> %
                  </button>
                  <button 
                    onClick={() => setVoucherForm({...voucherForm, discount_type: 'fixed'})}
                    className={cn("flex-1 flex items-center justify-center gap-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all", voucherForm.discount_type === 'fixed' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-400")}
                  >
                    <Banknote className="w-3 h-3" /> Rp
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('users.discountValue')}</label>
                <Input 
                  type="number"
                  placeholder={voucherForm.discount_type === 'percent' ? "10" : "15000"} 
                  value={voucherForm.discount_value}
                  onChange={(e) => setVoucherForm({...voucherForm, discount_value: e.target.value})}
                  className="bg-gray-50 border-gray-100 rounded-2xl h-14 px-4 focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all font-bold" 
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{t('users.minPurchase')}</label>
              <Input 
                type="number"
                placeholder="0" 
                value={voucherForm.min_purchase}
                onChange={(e) => setVoucherForm({...voucherForm, min_purchase: e.target.value})}
                className="bg-gray-50 border-gray-100 rounded-2xl h-14 px-4 focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all font-bold" 
              />
            </div>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-3 pt-4 font-sans">
            <Button 
              variant="ghost" 
              onClick={() => setIsVoucherModalOpen(false)}
              className="h-14 rounded-2xl font-bold flex-1 text-gray-500 hover:bg-gray-50"
            >
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleAssignVoucher}
              className="bg-emerald-600 hover:bg-emerald-700 h-14 rounded-2xl font-black uppercase tracking-widest text-[11px] flex-1 text-white shadow-lg shadow-emerald-100 transition-all hover:scale-[1.02]"
            >
              {t('users.sendVoucher')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
