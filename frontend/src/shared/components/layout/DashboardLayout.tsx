import {useState, ReactNode, useEffect, useRef} from 'react';
import foto2 from '../../../../assets/2.png';
import {motion, AnimatePresence} from 'motion/react';
import {NavLink, useLocation as useRouteLocation, useNavigate} from 'react-router-dom';
import {
  LayoutDashboard, 
  Package, 
  Archive, 
  Tag, 
  Users, 
  LogOut, 
  Menu, 
  X,
  User,
  Bell,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  MapPin,
  Globe,
  Check,
  Megaphone,
  BrainCircuit,
  MonitorCheck,
  Settings,
  Moon,
  Sun,
  AlertTriangle,
  ShoppingCart,
  Languages,
} from 'lucide-react';
import {useAuth} from '@/shared/context/AuthContext';
import {useLanguage} from '@/shared/context/LanguageContext';
import {useLocation} from '@/shared/context/LocationContext';
import {cn} from '@/shared/lib/utils';
import {Button, buttonVariants} from '@/shared/components/ui/button';
import {Avatar, AvatarFallback, AvatarImage} from '@/shared/components/ui/avatar';
import {Switch} from '@/shared/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/shared/components/ui/dialog';
import {ScrollArea} from '@/shared/components/ui/scroll-area';
import {Separator} from '@/shared/components/ui/separator';
import {MOCK_LOCATIONS, LocationID, BACKEND_URL, fetchBackend} from '@/shared/lib/api';

const SUPER_ADMIN_NAV = [
  {path: '/overview', labelKey: 'nav.overview', icon: LayoutDashboard},
  {path: '/catalog', labelKey: 'nav.masterProducts', icon: Package},
  {path: '/promo', labelKey: 'nav.promo', icon: Tag},
  {path: '/transactions', labelKey: 'nav.transactions', icon: ShoppingCart},
  {path: '/monitor', labelKey: 'nav.branchInventory', icon: MonitorCheck},
  {path: '/users', labelKey: 'nav.userManagement', icon: Users},
  {path: '/broadcast', labelKey: 'nav.broadcast', icon: Megaphone},
  {path: '/insights', labelKey: 'nav.aiInsights', icon: BrainCircuit},
];

const BRANCH_ADMIN_NAV = [
  {path: '/overview', labelKey: 'nav.overview', icon: LayoutDashboard},
  {path: '/inventory', labelKey: 'nav.inventory', icon: Archive},
  {path: '/promo', labelKey: 'nav.promo', icon: Tag},
  {path: '/transactions', labelKey: 'nav.transactions', icon: ShoppingCart},
  {path: '/users', labelKey: 'nav.users', icon: Users},
  {path: '/analysis', labelKey: 'nav.aiAnalysis', icon: BrainCircuit},
];

export default function DashboardLayout({children}: {children: ReactNode}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);
  const {user, logout} = useAuth();
  const {currentLocation, setCurrentLocation, locationName} = useLocation();
  const {language, setLanguage, t} = useLanguage();
  const routeLocation = useRouteLocation();
  const navigate = useNavigate();

  // Close language dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setIsLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<any>(null);
  const [readNotifIds, setReadNotifIds] = useState<Set<string>>(new Set());

  // Load user-specific read notification IDs when user changes
  useEffect(() => {
    if (user?.username) {
      try {
        const saved = localStorage.getItem(`readNotifIds_${user.username}`);
        setReadNotifIds(saved ? new Set(JSON.parse(saved)) : new Set());
      } catch {
        setReadNotifIds(new Set());
      }
    } else {
      setReadNotifIds(new Set());
    }
  }, [user?.username]);

  // Save read notification IDs to user-specific key in localStorage
  useEffect(() => {
    if (user?.username && readNotifIds.size >= 0) {
      localStorage.setItem(`readNotifIds_${user.username}`, JSON.stringify(Array.from(readNotifIds)));
    }
  }, [readNotifIds, user?.username]);

  const unreadNotifications = notifications.filter(n => !readNotifIds.has(n.id.toString()));
  const unreadCount = unreadNotifications.length;

  const loadNotifications = async () => {
    try {
      const list: any[] = [];

      // 1. Fetch Broadcasts from Super Admin
      const bRes = await fetchBackend('getBroadcasts');
      if (bRes.status === 'success' && Array.isArray(bRes.data)) {
        bRes.data.forEach((b: any) => {
          // If super admin, do not load broadcasts in the notifications list
          if (user?.role === 'super_admin') return;

          // If branch admin, only show if target matches ALL_BRANCHES or user.location_id
          if (user?.role === 'branch_admin') {
            const matchesAudience = b.audience === 'ALL_BRANCHES' || 
              (b.audience === 'SPECIFIC_BRANCH' && String(b.target_id) === String(user.location_id || ''));
            if (!matchesAudience) return;
          }
          list.push({
            id: b.id,
            type: 'broadcast',
            title: b.subject,
            preview: b.body,
            time: new Date(b.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            icon: 'megaphone',
            isRead: false,
          });
        });
      }

      // 2. Fetch Low Stock Warnings (for branch admin)
      if (user?.role === 'branch_admin' && currentLocation) {
        const invRes = await fetchBackend('getInventory', { location_id: currentLocation });
        if (invRes.status === 'success' && Array.isArray(invRes.data)) {
          invRes.data.forEach((item: any) => {
            const stock = Number(item.stock ?? 0);
            if (stock < 10) {
              list.push({
                id: `lowstock-${item.id}`,
                type: 'lowstock',
                title: t('notif.lowStock'),
                preview: language === 'id'
                  ? `Stok "${item.products?.name || 'Produk'}" sisa ${stock} pcs. Segera reorder!`
                  : `Stock for "${item.products?.name || 'Product'}" is only ${stock} pcs left. Please reorder immediately!`,
                time: 'Live',
                icon: 'alert',
                isRead: false,
              });
            }
          });
        }

        // 3. Fetch rejected product requests for branch admin
        const reqRes = await fetchBackend('getProductRequests', { status: 'rejected' });
        if (reqRes.status === 'success' && Array.isArray(reqRes.data)) {
          reqRes.data.forEach((r: any) => {
            list.push({
              id: `rejected-${r.id}`,
              type: 'rejected',
              title: t('notif.rejected'),
              preview: language === 'id'
                ? `Produk "${r.name}" ditolak. Alasan: ${r.rejection_reason || 'Tidak ada alasan'}`
                : `Product "${r.name}" rejected. Reason: ${r.rejection_reason || 'No reason'}`,
              time: r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US', { day: '2-digit', month: 'short' }) : '-',
              icon: 'alert',
              isRead: false,
            });
          });
        }
      }

      setNotifications(list);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  };

  useEffect(() => {
    if (user) {
      loadNotifications();
      const interval = setInterval(loadNotifications, 10000);
      return () => clearInterval(interval);
    }
  }, [user, currentLocation]);

  const markAllAsRead = () => {
    setReadNotifIds(prev => {
      const next = new Set(prev);
      notifications.forEach(n => next.add(n.id.toString()));
      return next;
    });
  };

  const markAsRead = (id: string) => {
    setReadNotifIds(prev => {
      const next = new Set(prev);
      next.add(id.toString());
      return next;
    });
  };

  const isSuperAdmin = user?.role === 'super_admin';
  const navItems = isSuperAdmin ? SUPER_ADMIN_NAV : BRANCH_ADMIN_NAV;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const activePageLabel = (() => {
    const path = routeLocation.pathname;
    if (path === '/inventory/add' || path === '/inventory/request') return t('page.inventory');
    if (path === '/promo/create') return t('page.promo');
    if (path === '/users/create') return t('page.users');
    if (path === '/add-product' || path === '/master-products') return t('page.masterProducts');
    const found = [...SUPER_ADMIN_NAV, ...BRANCH_ADMIN_NAV].find(n => n.path === path);
    return found ? t(found.labelKey) : t('page.dashboard');
  })();

  const getAvatarUrl = () => {
    const avatarStr = user?.avatar_url;
    if (!avatarStr || avatarStr === 'null' || avatarStr === '') {
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.username || 'User')}&background=4f46e5&color=fff&bold=true`;
    }
    if (avatarStr.startsWith('http')) return avatarStr;
    return `${BACKEND_URL}${avatarStr}`;
  };

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex font-sans selection:bg-indigo-100 relative">
      
      {/* Floating Sidebar Toggle Button (Desktop) */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className={cn(
          "hidden lg:flex absolute top-24 z-[60] items-center justify-center w-8 h-8 rounded-full bg-indigo-600 text-white shadow-[0_4px_12px_rgba(79,70,229,0.4)] hover:bg-indigo-700 transition-all duration-500 ease-in-out hover:scale-110",
          isSidebarOpen ? "left-[244px]" : "left-[56px]"
        )}
      >
        {isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {/* Sidebar... */}
      <aside 
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 bg-[#0F172A] text-white transition-all duration-500 ease-in-out shadow-[10px_0_40px_rgba(0,0,0,0.1)] overflow-hidden",
          isSidebarOpen ? "w-[260px]" : "w-0 lg:w-[72px]"
        )}
      >
        <div className="h-full flex flex-col py-6 px-3">
          {/* Logo Header */}
          <div className="flex items-center justify-between mb-10 sticky top-0 bg-transparent z-10 py-2">
            {isSidebarOpen ? (
              <div className="flex items-center gap-3 pl-1 min-w-0">
                <div className="w-12 h-12 shadow-lg shadow-indigo-500/20 flex-shrink-0 hover:scale-105 transition-transform cursor-pointer rounded-xl">
                  <img src={foto2} alt="AutoCashier Logo" className="w-full h-full object-contain rounded-xl" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[17px] font-black tracking-tighter uppercase italic leading-none truncate">AutoCashier</span>
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em] mt-0.5">Scan & Pay</span>
                </div>
              </div>
            ) : (
              <div className="w-full flex justify-center">
                <div className="w-10 h-10 shadow-lg shadow-indigo-500/20 hover:scale-110 transition-transform cursor-pointer rounded-xl">
                  <img src={foto2} alt="AutoCashier Logo" className="w-full h-full object-contain rounded-xl" />
                </div>
              </div>
            )}
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hover:bg-white/10 text-white/40 lg:hidden flex-shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-1.5">
              {isSidebarOpen && (
                <p className="text-[9px] font-black text-white/25 uppercase tracking-[0.35em] px-4 mb-4">
                  {t('nav.mainMenu')}
                </p>
              )}
              {navItems.map((item) => {
                const isActive = routeLocation.pathname === item.path || 
                  (item.path === '/catalog' && (routeLocation.pathname === '/master-products' || routeLocation.pathname === '/add-product')) ||
                  (item.path === '/promo' && routeLocation.pathname === '/promo/create') ||
                  (item.path === '/users' && routeLocation.pathname === '/users/create') ||
                  (item.path === '/inventory' && (routeLocation.pathname === '/inventory/add' || routeLocation.pathname === '/inventory/request'));
                const label = t(item.labelKey);
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    title={!isSidebarOpen ? label : undefined}
                    className={cn(
                      "flex items-center transition-all duration-200 group relative rounded-xl overflow-hidden",
                      isSidebarOpen
                        ? "gap-3 px-4 py-3 w-full"
                        : "justify-center p-0 mx-auto w-11 h-11",
                      isActive
                        ? "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/40"
                        : "text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10"
                    )}
                  >
                    {/* Active glow bar */}
                    {isActive && isSidebarOpen && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white/50 rounded-r-full" />
                    )}
                    <item.icon className={cn(
                      "flex-shrink-0 transition-all duration-200 w-[18px] h-[18px]",
                      isActive ? "text-white" : "text-white/60 group-hover:text-white group-hover:scale-110"
                    )} />
                    {isSidebarOpen && (
                      <span className={cn(
                        "text-[13px] tracking-tight whitespace-nowrap transition-all",
                        isActive ? "font-bold" : "font-medium"
                      )}>
                        {label}
                      </span>
                    )}
                    {isActive && isSidebarOpen && (
                      <div className="ml-auto flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse" />
                      </div>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </ScrollArea>

          <div className="mt-4 pt-4 border-t border-white/5">
            <button
              onClick={handleLogout}
              title={!isSidebarOpen ? t('nav.signOut') : undefined}
              className={cn(
                "flex items-center transition-all duration-300 rounded-2xl text-rose-400 hover:text-white hover:bg-rose-500/20 font-semibold",
                isSidebarOpen
                  ? "w-full gap-3 px-3 py-3"
                  : "justify-center p-3 mx-auto w-12 h-12"
              )}
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              {isSidebarOpen && <span className="text-[14px]">{t('nav.signOut')}</span>}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-x-hidden relative">
        <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-indigo-50/50 blur-[120px] rounded-full pointer-events-none -z-10" />

        <header className="h-24 bg-white/70 backdrop-blur-xl border-b border-gray-100 flex items-center justify-between px-8 sticky top-0 z-40 shrink-0">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="w-10 h-10 lg:hidden flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/30 transition-all active:scale-90 hover:scale-105 flex-shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex flex-col">
              <h1 className="text-2xl font-black text-gray-900 tracking-tighter leading-none">
                {activePageLabel}
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest leading-none">
                  {user?.role === 'branch_admin' ? locationName : t('header.enterprise')}
                </span>
                <span className="text-[10px] text-gray-300">•</span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
                  {user?.role === 'super_admin' ? t('header.superAdmin') : user?.role === 'branch_admin' ? t('header.branchAdmin') : user?.roleName || 'Admin'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-right">

            {/* Premium Segmented Language Switcher */}
            <div className="flex items-center bg-gray-50 border border-gray-200/80 p-1.5 rounded-2xl relative shadow-inner">
              <button
                onClick={() => setLanguage('id')}
                className={cn(
                  "flex items-center justify-center px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 select-none cursor-pointer",
                  language === 'id'
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                    : "text-gray-400 hover:text-gray-600"
                )}
                title="Bahasa Indonesia"
              >
                ID
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={cn(
                  "flex items-center justify-center px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 select-none cursor-pointer",
                  language === 'en'
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                    : "text-gray-400 hover:text-gray-600"
                )}
                title="English"
              >
                EN
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsNotifOpen(!isNotifOpen)}
                  className={cn(
                    "w-11 h-11 rounded-2xl relative hover:bg-indigo-50 transition-all outline-none",
                    isNotifOpen ? "text-indigo-600 bg-indigo-50" : "text-gray-400 hover:text-indigo-600"
                  )}
                >
                  <Bell className="w-6 h-6" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-rose-600 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </Button>

                {isNotifOpen && (
                  <>
                    {/* Backdrop overlay to close when clicking outside */}
                    <div className="fixed inset-0 z-45" onClick={() => setIsNotifOpen(false)} />
                    
                    {/* Floating Custom Notification Card */}
                    <div className="absolute right-0 mt-2 w-80 rounded-3xl p-4 bg-white border border-gray-100 shadow-2xl space-y-4 z-50 text-left font-sans animate-in fade-in slide-in-from-top-2 duration-200">
                       <div className="flex justify-between items-center">
                          <span className="font-black text-gray-900 uppercase text-[10px] tracking-widest text-indigo-600">
                            {t('notif.communicationCenter')} ({notifications.length})
                          </span>
                          {unreadCount > 0 && (
                            <button onClick={markAllAsRead} className="text-[10px] font-black uppercase text-indigo-500 hover:text-indigo-700 transition border-none bg-transparent">
                              {t('notif.markAllRead')}
                            </button>
                          )}
                       </div>
                       <div className="border-t border-gray-100 my-2" />
                       <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                          {unreadNotifications.length > 0 ? (
                            unreadNotifications.map((notif) => {
                              const isLowStock = notif.type === 'lowstock';
                              const isRejected = notif.type === 'rejected';
                              return (
                                <div 
                                  key={notif.id} 
                                  onClick={() => {
                                    setSelectedNotif(notif);
                                    setIsNotifOpen(false);
                                  }}
                                  className={cn(
                                    "p-3 rounded-2xl border transition-colors cursor-pointer group flex gap-3",
                                    isLowStock 
                                      ? "bg-rose-50/50 hover:bg-rose-50 border-rose-100/50" 
                                      : "bg-indigo-50/50 hover:bg-indigo-50 border-indigo-100/50"
                                  )}
                                >
                                  <div className={cn(
                                    "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                                    isLowStock ? "bg-rose-500 text-white" : "bg-indigo-600 text-white"
                                  )}>
                                    {isLowStock ? <AlertTriangle className="w-4 h-4" /> : <Megaphone className="w-4 h-4" />}
                                  </div>
                                  <div className="space-y-1 min-w-0 flex-1">
                                    <div className="flex justify-between items-start mb-0.5">
                                       <span className={cn(
                                         "text-xs font-black truncate leading-tight uppercase tracking-tight",
                                         isLowStock ? "text-rose-700" : "text-indigo-900"
                                       )}>
                                         {notif.title}
                                       </span>
                                       <span className="text-[8px] font-bold text-gray-400 shrink-0 font-mono pl-1">{notif.time}</span>
                                    </div>
                                    <p className="text-[11px] text-gray-600 font-semibold leading-relaxed break-words">{notif.preview}</p>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-center py-8">
                              <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                              <p className="text-xs font-black uppercase tracking-widest text-gray-400">{t('notif.noNew')}</p>
                            </div>
                          )}
                       </div>
                    </div>
                  </>
                )}
              </div>

                <Button 
                  variant="ghost" 
                  onClick={() => navigate('/profile')}
                  className="rounded-2xl gap-3 pl-2 pr-4 hover:bg-gray-50 border border-transparent hover:border-gray-100 h-14"
                >
                   <Avatar className="w-10 h-10 rounded-xl relative">
                      <AvatarImage src={getAvatarUrl()} alt={user?.username || 'User Avatar'} />
                      <AvatarFallback className="bg-indigo-600 text-white rounded-xl text-xs">{user?.username?.[0]}</AvatarFallback>
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white" />
                   </Avatar>
                   <div className="hidden lg:flex flex-col items-start">
                       <span className="text-xs font-bold text-gray-900 leading-none">{user?.username}</span>
                       <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{t('header.statusOnline')}</span>
                    </div>
                </Button>
            </div>
          </div>
        </header>

        <ScrollArea className="flex-1 bg-transparent w-full">
          <div className="p-6 lg:p-10 max-w-[1600px] mx-auto w-full">
             <motion.div
               key={routeLocation.pathname}
               initial={{opacity: 0, y: 20}}
               animate={{opacity: 1, y: 0}}
               transition={{duration: 0.5, ease: "easeOut"}}
             >
               {children}
             </motion.div>
          </div>
        </ScrollArea>
      </main>

      <Dialog open={!!selectedNotif} onOpenChange={(open) => {
        if (!open) {
          if (selectedNotif) {
             markAsRead(selectedNotif.id.toString());
          }
          setSelectedNotif(null);
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedNotif?.type === 'lowstock' ? (
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              ) : (
                <Megaphone className="w-5 h-5 text-indigo-500" />
              )}
              {selectedNotif?.title}
            </DialogTitle>
            <DialogDescription>
              {selectedNotif?.time}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedNotif?.preview}</p>
          </div>
          <DialogFooter>
            <Button onClick={() => {
               if (selectedNotif) markAsRead(selectedNotif.id.toString());
               setSelectedNotif(null);
            }}>
              {t('notif.markRead')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
