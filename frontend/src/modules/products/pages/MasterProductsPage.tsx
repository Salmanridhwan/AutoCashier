import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  BadgeCheck,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
  Save,
  Loader2,
  Check,
  Clock,
  Ban,
  ThumbsUp,
  ThumbsDown,
  ShieldCheck
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { fetchBackend, BACKEND_URL } from '@/shared/lib/api';
import { cn } from '@/shared/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/components/ui/tabs';
import { toast } from 'sonner';
import { useLanguage } from '@/shared/context/LanguageContext';
import PageTransition from '@/shared/components/ui/PageTransition';
import { StaggerList, StaggerItem } from '@/shared/components/ui/StaggerList';
// Matches actual DB schema: id, sku, name, price, stock, ai_label, category, image_url, created_at
type ProductRecord = {
  id: string;
  sku?: string;
  name?: string;
  price?: number | string | null;
  stock?: number | null;
  ai_label?: string | null;
  category?: string | null;
  image_url?: string | null;
  created_at?: string | null;
};

const formatCurrency = (value: number | string | null | undefined) => {
  const numericValue = typeof value === 'string' ? Number(value) : value ?? 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(Number(numericValue)) ? Number(numericValue) : 0);
};

const getImageUrl = (url: string | null | undefined) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${BACKEND_URL}${url}`;
};

// Helper to get auth token
const getToken = (): string => {
  try {
    const raw = localStorage.getItem('autocashier_user');
    if (raw) return JSON.parse(raw)?.token || '';
  } catch {}
  return '';
};

// Helper to parse and render product request description & photos elegantly
const renderRequestDescription = (desc: string) => {
  if (!desc) return <span className="text-gray-400 font-medium">-</span>;
  
  try {
    if (desc.trim().startsWith('{')) {
      const parsed = JSON.parse(desc);
      const reason = parsed.reason || '';
      const images = parsed.images || [];
      
      return (
        <div className="space-y-2.5 max-w-sm py-1">
          {reason ? (
            <p className="font-semibold text-gray-700 text-xs bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-100/50 leading-relaxed">
              💡 {reason}
            </p>
          ) : (
            <p className="text-gray-400 italic text-[11px] font-medium">Tidak ada keterangan tertulis</p>
          )}
          
          {images.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {images.map((img: any, idx: number) => (
                <div key={idx} className="relative group/thumb cursor-pointer h-9 w-9 flex-shrink-0">
                  <a href={getImageUrl(img.imageUrl)} target="_blank" rel="noreferrer" title={`Lihat foto ${img.angle}`}>
                    <img
                      src={getImageUrl(img.imageUrl)}
                      alt={img.angle}
                      className="h-9 w-9 object-cover rounded-lg border border-gray-200 hover:border-indigo-500 shadow-sm transition-all hover:scale-105"
                    />
                  </a>
                  <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[7px] px-1 rounded-br-lg rounded-tl-sm uppercase font-extrabold font-mono tracking-tighter">
                    {img.angle.substring(0, 1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
  } catch (e) {
    console.warn('Failed to parse request description:', e);
  }
  
  return <span className="text-gray-600 font-semibold">{desc}</span>;
};

// ─── Edit Modal ──────────────────────────────────────────────────────────────
function ProductEditModal({
  product,
  onClose,
  onSaved,
}: {
  product: ProductRecord;
  onClose: () => void;
  onSaved: (updated: ProductRecord) => void;
}) {
  const { t, language } = useLanguage();
  const [form, setForm] = useState({
    name: product.name ?? '',
    category: product.category ?? '',
    price: String(product.price ?? ''),
    stock: String(product.stock ?? '0'),
    ai_label: product.ai_label ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const token = getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${BACKEND_URL}/api/shared/products/${product.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          name: form.name.trim(),
          category: form.category.trim() || null,
          price: Number(form.price),
          stock: Number(form.stock),
          ai_label: form.ai_label.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'success') throw new Error(data.error || `HTTP ${res.status}`);
      onSaved({ ...product, ...form, price: Number(form.price), stock: Number(form.stock) });
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "h-11 rounded-2xl border-gray-200 bg-gray-50 px-4 text-sm font-medium focus:border-indigo-300 focus:ring-indigo-200 w-full";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.2 }}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/25">
              <Pencil className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-black text-gray-900 text-base">
                {language === 'id' ? 'Edit Produk' : 'Edit Product'}
              </h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{product.sku}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-2xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Thumbnail */}
        {product.image_url && (
          <div className="relative h-36 bg-gray-50 overflow-hidden">
            <img
              src={getImageUrl(product.image_url)}
              alt={product.name ?? 'Produk'}
              className="h-full w-full object-cover opacity-80"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white/60 to-transparent" />
          </div>
        )}

        {/* Form */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              {t('inventory.productName')} *
            </label>
            <Input name="name" value={form.name} onChange={handleChange} placeholder={language === 'id' ? 'Nama produk' : 'Product name'} className={inputClass} />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              {t('common.category')}
            </label>
            <Input name="category" value={form.category} onChange={handleChange} placeholder={t('request.categoryPlaceholder')} className={inputClass} />
          </div>

          {/* Price + Stock */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                {t('common.price')} (Rp) *
              </label>
              <Input name="price" type="number" min="0" value={form.price} onChange={handleChange} placeholder="0" className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                {t('common.stock')}
              </label>
              <Input name="stock" type="number" min="0" value={form.stock} onChange={handleChange} placeholder="0" className={inputClass} />
            </div>
          </div>

          {/* AI Label */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              {t('inventory.aiStatus')} (YOLO)
            </label>
            <Input name="ai_label" value={form.ai_label} onChange={handleChange} placeholder="Misal: bottle, cup, person..." className={inputClass} />
          </div>

          {/* Error */}
          {saveError && (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs font-bold text-rose-600">
              ❌ {saveError}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={saving}
              className="flex-1 h-12 rounded-2xl border-gray-200 font-black text-gray-600 hover:bg-gray-50"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="flex-1 h-12 rounded-2xl bg-indigo-600 font-black text-white hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 disabled:opacity-60"
            >
              {saving
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('common.loading')}</>
                : <><Save className="mr-2 h-4 w-4" />{t('common.save')}</>}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteConfirmModal({
  product,
  onConfirm,
  onCancel,
  loading,
}: {
  product: ProductRecord;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const { t, language } = useLanguage();
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-900/80 backdrop-blur-lg"
        onClick={onCancel}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-[32px] bg-white shadow-2xl"
      >
        {/* Red accent top bar */}
        <div className="h-1.5 bg-gradient-to-r from-rose-500 via-red-500 to-orange-500" />

        <div className="p-8 space-y-6">
          {/* Icon + Title */}
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 border border-rose-100 flex-shrink-0">
              <AlertTriangle className="h-7 w-7 text-rose-500" />
            </div>
            <div>
              <h2 className="font-black text-gray-900 text-xl tracking-tight">
                {language === 'id' ? 'Hapus Produk?' : 'Delete Product?'}
              </h2>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                {language === 'id' ? (
                  <>Tindakan ini <span className="font-bold text-rose-600">tidak dapat dibatalkan</span>. Semua data termasuk foto produk akan dihapus permanen.</>
                ) : (
                  <>This action <span className="font-bold text-rose-600">cannot be undone</span>. All data including product photos will be permanently deleted.</>
                )}
              </p>
            </div>
          </div>

          {/* Product Preview Card */}
          <div className="flex items-center gap-4 rounded-2xl border border-rose-100 bg-rose-50/50 p-4">
            {product.image_url ? (
              <img
                src={getImageUrl(product.image_url)}
                alt={product.name}
                className="h-16 w-16 rounded-xl object-cover border-2 border-white shadow-sm flex-shrink-0"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white border-2 border-rose-100 flex-shrink-0">
                <Package className="h-7 w-7 text-rose-300" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-black text-gray-900 text-base truncate">{product.name}</p>
              <p className="text-xs font-mono text-gray-400 mt-0.5">{product.sku}</p>
              {product.price && (
                <p className="text-sm font-bold text-rose-600 mt-1">
                  {formatCurrency(product.price)}
                </p>
              )}
            </div>
          </div>

          {/* Warning info */}
          <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700 font-medium">
              {language === 'id' 
                ? 'Produk akan dihapus dari katalog, inventaris cabang, dan sistem AI scanner.'
                : 'The product will be deleted from the catalog, branch inventory, and AI scanner system.'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={onCancel}
              variant="outline"
              className="flex-1 h-13 rounded-2xl border-gray-200 font-bold text-gray-600 hover:bg-gray-50 text-sm"
              disabled={loading}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={onConfirm}
              className="flex-1 h-13 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 font-bold text-white hover:from-rose-700 hover:to-red-700 shadow-lg shadow-rose-500/25 text-sm"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('inventory.deleting')}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  {language === 'id' ? 'Ya, Hapus Produk' : 'Yes, Delete Product'}
                </span>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MasterProductsPage() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Modal state
  const [editProduct, setEditProduct] = useState<ProductRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Approval Workflow State
  const [requests, setRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestBranchFilter, setRequestBranchFilter] = useState('all');
  const [requestStatusFilter, setRequestStatusFilter] = useState('all');

  const handleProductSaved = (updated: ProductRecord) => {
    setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
    setEditProduct(null);
  };

  const loadProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchBackend('getMasterCatalog');
      if (res.status === 'success') {
        setProducts(res.data as ProductRecord[]);
      } else {
        throw new Error(res.message || (language === 'id' ? 'Gagal memuat master data' : 'Failed to load master data'));
      }
    } catch (err: any) {
      setError(err?.message || (language === 'id' ? 'Gagal memuat master data dari database' : 'Failed to load master data from database'));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const res = await fetchBackend('getProductRequests');
      if (res.status === 'success') {
        setRequests(res.data || []);
      }
    } catch (err: any) {
      toast.error((language === 'id' ? 'Gagal memuat pengajuan produk: ' : 'Failed to load product requests: ') + err.message);
    } finally {
      setLoadingRequests(false);
    }
  }, [language]);

  // Approve modal state
  const [approveTarget, setApproveTarget] = useState<any | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const handleApproveRequest = (reqItem: any) => {
    setApproveTarget(reqItem);
  };

  const confirmApprove = async () => {
    if (!approveTarget) return;
    setIsApproving(true);
    try {
      const res = await fetchBackend('approveProductRequest', { id: approveTarget.id, price: approveTarget.price, category: approveTarget.category });
      if (res.status === 'success') {
        toast.success(language === 'id' ? 'Pengajuan produk berhasil disetujui' : 'Product request approved successfully');
        loadRequests();
        loadProducts();
        setApproveTarget(null);
      } else {
        toast.error(res.message || (language === 'id' ? 'Gagal menyetujui pengajuan' : 'Failed to approve request'));
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setIsApproving(false);
    }
  };

  // Reject modal state
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const handleRejectRequest = async (id: string) => {
    setRejectTarget(id);
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      toast.error(language === 'id' ? 'Alasan penolakan wajib diisi' : 'Rejection reason is required');
      return;
    }
    setIsRejecting(true);
    try {
      const res = await fetchBackend('rejectProductRequest', { id: rejectTarget, reason: rejectReason.trim() });
      if (res.status === 'success') {
        toast.success(language === 'id' ? 'Pengajuan produk berhasil ditolak' : 'Product request rejected successfully');
        loadRequests();
        setRejectTarget(null);
      } else {
        toast.error(res.message || (language === 'id' ? 'Gagal menolak pengajuan' : 'Failed to reject request'));
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setIsRejecting(false);
    }
  };

  useEffect(() => {
    void loadProducts();
    void loadRequests();
  }, [loadRequests]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetchBackend('deleteProduct', { id: deleteTarget.id });
      if (res.status === 'success') {
        setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
        setDeleteTarget(null);
        toast.success(language === 'id' ? 'Produk berhasil dihapus' : 'Product deleted successfully');
      } else {
        toast.error((language === 'id' ? 'Gagal menghapus: ' : 'Failed to delete: ') + (res.message || res.error || 'Unknown error'));
      }
    } catch (err: any) {
      toast.error((language === 'id' ? 'Gagal menghapus produk: ' : 'Failed to delete product: ') + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((product) => {
      const haystack = [product.sku, product.name, product.category, product.ai_label]
        .filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(keyword);
    });
  }, [products, query]);

  const stats = useMemo(() => {
    const withLabel = products.filter((product) => product.ai_label != null).length;
    return { total: products.length, active: withLabel, inactive: Math.max(products.length - withLabel, 0) };
  }, [products]);

  return (
    <PageTransition className="space-y-6 pb-12 font-sans">
      {/* Modals */}
      <AnimatePresence>
        {editProduct && (
          <ProductEditModal
            product={editProduct}
            onClose={() => setEditProduct(null)}
            onSaved={handleProductSaved}
          />
        )}
        {deleteTarget && (
          <DeleteConfirmModal
            product={deleteTarget}
            onConfirm={handleDelete}
            onCancel={() => setDeleteTarget(null)}
            loading={deleting}
          />
        )}
      </AnimatePresence>

      {/* ── Approve Modal ── */}
      <AnimatePresence>
        {approveTarget && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/80 backdrop-blur-lg" onClick={() => setApproveTarget(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-[32px] bg-white shadow-2xl">
              <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
              <div className="p-8 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-100 flex-shrink-0">
                    <ThumbsUp className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="font-black text-gray-900 text-lg tracking-tight">
                      {language === 'id' ? 'Setujui Pengajuan?' : 'Approve Request?'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {language === 'id' ? 'Produk akan ditambahkan ke katalog dan bisa dideteksi oleh scanner AI.' : 'Product will be added to the catalog and can be detected by the AI scanner.'}
                    </p>
                  </div>
                </div>

                {/* Product preview */}
                <div className="flex items-center gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                  {approveTarget.image_url ? (
                    <img src={getImageUrl(approveTarget.image_url)} alt="" className="h-14 w-14 rounded-xl object-cover border-2 border-white shadow-sm" />
                  ) : (
                    <div className="h-14 w-14 rounded-xl bg-white border-2 border-emerald-100 flex items-center justify-center">
                      <Package className="h-6 w-6 text-emerald-300" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-gray-900 text-base truncate">{approveTarget.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm font-bold text-emerald-600">Rp {approveTarget.price?.toLocaleString('id-ID')}</span>
                      <span className="text-xs text-gray-400">{approveTarget.category || (language === 'id' ? 'Tanpa Kategori' : 'Uncategorized')}</span>
                    </div>
                    {approveTarget.branch_name && (
                      <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-100 text-[10px] font-bold text-blue-700">
                        {language === 'id' ? `Dari: ${approveTarget.branch_name}` : `From: ${approveTarget.branch_name}`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
                  <ShieldCheck className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <p className="text-xs text-emerald-700 font-medium">
                    {language === 'id' 
                      ? 'Produk akan otomatis didaftarkan ke sistem AI dan tersedia untuk scan di kasir cabang.'
                      : 'Product will be automatically registered to the AI system and available for scanning at branch cashiers.'}
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button onClick={() => setApproveTarget(null)} variant="outline"
                    className="flex-1 h-12 rounded-2xl border-gray-200 font-bold text-gray-600 hover:bg-gray-50 text-sm" disabled={isApproving}>
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={confirmApprove} disabled={isApproving}
                    className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 font-bold text-white hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/20 text-sm disabled:opacity-50">
                    {isApproving ? (
                      <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}</span>
                    ) : (
                      <span className="flex items-center gap-2"><ThumbsUp className="h-4 w-4" /> {language === 'id' ? 'Ya, Setujui' : 'Yes, Approve'}</span>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Reject/Cancel Modal ── */}
      <AnimatePresence>
        {rejectTarget && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/80 backdrop-blur-lg"
              onClick={() => setRejectTarget(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-[32px] bg-white shadow-2xl"
            >
              <div className="h-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500" />
              <div className="p-8 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 border border-amber-100 flex-shrink-0">
                    <Ban className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="font-black text-gray-900 text-lg tracking-tight">
                      {language === 'id' ? 'Tolak Pengajuan?' : 'Reject Request?'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {language === 'id' ? 'Berikan alasan penolakan agar cabang dapat memahami keputusan ini.' : 'Provide a rejection reason so the branch can understand this decision.'}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    {language === 'id' ? 'Alasan Penolakan *' : 'Rejection Reason *'}
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={language === 'id' ? 'Contoh: Produk sudah ada di katalog, harga tidak sesuai, foto kurang jelas...' : 'e.g. Product already in catalog, price mismatch, unclear photos...'}
                    rows={3}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-300 transition-all placeholder:text-gray-400"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={() => setRejectTarget(null)}
                    variant="outline"
                    className="flex-1 h-12 rounded-2xl border-gray-200 font-bold text-gray-600 hover:bg-gray-50 text-sm"
                    disabled={isRejecting}
                  >
                    {t('common.back')}
                  </Button>
                  <Button
                    onClick={confirmReject}
                    disabled={isRejecting || !rejectReason.trim()}
                    className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-amber-600 to-rose-600 font-bold text-white hover:from-amber-700 hover:to-rose-700 shadow-lg shadow-amber-500/20 text-sm disabled:opacity-50"
                  >
                    {isRejecting ? (
                      <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}</span>
                    ) : (
                      <span className="flex items-center gap-2"><Ban className="h-4 w-4" /> {language === 'id' ? 'Konfirmasi Tolak' : 'Confirm Rejection'}</span>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── PAGE HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Package className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">
              {language === 'id' ? 'Kelola katalog produk dan verifikasi pengajuan cabang' : 'Manage product catalog and verify branch requests'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {language === 'id' ? `${products.length} produk terdaftar` : `${products.length} products registered`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              void loadProducts();
              void loadRequests();
            }}
            className="h-11 px-4 rounded-xl border-gray-200 bg-white font-bold text-gray-600 hover:bg-gray-50 transition-all shadow-sm gap-2 text-xs"
          >
            <RefreshCw className="h-4 w-4" /> {t('common.refresh')}
          </Button>
          <Button
            onClick={() => navigate('/add-product')}
            className="h-11 px-5 rounded-xl bg-indigo-600 font-black text-white hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 hover:scale-[1.02] transition-all border-none text-xs gap-2"
          >
            <Plus className="h-4 w-4" /> {language === 'id' ? 'Tambah Produk' : 'Add Product'}
          </Button>
        </div>
      </div>

      {/* ── STAT CARDS ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: language === 'id' ? 'Total Produk Master' : 'Total Master Products', value: stats.total, icon: Package, iconBg: 'bg-indigo-50 text-indigo-600' },
          { label: language === 'id' ? 'Tervalidasi AI' : 'AI Validated', value: stats.active, icon: BadgeCheck, iconBg: 'bg-emerald-50 text-emerald-600' },
          { label: language === 'id' ? 'Menunggu Persetujuan' : 'Pending Approval', value: requests.filter(r => r.status === 'pending').length, icon: AlertTriangle, iconBg: 'bg-amber-50 text-amber-600' },
        ].map(({ label, value, icon: Icon, iconBg }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
              <div className={cn('p-3 rounded-xl flex-shrink-0', iconBg)}><Icon className="h-5 w-5" /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">{label}</p>
                <p className="text-2xl font-black text-gray-900 tracking-tight font-mono">{value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="catalog" className="w-full space-y-6">
        <div className="flex items-center gap-3">
          <TabsList className="bg-transparent p-0 h-fit flex gap-3">
            <TabsTrigger value="catalog" className="group relative px-6 py-3.5 rounded-2xl font-bold text-sm transition-all duration-300 border-2 gap-2.5 data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:border-indigo-600 data-[state=active]:shadow-xl data-[state=active]:shadow-indigo-600/25 data-[state=active]:scale-[1.02] data-[state=inactive]:bg-white data-[state=inactive]:text-gray-500 data-[state=inactive]:border-gray-200 data-[state=inactive]:hover:border-indigo-200 data-[state=inactive]:hover:text-indigo-600 data-[state=inactive]:hover:bg-indigo-50/50 data-[state=inactive]:shadow-sm">
              <Package className="w-4.5 h-4.5" />
              {language === 'id' ? 'Katalog Produk' : 'Product Catalog'}
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-black data-[state=active]:bg-white/20 bg-indigo-100 text-indigo-600 group-data-[state=active]:bg-white/20 group-data-[state=active]:text-white">
                {products.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="requests" className="group relative px-6 py-3.5 rounded-2xl font-bold text-sm transition-all duration-300 border-2 gap-2.5 data-[state=active]:bg-amber-600 data-[state=active]:text-white data-[state=active]:border-amber-600 data-[state=active]:shadow-xl data-[state=active]:shadow-amber-600/25 data-[state=active]:scale-[1.02] data-[state=inactive]:bg-white data-[state=inactive]:text-gray-500 data-[state=inactive]:border-gray-200 data-[state=inactive]:hover:border-amber-200 data-[state=inactive]:hover:text-amber-600 data-[state=inactive]:hover:bg-amber-50/50 data-[state=inactive]:shadow-sm">
              <Clock className="w-4.5 h-4.5" />
              {language === 'id' ? 'Permintaan Cabang' : 'Branch Requests'}
              {requests.filter(r => r.status === 'pending').length > 0 && (
                <span className="flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[10px] font-black bg-rose-500 text-white shadow-lg shadow-rose-500/40 animate-pulse">
                  {requests.filter(r => r.status === 'pending').length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="catalog">
          {/* ── TABLE CARD ── */}
          <Card className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <div className="relative w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                <Input
                  placeholder={language === 'id' ? 'Cari nama, SKU, kategori, atau label AI...' : 'Search name, SKU, category, or AI label...'}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-11 rounded-xl border-gray-100 bg-gray-50 pl-11 pr-4 text-sm font-medium shadow-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-200 placeholder:text-gray-300 transition-all"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center gap-6 p-24">
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full" />
                  <Loader2 className="w-12 h-12 text-indigo-600 animate-spin relative z-10" />
                </div>
                <p className="text-sm font-black uppercase tracking-widest text-gray-400">
                  {language === 'id' ? 'Sinkronisasi Katalog Database...' : 'Syncing Database Catalog...'}
                </p>
              </div>
            ) : error ? (
              <div className="p-10">
                <div className="rounded-[32px] border border-rose-100 bg-rose-50 p-8 text-rose-700 text-center max-w-lg mx-auto">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-rose-100">
                    <AlertTriangle className="h-8 w-8 text-rose-500" />
                  </div>
                  <div className="text-sm font-black uppercase tracking-[0.2em] mb-2">{language === 'id' ? 'Sinkronisasi Gagal' : 'Sync Failed'}</div>
                  <p className="text-sm font-medium leading-relaxed text-rose-600/80 mb-6">{error}</p>
                  <Button onClick={loadProducts} className="h-12 px-8 rounded-2xl bg-rose-600 font-bold text-white hover:bg-rose-700 shadow-xl shadow-rose-600/20">
                    {language === 'id' ? 'Coba Koneksi Ulang' : 'Retry Connection'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50/60 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                      <th className="py-4 pl-6">{language === 'id' ? 'Produk' : 'Product'}</th>
                      <th className="py-4">SKU</th>
                      <th className="py-4">{language === 'id' ? 'Harga' : 'Price'}</th>
                      <th className="py-4">{language === 'id' ? 'Status AI' : 'AI Status'}</th>
                      <th className="py-4 text-right pr-6">{language === 'id' ? 'Aksi' : 'Action'}</th>
                    </tr>
                  </thead>
                  <StaggerList as={motion.tbody} className="divide-y divide-gray-50">
                    {filteredProducts.length > 0 ? (
                      filteredProducts.map((product) => (
                        <StaggerItem
                          as={motion.tr}
                          key={product.id}
                          className="group hover:bg-indigo-50/20 transition-colors border-b border-gray-50 last:border-0"
                        >
                            {/* Product cell */}
                            <td className="py-4 pl-6">
                              <div className="flex items-center gap-3">
                                {product.image_url ? (
                                  <div className="relative h-16 w-16 flex-shrink-0">
                                    <img
                                      src={getImageUrl(product.image_url)}
                                      alt={product.name ?? 'Produk'}
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
                                  <div className="font-black text-gray-900 group-hover:text-indigo-600 transition-colors text-sm">{product.name || '-'}</div>
                                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{product.category || (language === 'id' ? 'Tanpa Kategori' : 'Uncategorized')}</div>
                                </div>
                              </div>
                            </td>

                            <td className="py-4 font-mono text-xs font-bold text-gray-500">{product.sku || '-'}</td>

                            <td className="py-4">
                              <div className="flex flex-col">
                                <span className="font-black text-gray-900 tracking-tight text-base">{formatCurrency(product.price)}</span>
                                <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mt-1">{language === 'id' ? 'Aktif' : 'Active'}</span>
                              </div>
                            </td>

                            <td className="py-4">
                              <Badge className={`rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] ${
                                product.ai_label
                                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-600'
                                  : 'border border-amber-200 bg-amber-50 text-amber-600'
                              }`}>
                                {product.ai_label ? (
                                  <div className="flex items-center gap-1.5">
                                    <BadgeCheck className="w-3.5 h-3.5" />
                                    {product.ai_label}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    {language === 'id' ? 'Belum Ada' : 'None'}
                                  </div>
                                )}
                              </Badge>
                            </td>

                            {/* Actions */}
                            <td className="py-4 pr-6">
                              <div className="flex items-center justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity duration-200">
                                <Button variant="ghost" size="icon" onClick={() => navigate(`/add-product?edit=${product.id}`, { state: { product } })}
                                  className="bg-white hover:bg-indigo-50 shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-[18px] text-indigo-600 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(79,70,229,0.15)] transition-all duration-300 h-12 w-12 flex items-center justify-center">
                                  <Pencil className="w-5 h-5" strokeWidth={2.5} />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(product)}
                                  className="bg-white hover:bg-rose-50 shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-[18px] text-rose-500 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(244,63,94,0.15)] transition-all duration-300 h-12 w-12 flex items-center justify-center">
                                  <Trash2 className="w-5 h-5" strokeWidth={2.5} />
                                </Button>
                              </div>
                            </td>
                          </StaggerItem>
                        ))
                      ) : (
                        <tr className="border-none">
                          <td colSpan={6} className="px-10 py-24 text-center">
                            <div className="mx-auto max-w-md space-y-4">
                              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-50 border border-gray-100 shadow-sm text-gray-400">
                                <Search className="h-8 w-8" />
                              </div>
                              <div className="space-y-2">
                                <h3 className="text-xl font-black text-gray-900 tracking-tight">
                                  {language === 'id' ? 'Belum ada data yang cocok' : 'No matching data'}
                                </h3>
                                <p className="text-sm font-medium leading-relaxed text-gray-500">
                                  {language === 'id' 
                                    ? 'Produk yang Anda cari tidak ditemukan dalam database Master. Coba ubah kata kunci pencarian atau daftarkan produk baru.'
                                    : 'The product you are looking for was not found in the Master database. Try changing search keywords or register a new product.'}
                                </p>
                              </div>
                              <Button
                                onClick={() => navigate('/add-product')}
                                className="h-12 mt-4 px-8 rounded-2xl bg-indigo-600 font-bold text-white hover:bg-indigo-700 shadow-xl shadow-indigo-600/20"
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                {language === 'id' ? 'Registrasi Produk' : 'Register Product'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </StaggerList>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="requests">
          <Card className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
            <CardHeader className="p-6 pb-4 border-b border-gray-100">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center border border-amber-100">
                    <Clock className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-gray-900">{language === 'id' ? 'Permintaan Produk Baru' : 'New Product Requests'}</h3>
                    <p className="text-gray-400 text-[11px] mt-0.5">{language === 'id' ? 'Pengajuan dari cabang yang menunggu persetujuan' : 'Requests from branch awaiting approval'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select value={requestBranchFilter} onChange={(e) => setRequestBranchFilter(e.target.value)}
                    className="text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200">
                    <option value="all">{language === 'id' ? 'Semua Cabang' : 'All Branches'}</option>
                    {[...new Set(requests.map(r => r.branch_name).filter(Boolean))].map((name: any) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <select value={requestStatusFilter} onChange={(e) => setRequestStatusFilter(e.target.value)}
                    className="text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200">
                    <option value="all">{language === 'id' ? 'Semua Status' : 'All Status'}</option>
                    <option value="pending">{language === 'id' ? 'Menunggu' : 'Pending'}</option>
                    <option value="approved">{language === 'id' ? 'Disetujui' : 'Approved'}</option>
                    <option value="rejected">{language === 'id' ? 'Ditolak' : 'Rejected'}</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingRequests ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                </div>
              ) : requests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                  <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center">
                    <Check className="w-8 h-8 text-emerald-500" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">{language === 'id' ? 'Semua Sudah Diproses' : 'All Processed'}</h4>
                    <p className="text-gray-400 text-xs mt-1">{language === 'id' ? 'Tidak ada pengajuan yang menunggu persetujuan.' : 'No requests awaiting approval.'}</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="py-3.5 pl-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">{language === 'id' ? 'Produk' : 'Product'}</th>
                        <th className="py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">{language === 'id' ? 'Cabang' : 'Branch'}</th>
                        <th className="py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">{language === 'id' ? 'Kategori' : 'Category'}</th>
                        <th className="py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">{language === 'id' ? 'Harga' : 'Price'}</th>
                        <th className="py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">{language === 'id' ? 'Foto' : 'Photo'}</th>
                        <th className="py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">{language === 'id' ? 'Alasan Pengajuan' : 'Reason for Request'}</th>
                        <th className="py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                        <th className="py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">{language === 'id' ? 'Alasan Penolakan' : 'Rejection Reason'}</th>
                        <th className="py-3.5 pr-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">{language === 'id' ? 'Aksi' : 'Action'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {requests
                        .filter(r => requestBranchFilter === 'all' || r.branch_name === requestBranchFilter)
                        .filter(r => requestStatusFilter === 'all' || r.status === requestStatusFilter)
                        .map((reqItem) => (
                        <tr key={reqItem.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-4 pl-5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                {(() => {
                                  try {
                                    const parsed = JSON.parse(reqItem.description || '{}');
                                    const imgs = parsed.images || [];
                                    if (imgs.length > 0 && imgs[0].imageUrl) {
                                      return <img src={getImageUrl(imgs[0].imageUrl)} alt="" className="w-full h-full object-cover" />;
                                    }
                                  } catch {}
                                  return <Package className="w-4 h-4 text-gray-400" />;
                                })()}
                              </div>
                              <div>
                                <p className="font-bold text-gray-900 text-sm">{reqItem.name}</p>
                                {reqItem.sku && <p className="text-[10px] font-mono text-gray-400">{reqItem.sku}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="py-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-100 text-[11px] font-bold text-blue-700">
                              {reqItem.branch_name || reqItem.branch_code || '-'}
                            </span>
                          </td>
                          <td className="py-4 text-xs font-semibold text-gray-600">{reqItem.category || '-'}</td>
                          <td className="py-4 text-sm font-bold text-gray-900">Rp {reqItem.price?.toLocaleString('id-ID') || '0'}</td>
                          <td className="py-4">
                            <div className="flex gap-1.5">
                              {(() => {
                                try {
                                  const parsed = JSON.parse(reqItem.description || '{}');
                                  const imgs = parsed.images || [];
                                  return imgs.slice(0, 4).map((img: any, idx: number) => (
                                    <a key={idx} href={getImageUrl(img.imageUrl)} target="_blank" rel="noreferrer">
                                      <img src={getImageUrl(img.imageUrl)} alt={img.angle} className="w-9 h-9 rounded-lg object-cover border border-gray-200 hover:border-indigo-400 transition-colors" />
                                    </a>
                                  ));
                                } catch { return <span className="text-gray-400 text-xs">-</span>; }
                              })()}
                            </div>
                          </td>
                          <td className="py-4 text-xs text-gray-500 max-w-[160px]">
                            {(() => {
                              try {
                                const parsed = JSON.parse(reqItem.description || '{}');
                                return parsed.reason || '-';
                              } catch { return reqItem.description || '-'; }
                            })()}
                          </td>
                          <td className="py-4">
                            <Badge className={cn(
                              'rounded-full px-2.5 py-1 text-[9px] font-black uppercase border-none',
                              reqItem.status === 'approved' && 'bg-emerald-100 text-emerald-700',
                              reqItem.status === 'pending' && 'bg-amber-100 text-amber-700',
                              reqItem.status === 'rejected' && 'bg-rose-100 text-rose-700'
                            )}>
                              {reqItem.status === 'pending' 
                                ? (language === 'id' ? 'Menunggu' : 'Pending') 
                                : reqItem.status === 'approved' 
                                  ? (language === 'id' ? 'Disetujui' : 'Approved') 
                                  : (language === 'id' ? 'Ditolak' : 'Rejected')}
                            </Badge>
                          </td>
                          <td className="py-4 text-xs text-gray-500 max-w-[150px]">
                            {reqItem.status === 'rejected' && reqItem.rejection_reason ? (
                              <span className="text-rose-600 font-medium" title={reqItem.rejection_reason}>{reqItem.rejection_reason}</span>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="py-4 pr-5 text-right">
                            {reqItem.status === 'pending' ? (
                              <div className="flex items-center justify-end gap-2">
                                <Button size="sm" onClick={() => handleApproveRequest(reqItem)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5 text-[11px] font-bold h-8 px-3">
                                  <ThumbsUp className="w-3 h-3" /> {language === 'id' ? 'Setujui' : 'Approve'}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleRejectRequest(reqItem.id)}
                                  className="border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl gap-1.5 text-[11px] font-bold h-8 px-3">
                                  <ThumbsDown className="w-3 h-3" /> {language === 'id' ? 'Tolak' : 'Reject'}
                                </Button>
                              </div>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => handleRejectRequest(reqItem.id)}
                                className="border-gray-200 text-gray-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 rounded-xl gap-1.5 text-[11px] font-bold h-8 px-3">
                                <Ban className="w-3 h-3" /> {language === 'id' ? 'Batalkan' : 'Cancel'}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageTransition>
  );
}
