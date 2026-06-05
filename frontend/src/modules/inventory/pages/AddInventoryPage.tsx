import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Plus, Loader2, Upload, Trash2, Camera, X, Check, Search, AlertTriangle, Layers, HelpCircle, BadgeCheck } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/components/ui/tabs';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { BACKEND_URL } from '@/shared/lib/api';
import { cn } from '@/shared/lib/utils';
import { useLanguage } from '@/shared/context/LanguageContext';
import PageTransition from '@/shared/components/ui/PageTransition';

const CATEGORIES = ['Coffee', 'Pastry', 'Cake', 'Beverage', 'Sandwich', 'Snack', 'Other'];

type AngleKey = 'front' | 'back' | 'left' | 'right';

const ANGLES: { key: AngleKey; label: string; fieldName: string }[] = [
  { key: 'front', label: 'Depan', fieldName: 'imageFront' },
  { key: 'back', label: 'Belakang', fieldName: 'imageBack' },
  { key: 'left', label: 'Kiri', fieldName: 'imageLeft' },
  { key: 'right', label: 'Kanan', fieldName: 'imageRight' },
];

function getToken(): string {
  try {
    const raw = localStorage.getItem('autocashier_user');
    if (raw) return JSON.parse(raw)?.token || '';
  } catch { /* */ }
  return '';
}

function authHeaders() {
  const token = getToken();
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export default function AddInventoryPage() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'master' | 'request'>('master');
  const [isSaving, setIsSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Data States
  const [masterCatalog, setMasterCatalog] = useState<any[]>([]);
  const [branchInventory, setBranchInventory] = useState<any[]>([]);
  const [selectedMasterId, setSelectedMasterId] = useState<string>('');
  const [masterSearch, setMasterSearch] = useState<string>('');

  // Form states for linking Master Product
  const [linkForm, setLinkForm] = useState({
    stock: '0',
    price: '',
  });

  // Form states for submitting new Product Request
  const [requestForm, setRequestForm] = useState({
    name: '',
    price: '',
    category: '',
    sku: '',
    unit: 'pcs',
    description: '',
  });

  // Image files states for requests
  const [imageFiles, setImageFiles] = useState<Record<AngleKey, File | null>>({
    front: null,
    back: null,
    left: null,
    right: null,
  });

  const [imagePreviews, setImagePreviews] = useState<Record<AngleKey, string | null>>({
    front: null,
    back: null,
    left: null,
    right: null,
  });

  const fileInputRefs = {
    front: useRef<HTMLInputElement>(null),
    back: useRef<HTMLInputElement>(null),
    left: useRef<HTMLInputElement>(null),
    right: useRef<HTMLInputElement>(null),
  };

  // Camera states
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [activeCameraAngle, setActiveCameraAngle] = useState<AngleKey | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Fetch data
  const loadData = async () => {
    try {
      setLoadingData(true);
      const token = getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      // 1. Fetch master catalog
      const masterRes = await fetch(`${BACKEND_URL}/api/shared/products`, { headers });
      const masterJson = await masterRes.json();

      // 2. Fetch branch inventory
      const branchRes = await fetch(`${BACKEND_URL}/api/admin/inventory`, { headers });
      const branchJson = await branchRes.json();

      if (masterRes.ok && masterJson.data) {
        setMasterCatalog(masterJson.data);
      }
      if (branchRes.ok && branchJson.data) {
        setBranchInventory(branchJson.data);
      }
    } catch (err: any) {
      toast.error('Gagal mengambil data katalog: ' + err.message);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Camera actions
  const startCameraStream = async (deviceId?: string) => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    const constraints: MediaStreamConstraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (videoRef.current) videoRef.current.srcObject = stream;
    streamRef.current = stream;
  };

  const openCamera = async (angle: AngleKey) => {
    setActiveCameraAngle(angle);
    setIsCameraOpen(true);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setCameraDevices(videoDevices);
      const idx = currentDeviceIndex < videoDevices.length ? currentDeviceIndex : 0;
      setCurrentDeviceIndex(idx);
      await startCameraStream(videoDevices[idx]?.deviceId);
    } catch (err) {
      toast.error('Gagal membuka kamera: ' + (err as Error).message);
      setIsCameraOpen(false);
      setActiveCameraAngle(null);
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
    setActiveCameraAngle(null);
  };

  const switchCamera = async () => {
    if (cameraDevices.length < 2) return;
    const nextIndex = (currentDeviceIndex + 1) % cameraDevices.length;
    setCurrentDeviceIndex(nextIndex);
    try { await startCameraStream(cameraDevices[nextIndex].deviceId); } catch {}
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current && activeCameraAngle) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        canvasRef.current.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `camera_${activeCameraAngle}.jpg`, { type: 'image/jpeg' });
            setImageFiles(prev => ({ ...prev, [activeCameraAngle]: file }));
            setImagePreviews(prev => ({ ...prev, [activeCameraAngle]: URL.createObjectURL(blob) }));
            closeCamera();
            toast.success(`Foto ${activeCameraAngle} berhasil diambil!`);
          }
        }, 'image/jpeg', 0.8);
      }
    }
  };

  const handleImageSelect = (angle: AngleKey, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFiles(prev => ({ ...prev, [angle]: file }));
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => ({ ...prev, [angle]: reader.result as string }));
      };
      reader.readAsDataURL(file);
      toast.success(`Foto ${angle} berhasil diupload!`);
    }
  };

  const handleRemoveImage = (angle: AngleKey) => {
    setImageFiles(prev => ({ ...prev, [angle]: null }));
    setImagePreviews(prev => ({ ...prev, [angle]: null }));
    const ref = fileInputRefs[angle];
    if (ref.current) ref.current.value = '';
  };

  const uploadedCount = Object.values(imageFiles).filter(Boolean).length;

  // Action 1: Add a product from Master Catalog to Branch Inventory
  const handleLinkCatalogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMasterId) return;

    try {
      setIsSaving(true);
      const selectedProduct = masterCatalog.find(p => p.id === selectedMasterId);
      const costPrice = linkForm.price ? Number(linkForm.price) : selectedProduct?.price || 0;

      const response = await fetch(`${BACKEND_URL}/api/admin/inventory`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          product_id: selectedMasterId,
          stock: Number(linkForm.stock) || 0,
          cost_price: costPrice,
          _link_existing: true,
        }),
      });

      const result = await response.json();
      if (response.ok) {
        toast.success(
          language === 'id'
            ? `✅ Berhasil menambahkan "${selectedProduct?.name}" ke toko Anda!`
            : `✅ Successfully added "${selectedProduct?.name}" to your store!`
        );
        setTimeout(() => navigate('/inventory'), 1000);
      } else {
        throw new Error(result.message || 'Gagal menghubungkan produk');
      }
    } catch (err: any) {
      toast.error('❌ Gagal: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Action 2: Submit a custom product request to Super Admin
  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadedCount < 4) {
      toast.error(t('addInventory.errorPhoto'));
      return;
    }

    try {
      setIsSaving(true);
      const uploadFormData = new FormData();
      uploadFormData.append('name', requestForm.name);
      uploadFormData.append('price', requestForm.price.replace(/\./g, ''));
      uploadFormData.append('category', requestForm.category || 'Uncategorized');
      if (requestForm.sku) uploadFormData.append('sku', requestForm.sku);
      uploadFormData.append('unit', requestForm.unit || 'pcs');
      uploadFormData.append('description', requestForm.description);

      // Append all 4 angle images
      for (const angle of ANGLES) {
        const file = imageFiles[angle.key];
        if (file) {
          uploadFormData.append(angle.fieldName, file);
        }
      }

      const response = await fetch(`${BACKEND_URL}/api/shared/products/requests`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
        },
        body: uploadFormData,
      });

      const result = await response.json();
      if (response.ok) {
        toast.success('🚀 Pengajuan produk baru berhasil dikirim ke Super Admin!');
        setTimeout(() => navigate('/inventory'), 1200);
      } else {
        throw new Error(result.message || 'Gagal mengirim pengajuan');
      }
    } catch (err: any) {
      toast.error('❌ Gagal: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Filter master catalog to show only products not already in branch inventory
  const filteredMasterCatalog = useMemo(() => {
    const branchProductIds = branchInventory.map(item => item.id);
    let list = masterCatalog.filter(p => !branchProductIds.includes(p.id));

    if (masterSearch.trim()) {
      const keyword = masterSearch.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(keyword) ||
        (p.sku && p.sku.toLowerCase().includes(keyword)) ||
        (p.category && p.category.toLowerCase().includes(keyword))
      );
    }
    return list;
  }, [masterCatalog, branchInventory, masterSearch]);

  const selectedProductDetails = useMemo(() => {
    return masterCatalog.find(p => p.id === selectedMasterId) || null;
  }, [masterCatalog, selectedMasterId]);

  return (
    <>
      {/* Camera Fullscreen Overlay */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-lg overflow-hidden rounded-[32px] bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h3 className="text-lg font-black text-gray-900">
                  {t('addInventory.takePhoto')} {activeCameraAngle ? t(`request.${activeCameraAngle}`) : ''}
                </h3>
                <p className="text-xs text-gray-400 font-bold mt-0.5">{t('addInventory.centerProduct')}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={closeCamera} className="rounded-xl h-10 w-10 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="relative bg-black aspect-[4/3] flex items-center justify-center overflow-hidden cursor-crosshair">
              <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full">
                {t('addInventory.tapToFocus')}
              </div>
            </div>
            <div className="p-6 flex items-center justify-center gap-6 bg-gray-50 border-t border-gray-100">
              <Button type="button" onClick={switchCamera} variant="outline"
                disabled={cameraDevices.length < 2}
                className="h-12 w-12 rounded-full border-gray-300 p-0 flex items-center justify-center hover:bg-gray-100 transition-transform hover:scale-105 active:scale-95 disabled:opacity-30"
                title="Ganti Kamera">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600"><path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/><path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5"/><circle cx="12" cy="12" r="3"/><path d="m18 22-3-3 3-3"/><path d="m6 2 3 3-3 3"/></svg>
              </Button>
              <Button type="button" onClick={takePhoto}
                className="h-16 w-16 rounded-full bg-indigo-600 hover:bg-indigo-700 p-0 shadow-lg shadow-indigo-600/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all border-none">
                <Camera className="h-7 w-7 text-white" />
              </Button>
              <div className="h-12 w-12" />
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </motion.div>
        </div>
      )}

      <PageTransition
        className="min-h-screen -m-6 bg-[#F8FAFC] p-6 lg:p-10 font-sans"
      >
        <div className="mx-auto max-w-4xl space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xl shadow-indigo-600/20">
                <Plus className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-gray-900">{t('addInventory.title')}</h1>
                <p className="text-sm font-medium text-gray-500 mt-0.5">{t('addInventory.subtitle')}</p>
              </div>
            </div>

            <Button
              onClick={() => navigate('/inventory')}
              variant="outline"
              className="h-11 rounded-xl border-gray-200 bg-white px-5 font-bold text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all shadow-sm"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('addInventory.backToStock')}
            </Button>
          </div>

          {/* Master Catalog Selection */}
          <div className="space-y-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                
                {/* Left Column: List of Master Products */}
                <div className="lg:col-span-3 space-y-4">
                  <Card className="rounded-[28px] border border-gray-100 shadow-sm bg-white overflow-hidden">
                    <div className="p-5 border-b border-gray-50">
                      <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          placeholder={t('addInventory.searchProduct')}
                          value={masterSearch}
                          onChange={e => setMasterSearch(e.target.value)}
                          className="pl-10 h-11 bg-gray-50/50 border-gray-200 rounded-xl text-sm font-medium focus:bg-white transition-all shadow-none"
                        />
                      </div>
                    </div>

                    <div className="p-2 max-h-[500px] overflow-y-auto divide-y divide-gray-50">
                      {loadingData ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('addInventory.syncingCatalog')}</p>
                        </div>
                      ) : filteredMasterCatalog.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                          <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 mb-3 border border-gray-100">
                            <Package className="w-7 h-7" />
                          </div>
                          <h4 className="font-bold text-gray-900 text-sm">{t('addInventory.noProductAvailable')}</h4>
                          <p className="text-gray-400 text-xs mt-1 max-w-xs leading-relaxed">
                            {t('addInventory.noProductDesc')}
                          </p>
                        </div>
                      ) : (
                        filteredMasterCatalog.map((product) => (
                          <div
                            key={product.id}
                            onClick={() => {
                              setSelectedMasterId(product.id);
                              setLinkForm(prev => ({
                                ...prev,
                                price: String(product.price || ''),
                              }));
                            }}
                            className={cn(
                              "p-4 rounded-2xl cursor-pointer flex items-center justify-between transition-all gap-4",
                              selectedMasterId === product.id
                                ? "bg-indigo-50/60 border border-indigo-100 shadow-sm"
                                : "hover:bg-gray-50/50 border border-transparent"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {product.image_url ? (
                                <img
                                  src={product.image_url}
                                  alt={product.name}
                                  className="w-11 h-11 rounded-xl object-cover border border-gray-200 shadow-sm bg-white"
                                />
                              ) : (
                                <div className="w-11 h-11 bg-indigo-50 rounded-xl flex items-center justify-center font-bold text-indigo-600 text-sm">
                                  {product.name.substring(0, 1).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-bold text-gray-900 truncate text-sm">{product.name}</p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                                  {product.category || 'Uncategorized'} • SKU: {product.sku || '-'}
                                </p>
                              </div>
                            </div>

                            <div className="text-right flex-shrink-0">
                              <p className="font-mono font-black text-gray-900 text-sm">Rp {product.price.toLocaleString()}</p>
                              {product.ai_label && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-emerald-600 mt-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                  <BadgeCheck className="w-3 h-3" />
                                  YOLO
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </Card>
                </div>

                {/* Right Column: Inventory Addition Config */}
                <div className="lg:col-span-2">
                  <Card className="rounded-[28px] border border-gray-100 shadow-md bg-white overflow-hidden sticky top-6">
                    <div className="p-6 bg-gradient-to-br from-indigo-50/40 to-indigo-100/10 border-b border-gray-100">
                      <h3 className="text-sm font-black text-indigo-950 uppercase tracking-widest">{t('addInventory.branchStockSettings')}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{t('addInventory.branchStockDesc')}</p>
                    </div>

                    <form onSubmit={handleLinkCatalogSubmit} className="p-6 space-y-5">
                      {selectedProductDetails ? (
                        <div className="space-y-4">
                          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/50 flex items-center gap-3">
                            {selectedProductDetails.image_url && (
                              <img src={selectedProductDetails.image_url} className="w-10 h-10 object-cover rounded-lg border bg-white" alt="" />
                            )}
                            <div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('addInventory.selectedProduct')}</p>
                              <h5 className="font-bold text-gray-900 text-sm truncate">{selectedProductDetails.name}</h5>
                            </div>
                          </div>

                          {/* Stock Field */}
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t('addInventory.initialStock')}</Label>
                            <Input
                              type="number"
                              placeholder="0"
                              value={linkForm.stock}
                              onChange={e => setLinkForm(prev => ({ ...prev, stock: e.target.value }))}
                              className="h-11 rounded-xl bg-gray-50/50 font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-100/60 border-gray-200"
                              required
                            />
                          </div>

                          {/* Branch Custom Price Field */}
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center justify-between">
                              <span>{t('addInventory.branchCustomPrice')}</span>
                              <span className="text-[9px] text-gray-400 lowercase font-medium">{t('addInventory.defaultMasterPrice')}</span>
                            </Label>
                            <Input
                              type="number"
                              placeholder={`${t('addInventory.masterDefault')}: Rp ${selectedProductDetails.price.toLocaleString()}`}
                              value={linkForm.price}
                              onChange={e => setLinkForm(prev => ({ ...prev, price: e.target.value }))}
                              className="h-11 rounded-xl bg-gray-50/50 font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-100/60 border-gray-200"
                            />
                          </div>

                          <Button
                            type="submit"
                            disabled={isSaving}
                            className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-600/10 font-bold gap-2 text-xs uppercase tracking-wider border-none mt-4 transition-all"
                          >
                            {isSaving ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Check className="w-4.5 h-4.5" />}
                            {isSaving ? t('addInventory.connecting') : t('addInventory.addToStore')}
                          </Button>
                        </div>
                      ) : (
                        <div className="py-12 text-center text-gray-400 space-y-3">
                          <Package className="w-12 h-12 mx-auto text-gray-300 stroke-[1.5]" />
                          <div className="px-4">
                            <p className="font-bold text-gray-800 text-sm">{t('addInventory.selectMasterFirst')}</p>
                            <p className="text-xs text-gray-400 mt-1 max-w-[200px] mx-auto leading-relaxed">
                              {t('addInventory.selectMasterDesc')}
                            </p>
                          </div>
                        </div>
                      )}
                    </form>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </div>
      </PageTransition>
    </>
  );
}
