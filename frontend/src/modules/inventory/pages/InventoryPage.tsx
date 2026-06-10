import {useState, useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import {Card, CardContent, CardHeader} from '@/shared/components/ui/card';
import {Button} from '@/shared/components/ui/button';
import {Input} from '@/shared/components/ui/input';
import {Label} from '@/shared/components/ui/label';
import {
  Search, 
  Filter, 
  Plus, 
  Package, 
  MoreVertical, 
  ArrowUpDown, 
  AlertCircle, 
  AlertTriangle,
  DollarSign, 
  Trash2, 
  Edit2, 
  Loader2, 
  MapPin,
  Camera,
  Upload,
  Image as ImageIcon,
  FileDown,
  Check,
  ChevronsUpDown,
  Sparkles,
  Send
} from 'lucide-react';
import {useLocation} from '@/shared/context/LocationContext';
import {useAuth} from '@/shared/context/AuthContext';
import {fetchBackend, MOCK_LOCATIONS, BACKEND_URL} from '@/shared/lib/api';
import {cn} from '@/shared/lib/utils';
import {useLanguage} from '@/shared/context/LanguageContext';

import {Badge} from '@/shared/components/ui/badge';
import {motion} from 'motion/react';
import PageTransition from '@/shared/components/ui/PageTransition';
import { StaggerList, StaggerItem } from '@/shared/components/ui/StaggerList';
import {Tabs, TabsList, TabsTrigger} from '@/shared/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { toast } from "sonner";

export default function InventoryPage() {
  const navigate = useNavigate();
  const {currentLocation, allBranches, locationName} = useLocation();
  const {user} = useAuth();
  const {t, language} = useLanguage();
  const [inventory, setInventory] = useState<any[]>([]);
  const [masterCatalog, setMasterCatalog] = useState<any[]>([]);
  const [entryType, setEntryType] = useState<'master' | 'local'>('master');
  const [loading, setLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [comboboxSearch, setComboboxSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentItem, setCurrentItem] = useState<any>(null);
  const [uploadMode, setUploadMode] = useState<'file' | 'camera'>('file');
  const [form, setForm] = useState({ 
    catalogId: '',
    name: '', 
    category: '', 
    stock: '' as any, 
    price: '' as any, 
    location_id: '',
    photos: { front: '', back: '', right: '', left: '' }
  });

  const isSuperAdmin = user?.role === 'super_admin';

  const loadData = async () => {
    setLoading(true);
    const [invRes, catRes] = await Promise.all([
      fetchBackend('getInventory', { location_id: currentLocation }),
      fetchBackend('getMasterCatalog')
    ]);
    
    if (invRes.status === 'success') setInventory(invRes.data || []);
    if (catRes.status === 'success') setMasterCatalog(catRes.data || []);
    
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [currentLocation]);

  const handleCatalogSelect = (id: string, name?: string) => {
    if (id === 'custom') {
      setForm({
        ...form,
        catalogId: 'local-custom',
        name: name || comboboxSearch,
        category: 'Local Product',
        price: '' as any,
        stock: '' as any
      });
      setComboboxOpen(false);
      return;
    }

    const item = masterCatalog.find(c => c.id === id);
    if (item) {
      setForm({
        ...form,
        catalogId: id,
        name: item.name,
        category: item.category,
        price: item.basePrice,
        stock: '' as any
      });
      setComboboxOpen(false);
    }
  };

  const handleExportPDF = () => {
    const snapshot = {
      inventory: filteredInventory,
      branchName: currentLocation === 'ALL' ? (language === 'id' ? 'Semua Cabang (Konsolidasi)' : 'All Branches (Consolidated)') : locationName,
      generatedAt: new Date().toLocaleString(language === 'id' ? 'id-ID' : 'en-US', {
        day:    '2-digit',
        month:  'long',
        year:   'numeric',
        hour:   '2-digit',
        minute: '2-digit',
      }),
    };
    sessionStorage.setItem('inventory_report_snapshot', JSON.stringify(snapshot));
    navigate('/inventory/report');
  };

  const handleAdd = async () => {
    const loc = isSuperAdmin ? form.location_id : (currentLocation === 'ALL' ? 'BR-001' : currentLocation);
    if (!loc || !form.catalogId) {
       toast.error("Please select a product and branch");
       return;
    }
    
    if (form.stock === '' || form.price === '') {
       toast.error("Stock level and unit selling price are mandatory");
       return;
    }

    if (entryType === 'local' && !form.category) {
       toast.error("Product category is required for local registry");
       return;
    }

    // Check photos
    const hasAllPhotos = Object.values(form.photos).every(p => p !== '');
    if (!hasAllPhotos) {
       toast.error("Mandatory 4-sided photos required for physical validation");
       return;
    }

    const res = await fetchBackend('addInventory', { ...form, location_id: loc });
    if (res.status === 'success') {
      toast.success("Stock recorded successfully");
      loadData();
      setForm({ 
        catalogId: '', 
        name: '', 
        category: '', 
        stock: '' as any, 
        price: '' as any, 
        location_id: '', 
        photos: { front: '', back: '', right: '', left: '' } 
      });
    }
  };

  const handleEdit = async () => {
    const isAllView = currentLocation === 'ALL';
    try {
      let res;
      if (isAllView) {
        const fetchRes = await fetch(`${BACKEND_URL}/api/shared/products/${currentItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            price: Number(form.price),
            stock: Number(form.stock),
          }),
        });
        const data = await fetchRes.json();
        res = { status: fetchRes.ok && data.status === 'success' ? 'success' : 'error', message: data.error };
      } else {
        res = await fetchBackend('updateInventory', { ...currentItem, ...form });
      }

      if (res.status === 'success') {
        toast.success("Catalog updated successfully");
        setIsEditOpen(false);
        loadData();
      } else {
        toast.error(res.message || res.error || "Failed to update catalog");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error");
    }
  };

  const confirmDelete = (item: any) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    
    setIsDeleting(true);
    const isAllView = currentLocation === 'ALL';

    try {
      let res;
      if (isAllView) {
        // Delete from master catalog (+ Supabase Storage)
        res = await fetchBackend('deleteProduct', { id: itemToDelete.id });
      } else {
        // Delete from branch inventory only
        res = await fetchBackend('deleteInventory', { id: itemToDelete.id, location_id: currentLocation });
      }

      if (res.status === 'success') {
        toast.success(`✅ "${itemToDelete.name}" berhasil dihapus`);
        loadData();
      } else {
        toast.error(`❌ Gagal menghapus: ${res.error || res.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      toast.error(`❌ Error: ${err.message}`);
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const openEdit = (item: any) => {
    setCurrentItem(item);
    setForm({ 
      catalogId: item.catalogId || item.id || '',
      name: item.name, 
      category: item.category, 
      stock: item.stock, 
      price: item.price, 
      location_id: item.location_id || item.branch_id || '',
      photos: item.photos || { front: '', back: '', right: '', left: '' }
    });
    setIsEditOpen(true);
  };

  const filteredCatalog = masterCatalog.filter(item => 
    item.name.toLowerCase().includes(comboboxSearch.toLowerCase())
  );

  const filteredInventory = (inventory || []).filter(item => 
    (item.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.sku || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <PageTransition className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Package className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{t('inventory.subtitle')}</p>
            <p className="text-xs text-gray-400 mt-0.5">{inventory.length} {t('inventory.registered')} • {t('inventory.lastUpdated')}</p>
          </div>
        </div>
        <div className="flex gap-3">
           <Button 
            variant="outline"
            className="h-12 px-6 rounded-2xl font-bold border-gray-200"
            onClick={handleExportPDF}
           >
             <FileDown className="w-4 h-4 mr-2" /> PDF Export
           </Button>
           <Button 
            className="bg-indigo-600 hover:bg-indigo-700 h-12 px-6 rounded-2xl shadow-xl shadow-indigo-600/20 font-bold border-none"
            onClick={() => navigate('/inventory/add')}
           >
             <Plus className="w-4 h-4 mr-2" /> {t('inventory.addStock')}
           </Button>
           <Button 
            className="bg-amber-600 hover:bg-amber-700 h-12 px-6 rounded-2xl shadow-xl shadow-amber-600/20 font-bold border-none"
            onClick={() => navigate('/inventory/request')}
           >
             <Send className="w-4 h-4 mr-2" /> {t('inventory.requestNewProduct')}
           </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-24">
           <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
        </div>
      ) : (
        <>
          <div className={`grid grid-cols-1 md:grid-cols-${currentLocation === 'ALL' ? '1' : '3'} gap-6`}>
            {currentLocation !== 'ALL' && (
              <>
                <Card className="rounded-[32px] border-none shadow-sm bg-indigo-600 text-white overflow-hidden relative">
                  <CardContent className="p-8">
                    <h4 className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mb-1">{t('inventory.totalAssets')}</h4>
                    <div className="text-4xl font-black tracking-tighter font-mono">
                      Rp {(inventory || []).reduce((acc, curr) => acc + ((curr.price || 0) * (curr.stock || 0)), 0).toLocaleString()}
                    </div>
                    <p className="text-white/40 text-[10px] font-bold mt-2 uppercase tracking-widest">{t('inventory.calculatedValue')}</p>
                  </CardContent>
                </Card>
                <Card className="rounded-[32px] border-none shadow-sm bg-white overflow-hidden">
                  <CardContent className="p-8">
                    <h4 className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">{t('inventory.lowStockAlerts')}</h4>
                    <div className="text-4xl font-black tracking-tighter font-mono text-rose-500">
                      {(inventory || []).filter(i => (i.stock || 0) < 20).length} {t('inventory.items')}
                    </div>
                    <p className="text-gray-400 text-[10px] font-bold mt-2 uppercase tracking-widest">{t('inventory.requiresAttention')}</p>
                  </CardContent>
                </Card>
              </>
            )}
            <Card className="rounded-[32px] border-none shadow-sm bg-white overflow-hidden">
              <CardContent className="p-8">
                <h4 className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">{t('inventory.skuCount')}</h4>
                <div className="text-4xl font-black tracking-tighter font-mono text-gray-900">{(inventory || []).length}</div>
                <p className="text-gray-400 text-[10px] font-bold mt-2 uppercase tracking-widest">{t('inventory.totalUniqueProducts')}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-[40px] border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="p-8 pb-0">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                 <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input 
                      placeholder={t('inventory.searchCatalog')} 
                      className="pl-12 h-12 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500/20"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                 </div>
                 <Button variant="ghost" size="icon" className="rounded-xl hover:bg-gray-50"><Filter className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="p-8">
               <div className="overflow-x-auto">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="bg-gray-50/60 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                           <th className="py-4 pl-6">{t('inventory.product')}</th>
                           <th className="py-4">{t('inventory.sku')}</th>
                           <th className="py-4">{t('common.price')}</th>
                           {currentLocation !== 'ALL' && <th className="py-4">{t('common.stock')}</th>}
                           <th className="py-4">{t('inventory.aiStatus')}</th>
                           <th className="py-4 text-right pr-6">{t('common.action')}</th>
                        </tr>
                     </thead>
                     <StaggerList as={motion.tbody} className="divide-y divide-gray-50">
                        {(filteredInventory || []).map((item) => (
                           <StaggerItem as={motion.tr} key={item.id} className="group hover:bg-indigo-50/20 transition-colors border-b border-gray-50 last:border-0">
                              {/* Product Cell */}
                              <td className="py-4 pl-6">
                                 <div className="flex items-center gap-3">
                                    {item.image_url ? (
                                       <div className="relative h-12 w-12 flex-shrink-0">
                                          <img 
                                             src={item.image_url.startsWith('http') ? item.image_url : `${BACKEND_URL}${item.image_url}`} 
                                             alt={item.name} 
                                             className="h-12 w-12 rounded-xl object-cover border border-gray-200 shadow-sm transition-transform duration-300 group-hover:scale-105"
                                             onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                                (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('hidden');
                                             }}
                                          />
                                          <div hidden className="absolute inset-0 flex items-center justify-center rounded-xl border border-gray-100 bg-gray-50">
                                             <Package className="h-5 w-5 text-indigo-400" />
                                          </div>
                                       </div>
                                    ) : (
                                       <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-indigo-100 bg-indigo-50/50">
                                          <Package className="h-7 w-7 text-indigo-400" />
                                       </div>
                                    )}
                                    <div className="space-y-0.5">
                                       <div className="font-black text-gray-900 group-hover:text-indigo-600 transition-colors text-sm">{item.name || '-'}</div>
                                       <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{item.category || 'Uncategorized'}</div>
                                    </div>
                                 </div>
                              </td>

                              {/* SKU Cell */}
                              <td className="py-4 font-mono text-xs font-bold text-gray-500">{item.sku || '-'}</td>

                              {/* Price Cell */}
                              <td className="py-4">
                                 <div className="flex flex-col">
                                    <span className="font-black text-gray-900 tracking-tight text-base">
                                       Rp {(item.price ?? 0).toLocaleString('id-ID')}
                                    </span>
                                    <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mt-1">{t('common.active')}</span>
                                 </div>
                              </td>

                              {/* Stock Cell */}
                              {currentLocation !== 'ALL' && (
                                 <td className="py-4">
                                    <div className="flex items-center">
                                       {(item.stock ?? 0) < 20 ? (
                                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 font-mono text-sm font-bold shadow-sm">
                                             <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                                             {item.stock ?? 0}
                                          </div>
                                       ) : (
                                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 text-gray-600 border border-gray-200 font-mono text-sm font-bold">
                                             {item.stock ?? 0}
                                          </div>
                                       )}
                                    </div>
                                 </td>
                              )}

                              {/* AI Status Cell */}
                              <td className="py-4">
                                 <Badge className={`rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] ${
                                    item.ai_label
                                       ? 'border border-emerald-200 bg-emerald-50 text-emerald-600'
                                       : 'border border-amber-200 bg-amber-50 text-amber-600'
                                 }`}>
                                    {item.ai_label ? (
                                       <div className="flex items-center gap-1.5">
                                          <Check className="w-3.5 h-3.5" />
                                          {item.ai_label}
                                       </div>
                                    ) : (
                                       <div className="flex items-center gap-1.5">
                                          <AlertTriangle className="w-3.5 h-3.5" />
                                          {t('inventory.noAiLabel')}
                                       </div>
                                    )}
                                 </Badge>
                              </td>

                              {/* Actions Cell */}
                              <td className="py-4 pr-6">
                                 <div className="flex items-center justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity duration-200">
                                    <Button variant="ghost" size="icon" onClick={() => openEdit(item)}
                                       className="bg-white hover:bg-indigo-50 shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-[18px] text-indigo-600 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(79,70,229,0.15)] transition-all duration-300 h-12 w-12 flex items-center justify-center">
                                       <Edit2 className="w-5 h-5" strokeWidth={2.5} />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => confirmDelete(item)}
                                       className="bg-white hover:bg-rose-50 shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-[18px] text-rose-600 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(225,29,72,0.15)] transition-all duration-300 h-12 w-12 flex items-center justify-center">
                                       <Trash2 className="w-5 h-5" strokeWidth={2.5} />
                                    </Button>
                                 </div>
                              </td>
                           </StaggerItem>
                        ))}
                     </StaggerList>
                  </table>
               </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="rounded-[32px]">
          <DialogHeader>
            <DialogTitle>{t('inventory.modifyStock')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('inventory.productName')}</Label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('inventory.stockCount')}</Label>
                <Input type="number" value={form.stock} onChange={e => setForm({...form, stock: parseInt(e.target.value)})} />
              </div>
              <div className="space-y-2">
                <Label>{t('inventory.unitPrice')}</Label>
                <Input type="number" value={form.price} onChange={e => setForm({...form, price: parseInt(e.target.value)})} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleEdit} className="bg-indigo-600">{t('inventory.applyChanges')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stunning Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="rounded-[32px] sm:max-w-md p-0 overflow-hidden border-none shadow-[0_20px_60px_-15px_rgba(225,29,72,0.3)]">
          <div className="bg-gradient-to-br from-rose-500 to-rose-700 p-10 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
               <Trash2 className="w-48 h-48 -rotate-12 translate-x-8 -translate-y-12" />
            </div>
            <div className="relative z-10">
              <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-xl border border-white/30 shadow-2xl">
                <Trash2 className="w-12 h-12 text-white drop-shadow-md" />
              </div>
              <DialogTitle className="text-3xl font-black text-white tracking-tight mb-3 drop-shadow-md">
                {currentLocation === 'ALL' ? t('inventory.deleteProduct') : t('inventory.deleteStock')}
              </DialogTitle>
              <DialogDescription className="text-rose-50 font-medium text-base px-2">
                {currentLocation === 'ALL' 
                  ? t('inventory.deleteProductDesc').replace('{name}', itemToDelete?.name || '')
                  : t('inventory.deleteStockDesc').replace('{name}', itemToDelete?.name || '')}
              </DialogDescription>
            </div>
          </div>
          
          <div className="p-8 bg-white">
            <div className="flex gap-4">
              <Button 
                variant="outline" 
                onClick={() => setDeleteDialogOpen(false)}
                className="flex-1 h-14 rounded-2xl border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                disabled={isDeleting}
              >
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handleDelete} 
                disabled={isDeleting}
                className="flex-1 h-14 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xl shadow-rose-600/20 transition-all hover:scale-[1.02]"
              >
                {isDeleting ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t('inventory.deleting')}
                  </div>
                ) : (
                   t('inventory.confirmDelete')
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
     </PageTransition>
  );
}
