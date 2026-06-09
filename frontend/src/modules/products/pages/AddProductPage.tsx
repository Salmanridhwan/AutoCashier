import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Package, Plus, Loader2, Upload, Trash2, Camera, X, SwitchCamera, Save } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Card } from '@/shared/components/ui/card';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { BACKEND_URL } from '@/shared/lib/api';
import { useLanguage } from '@/shared/context/LanguageContext';
import PageTransition from '@/shared/components/ui/PageTransition';

type AngleKey = 'front' | 'back' | 'left' | 'right';

const ANGLES: { key: AngleKey; labelId: string; labelEn: string; fieldName: string }[] = [
  { key: 'front', labelId: 'Depan', labelEn: 'Front', fieldName: 'imageFront' },
  { key: 'back', labelId: 'Belakang', labelEn: 'Back', fieldName: 'imageBack' },
  { key: 'left', labelId: 'Kiri', labelEn: 'Left', fieldName: 'imageLeft' },
  { key: 'right', labelId: 'Kanan', labelEn: 'Right', fieldName: 'imageRight' },
];

export default function AddProductPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t, language } = useLanguage();

  // Edit mode detection
  const editId = searchParams.get('edit');
  const editProduct = location.state?.product || null;
  const isEditMode = !!editId;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: editProduct?.name || '',
    category: editProduct?.category || '',
    price: editProduct?.price ? String(editProduct.price) : '',
  });

  const [imageFiles, setImageFiles] = useState<Record<AngleKey, File | null>>({
    front: null,
    back: null,
    left: null,
    right: null,
  });

  const [imagePreviews, setImagePreviews] = useState<Record<AngleKey, string | null>>({
    front: editProduct?.image_url || null,
    back: null,
    left: null,
    right: null,
  });

  const fileInputRefs: Record<AngleKey, React.RefObject<HTMLInputElement | null>> = {
    front: useRef<HTMLInputElement>(null),
    back: useRef<HTMLInputElement>(null),
    left: useRef<HTMLInputElement>(null),
    right: useRef<HTMLInputElement>(null),
  };

  // Product videos (extracted into many training frames on the server)
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [videoPreviews, setVideoPreviews] = useState<string[]>([]);
  const [existingVideos, setExistingVideos] = useState<{ url: string; filename?: string }[]>([]);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Camera states
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [activeCameraAngle, setActiveCameraAngle] = useState<AngleKey | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Fetch existing product images when in edit mode
  useEffect(() => {
    if (!isEditMode || !editId) return;
    (async () => {
      try {
        let token = '';
        const savedUser = localStorage.getItem('autocashier_user');
        if (savedUser) { try { token = JSON.parse(savedUser).token || ''; } catch {} }

        const res = await fetch(`${BACKEND_URL}/api/shared/products/${editId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (data.status === 'success' && data.data) {
          // Set front image from product.image_url
          if (data.data.image_url) {
            setImagePreviews(prev => ({ ...prev, front: data.data.image_url }));
          }
        }

        // Fetch all angle images from product_images table via Supabase
        const imgRes = await fetch(`${BACKEND_URL}/api/shared/products/${editId}/images`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        }).catch(() => null);

        if (imgRes && imgRes.ok) {
          const imgData = await imgRes.json();
          if (imgData.status === 'success' && imgData.data) {
            const validAngles = ANGLES.map(a => a.key as string);
            const previews: Record<string, string | null> = Object.fromEntries(validAngles.map(a => [a, null]));
            for (const img of imgData.data) {
              const angle = img.angle as string;
              // Only use original photos (skip mirror versions)
              if (validAngles.includes(angle) && img.image_url && !previews[angle] && !img.filename?.startsWith('mirror-')) {
                previews[angle] = img.image_url;
              }
            }
            setImagePreviews(prev => ({ ...prev, ...previews }));

            // Show existing product videos (if any)
            const videos = imgData.data
              .filter((i: any) => i.angle === 'video' && i.image_url)
              .map((i: any) => ({ url: i.image_url as string, filename: i.filename as string | undefined }));
            setExistingVideos(videos);
          }
        }
      } catch (err) {
        console.error('[EditProduct] Failed to load images:', err);
      }
    })();
  }, [isEditMode, editId]);

  const startStream = async (deviceId?: string) => {
    // Stop existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    const constraints: MediaStreamConstraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    streamRef.current = stream;
    trackRef.current = stream.getVideoTracks()[0] || null;
  };

  const openCamera = async (angle: AngleKey) => {
    setActiveCameraAngle(angle);
    setIsCameraOpen(true);
    setFocusPoint(null);
    try {
      // Enumerate available cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setCameraDevices(videoDevices);

      // Start with first device (or last used index)
      const idx = currentDeviceIndex < videoDevices.length ? currentDeviceIndex : 0;
      setCurrentDeviceIndex(idx);
      await startStream(videoDevices[idx]?.deviceId);
    } catch (err) {
      toast.error((language === 'id' ? 'Gagal membuka kamera: ' : 'Failed to open camera: ') + (err as Error).message);
      setIsCameraOpen(false);
      setActiveCameraAngle(null);
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      trackRef.current = null;
    }
    setIsCameraOpen(false);
    setActiveCameraAngle(null);
    setFocusPoint(null);
  };

  /** Switch to next available camera */
  const switchCamera = async () => {
    if (cameraDevices.length < 2) {
      toast.error(language === 'id' ? 'Hanya ada 1 kamera tersedia' : 'Only 1 camera is available');
      return;
    }
    const nextIndex = (currentDeviceIndex + 1) % cameraDevices.length;
    setCurrentDeviceIndex(nextIndex);
    try {
      await startStream(cameraDevices[nextIndex].deviceId);
    } catch (err) {
      toast.error((language === 'id' ? 'Gagal switch kamera: ' : 'Failed to switch camera: ') + (err as Error).message);
    }
  };

  /** Tap-to-focus: klik area video untuk fokus kamera ke titik tersebut */
  const handleTapToFocus = (e: React.MouseEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;  // 0..1
    const y = (e.clientY - rect.top) / rect.height;   // 0..1

    // Show focus indicator
    setFocusPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setTimeout(() => setFocusPoint(null), 1500);

    // Apply focus point via ImageCapture API or advanced constraints
    try {
      const capabilities = track.getCapabilities() as any;
      const constraints: any = {};

      // Check if focusMode is supported
      if (capabilities?.focusMode?.includes('manual') || capabilities?.focusMode?.includes('single-shot')) {
        constraints.focusMode = 'manual';
      }

      // Check if pointsOfInterest (focus point) is supported
      if (capabilities?.pointsOfInterest) {
        constraints.pointsOfInterest = [{ x, y }];
      }

      if (Object.keys(constraints).length > 0) {
        track.applyConstraints({ advanced: [constraints] } as any);
      }
    } catch (err) {
      // Tap-to-focus not supported on this device, visual indicator still shows
      console.log('[Camera] Tap-to-focus not supported:', err);
    }
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
    }
  };

  const handleRemoveImage = (angle: AngleKey) => {
    setImageFiles(prev => ({ ...prev, [angle]: null }));
    setImagePreviews(prev => ({ ...prev, [angle]: null }));
    const ref = fileInputRefs[angle];
    if (ref.current) ref.current.value = '';
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setVideoFiles(prev => [...prev, ...files]);
    setVideoPreviews(prev => [...prev, ...files.map(file => URL.createObjectURL(file))]);
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const handleRemoveNewVideo = (index: number) => {
    setVideoPreviews(prev => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
    setVideoFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadedCount = Object.values(imageFiles).filter(Boolean).length;
  const totalVideoCount = existingVideos.length + videoFiles.length;

  const autoLabel = useMemo(() => {
    if (!formData.name) return '';
    return formData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }, [formData.name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setError(null);

      if (!formData.name || !formData.price) {
        throw new Error(language === 'id' ? 'Nama dan Harga wajib diisi' : 'Name and Price are required');
      }

      let token = '';
      const savedUser = localStorage.getItem('autocashier_user');
      if (savedUser) {
        try { const parsed = JSON.parse(savedUser); if (parsed.token) token = parsed.token; } catch (e) {}
      }

      if (isEditMode && editId) {
        // ── EDIT MODE: Update product info + optional new images ──
        const rawPrice = formData.price.replace(/\./g, '');
        const hasNewImages = Object.values(imageFiles).some(f => f !== null) || videoFiles.length > 0;

        if (hasNewImages) {
          // Send as FormData with images
          const uploadFormData = new FormData();
          uploadFormData.append('name', formData.name.trim());
          uploadFormData.append('category', formData.category.trim());
          uploadFormData.append('price', rawPrice);
          uploadFormData.append('ai_label', autoLabel || '');

          for (const angle of ANGLES) {
            const file = imageFiles[angle.key];
            if (file) uploadFormData.append(angle.fieldName, file);
          }
          for (const file of videoFiles) {
            uploadFormData.append('video', file);
          }

          const res = await fetch(`${BACKEND_URL}/api/shared/products/${editId}`, {
            method: 'PUT',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: uploadFormData,
          });
          const result = await res.json();
          if (!res.ok || result.status !== 'success') throw new Error(result.error || `HTTP ${res.status}`);
        } else {
          // Send as JSON (no images)
          const res = await fetch(`${BACKEND_URL}/api/shared/products/${editId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({
              name: formData.name.trim(),
              category: formData.category.trim() || null,
              price: Number(rawPrice),
              ai_label: autoLabel || null,
            }),
          });
          const result = await res.json();
          if (!res.ok || result.status !== 'success') throw new Error(result.error || `HTTP ${res.status}`);
        }

        toast.success(language === 'id' ? '✅ Produk berhasil diperbarui!' : '✅ Product updated successfully!');
        setTimeout(() => navigate('/master-products'), 1000);
      } else {
        // ── CREATE MODE: New product ──
        if (uploadedCount < ANGLES.length) {
          throw new Error(language === 'id' ? `Mohon lengkapi ke-${ANGLES.length} foto sudut produk` : `Please complete all ${ANGLES.length} product angle photos`);
        }
        if (videoFiles.length === 0) {
          throw new Error(language === 'id' ? 'Mohon unggah minimal 1 video produk' : 'Please upload at least 1 product video');
        }

        const uploadFormData = new FormData();
        uploadFormData.append('name', formData.name);
        uploadFormData.append('category', formData.category.trim());
        const rawPrice = formData.price.replace(/\./g, '');
        uploadFormData.append('price', rawPrice);
        uploadFormData.append('ai_label', autoLabel);
        uploadFormData.append('stock', '0');

        for (const angle of ANGLES) {
          const file = imageFiles[angle.key];
          if (file) uploadFormData.append(angle.fieldName, file);
        }
        for (const file of videoFiles) {
          uploadFormData.append('video', file);
        }

        const response = await fetch(`${BACKEND_URL}/api/shared/products`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: uploadFormData,
        });
        const result = await response.json();

        if (response.ok && result.status === 'success') {
          toast.success(language === 'id' ? '✅ Produk berhasil ditambahkan!' : '✅ Product added successfully!');
          setTimeout(() => navigate('/master-products'), 1500);
        } else {
          throw new Error(result.error || (language === 'id' ? 'Gagal menambah produk' : 'Failed to add product'));
        }
      }
    } catch (err: any) {
      const errorMsg = err.message || (language === 'id' ? 'Terjadi kesalahan' : 'An error occurred');
      setError(errorMsg);
      toast.error(`❌ Error: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Camera Modal */}
      <AnimatePresence>
        {isCameraOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b p-4">
                <h3 className="text-lg font-bold text-gray-900">
                  {language === 'id' ? 'Ambil Foto ' : 'Take Photo '}
                  {(() => {
                    const activeAngle = ANGLES.find(a => a.key === activeCameraAngle);
                    return activeAngle ? (language === 'id' ? activeAngle.labelId : activeAngle.labelEn) : '';
                  })()}
                </h3>
                <Button type="button" variant="ghost" size="icon" onClick={closeCamera} className="rounded-full">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="relative bg-black aspect-[4/3] flex items-center justify-center cursor-crosshair" onClick={handleTapToFocus}>
                <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
                {/* Focus indicator */}
                <AnimatePresence>
                  {focusPoint && (
                    <motion.div
                      initial={{ opacity: 1, scale: 1.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.3 }}
                      className="absolute pointer-events-none"
                      style={{ left: focusPoint.x - 30, top: focusPoint.y - 30 }}
                    >
                      <div className="w-[60px] h-[60px] border-2 border-yellow-400 rounded-lg shadow-[0_0_10px_rgba(250,204,21,0.5)]">
                        <div className="absolute top-1/2 left-0 w-2 h-[2px] bg-yellow-400 -translate-y-1/2" />
                        <div className="absolute top-1/2 right-0 w-2 h-[2px] bg-yellow-400 -translate-y-1/2" />
                        <div className="absolute left-1/2 top-0 w-[2px] h-2 bg-yellow-400 -translate-x-1/2" />
                        <div className="absolute left-1/2 bottom-0 w-[2px] h-2 bg-yellow-400 -translate-x-1/2" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {/* Tap hint */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full">
                  {language === 'id' ? 'Ketuk untuk fokus' : 'Tap to focus'}
                </div>
              </div>
              <div className="p-6 flex items-center justify-center gap-6 bg-gray-50">
                {/* Switch camera button */}
                <Button 
                  type="button"
                  onClick={switchCamera}
                  variant="outline"
                  className="h-12 w-12 rounded-full border-gray-300 p-0 flex items-center justify-center hover:bg-gray-100 transition-transform hover:scale-105 active:scale-95"
                  title={language === 'id' ? 'Ganti Kamera' : 'Switch Camera'}
                >
                  <SwitchCamera className="h-5 w-5 text-gray-600" />
                </Button>

                {/* Capture button */}
                <Button 
                  type="button"
                  onClick={takePhoto} 
                  className="h-16 w-16 rounded-full bg-indigo-600 hover:bg-indigo-700 p-0 shadow-[0_0_0_4px_rgba(79,70,229,0.2)] flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
                >
                  <Camera className="h-7 w-7 text-white" />
                </Button>

                {/* Spacer for symmetry */}
                <div className="h-12 w-12" />
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <PageTransition
        className="min-h-screen -m-6 bg-[#F8FAFC] p-6 lg:p-10 font-sans"
      >
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xl shadow-indigo-600/20">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-gray-900">
                {isEditMode 
                  ? (language === 'id' ? 'Edit Produk' : 'Edit Product') 
                  : (language === 'id' ? 'Registrasi Produk' : 'Register Product')}
              </h1>
              <p className="text-sm font-medium text-gray-500 mt-1">
                {isEditMode 
                  ? (language === 'id' ? 'Perbarui informasi produk Anda.' : 'Update your product information.') 
                  : (language === 'id' ? `Masukkan nama, harga, dan ${ANGLES.length} foto produk Anda.` : `Enter your product name, price, and ${ANGLES.length} photos.`)}
              </p>
            </div>
          </div>
          
          <Button
            onClick={() => navigate('/master-products')}
            variant="outline"
            className="h-10 rounded-xl border-gray-200 bg-white px-4 font-bold text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all shadow-sm"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back')}
          </Button>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-600 shadow-sm flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center">
                <X className="w-4 h-4" />
              </div>
              {error}
            </div>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="overflow-hidden rounded-[32px] border-none bg-white shadow-[0_8px_40px_rgba(0,0,0,0.06)] p-8">
            <div className="space-y-2 mb-8">
              <h3 className="text-lg font-black text-gray-900">{language === 'id' ? 'Informasi Dasar' : 'Basic Information'}</h3>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{language === 'id' ? 'Detail Utama' : 'Main Details'}</p>
            </div>

            <div className="grid gap-8 sm:grid-cols-2">
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  {t('inventory.productName')} *
                </Label>
                <Input
                  placeholder={t('request.namePlaceholder')}
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="h-14 rounded-2xl bg-gray-50/50 font-bold text-base focus:bg-white focus:ring-2 focus:ring-indigo-100 border-gray-200 shadow-sm transition-all"
                  required
                />
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  {t('common.category')}
                </Label>
                <Input
                  placeholder={language === 'id' ? 'Misal: Minuman, Makanan, Snack...' : 'e.g. Beverages, Food, Snacks...'}
                  value={formData.category}
                  onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="h-14 rounded-2xl bg-gray-50/50 font-bold text-base focus:bg-white focus:ring-2 focus:ring-indigo-100 border-gray-200 shadow-sm transition-all"
                />
              </div>
            </div>

            <div className="mt-6">
              <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                {t('common.price')} (Rp) *
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={formData.price}
                onChange={e => {
                  const rawValue = e.target.value.replace(/[^0-9]/g, '');
                  const formatted = rawValue ? parseInt(rawValue, 10).toLocaleString('id-ID').replace(/,/g, '.') : '';
                  setFormData(prev => ({ ...prev, price: formatted }));
                }}
                className="mt-3 h-14 rounded-2xl bg-gray-50/50 font-bold text-base focus:bg-white focus:ring-2 focus:ring-indigo-100 border-gray-200 shadow-sm transition-all"
                required
              />
            </div>

            {autoLabel && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 flex items-center gap-3 p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100"
              >
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600/70">
                    {language === 'id' ? 'AI Label Terbuat Otomatis' : 'AI Label Generated Automatically'}
                  </p>
                  <p className="text-sm font-bold text-emerald-700 font-mono">{autoLabel}</p>
                </div>
              </motion.div>
            )}
          </Card>

          <Card className="overflow-hidden rounded-[32px] border-none bg-white shadow-[0_8px_40px_rgba(0,0,0,0.06)] p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div className="space-y-2">
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <Camera className="h-5 w-5 text-indigo-600" />
                  {language === 'id' ? 'Foto 4 Sudut ' : '4-Angle Photos '}
                  {isEditMode ? (language === 'id' ? '(Opsional)' : '(Optional)') : (language === 'id' ? '(Wajib)' : '(Required)')}
                </h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  {language === 'id' ? 'Untuk identifikasi AI Yolo-Vision' : 'For AI Yolo-Vision identification'}
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-indigo-50 border border-indigo-100 px-4 py-2">
                <div className={`h-2.5 w-2.5 rounded-full shadow-sm ${uploadedCount === ANGLES.length ? 'bg-emerald-500 shadow-emerald-500/50' : uploadedCount > 0 ? 'bg-amber-500 shadow-amber-500/50' : 'bg-gray-300'}`} />
                <span className="text-xs font-black text-indigo-600">
                  {uploadedCount}
                  {language === 'id' ? `/${ANGLES.length} Foto Lengkap` : `/${ANGLES.length} Photos Complete`}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {ANGLES.map(({ key, labelId, labelEn }) => (
                <div key={key} className="space-y-3">
                  <div
                     className={`relative aspect-square overflow-hidden rounded-[24px] border-2 transition-all group ${
                      imagePreviews[key]
                        ? 'border-indigo-600 shadow-xl shadow-indigo-600/10'
                        : 'border-dashed border-gray-200 bg-gray-50 hover:bg-indigo-50/50 hover:border-indigo-300 cursor-pointer'
                    }`}
                    onClick={() => {
                      if (!imagePreviews[key]) fileInputRefs[key].current?.click();
                    }}
                  >
                    {imagePreviews[key] ? (
                      <>
                        <img src={imagePreviews[key]!} alt={`${language === 'id' ? labelId : labelEn} preview`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity duration-300 backdrop-blur-[2px]">
                          <Button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveImage(key);
                            }}
                            size="icon"
                            variant="destructive"
                            className="h-12 w-12 rounded-full shadow-xl"
                          >
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        </div>
                        {/* Angle badge */}
                        <div className="absolute top-3 left-3 rounded-lg bg-indigo-600/90 backdrop-blur-md px-3 py-1.5 shadow-sm border border-indigo-400/30">
                          <span className="text-[10px] font-black uppercase tracking-widest text-white">
                            {language === 'id' ? labelId : labelEn}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center text-gray-400 gap-3 p-4 relative">
                        <span className="text-xs font-black uppercase tracking-widest text-center leading-tight">
                          {language === 'id' ? labelId : labelEn}
                        </span>
                        
                        <div className="flex gap-3 mt-4">
                          <Button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); fileInputRefs[key].current?.click(); }}
                            variant="outline"
                            size="icon"
                            className="h-12 w-12 rounded-2xl border-gray-200 bg-white shadow-sm hover:bg-gray-50 hover:text-indigo-600 hover:border-indigo-200 transition-all hover:scale-105 hover:-rotate-6"
                            title={language === 'id' ? 'Unggah Berkas' : 'Upload File'}
                          >
                            <Upload className="h-5 w-5" />
                          </Button>
                          
                          <Button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openCamera(key); }}
                            variant="outline"
                            size="icon"
                            className="h-12 w-12 rounded-2xl border-gray-200 bg-white shadow-sm hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all hover:scale-105 hover:rotate-6"
                            title={language === 'id' ? 'Buka Kamera' : 'Open Camera'}
                          >
                            <Camera className="h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    ref={fileInputRefs[key]}
                    accept="image/*"
                    onChange={(e) => handleImageSelect(key, e)}
                    className="hidden"
                  />
                </div>
              ))}
            </div>

            {/* ── Product Video (extracted into many training frames) ── */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                  <Camera className="h-5 w-5 text-indigo-600" />
                  {language === 'id' ? 'Video Produk' : 'Product Videos'}
                </h3>
                <span className={`text-xs font-bold ${totalVideoCount > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {totalVideoCount > 0
                    ? (language === 'id' ? `${totalVideoCount} video siap` : `${totalVideoCount} videos ready`)
                    : (language === 'id' ? 'Belum ada' : 'None')}
                </span>
              </div>
              {totalVideoCount > 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {existingVideos.map((video, index) => (
                    <div key={`${video.url}-${index}`} className="overflow-hidden rounded-[24px] border-2 border-gray-200 bg-gray-50 shadow-sm">
                      <video src={video.url} controls className="w-full max-h-56 bg-black object-contain" />
                      <div className="px-4 py-3 text-xs font-bold text-gray-500">
                        {language === 'id' ? 'Video tersimpan' : 'Saved video'} {index + 1}
                        {video.filename ? ` - ${video.filename}` : ''}
                      </div>
                    </div>
                  ))}
                  {videoPreviews.map((preview, index) => (
                    <div key={preview} className="relative overflow-hidden rounded-[24px] border-2 border-indigo-600 shadow-xl shadow-indigo-600/10">
                      <video src={preview} controls className="w-full max-h-56 bg-black object-contain" />
                      <Button
                        type="button"
                        onClick={() => handleRemoveNewVideo(index)}
                        size="icon"
                        variant="destructive"
                        className="absolute top-3 right-3 h-10 w-10 rounded-full shadow-xl"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <div className="px-4 py-3 text-xs font-bold text-indigo-600">
                        {language === 'id' ? 'Video baru' : 'New video'} {index + 1}: {videoFiles[index]?.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div
                className="mt-4 flex flex-col items-center justify-center gap-3 rounded-[24px] border-2 border-dashed border-gray-200 bg-gray-50 p-10 cursor-pointer hover:bg-indigo-50/50 hover:border-indigo-300 transition-all"
                onClick={() => videoInputRef.current?.click()}
              >
                <Upload className="h-7 w-7 text-gray-400" />
                <p className="text-sm font-bold text-gray-500">
                  {language === 'id' ? 'Unggah 1 atau beberapa video pendek (~15-20 dtk, produk 60-80% frame)' : 'Upload one or more short videos (~15-20s, product fills 60-80% of the frame)'}
                </p>
                <p className="text-xs text-gray-400">
                  {language === 'id' ? 'Sistem mengekstrak puluhan foto latih dari setiap video' : 'The system extracts dozens of training photos from each video'}
                </p>
              </div>
              <input
                type="file"
                ref={videoInputRef}
                accept="video/*"
                multiple
                onChange={handleVideoSelect}
                className="hidden"
              />
            </div>

            <div className="mt-8 rounded-2xl bg-indigo-50/50 border border-indigo-100 p-5 flex gap-4 items-start">
               <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0 shadow-sm text-indigo-600 border border-indigo-100">
                 <Package className="w-5 h-5" />
               </div>
               <div>
                  <h4 className="text-sm font-black text-indigo-900 mb-1">
                    {language === 'id' ? 'Panduan Foto' : 'Photo Guide'}
                  </h4>
                  <p className="text-xs font-semibold text-indigo-700/80 leading-relaxed">
                    {language === 'id'
                      ? `Pastikan produk difoto dalam kondisi terang tanpa objek lain di sekitarnya. Ke-${ANGLES.length} sudut (Depan, Belakang, Kiri, Kanan) + minimal 1 video wajib diisi agar sistem AI dapat mengenali produk dengan akurat saat checkout.`
                      : `Ensure the product is photographed in bright conditions with no other objects around it. All ${ANGLES.length} angles (Front, Back, Left, Right) + at least 1 video are required for the AI system to recognize the product accurately during checkout.`}
                  </p>
               </div>
            </div>
          </Card>

          <div className="pt-4 pb-12">
            <Button
              type="submit"
              disabled={isLoading || !formData.name || !formData.price || (!isEditMode && (uploadedCount < ANGLES.length || videoFiles.length === 0))}
              className="h-16 w-full rounded-2xl bg-indigo-600 text-base font-black text-white shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-60 transition-all"
            >
              {isLoading ? (
                <Loader2 className="h-6 w-6 animate-spin mr-3" />
              ) : isEditMode ? (
                <Save className="h-6 w-6 mr-3" />
              ) : (
                <Plus className="h-6 w-6 mr-3" />
              )}
              {isLoading 
                ? (isEditMode 
                  ? (language === 'id' ? 'Menyimpan...' : 'Saving...') 
                  : (language === 'id' ? 'Menyimpan & Mengunggah Media...' : 'Saving & Uploading Media...')) 
                : isEditMode 
                  ? (language === 'id' ? 'Simpan Perubahan' : 'Save Changes') 
                  : (language === 'id' ? 'Simpan Produk Baru' : 'Save New Product')}
            </Button>
          </div>
        </form>
      </div>
    </PageTransition>
    </>
  );
}
