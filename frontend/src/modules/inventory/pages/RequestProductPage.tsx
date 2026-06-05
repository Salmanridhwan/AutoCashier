import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Send, Loader2, Upload, Trash2, Camera, X, SwitchCamera, MessageSquare } from 'lucide-react';
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

const ANGLES: { key: AngleKey; labelKey: string; fieldName: string }[] = [
  { key: 'front', labelKey: 'request.front', fieldName: 'imageFront' },
  { key: 'back', labelKey: 'request.backAngle', fieldName: 'imageBack' },
  { key: 'left', labelKey: 'request.left', fieldName: 'imageLeft' },
  { key: 'right', labelKey: 'request.right', fieldName: 'imageRight' },
];

function getToken(): string {
  try { return JSON.parse(localStorage.getItem('autocashier_user') || '{}')?.token || ''; } catch { return ''; }
}

export default function RequestProductPage() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({ name: '', price: '', category: '', description: '' });

  const [imageFiles, setImageFiles] = useState<Record<AngleKey, File | null>>({ front: null, back: null, left: null, right: null });
  const [imagePreviews, setImagePreviews] = useState<Record<AngleKey, string | null>>({ front: null, back: null, left: null, right: null });
  const fileInputRefs = { front: useRef<HTMLInputElement>(null), back: useRef<HTMLInputElement>(null), left: useRef<HTMLInputElement>(null), right: useRef<HTMLInputElement>(null) };

  // Camera states
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [activeCameraAngle, setActiveCameraAngle] = useState<AngleKey | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => { return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); }; }, []);

  const startStream = async (deviceId?: string) => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } } : { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
    if (videoRef.current) videoRef.current.srcObject = stream;
    streamRef.current = stream;
  };

  const openCamera = async (angle: AngleKey) => {
    setActiveCameraAngle(angle); setIsCameraOpen(true);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const vd = devices.filter(d => d.kind === 'videoinput');
      setCameraDevices(vd);
      await startStream(vd[currentDeviceIndex]?.deviceId);
    } catch (err) { toast.error('Gagal membuka kamera'); setIsCameraOpen(false); setActiveCameraAngle(null); }
  };

  const closeCamera = () => { if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; } setIsCameraOpen(false); setActiveCameraAngle(null); };

  const switchCamera = async () => {
    if (cameraDevices.length < 2) return;
    const next = (currentDeviceIndex + 1) % cameraDevices.length;
    setCurrentDeviceIndex(next);
    try { await startStream(cameraDevices[next].deviceId); } catch {}
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current && activeCameraAngle) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        canvasRef.current.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `camera_${activeCameraAngle}.jpg`, { type: 'image/jpeg' });
            setImageFiles(p => ({ ...p, [activeCameraAngle!]: file }));
            setImagePreviews(p => ({ ...p, [activeCameraAngle!]: URL.createObjectURL(blob) }));
            closeCamera();
          }
        }, 'image/jpeg', 0.8);
      }
    }
  };

  const handleImageSelect = (angle: AngleKey, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setImageFiles(p => ({ ...p, [angle]: file })); const r = new FileReader(); r.onloadend = () => setImagePreviews(p => ({ ...p, [angle]: r.result as string })); r.readAsDataURL(file); }
  };

  const handleRemoveImage = (angle: AngleKey) => { setImageFiles(p => ({ ...p, [angle]: null })); setImagePreviews(p => ({ ...p, [angle]: null })); };

  const uploadedCount = Object.values(imageFiles).filter(Boolean).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true); setError(null);
      if (!formData.name || !formData.price) {
        throw new Error(
          language === 'id' ? 'Nama dan Harga wajib diisi' : 'Name and Price are required'
        );
      }
      if (uploadedCount < 4) {
        throw new Error(
          language === 'id' ? 'Mohon lengkapi ke-4 foto sudut produk' : 'Please upload photos from all 4 angles'
        );
      }

      const fd = new FormData();
      fd.append('name', formData.name);
      fd.append('price', formData.price.replace(/\./g, ''));
      fd.append('category', formData.category || 'Uncategorized');
      fd.append('description', formData.description);
      fd.append('unit', 'pcs');
      for (const angle of ANGLES) { const file = imageFiles[angle.key]; if (file) fd.append(angle.fieldName, file); }

      const res = await fetch(`${BACKEND_URL}/api/shared/products/requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const result = await res.json();
      if (res.ok && result.status === 'success') {
        toast.success(t('request.successSent'));
        setTimeout(() => navigate('/inventory'), 1200);
      } else throw new Error(result.message || 'Gagal mengirim pengajuan');
    } catch (err: any) { setError(err.message); toast.error(`❌ ${err.message}`); }
    finally { setIsLoading(false); }
  };

  return (
    <>
      {/* Camera Modal */}
      <AnimatePresence>
        {isCameraOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b p-4">
                <h3 className="text-lg font-bold text-gray-900">{t('addInventory.takePhoto')} {activeCameraAngle ? t(`request.${activeCameraAngle}`) : ''}</h3>
                <Button type="button" variant="ghost" size="icon" onClick={closeCamera} className="rounded-full"><X className="h-5 w-5" /></Button>
              </div>
              <div className="relative bg-black aspect-[4/3]">
                <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full">{t('addInventory.tapToFocus')}</div>
              </div>
              <div className="p-6 flex items-center justify-center gap-6 bg-gray-50">
                <Button type="button" onClick={switchCamera} disabled={cameraDevices.length < 2} variant="outline" className="h-12 w-12 rounded-full border-gray-300 p-0 disabled:opacity-30"><SwitchCamera className="h-5 w-5 text-gray-600" /></Button>
                <Button type="button" onClick={takePhoto} className="h-16 w-16 rounded-full bg-indigo-600 hover:bg-indigo-700 p-0 shadow-[0_0_0_4px_rgba(79,70,229,0.2)]"><Camera className="h-7 w-7 text-white" /></Button>
                <div className="h-12 w-12" />
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <PageTransition className="min-h-screen -m-6 bg-[#F8FAFC] p-6 lg:p-10 font-sans">
        <div className="mx-auto max-w-4xl space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-600 text-white shadow-xl shadow-amber-600/20">
                <Send className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-gray-900">{t('request.title')}</h1>
                <p className="text-sm font-medium text-gray-500 mt-1">{t('request.subtitle')}</p>
              </div>
            </div>
            <Button onClick={() => navigate('/inventory')} variant="outline" className="h-10 rounded-xl border-gray-200 bg-white px-4 font-bold text-gray-600">
              <ArrowLeft className="mr-2 h-4 w-4" /> {t('request.back')}
            </Button>
          </div>

          {/* Info banner */}
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <MessageSquare className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-900">{t('request.needApproval')}</p>
              <p className="text-xs text-amber-700 mt-0.5">{t('request.approvalDesc')}</p>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-600 flex items-center gap-3">
              <X className="w-4 h-4" /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Informasi Produk */}
            <Card className="overflow-hidden rounded-[32px] border-none bg-white shadow-[0_8px_40px_rgba(0,0,0,0.06)] p-8">
              <div className="space-y-2 mb-8">
                <h3 className="text-lg font-black text-gray-900">{t('request.productInfo')}</h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('request.productInfoDesc')}</p>
              </div>
              <div className="grid gap-8 sm:grid-cols-2">
                <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('request.productName')}</Label>
                  <Input placeholder={t('request.namePlaceholder')} value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                    className="h-14 rounded-2xl bg-gray-50/50 font-bold text-base focus:bg-white focus:ring-2 focus:ring-indigo-100 border-gray-200" required />
                </div>
                <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('request.proposedPrice')}</Label>
                  <Input type="text" inputMode="numeric" placeholder="0" value={formData.price}
                    onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); setFormData(p => ({ ...p, price: raw ? parseInt(raw).toLocaleString('id-ID').replace(/,/g, '.') : '' })); }}
                    className="h-14 rounded-2xl bg-gray-50/50 font-bold text-base focus:bg-white focus:ring-2 focus:ring-indigo-100 border-gray-200" required />
                </div>
                <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('request.category')}</Label>
                  <Input placeholder={t('request.categoryPlaceholder')} value={formData.category} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}
                    className="h-14 rounded-2xl bg-gray-50/50 font-bold text-base focus:bg-white focus:ring-2 focus:ring-indigo-100 border-gray-200" />
                </div>
                <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('request.reason')}</Label>
                  <Input placeholder={t('request.reasonPlaceholder')} value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                    className="h-14 rounded-2xl bg-gray-50/50 font-bold text-base focus:bg-white focus:ring-2 focus:ring-indigo-100 border-gray-200" required />
                </div>
              </div>
            </Card>

            {/* Foto 4 Sudut */}
            <Card className="overflow-hidden rounded-[32px] border-none bg-white shadow-[0_8px_40px_rgba(0,0,0,0.06)] p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div className="space-y-2">
                  <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                    <Camera className="h-5 w-5 text-indigo-600" />
                    {t('request.photos4Angles')}
                  </h3>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('request.photosDesc')}</p>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-indigo-50 border border-indigo-100 px-4 py-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${uploadedCount === 4 ? 'bg-emerald-500' : uploadedCount > 0 ? 'bg-amber-500' : 'bg-gray-300'}`} />
                  <span className="text-xs font-black text-indigo-600">{uploadedCount}/4 {t('request.photos')}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                {ANGLES.map(({ key, labelKey }) => (
                  <div key={key} className="space-y-3">
                    <div className={`relative aspect-square overflow-hidden rounded-[24px] border-2 transition-all group ${
                      imagePreviews[key] ? 'border-indigo-600 shadow-xl shadow-indigo-600/10' : 'border-dashed border-gray-200 bg-gray-50 hover:bg-indigo-50/50 hover:border-indigo-300 cursor-pointer'
                    }`} onClick={() => { if (!imagePreviews[key]) fileInputRefs[key].current?.click(); }}>
                      {imagePreviews[key] ? (
                        <>
                          <img src={imagePreviews[key]!} alt={t(labelKey)} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
                            <Button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveImage(key); }} size="icon" variant="destructive" className="h-12 w-12 rounded-full shadow-xl">
                              <Trash2 className="h-5 w-5" />
                            </Button>
                          </div>
                          <div className="absolute top-3 left-3 rounded-lg bg-indigo-600/90 px-3 py-1.5">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white">{t(labelKey)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center text-gray-400 gap-3 p-4">
                          <span className="text-xs font-black uppercase tracking-widest">{t(labelKey)}</span>
                          <div className="flex gap-3 mt-2">
                            <Button type="button" onClick={(e) => { e.stopPropagation(); fileInputRefs[key].current?.click(); }} variant="outline" size="icon"
                              className="h-12 w-12 rounded-2xl border-gray-200 bg-white shadow-sm hover:bg-gray-50 hover:text-indigo-600"><Upload className="h-5 w-5" /></Button>
                            <Button type="button" onClick={(e) => { e.stopPropagation(); openCamera(key); }} variant="outline" size="icon"
                              className="h-12 w-12 rounded-2xl border-gray-200 bg-white shadow-sm hover:bg-indigo-50 hover:text-indigo-600"><Camera className="h-5 w-5" /></Button>
                          </div>
                        </div>
                      )}
                    </div>
                    <input type="file" ref={fileInputRefs[key]} accept="image/*" onChange={(e) => handleImageSelect(key, e)} className="hidden" />
                  </div>
                ))}
              </div>
            </Card>

            {/* Submit */}
            <div className="pt-4 pb-12">
              <Button type="submit" disabled={isLoading || !formData.name || !formData.price || uploadedCount < 4}
                className="h-16 w-full rounded-2xl bg-amber-600 text-base font-black text-white shadow-xl shadow-amber-600/20 hover:bg-amber-700 disabled:opacity-60 transition-all">
                {isLoading ? <Loader2 className="h-6 w-6 animate-spin mr-3" /> : <Send className="h-6 w-6 mr-3" />}
                {isLoading ? t('request.sending') : t('request.sendToAdmin')}
              </Button>
            </div>
          </form>
        </div>
      </PageTransition>
    </>
  );
}
