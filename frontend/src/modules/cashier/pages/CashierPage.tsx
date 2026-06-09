import * as React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/shared/context/AuthContext';
import { useLocation } from '@/shared/context/LocationContext';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import {
  Camera, CameraOff, Plus, Minus, Trash2, Search, ShoppingCart, Loader2,
  CheckCircle2, ArrowLeft, ArrowRight, User, Tag, Coins, QrCode,
  LogOut, Sparkles, RefreshCw, X, ScanLine, ChevronLeft, ChevronRight,
  SwitchCamera,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CartItem { id: string; name: string; price: number; quantity: number; ai_class_name: string; image_url?: string | null; }
interface MemberInfo { id: string; name: string; phone: string; }
interface Promo {
  id: string; title?: string; code?: string;
  discount_type: string; discount_value: number; max_discount?: number | null; min_purchase?: number | null;
}
interface SuccessOverlayData {
  product: { id: string; name: string; price: number; ai_class_name: string; image_url?: string | null };
  confidence: number;
  scanCropUrl?: string | null;
}
interface ProductImage {
  angle?: string | null;
  image_url?: string | null;
  filename?: string | null;
}
type Step = 'scan' | 'cart' | 'payment' | 'receipt';

const RECEIPT_SECONDS = 60;
const SUCCESS_OVERLAY_SECONDS = 2;
const MIN_ACCEPT_CONFIDENCE = 0.70;
const SCANNER_ROI_OUTPUT_SIZE = 640;
const rp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

const ProductThumbnail = ({
  imageUrl,
  name,
  className,
}: {
  imageUrl?: string | null;
  name: string;
  className: string;
}) => {
  const [imageFailed, setImageFailed] = React.useState(false);

  React.useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  if (!imageUrl || imageFailed) {
    return (
      <div
        aria-label={`Foto depan ${name} tidak tersedia`}
        className={`${className} flex shrink-0 items-center justify-center bg-indigo-50 font-bold text-indigo-500`}
      >
        {name.trim().charAt(0).toUpperCase() || '?'}
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={`Foto depan ${name}`}
      className={`${className} shrink-0 object-contain p-1`}
      onError={() => setImageFailed(true)}
    />
  );
};

const normalizeBbox = (bbox: unknown): number[] | null => {
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some(value => !Number.isFinite(Number(value)))) {
    return null;
  }
  const [rawX1, rawY1, rawX2, rawY2] = bbox.map(value => Math.max(0, Math.min(1, Number(value))));
  return rawX2 > rawX1 && rawY2 > rawY1 ? [rawX1, rawY1, rawX2, rawY2] : null;
};

const createCroppedPreview = (sourceCanvas: HTMLCanvasElement | null, bbox: unknown) => {
  const normalizedBbox = normalizeBbox(bbox);
  if (!sourceCanvas || !normalizedBbox || !sourceCanvas.width || !sourceCanvas.height) return null;

  const [x1, y1, x2, y2] = normalizedBbox;
  const sx = Math.round(x1 * sourceCanvas.width);
  const sy = Math.round(y1 * sourceCanvas.height);
  const sw = Math.max(1, Math.round((x2 - x1) * sourceCanvas.width));
  const sh = Math.max(1, Math.round((y2 - y1) * sourceCanvas.height));
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = sw;
  previewCanvas.height = sh;

  const previewContext = previewCanvas.getContext('2d');
  if (!previewContext) return null;
  previewContext.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return previewCanvas.toDataURL('image/jpeg', 0.82);
};

const getVideoSourceRoi = (
  video: HTMLVideoElement,
  wrap: HTMLDivElement,
  roi: HTMLDivElement,
) => {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = wrap.clientWidth;
  const ch = wrap.clientHeight;
  if (!vw || !vh || !cw || !ch) return null;

  const wrapRect = wrap.getBoundingClientRect();
  const roiRect = roi.getBoundingClientRect();
  const scale = Math.max(cw / vw, ch / vh);
  const offX = (vw * scale - cw) / 2;
  const offY = (vh * scale - ch) / 2;
  const roiLeft = roiRect.left - wrapRect.left;
  const roiTop = roiRect.top - wrapRect.top;
  const sx = Math.max(0, (roiLeft + offX) / scale);
  const sy = Math.max(0, (roiTop + offY) / scale);
  const sw = Math.min(vw - sx, roiRect.width / scale);
  const sh = Math.min(vh - sy, roiRect.height / scale);

  return sw > 1 && sh > 1 ? { sx, sy, sw, sh } : null;
};

export default function CashierPage() {
  const { user, logout } = useAuth();
  const { currentLocation, locationName } = useLocation();

  const [step, setStep] = React.useState<Step>('scan');

  // POS state
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [isScanCartOpen, setIsScanCartOpen] = React.useState(true);
  const [member, setMember] = React.useState<MemberInfo | null>(null);
  const [memberPhone, setMemberPhone] = React.useState('');
  const [isCheckingMember, setIsCheckingMember] = React.useState(false);

  // Promo & points
  const [promos, setPromos] = React.useState<Promo[]>([]);
  const [selectedPromoId, setSelectedPromoId] = React.useState<string | null>(null);
  const [pointsBalance, setPointsBalance] = React.useState(0);
  const [pointsToUse, setPointsToUse] = React.useState(0);

  // Checkout / receipt
  const [isCheckingOut, setIsCheckingOut] = React.useState(false);
  const [receipt, setReceipt] = React.useState<any>(null);
  const [countdown, setCountdown] = React.useState(RECEIPT_SECONDS);

  // Camera & scanner
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const successAudioContextRef = React.useRef<AudioContext | null>(null);
  const isProcessingFrame = React.useRef(false);
  const [cameraActive, setCameraActive] = React.useState(false);
  const [cameraReady, setCameraReady] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [isDetecting, setIsDetecting] = React.useState(false);
  const [isBackgroundFrame, setIsBackgroundFrame] = React.useState(true);
  const [availableCameras, setAvailableCameras] = React.useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = React.useState('');
  const [isSwitchingCamera, setIsSwitchingCamera] = React.useState(false);
  const [scanStatus, setScanStatus] = React.useState<'SCANNING' | 'ACCEPT' | 'REJECT' | 'STANDBY'>('STANDBY');
  const [feedback, setFeedback] = React.useState('');
  const [successOverlay, setSuccessOverlay] = React.useState<SuccessOverlayData | null>(null);
  const [successCountdown, setSuccessCountdown] = React.useState(SUCCESS_OVERLAY_SECONDS);
  const frontImageCacheRef = React.useRef<Map<string, string | null>>(new Map());

  // Animated detection box normalized to the fixed scanner ROI.
  const [detBox, setDetBox] = React.useState<number[] | null>(null);
  const [detKind, setDetKind] = React.useState<'ACCEPT' | 'CONFIRM'>('ACCEPT');
  const [detLabel, setDetLabel] = React.useState('');
  const camWrapRef = React.useRef<HTMLDivElement>(null);
  const roiFrameRef = React.useRef<HTMLDivElement>(null);
  const boxTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const getHeaders = (multipart = false) => {
    const headers: Record<string, string> = {};
    if (!multipart) headers['Content-Type'] = 'application/json';
    const saved = localStorage.getItem('autocashier_user');
    if (saved) { try { const p = JSON.parse(saved); if (p.token) headers['Authorization'] = `Bearer ${p.token}`; } catch {} }
    return headers;
  };

  // ─── Camera ───────────────────────────────────────────────────────────────────
  const getCameras = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const vids = devices.filter(d => d.kind === 'videoinput');
      setAvailableCameras(vids);
      if (vids.length > 0) setSelectedCameraId(current => current || vids[0].deviceId);
    } catch (e) { console.error(e); }
  };

  const startCamera = async (deviceId?: string) => {
    try {
      setCameraError(null);
      setIsSwitchingCamera(true);
      setCameraActive(false);
      setCameraReady(false);
      setScanStatus('STANDBY');
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      let constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      };
      let stream: MediaStream;
      try { stream = await navigator.mediaDevices.getUserMedia(constraints); }
      catch { stream = await navigator.mediaDevices.getUserMedia({ video: true }); }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      const activeDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId;
      if (activeDeviceId) setSelectedCameraId(activeDeviceId);
      setCameraActive(true);
      getCameras();
    } catch (err: any) {
      setCameraError(`Gagal mengakses kamera: ${err.message || err.name || 'beri izin kamera'}`);
      setCameraActive(false);
      setCameraReady(false);
      setScanStatus('STANDBY');
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setCameraActive(false);
    setCameraReady(false);
    setIsDetecting(false);
    setIsSwitchingCamera(false);
    setScanStatus('STANDBY');
  };

  const toggleCamera = () => {
    if (availableCameras.length < 2 || isSwitchingCamera || !cameraReady) return;
    const currentIndex = availableCameras.findIndex(camera => camera.deviceId === selectedCameraId);
    const nextCamera = availableCameras[(currentIndex + 1 + availableCameras.length) % availableCameras.length];
    setSelectedCameraId(nextCamera.deviceId);
    void startCamera(nextCamera.deviceId);
  };

  React.useEffect(() => {
    getCameras();
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-attach the live stream to the <video> when returning to the scan step
  // (the <video> element only exists on the scan step, so it remounts each time).
  React.useEffect(() => {
    if (step !== 'scan') return;
    if (streamRef.current && videoRef.current) {
      setCameraReady(false);
      setScanStatus('STANDBY');
      videoRef.current.srcObject = streamRef.current;
      setCameraActive(true);
    } else if (!streamRef.current && !isSwitchingCamera) {
      startCamera(selectedCameraId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cameraActive, selectedCameraId]);

  // ─── Scanner loop (only on scan step) ─────────────────────────────────────────
  const showDetectionBox = (bbox: number[] | null | undefined, kind: 'ACCEPT' | 'CONFIRM', label: string) => {
    // Use the real YOLO box when available, else a centered fallback so there is
    // always a visible animated box when a product is detected.
    const box = (bbox && bbox.length === 4) ? bbox : [0.22, 0.18, 0.78, 0.82];
    setDetBox(box);
    setDetKind(kind);
    setDetLabel(label);
    if (boxTimerRef.current) clearTimeout(boxTimerRef.current);
    boxTimerRef.current = setTimeout(() => setDetBox(null), 1000);
  };

  // Map a bbox normalized to the submitted ROI back into the visible ROI.
  const boxStyle = (): React.CSSProperties => {
    const wrap = camWrapRef.current, roi = roiFrameRef.current;
    if (!detBox || !wrap || !roi) return { display: 'none' };
    const wrapRect = wrap.getBoundingClientRect();
    const roiRect = roi.getBoundingClientRect();
    const [rawX1, rawY1, rawX2, rawY2] = detBox;
    const x1 = Math.max(0, Math.min(1, rawX1));
    const y1 = Math.max(0, Math.min(1, rawY1));
    const x2 = Math.max(x1, Math.min(1, rawX2));
    const y2 = Math.max(y1, Math.min(1, rawY2));
    const roiLeft = roiRect.left - wrapRect.left;
    const roiTop = roiRect.top - wrapRect.top;
    return {
      left: roiLeft + x1 * roiRect.width,
      top: roiTop + y1 * roiRect.height,
      width: (x2 - x1) * roiRect.width,
      height: (y2 - y1) * roiRect.height,
    };
  };

  const handleScanResult = (result: any) => {
    const { decision, product, confidence, bbox } = result;
    const classifierClass = result?.classification?.class_name;
    const isBackground = classifierClass === 'background';
    setIsBackgroundFrame(isBackground);
    const detection = result?.detection;

    if (isBackground) {
      setScanStatus('SCANNING');
      return;
    }

    const isAutoAccepted = (
      product
      && (decision === 'ACCEPT' || decision === 'NEED_CONFIRMATION')
      && Number(confidence) >= MIN_ACCEPT_CONFIDENCE
    );

    if (isAutoAccepted) {
      showDetectionBox(bbox, 'ACCEPT', product.name);
      setScanStatus('ACCEPT');
      const scanCropUrl = detection?.detected === true
        ? createCroppedPreview(canvasRef.current, bbox)
        : null;
      completeDetectedProduct(product, confidence, scanCropUrl);
    } else if (decision === 'REJECT') {
      setScanStatus('REJECT');
    }
  };

  const captureFrame = async () => {
    if (!videoRef.current || !canvasRef.current || !camWrapRef.current || !roiFrameRef.current
      || successOverlay || isProcessingFrame.current || !cameraActive || !cameraReady) return;
    try {
      isProcessingFrame.current = true;
      setIsDetecting(true);
      const video = videoRef.current, canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        isProcessingFrame.current = false;
        setIsDetecting(false);
        return;
      }
      const sourceRoi = getVideoSourceRoi(video, camWrapRef.current, roiFrameRef.current);
      if (!sourceRoi) {
        isProcessingFrame.current = false;
        setIsDetecting(false);
        return;
      }
      canvas.width = SCANNER_ROI_OUTPUT_SIZE;
      canvas.height = SCANNER_ROI_OUTPUT_SIZE;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        video,
        sourceRoi.sx,
        sourceRoi.sy,
        sourceRoi.sw,
        sourceRoi.sh,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      canvas.toBlob(async (blob) => {
        if (!blob) {
          isProcessingFrame.current = false;
          setIsDetecting(false);
          return;
        }
        try {
          const fd = new FormData();
          fd.append('file', blob, 'scan.jpg');
          if (currentLocation && currentLocation !== 'ALL') fd.append('branch_id', currentLocation);
          const res = await fetch('/api/kasir/detect-v2', { method: 'POST', headers: getHeaders(true), body: fd });
          if (res.ok) { const r = await res.json(); if (r.success !== undefined) handleScanResult(r); }
        } catch {} finally {
          isProcessingFrame.current = false;
          setIsDetecting(false);
        }
      }, 'image/jpeg', 0.85);
    } catch {
      isProcessingFrame.current = false;
      setIsDetecting(false);
    }
  };

  React.useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (step === 'scan' && cameraActive && cameraReady && !successOverlay) {
      interval = setInterval(captureFrame, 500);
    }
    return () => { if (interval) clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cameraActive, cameraReady, successOverlay, currentLocation]);

  // ─── Cart ───────────────────────────────────────────────────────────────────
  const loadFrontImage = async (productId: string, fallbackUrl?: string | null) => {
    if (frontImageCacheRef.current.has(productId)) {
      return frontImageCacheRef.current.get(productId) ?? fallbackUrl ?? null;
    }

    try {
      const response = await fetch(`/api/shared/products/${productId}/images`, { headers: getHeaders() });
      if (!response.ok) throw new Error(`Failed to load product images (${response.status})`);

      const result = await response.json();
      const images: ProductImage[] = Array.isArray(result?.data) ? result.data : [];
      const primaryFront = images.find(image => (
        image.angle === 'front'
        && image.image_url
        && !String(image.filename || '').toLowerCase().startsWith('mirror-')
      ));
      const frontImage = primaryFront || images.find(image => image.angle === 'front' && image.image_url);
      const imageUrl = frontImage?.image_url || fallbackUrl || null;
      frontImageCacheRef.current.set(productId, imageUrl);
      return imageUrl;
    } catch (error) {
      console.warn('[CART] Gagal mengambil foto depan produk:', error);
      frontImageCacheRef.current.set(productId, fallbackUrl || null);
      return fallbackUrl || null;
    }
  };

  const addToCart = (product: any, scanCropUrl?: string | null) => {
    const fallbackImageUrl = product.image_url || null;
    const cartImageUrl = scanCropUrl || fallbackImageUrl;
    setCart(prev => {
      const idx = prev.findIndex(i => i.id === product.id);
      if (idx > -1) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          quantity: updated[idx].quantity + 1,
          image_url: scanCropUrl || updated[idx].image_url,
        };
        return updated;
      }
      return [...prev, {
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        ai_class_name: product.ai_class_name,
        image_url: cartImageUrl,
      }];
    });

    if (scanCropUrl) return;

    void loadFrontImage(product.id, fallbackImageUrl).then(frontImageUrl => {
      setCart(prev => prev.map(item => (
        item.id === product.id ? { ...item, image_url: frontImageUrl } : item
      )));
    });
  };

  const getSuccessAudioContext = React.useCallback(() => {
    const AudioContextClass = window.AudioContext
      || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!successAudioContextRef.current || successAudioContextRef.current.state === 'closed') {
      successAudioContextRef.current = new AudioContextClass();
    }
    return successAudioContextRef.current;
  }, []);

  React.useEffect(() => {
    const unlockSuccessAudio = () => {
      const audioContext = getSuccessAudioContext();
      if (audioContext?.state === 'suspended') void audioContext.resume();
      window.removeEventListener('pointerdown', unlockSuccessAudio);
      window.removeEventListener('keydown', unlockSuccessAudio);
    };

    window.addEventListener('pointerdown', unlockSuccessAudio, { once: true });
    window.addEventListener('keydown', unlockSuccessAudio, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlockSuccessAudio);
      window.removeEventListener('keydown', unlockSuccessAudio);
      const audioContext = successAudioContextRef.current;
      successAudioContextRef.current = null;
      if (audioContext && audioContext.state !== 'closed') void audioContext.close();
    };
  }, [getSuccessAudioContext]);

  const playSuccessSound = async () => {
    try {
      const audioContext = getSuccessAudioContext();
      if (!audioContext) return;
      if (audioContext.state === 'suspended') await audioContext.resume();

      const masterGain = audioContext.createGain();
      const soundStart = audioContext.currentTime + 0.02;
      masterGain.gain.setValueAtTime(0.0001, soundStart);
      masterGain.gain.exponentialRampToValueAtTime(0.2, soundStart + 0.025);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, soundStart + 0.85);
      masterGain.connect(audioContext.destination);

      [
        { frequency: 523.25, delay: 0 },
        { frequency: 659.25, delay: 0.11 },
        { frequency: 783.99, delay: 0.22 },
      ].forEach(({ frequency, delay }) => {
        const oscillator = audioContext.createOscillator();
        const noteGain = audioContext.createGain();
        const startAt = soundStart + delay;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, startAt);
        noteGain.gain.setValueAtTime(0.0001, startAt);
        noteGain.gain.exponentialRampToValueAtTime(0.75, startAt + 0.025);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.4);
        oscillator.connect(noteGain);
        noteGain.connect(masterGain);
        oscillator.start(startAt);
        oscillator.stop(startAt + 0.42);
      });
    } catch (error) {
      console.warn('[SCANNER] Efek suara sukses tidak dapat dimainkan:', error);
    }
  };

  const completeDetectedProduct = (product: any, confidence: number, scanCropUrl?: string | null) => {
    addToCart(product, scanCropUrl);
    void playSuccessSound();
    setDetBox(null);
    setScanStatus('ACCEPT');
    setFeedback(`Ditambahkan: ${product.name}`);
    setSuccessCountdown(SUCCESS_OVERLAY_SECONDS);
    setSuccessOverlay({ product, confidence, scanCropUrl });
  };

  React.useEffect(() => {
    if (!successOverlay) return;

    const countdownInterval = setInterval(() => {
      setSuccessCountdown(current => Math.max(0, current - 1));
    }, 1000);
    const resumeTimer = setTimeout(() => {
      setSuccessOverlay(null);
      setSuccessCountdown(SUCCESS_OVERLAY_SECONDS);
      setScanStatus('SCANNING');
      setFeedback('');
      setIsBackgroundFrame(true);
    }, SUCCESS_OVERLAY_SECONDS * 1000);

    return () => {
      clearInterval(countdownInterval);
      clearTimeout(resumeTimer);
    };
  }, [successOverlay]);
  const updateQty = (id: string, delta: number) =>
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i));
  const removeFromCart = (id: string) => setCart(prev => prev.filter(i => i.id !== id));

  // ─── Member / promo / points ──────────────────────────────────────────────────
  const checkMember = async () => {
    if (!memberPhone.trim()) return;
    setIsCheckingMember(true);
    try {
      const res = await fetch('/api/kasir/members/check', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ phone: memberPhone }) });
      const data = await res.json();
      if (data.success && data.isMember) {
        const m = { id: data.user.id, name: data.user.name, phone: data.user.phone };
        setMember(m);
        toast.success(`Member: ${m.name}`);
        loadMemberExtras(m.id);
      } else {
        setMember(null); setPromos([]); setPointsBalance(0);
        toast.error(data.message || 'Bukan member / tidak terdaftar.');
      }
    } catch { toast.error('Gagal mengecek member.'); }
    finally { setIsCheckingMember(false); }
  };

  const loadMemberExtras = async (memberId: string) => {
    try {
      const [pRes, ptRes] = await Promise.all([
        fetch(`/api/kasir/members/promos?user_id=${memberId}`, { headers: getHeaders() }),
        fetch(`/api/kasir/members/points?user_id=${memberId}`, { headers: getHeaders() }),
      ]);
      const pData = await pRes.json(); const ptData = await ptRes.json();
      if (pData.success) setPromos(pData.promos || []);
      if (ptData.success) setPointsBalance(ptData.balance || 0);
    } catch { /* ignore */ }
  };

  const clearMember = () => {
    setMember(null); setMemberPhone(''); setPromos([]); setSelectedPromoId(null);
    setPointsBalance(0); setPointsToUse(0);
  };

  // ─── Totals ───────────────────────────────────────────────────────────────────
  const subtotal = cart.reduce((a, i) => a + i.price * i.quantity, 0);
  const selectedPromo = promos.find(p => p.id === selectedPromoId) || null;
  const promoDiscount = React.useMemo(() => {
    if (!selectedPromo) return 0;
    if (selectedPromo.min_purchase && subtotal < Number(selectedPromo.min_purchase)) return 0;
    let d = 0;
    if (String(selectedPromo.discount_type).toLowerCase() === 'percentage') {
      d = Math.floor(subtotal * (Number(selectedPromo.discount_value) / 100));
      if (selectedPromo.max_discount) d = Math.min(d, Number(selectedPromo.max_discount));
    } else { d = Number(selectedPromo.discount_value); }
    return Math.min(d, subtotal);
  }, [selectedPromo, subtotal]);

  const maxPoints = Math.max(0, Math.min(pointsBalance, subtotal - promoDiscount));
  const pointsApplied = Math.min(pointsToUse, maxPoints);
  const total = Math.max(0, subtotal - promoDiscount - pointsApplied);
  const pointsEarned = Math.floor(total * 0.01);

  // ─── Checkout ─────────────────────────────────────────────────────────────────
  const submitCheckout = async () => {
    if (cart.length === 0) return;
    setIsCheckingOut(true);
    try {
      const payload = {
        header: {
          branch_id: currentLocation !== 'ALL' ? currentLocation : null,
          member_id: member?.id || null,
          total_price: total,
          payment_method: 'qris',
          points_used: pointsApplied,
          promo_id: selectedPromoId || undefined,
        },
        items: cart.map(i => ({ id: i.id, price: i.price, qty: i.quantity })),
      };
      const res = await fetch('/api/kasir/checkout', { method: 'POST', headers: getHeaders(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) {
        setReceipt({
          invoiceNumber: data.transaction.invoice_number,
          items: cart, subtotal, promoDiscount, pointsApplied, total, pointsEarned,
          member, paidAt: new Date(),
        });
        setStep('receipt');
        setCountdown(RECEIPT_SECONDS);
      } else {
        toast.error(data.message || 'Checkout gagal.');
      }
    } catch { toast.error('Koneksi ke server gagal.'); }
    finally { setIsCheckingOut(false); }
  };

  // Receipt countdown → auto reset
  React.useEffect(() => {
    if (step !== 'receipt') return;
    if (countdown <= 0) { resetTransaction(); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, countdown]);

  const resetTransaction = () => {
    setCart([]); clearMember(); setReceipt(null);
    setScanStatus('SCANNING');
    setSuccessOverlay(null);
    setSuccessCountdown(SUCCESS_OVERLAY_SECONDS);
    setDetBox(null);
    setStep('scan');
  };

  const qrData = receipt
    ? `QRIS|${receipt.invoiceNumber}|${total}`
    : `QRIS|${currentLocation}|${total}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=${encodeURIComponent(qrData)}`;
  const activeCameraIndex = availableCameras.findIndex(camera => camera.deviceId === selectedCameraId);
  const activeCamera = activeCameraIndex >= 0 ? availableCameras[activeCameraIndex] : availableCameras[0];
  const activeCameraName = activeCamera?.label || (
    availableCameras.length > 0 ? `Kamera ${Math.max(1, activeCameraIndex + 1)}` : 'Kamera'
  );
  const isPreparingCamera = isSwitchingCamera || (cameraActive && !cameraReady);
  const scannerBadge = cameraError
    ? {
        label: 'Scanner Bermasalah',
        compactLabel: 'Bermasalah',
        icon: CameraOff,
        className: 'border-rose-200 bg-rose-50 text-rose-700',
      }
    : isPreparingCamera
      ? {
          label: 'Menyiapkan Scanner',
          compactLabel: 'Menyiapkan',
          icon: Loader2,
          className: 'border-amber-200 bg-amber-50 text-amber-700',
        }
      : cameraActive && cameraReady && scanStatus !== 'STANDBY'
        ? {
            label: 'Scanner Siap',
            compactLabel: 'Siap',
            icon: ScanLine,
            className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          }
        : {
            label: 'Scanner Belum Siap',
            compactLabel: 'Belum Siap',
            icon: CameraOff,
            className: 'border-gray-200 bg-gray-100 text-gray-600',
          };
  const ScannerBadgeIcon = scannerBadge.icon;

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  const Header = () => (
    <header className="flex min-h-16 shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2 shadow-sm sm:px-6">
      <Link to="/" className="group flex min-w-0 items-center gap-2 sm:gap-3 hover:opacity-90 transition-opacity">
        <div className="shrink-0 rounded-xl bg-indigo-600 p-2 text-white group-hover:scale-105 transition-transform"><Sparkles className="size-5" /></div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-gray-900 sm:text-lg group-hover:text-indigo-600 transition-colors">AutoCashier POS</h1>
          <p className="hidden truncate text-xs text-gray-500 sm:block">Cabang: {locationName} · {user?.username}</p>
        </div>
      </Link>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        {step === 'scan' && (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Badge variant="outline" className={`h-8 gap-1.5 px-2 font-semibold sm:px-3 ${scannerBadge.className}`}>
              <ScannerBadgeIcon className={isPreparingCamera ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">{scannerBadge.label}</span>
              <span className="sm:hidden">{scannerBadge.compactLabel}</span>
            </Badge>
            {availableCameras.length > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={toggleCamera}
                disabled={isPreparingCamera || !cameraReady}
                className="h-10 max-w-56 gap-2 rounded-full border-indigo-200 bg-indigo-50 px-3 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800"
                aria-label={`Ganti kamera. Kamera aktif: ${activeCameraName}`}
                title={`Kamera aktif: ${activeCameraName}`}
              >
                {isPreparingCamera
                  ? <Loader2 className="size-4 animate-spin" />
                  : <SwitchCamera className="size-4" />}
                <span className="hidden truncate sm:inline">
                  {isPreparingCamera
                    ? 'Menyiapkan kamera...'
                    : `Kamera ${Math.max(1, activeCameraIndex + 1)}/${availableCameras.length}`}
                </span>
              </Button>
            )}
          </div>
        )}
        <Button
          variant="ghost"
          onClick={() => { stopCamera(); logout(); }}
          className="px-2 text-gray-500 hover:text-gray-900 sm:px-4"
          aria-label="Keluar"
        >
          <LogOut className="size-4 sm:mr-1.5" /> <span className="hidden sm:inline">Keluar</span>
        </Button>
      </div>
    </header>
  );

  // ─── STEP: SCAN ───────────────────────────────────────────────────────────────
  const renderScan = () => (
    <main className={`relative flex-1 grid grid-cols-1 gap-0 overflow-hidden ${
      isScanCartOpen ? 'lg:grid-cols-[minmax(0,4fr)_minmax(260px,1fr)]' : 'lg:grid-cols-1'
    }`}>
      {/* Camera (80%) */}
      <section ref={camWrapRef} className="relative bg-black flex items-center justify-center overflow-hidden">
        {cameraActive ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onCanPlay={() => {
              setCameraReady(true);
              setScanStatus('SCANNING');
            }}
            onEmptied={() => {
              setCameraReady(false);
              setScanStatus('STANDBY');
            }}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 text-gray-400">
            <CameraOff className="size-16 stroke-[1.5]" />
            <p className="text-sm max-w-xs text-center">{cameraError || 'Kamera tidak aktif.'}</p>
            <Button onClick={() => startCamera(selectedCameraId)}><Camera className="size-4 mr-2" />Aktifkan Kamera</Button>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />

        {successOverlay && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center overflow-hidden p-3 sm:p-5 lg:p-6">
            <div className="success-celebration relative w-full max-w-[20rem] sm:max-w-sm">
              <div className="success-detection-rays absolute left-1/2 top-1/2 size-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full sm:size-[32rem]" />
              <div className="success-detection-particles absolute inset-0" aria-hidden="true">
                {Array.from({ length: 10 }).map((_, index) => (
                  <span key={index} style={{ '--particle-index': index } as React.CSSProperties}>
                    <Sparkles className="size-4 sm:size-5" />
                  </span>
                ))}
              </div>
              <div className="success-detection-card relative max-h-[calc(100vh-6rem)] overflow-hidden rounded-2xl border border-emerald-200 bg-white/95 p-4 text-center shadow-2xl backdrop-blur-sm sm:rounded-3xl sm:p-6 lg:p-7">
                <div className="success-detection-glow absolute inset-x-8 -top-24 h-44 rounded-full bg-emerald-300/40 blur-3xl" />
                <div className="success-detection-ring relative mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-300/60 sm:mb-4 sm:size-20">
                  <CheckCircle2 className="success-detection-check size-8 sm:size-11" />
                </div>
                <p className="relative text-xs font-bold uppercase tracking-[0.16em] text-emerald-600 sm:text-sm sm:tracking-[0.2em]">Produk Terdeteksi</p>
                <ProductThumbnail
                  imageUrl={successOverlay.scanCropUrl || successOverlay.product.image_url}
                  name={successOverlay.product.name}
                  className="success-detection-product relative mx-auto mt-2 size-20 rounded-xl border border-gray-200 bg-white shadow-md sm:mt-4 sm:size-28 sm:rounded-2xl"
                />
                <h2 className="relative mt-2 truncate text-lg font-extrabold text-gray-900 sm:mt-4 sm:text-2xl" title={successOverlay.product.name}>
                  {successOverlay.product.name}
                </h2>
                <p className="relative mt-0.5 text-base font-bold text-indigo-600 sm:mt-1 sm:text-lg">{rp(successOverlay.product.price)}</p>
                <div className="relative mx-auto mt-2 flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 sm:mt-3 sm:px-3 sm:py-1.5 sm:text-sm">
                  <ShoppingCart className="size-3.5 sm:size-4" /> Masuk ke keranjang
                </div>
                <p className="relative mt-2 text-xs text-gray-500 sm:mt-3 sm:text-sm">
                  Scan berikutnya dalam {successCountdown} detik.
                </p>
                <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100 sm:mt-5">
                  <div className="success-detection-progress h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500" />
                </div>
              </div>
            </div>
          </div>
        )}

        {!isScanCartOpen && (
          <button
            type="button"
            onClick={() => setIsScanCartOpen(true)}
            className="absolute right-4 top-4 z-30 flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-2.5 text-sm font-bold text-gray-900 shadow-lg backdrop-blur-sm transition hover:bg-white"
            aria-label="Buka keranjang"
          >
            <ChevronLeft className="size-4 text-gray-500" />
            <ShoppingCart className="size-4 text-indigo-600" />
            Keranjang
            <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">
              {cart.reduce((a, i) => a + i.quantity, 0)}
            </span>
          </button>
        )}

        {/* Scan frame overlay */}
        {cameraActive && (
          <>
            {/* Scan frame: status-colored corners + moving scan line */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div ref={roiFrameRef} className="relative w-[58%] aspect-square max-w-md rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/65 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur-sm">
                  Posisikan seluruh produk di dalam kotak
                </div>
                {[
                  'top-0 left-0 border-t-4 border-l-4 rounded-tl-3xl',
                  'top-0 right-0 border-t-4 border-r-4 rounded-tr-3xl',
                  'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl',
                  'bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl',
                ].map((c, i) => (
                  <span key={i} className={`absolute w-10 h-10 transition-colors duration-300 ${
                    scanStatus === 'ACCEPT' ? 'border-emerald-400'
                    : 'border-white/80'} ${c}`} />
                ))}
                <span className="roi-scan-beam pointer-events-none absolute inset-x-4 top-0 z-10 h-[3px] rounded-full bg-gradient-to-r from-transparent via-blue-300 to-transparent shadow-[0_0_8px_rgba(96,165,250,0.7)]" />
              </div>
            </div>

            {/* Animated status indicator */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
              {scanStatus === 'ACCEPT' ? (
                <div key={feedback} className="flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-emerald-500 text-white text-lg font-bold shadow-xl" style={{ animation: 'posPop 0.3s ease-out' }}>
                  <CheckCircle2 className="size-6" /> {feedback || 'Produk terdeteksi'}
                </div>
              ) : isDetecting && !isBackgroundFrame ? (
                <div className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
                  <Loader2 className="size-4 animate-spin" /> Mendeteksi...
                </div>
              ) : (
                <div className="flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-white/95 text-gray-800 text-lg font-bold shadow-xl backdrop-blur-md">
                  <ScanLine className={`size-6 text-indigo-600 ${isBackgroundFrame ? '' : 'animate-pulse'}`} /> Siap mendeteksi produk
                </div>
              )}
            </div>

            {/* Animated detection bounding box */}
            {detBox && (
              <div className="pointer-events-none absolute z-20 transition-all duration-150 ease-out" style={boxStyle()}>
                <div className={`relative w-full h-full rounded-xl border-[3px] animate-pulse ${detKind === 'ACCEPT' ? 'border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.7)]' : 'border-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.7)]'}`}>
                  {/* corner accents */}
                  {['-top-1 -left-1 border-t-4 border-l-4 rounded-tl-xl', '-top-1 -right-1 border-t-4 border-r-4 rounded-tr-xl', '-bottom-1 -left-1 border-b-4 border-l-4 rounded-bl-xl', '-bottom-1 -right-1 border-b-4 border-r-4 rounded-br-xl'].map((c, i) => (
                    <span key={i} className={`absolute w-5 h-5 ${detKind === 'ACCEPT' ? 'border-emerald-300' : 'border-amber-300'} ${c}`} />
                  ))}
                  {/* label */}
                  <div className={`absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1 rounded-lg text-sm font-bold text-white shadow-lg ${detKind === 'ACCEPT' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                    {detLabel}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Cart (20%) */}
      {isScanCartOpen && <section className="flex flex-col bg-white border-l border-gray-200 min-h-0">
        <div className="px-3 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
          <h2 className="font-bold text-sm text-gray-900 flex items-center gap-1.5"><ShoppingCart className="size-4 text-indigo-600" /> Keranjang</h2>
          <div className="flex items-center gap-1">
            <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
              {cart.reduce((a, i) => a + i.quantity, 0)} item
            </span>
            <button
              type="button"
              onClick={() => setIsScanCartOpen(false)}
              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              aria-label="Tutup keranjang"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 min-h-0">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 px-3 py-10">
              <ShoppingCart className="size-10 stroke-[1.2] mb-2" />
              <p className="text-sm font-medium text-gray-500">Keranjang kosong</p>
              <p className="mt-1 text-xs">Arahkan produk ke kamera</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {cart.map(item => (
                <div key={item.id} className="rounded-xl border border-gray-100 bg-gray-50 p-2.5">
                  <div className="flex items-start gap-2">
                    <ProductThumbnail
                      imageUrl={item.image_url}
                      name={item.name}
                      className="size-12 rounded-lg border border-gray-200 bg-white"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900" title={item.name}>{item.name}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{rp(item.price)} / item</p>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      aria-label={`Hapus ${item.name}`}
                      className="shrink-0 rounded-md p-1 text-gray-300 hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-bold tabular-nums text-gray-900">{rp(item.price * item.quantity)}</span>
                    <div className="flex h-8 shrink-0 items-center rounded-lg border border-gray-200 bg-white">
                      <button onClick={() => updateQty(item.id, -1)} className="h-full px-2 text-gray-500 hover:text-indigo-600"><Minus className="size-3.5" /></button>
                      <span className="w-6 text-center text-sm font-bold text-gray-900">{item.quantity}</span>
                      <button onClick={() => updateQty(item.id, 1)} className="h-full px-2 text-gray-500 hover:text-indigo-600"><Plus className="size-3.5" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 p-3">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-gray-500">Subtotal</span>
            <span className="min-w-0 truncate text-lg font-extrabold tabular-nums text-gray-900">{rp(subtotal)}</span>
          </div>
          <Button disabled={cart.length === 0} onClick={() => setStep('cart')}
            className="h-11 w-full bg-indigo-600 text-sm font-bold hover:bg-indigo-700">
            Selesai Belanja <ArrowRight className="ml-1.5 size-4" />
          </Button>
        </div>
      </section>}
    </main>
  );

  // ─── STEP: CART (member + promo + points) ─────────────────────────────────────
  const renderCart = () => (
    <main className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto p-6 space-y-5">
        <button onClick={() => setStep('scan')} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 font-medium">
          <ArrowLeft className="size-4" /> Kembali memindai
        </button>

        {/* Items */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><ShoppingCart className="size-5 text-indigo-600" /> Ringkasan Belanja</h2>
          <div className="divide-y divide-gray-100">
            {cart.map(item => (
              <div key={item.id} className="py-2.5 flex items-center gap-3">
                <ProductThumbnail
                  imageUrl={item.image_url}
                  name={item.name}
                  className="size-14 rounded-xl border border-gray-200 bg-white"
                />
                <div className="flex-1"><p className="font-medium text-gray-900">{item.name}</p><p className="text-sm text-gray-500">{rp(item.price)} × {item.quantity}</p></div>
                <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg h-9">
                  <button onClick={() => updateQty(item.id, -1)} className="px-2.5 text-gray-500"><Minus className="size-4" /></button>
                  <span className="w-8 text-center font-bold">{item.quantity}</span>
                  <button onClick={() => updateQty(item.id, 1)} className="px-2.5 text-gray-500"><Plus className="size-4" /></button>
                </div>
                <span className="w-24 text-right font-bold">{rp(item.price * item.quantity)}</span>
                <button onClick={() => removeFromCart(item.id)} className="text-gray-300 hover:text-rose-500"><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
        </div>

        {/* Member */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><User className="size-5 text-indigo-600" /> Member</h2>
          {member ? (
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-5 text-emerald-600" />
                <div><p className="font-semibold text-emerald-800">{member.name}</p><p className="text-sm text-emerald-600">{member.phone} · {pointsBalance.toLocaleString('id-ID')} poin</p></div>
              </div>
              <Button variant="ghost" onClick={clearMember} className="text-gray-500"><X className="size-4" /></Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="size-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input placeholder="Nomor WhatsApp (mis. 0812...)" value={memberPhone}
                  onChange={e => setMemberPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && checkMember()}
                  className="h-12 pl-10 text-base" />
              </div>
              <Button onClick={checkMember} disabled={isCheckingMember || !memberPhone.trim()} className="h-12 px-6 bg-indigo-600 hover:bg-indigo-700">
                {isCheckingMember ? <Loader2 className="size-4 animate-spin" /> : 'Cek'}
              </Button>
            </div>
          )}
          {!member && <p className="text-xs text-gray-400 mt-2">Lewati jika bukan member. Member dapat memakai promo & poin.</p>}
        </div>

        {/* Promo + points (member only) */}
        {member && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <div>
              <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><Tag className="size-5 text-indigo-600" /> Promo</h2>
              {promos.length === 0 ? (
                <p className="text-sm text-gray-400">Tidak ada promo aktif.</p>
              ) : (
                <div className="grid gap-2">
                  <button onClick={() => setSelectedPromoId(null)} className={`text-left p-3 rounded-xl border ${!selectedPromoId ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
                    <span className="font-medium text-gray-700">Tanpa promo</span>
                  </button>
                  {promos.map(p => {
                    const ok = !p.min_purchase || subtotal >= Number(p.min_purchase);
                    return (
                      <button key={p.id} disabled={!ok} onClick={() => setSelectedPromoId(p.id)}
                        className={`text-left p-3 rounded-xl border disabled:opacity-50 ${selectedPromoId === p.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
                        <p className="font-semibold text-gray-900">{p.title || p.code}</p>
                        <p className="text-sm text-gray-500">
                          {String(p.discount_type).toLowerCase() === 'percentage' ? `Diskon ${p.discount_value}%` : `Potongan ${rp(p.discount_value)}`}
                          {p.min_purchase ? ` · min ${rp(Number(p.min_purchase))}` : ''}
                          {!ok ? ' (belum memenuhi minimum)' : ''}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h2 className="font-bold text-gray-900 mb-2 flex items-center gap-2"><Coins className="size-5 text-amber-500" /> Pakai Poin</h2>
              <p className="text-sm text-gray-500 mb-2">Saldo poin: <b>{pointsBalance.toLocaleString('id-ID')}</b> (1 poin = Rp 1). Maks dipakai: {maxPoints.toLocaleString('id-ID')}</p>
              <div className="flex gap-2">
                <Input type="number" min={0} max={maxPoints} value={pointsToUse || ''} placeholder="0"
                  onChange={e => setPointsToUse(Math.max(0, Math.min(maxPoints, Number(e.target.value) || 0)))}
                  className="h-12 text-base" />
                <Button variant="outline" className="h-12 px-4" onClick={() => setPointsToUse(maxPoints)}>Pakai Maks</Button>
                <Button variant="outline" className="h-12 px-4" onClick={() => setPointsToUse(0)}>0</Button>
              </div>
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="space-y-1.5 text-gray-600">
            <div className="flex justify-between"><span>Subtotal</span><span>{rp(subtotal)}</span></div>
            {promoDiscount > 0 && <div className="flex justify-between text-emerald-600"><span>Diskon promo</span><span>- {rp(promoDiscount)}</span></div>}
            {pointsApplied > 0 && <div className="flex justify-between text-amber-600"><span>Poin dipakai</span><span>- {rp(pointsApplied)}</span></div>}
            <div className="flex justify-between items-end pt-2 mt-2 border-t border-gray-100">
              <span className="font-bold text-gray-900">Total</span>
              <span className="text-3xl font-extrabold text-indigo-600">{rp(total)}</span>
            </div>
            {member && <p className="text-xs text-amber-600 text-right">+{pointsEarned.toLocaleString('id-ID')} poin akan didapat</p>}
          </div>
          <Button onClick={() => setStep('payment')} disabled={cart.length === 0}
            className="w-full h-14 text-lg font-bold mt-4 bg-indigo-600 hover:bg-indigo-700">
            Lanjut ke Pembayaran <QrCode className="size-5 ml-2" />
          </Button>
        </div>
      </div>
    </main>
  );

  // ─── STEP: PAYMENT (QRIS) ─────────────────────────────────────────────────────
  const renderPayment = () => (
    <main className="flex-1 overflow-y-auto bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl border border-gray-200 shadow-sm p-8 text-center">
        <button onClick={() => setStep('cart')} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 font-medium mb-4">
          <ArrowLeft className="size-4" /> Kembali
        </button>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm font-bold mb-3"><QrCode className="size-4" /> Pembayaran QRIS</div>
        <p className="text-gray-500">Total yang harus dibayar</p>
        <p className="text-4xl font-extrabold text-gray-900 mb-5">{rp(total)}</p>
        <div className="mx-auto w-[280px] h-[280px] rounded-2xl border-4 border-indigo-100 p-2 bg-white">
          <img src={qrUrl} alt="QRIS" className="w-full h-full object-contain" />
        </div>
        <p className="text-sm text-gray-500 mt-4">Minta pembeli memindai QR dengan aplikasi e-wallet / m-banking.</p>
        <Button onClick={submitCheckout} disabled={isCheckingOut}
          className="w-full h-14 text-lg font-bold mt-6 bg-emerald-600 hover:bg-emerald-700">
          {isCheckingOut ? <><Loader2 className="size-5 mr-2 animate-spin" /> Memproses...</> : <><CheckCircle2 className="size-5 mr-2" /> Konfirmasi Pembayaran</>}
        </Button>
        <p className="text-xs text-gray-400 mt-2">Tekan setelah pembayaran diterima.</p>
      </div>
    </main>
  );

  // ─── STEP: RECEIPT ────────────────────────────────────────────────────────────
  const renderReceipt = () => (
    <main className="flex-1 overflow-y-auto bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-3xl border border-gray-200 shadow-sm p-7">
        <div className="text-center mb-5">
          <div className="mx-auto p-3 rounded-full bg-emerald-100 text-emerald-600 w-fit mb-3"><CheckCircle2 className="size-9" /></div>
          <h2 className="text-xl font-extrabold text-gray-900">Pembayaran Berhasil</h2>
          <p className="text-sm text-gray-500">{receipt?.invoiceNumber}</p>
        </div>
        <div className="border-y border-dashed border-gray-200 py-4 space-y-1.5 text-sm">
          {receipt?.items?.map((it: CartItem) => (
            <div key={it.id} className="flex justify-between text-gray-600"><span>{it.name} × {it.quantity}</span><span>{rp(it.price * it.quantity)}</span></div>
          ))}
        </div>
        <div className="py-3 space-y-1 text-sm text-gray-600">
          <div className="flex justify-between"><span>Subtotal</span><span>{rp(receipt?.subtotal || 0)}</span></div>
          {receipt?.promoDiscount > 0 && <div className="flex justify-between text-emerald-600"><span>Promo</span><span>- {rp(receipt.promoDiscount)}</span></div>}
          {receipt?.pointsApplied > 0 && <div className="flex justify-between text-amber-600"><span>Poin</span><span>- {rp(receipt.pointsApplied)}</span></div>}
          <div className="flex justify-between font-extrabold text-gray-900 text-lg pt-1.5 border-t border-gray-100"><span>Total (QRIS)</span><span>{rp(receipt?.total || 0)}</span></div>
          {receipt?.member && <div className="flex justify-between text-amber-600 pt-1"><span>Poin didapat</span><span>+{receipt.pointsEarned}</span></div>}
        </div>
        <p className="text-center text-xs text-gray-400 my-3">Terima kasih telah berbelanja 🙏</p>

        <Button onClick={resetTransaction} className="w-full h-14 text-lg font-bold bg-indigo-600 hover:bg-indigo-700">
          <RefreshCw className="size-5 mr-2" /> Transaksi Baru
        </Button>
        <p className="text-center text-sm text-gray-400 mt-3">Kembali otomatis dalam <b className="text-gray-700">{countdown}</b> detik</p>
      </div>
    </main>
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50 text-gray-900 antialiased overflow-hidden">
      <Header />
      {step === 'scan' && renderScan()}
      {step === 'cart' && renderCart()}
      {step === 'payment' && renderPayment()}
      {step === 'receipt' && renderReceipt()}
    </div>
  );
}
