import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/context/AuthContext';
import { useLocation } from '@/shared/context/LocationContext';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import {
  Camera, CameraOff, Plus, Minus, Trash2, Search, ShoppingCart, Loader2,
  CheckCircle2, ArrowLeft, ArrowRight, User, Tag, Coins, QrCode,
  LogOut, LogIn, Sparkles, RefreshCw, X, ScanLine, ChevronLeft, ChevronRight,
  SwitchCamera, ShieldCheck, Clock, Phone, AlertTriangle, FileImage, FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';

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
  const navigate = useNavigate();

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
  const [receiptPreviewUrl, setReceiptPreviewUrl] = React.useState<string | null>(null);

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
  const receiptRef = React.useRef<HTMLDivElement>(null);

  const openReceiptPreview = () => {
    const canvas = generateReceiptCanvas();
    if (!canvas) { toast.error('Data struk tidak tersedia'); return; }
    setReceiptPreviewUrl(canvas.toDataURL('image/png'));
  };

  const closeReceiptPreview = () => setReceiptPreviewUrl(null);

  // ─── Receipt Canvas Generation (native Canvas2D – no html2canvas needed) ─────
  const generateReceiptCanvas = (): HTMLCanvasElement | null => {
    if (!receipt) return null;

    const SCALE = 2;
    const W = 360 * SCALE;          // 720 px physical
    const PADDING = 24 * SCALE;
    const FONT_SM = 11 * SCALE;
    const FONT_MD = 13 * SCALE;
    const FONT_LG = 15 * SCALE;
    const FONT_XL = 20 * SCALE;
    const LINE = 20 * SCALE;
    const items: CartItem[] = receipt.items || [];

    // ---- First pass: calculate total height ----
    const BASE_HEIGHT =
      (40 + 16 + 14 + 14 + 4 + 16 +   // header
       12 + items.length * 40 + 12 +   // items
       16 + 14 + 14 + 14 + 16 +        // subtotals
       20 + 14 + 14 +                  // total
       16 + 14 + 14 + 40              // footer
      );
    const H = (BASE_HEIGHT + 80) * SCALE;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Background
    ctx.fillStyle = '#fdfdfd';
    ctx.fillRect(0, 0, W, H);

    let y = PADDING;

    const drawText = (
      text: string, x: number, size: number,
      weight: 'normal' | 'bold' = 'normal',
      align: CanvasTextAlign = 'left',
      color = '#1f2937'
    ) => {
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px monospace`;
      ctx.textAlign = align;
      ctx.fillText(text, x, y);
    };

    const drawDash = () => {
      ctx.setLineDash([6 * SCALE, 4 * SCALE]);
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 1.5 * SCALE;
      ctx.beginPath();
      ctx.moveTo(PADDING, y);
      ctx.lineTo(W - PADDING, y);
      ctx.stroke();
      ctx.setLineDash([]);
      y += 12 * SCALE;
    };

    // ---- Header ----
    y += 8 * SCALE;
    drawText('AUTOCASHIER', W / 2, FONT_XL, 'bold', 'center');
    y += LINE + 4 * SCALE;
    drawText('Struk Pembayaran', W / 2, FONT_SM, 'normal', 'center', '#6b7280');
    y += LINE - 4 * SCALE;
    drawText(receipt.invoiceNumber || '', W / 2, FONT_SM, 'normal', 'center', '#9ca3af');
    y += LINE + 4 * SCALE;
    drawDash();

    // ---- Items ----
    items.forEach((it: CartItem) => {
      drawText(it.name.toUpperCase(), PADDING, FONT_MD, 'bold', 'left');
      drawText(rp(it.price * it.quantity), W - PADDING, FONT_MD, 'bold', 'right');
      y += LINE;
      drawText(`${it.quantity} x ${rp(it.price)}`, PADDING, FONT_SM, 'normal', 'left', '#6b7280');
      y += LINE + 4 * SCALE;
    });
    drawDash();

    // ---- Summary ----
    const rowPair = (label: string, value: string, color = '#1f2937') => {
      drawText(label, PADDING, FONT_MD, 'normal', 'left', color);
      drawText(value, W - PADDING, FONT_MD, 'normal', 'right', color);
      y += LINE;
    };
    rowPair('Subtotal', rp(receipt.subtotal || 0));
    if (receipt.promoDiscount > 0) rowPair('Diskon Promo', '-' + rp(receipt.promoDiscount), '#059669');
    if (receipt.pointsApplied > 0) rowPair('Poin Dipakai', '-' + rp(receipt.pointsApplied), '#d97706');
    y += 4 * SCALE;
    drawDash();

    // ---- Total ----
    drawText('TOTAL', PADDING, FONT_LG, 'bold');
    drawText(rp(receipt.total || 0), W - PADDING, FONT_LG, 'bold', 'right');
    y += LINE + 4 * SCALE;
    const payMethod = (receipt.total === 0) ? 'LUNAS (POIN)' : 'QRIS';
    drawText('Tipe Bayar', PADDING, FONT_SM, 'normal', 'left', '#6b7280');
    drawText(payMethod, W - PADDING, FONT_SM, 'bold', 'right', '#6b7280');
    y += LINE;
    if (receipt.pointsEarned > 0) {
      drawText('Poin didapat', PADDING, FONT_SM, 'normal', 'left', '#d97706');
      drawText(`+${receipt.pointsEarned.toLocaleString('id-ID')}`, W - PADDING, FONT_SM, 'bold', 'right', '#d97706');
      y += LINE;
    }
    y += 4 * SCALE;
    drawDash();

    // ---- Footer ----
    drawText('Terima Kasih', W / 2, FONT_SM, 'normal', 'center', '#9ca3af');
    y += LINE;
    drawText('Barang tidak dapat ditukar / dikembalikan', W / 2, FONT_SM, 'normal', 'center', '#9ca3af');
    y += LINE + 4 * SCALE;

    // Trim canvas to actual content
    const trimmed = document.createElement('canvas');
    trimmed.width = W;
    trimmed.height = y + PADDING;
    const tctx = trimmed.getContext('2d')!;
    tctx.fillStyle = '#fdfdfd';
    tctx.fillRect(0, 0, trimmed.width, trimmed.height);
    tctx.drawImage(canvas, 0, 0);
    return trimmed;
  };

  const handleDownloadPNG = async () => {
    const tid = toast.loading('Membuat gambar struk...');
    try {
      const canvas = generateReceiptCanvas();
      if (!canvas) { toast.dismiss(tid); toast.error('Data struk tidak ditemukan'); return; }
      canvas.toBlob((blob) => {
        if (!blob) { toast.dismiss(tid); toast.error('Gagal membuat PNG'); return; }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `struk-${receipt?.invoiceNumber || 'pembayaran'}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.dismiss(tid);
        toast.success('Struk PNG berhasil diunduh!');
      }, 'image/png');
    } catch (error) {
      console.error(error);
      toast.dismiss(tid);
      toast.error('Gagal mengunduh PNG');
    }
  };

  const handleDownloadPDF = async () => {
    const tid = toast.loading('Membuat PDF struk...');
    try {
      const canvas = generateReceiptCanvas();
      if (!canvas) { toast.dismiss(tid); toast.error('Data struk tidak ditemukan'); return; }
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const PX_TO_MM = 25.4 / 96 / 2; // SCALE=2 applied when drawing
      const mmW = canvas.width * PX_TO_MM;
      const mmH = canvas.height * PX_TO_MM;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [mmW, mmH] });
      pdf.addImage(imgData, 'JPEG', 0, 0, mmW, mmH);
      pdf.save(`struk-${receipt?.invoiceNumber || 'pembayaran'}.pdf`);
      toast.dismiss(tid);
      toast.success('Struk PDF berhasil diunduh!');
    } catch (error) {
      console.error(error);
      toast.dismiss(tid);
      toast.error('Gagal mengunduh PDF');
    }
  };

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
          <p className="hidden truncate text-xs text-gray-500 sm:block">Cabang: {locationName}</p>
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
        {user ? (
          <Button
            variant="ghost"
            onClick={() => { stopCamera(); logout(); navigate('/'); }}
            className="px-2 text-gray-500 hover:text-gray-900 sm:px-4"
            aria-label="Keluar"
          >
            <LogOut className="size-4 sm:mr-1.5" /> <span className="hidden sm:inline">Keluar</span>
          </Button>
        ) : (
          <Button
            onClick={() => { stopCamera(); navigate('/login'); }}
            className="px-2 bg-indigo-600 hover:bg-indigo-700 text-white sm:px-4 rounded-full shadow-md"
            aria-label="Login"
          >
            <LogIn className="size-4 sm:mr-1.5" /> <span className="hidden sm:inline">Login</span>
          </Button>
        )}
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
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/65 px-5 py-2 text-sm font-bold text-white backdrop-blur-sm border border-white/10 shadow-lg">
                  Posisikan seluruh produk di dalam kotak
                </div>
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/50 px-4 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md border border-white/10 flex items-center gap-2">
                  <ScanLine className="size-3.5 text-indigo-400" /> Arahkan bagian depan produk menghadap kamera
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
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">

              {scanStatus === 'ACCEPT' ? (
                <div key={feedback} className="flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-emerald-500 text-white text-lg font-bold shadow-xl" style={{ animation: 'posPop 0.3s ease-out' }}>
                  <CheckCircle2 className="size-6" /> {feedback || 'Produk terdeteksi'}
                </div>
              ) : isDetecting && !isBackgroundFrame ? (
                <div className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
                  <Loader2 className="size-4 animate-spin" /> Mendeteksi...
                </div>
              ) : null}
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
                      className="shrink-0 rounded-md p-1.5 text-rose-500 bg-rose-50 hover:bg-rose-100 transition-colors"
                    >
                      <Trash2 className="size-4" />
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
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <button onClick={() => setStep('scan')} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 font-medium">
          <ArrowLeft className="size-4" /> Kembali memindai
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Items */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h2 className="font-extrabold text-gray-900 text-lg mb-4 flex items-center gap-2"><ShoppingCart className="size-6 text-indigo-600" /> Ringkasan Belanja</h2>
              <div className="divide-y divide-gray-100">
                {cart.length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    <ShoppingCart className="size-12 mx-auto mb-3 stroke-[1.5]" />
                    <p className="text-base font-medium">Keranjang masih kosong</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.id} className="py-4 flex items-center gap-4">
                      <ProductThumbnail
                        imageUrl={item.image_url}
                        name={item.name}
                        className="size-16 rounded-xl border border-gray-200 bg-white shadow-sm"
                      />
                      <div className="flex-1">
                        <p className="font-bold text-gray-900 text-base">{item.name}</p>
                        <p className="text-sm text-gray-500 mt-0.5">{rp(item.price)} × {item.quantity}</p>
                      </div>
                      <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg h-10 shadow-sm">
                        <button onClick={() => updateQty(item.id, -1)} className="px-3 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-l-lg transition-colors"><Minus className="size-4" /></button>
                        <span className="w-10 text-center font-bold text-gray-800">{item.quantity}</span>
                        <button onClick={() => updateQty(item.id, 1)} className="px-3 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-r-lg transition-colors"><Plus className="size-4" /></button>
                      </div>
                      <span className="w-28 text-right font-extrabold text-gray-900 text-lg">{rp(item.price * item.quantity)}</span>
                      <button onClick={() => removeFromCart(item.id)} className="shrink-0 rounded-lg p-2 text-rose-500 bg-rose-50 hover:bg-rose-100 transition-colors ml-2">
                        <Trash2 className="size-4.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Member, Promo, Totals */}
          <div className="lg:col-span-5 space-y-6">
            {/* Member */}
            <div className="bg-gradient-to-br from-indigo-50/80 to-white rounded-2xl border border-indigo-200 p-6 shadow-md shadow-indigo-500/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full pointer-events-none" />
              
              <div className="flex items-center justify-between mb-5 relative z-10">
                <h2 className="font-black text-indigo-950 text-lg flex items-center gap-3">
                  <div className="p-2 bg-indigo-600 rounded-xl shadow-sm shadow-indigo-600/30">
                    <User className="size-5 text-white" />
                  </div>
                  Customer & Member
                </h2>
                {!member && <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600 bg-indigo-100/80 px-3 py-1 rounded-full">Prioritas</span>}
              </div>

              <div className="relative z-10">
                {member ? (
                  <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50 border border-emerald-200 shadow-sm transition-all">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="size-6 text-emerald-600" />
                      <div>
                        <p className="font-bold text-emerald-900 text-base">{member.name}</p>
                        <p className="text-sm text-emerald-700 font-medium">{member.phone} · <span className="font-extrabold text-emerald-800">{pointsBalance.toLocaleString('id-ID')} poin</span></p>
                      </div>
                    </div>
                    <Button variant="ghost" onClick={clearMember} className="text-emerald-700 hover:text-rose-600 hover:bg-rose-50 rounded-lg p-2"><X className="size-5" /></Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 mt-2">
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-3.5 rounded-xl flex items-center gap-3 shadow-sm">
                      <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-2 rounded-xl shrink-0 shadow-md shadow-orange-500/20">
                        <Sparkles className="size-5 text-white animate-pulse" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-amber-900 tracking-wide">Dapatkan Diskon & Poin Spesial!</p>
                        <p className="text-xs text-amber-700 font-semibold mt-0.5">Masukkan nomor WhatsApp Anda untuk menikmati promo loyalitas.</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1 group">
                        <Phone className="size-6 text-indigo-500 absolute left-4 top-1/2 -translate-y-1/2 transition-transform group-focus-within:scale-110 group-focus-within:text-indigo-600" />
                        <Input placeholder="Ketik 0812..." value={memberPhone}
                          onChange={e => setMemberPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && checkMember()}
                          className="h-14 pl-12 text-lg font-black text-gray-900 rounded-xl border-2 border-indigo-200 bg-white focus:bg-indigo-50/50 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 transition-all placeholder:text-gray-300 shadow-sm" />
                      </div>
                      <Button onClick={checkMember} disabled={isCheckingMember || !memberPhone.trim()} className="h-14 px-8 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-black text-base shadow-lg shadow-indigo-600/30 hover:-translate-y-1 transition-all">
                        {isCheckingMember ? <Loader2 className="size-5 animate-spin" /> : 'Cek Member'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Promo + points (member only) */}
            {member && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-5">
                <div>
                  <h2 className="font-extrabold text-gray-900 mb-4 flex items-center gap-2"><Tag className="size-5 text-indigo-600" /> Promo</h2>
                  {promos.length === 0 ? (
                    <p className="text-sm text-gray-400 font-medium bg-gray-50 p-3 rounded-xl border border-gray-100">Tidak ada promo aktif saat ini.</p>
                  ) : (
                    <div className="grid gap-3">
                      <button onClick={() => setSelectedPromoId(null)} className={`text-left p-3.5 rounded-xl border transition-all ${!selectedPromoId ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20 shadow-sm' : 'border-gray-200 hover:border-indigo-300'}`}>
                        <span className="font-bold text-gray-700">Tanpa promo</span>
                      </button>
                      {promos.map(p => {
                        const ok = !p.min_purchase || subtotal >= Number(p.min_purchase);
                        return (
                          <button key={p.id} disabled={!ok} onClick={() => setSelectedPromoId(p.id)}
                            className={`text-left p-3.5 rounded-xl border transition-all disabled:opacity-50 disabled:bg-gray-50 ${selectedPromoId === p.id ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20 shadow-sm' : 'border-gray-200 hover:border-indigo-300'}`}>
                            <p className="font-bold text-gray-900">{p.title || p.code}</p>
                            <p className="text-sm text-gray-500 mt-1 font-medium">
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

                <div className="border-t border-gray-100 pt-5">
                  <h2 className="font-extrabold text-gray-900 mb-2 flex items-center gap-2"><Coins className="size-5 text-amber-500" /> Pakai Poin</h2>
                  <p className="text-sm text-gray-500 mb-3 font-medium">Saldo poin: <b className="text-gray-900">{pointsBalance.toLocaleString('id-ID')}</b> (1 poin = Rp 1). Maks dipakai: {maxPoints.toLocaleString('id-ID')}</p>
                  <div className="flex gap-2">
                    <Input type="number" min={0} max={maxPoints} value={pointsToUse || ''} placeholder="0"
                      onChange={e => setPointsToUse(Math.max(0, Math.min(maxPoints, Number(e.target.value) || 0)))}
                      className="h-11 text-base rounded-xl border-gray-200 bg-gray-50 focus:bg-white transition-colors" />
                    <Button variant="outline" className="h-11 px-4 rounded-xl border-gray-200 font-bold hover:bg-gray-50 hover:text-indigo-600 transition-colors" onClick={() => setPointsToUse(maxPoints)}>Pakai Maks</Button>
                    <Button variant="outline" className="h-11 px-4 rounded-xl border-gray-200 font-bold hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors" onClick={() => setPointsToUse(0)}>Reset</Button>
                  </div>
                </div>
              </div>
            )}

            {/* Totals */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <div className="space-y-2 text-gray-600">
                <div className="flex justify-between items-center"><span className="font-medium">Subtotal</span><span className="font-semibold text-gray-900 text-base">{rp(subtotal)}</span></div>
                {promoDiscount > 0 && <div className="flex justify-between items-center text-emerald-600"><span className="font-bold">Diskon promo</span><span className="font-bold">- {rp(promoDiscount)}</span></div>}
                {pointsApplied > 0 && <div className="flex justify-between items-center text-amber-600"><span className="font-bold">Poin dipakai</span><span className="font-bold">- {rp(pointsApplied)}</span></div>}
                <div className="flex justify-between items-end pt-4 mt-2 border-t border-gray-200">
                  <span className="font-black text-gray-900 text-lg">Total Pembayaran</span>
                  <span className="text-4xl font-black text-indigo-600 tracking-tight">{rp(total)}</span>
                </div>
                {member && <p className="text-sm font-bold text-amber-600 text-right mt-1">+{pointsEarned.toLocaleString('id-ID')} poin akan didapat</p>}
              </div>
              <Button onClick={() => setStep('payment')} disabled={cart.length === 0}
                className="w-full h-14 text-lg font-black mt-6 bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-600/25 transition-all hover:-translate-y-0.5">
                Lanjut ke Pembayaran <QrCode className="size-5 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );

  // ─── STEP: PAYMENT (QRIS) ─────────────────────────────────────────────────────
  const renderPayment = () => (
    <main className="flex-1 overflow-y-auto bg-slate-50 relative p-4 md:p-8">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-0 w-full h-[50vh] bg-gradient-to-b from-indigo-600 to-indigo-900 rounded-b-[60px] shadow-xl pointer-events-none" />
      <div className="absolute top-10 right-20 w-64 h-64 bg-white/10 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute top-20 left-10 w-48 h-48 bg-indigo-400/20 blur-3xl rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 flex flex-col items-center">
        <div className="w-full flex items-center justify-between mb-8">
          <button onClick={() => setStep('cart')} className="flex items-center gap-2 text-white hover:text-indigo-100 font-bold px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-md transition-all">
            <ArrowLeft className="size-5" /> Kembali ke Keranjang
          </button>
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-6 py-2.5 rounded-xl text-white font-semibold shadow-sm">
            <ShieldCheck className="size-5 text-emerald-300" />
            Pembayaran Aman
          </div>
        </div>

        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Order Summary */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="bg-white rounded-[24px] border border-gray-100 shadow-xl p-6">
              <h3 className="font-extrabold text-gray-900 text-lg mb-4 flex items-center gap-2">
                <ShoppingCart className="size-5 text-indigo-600" />
                Ringkasan Pesanan
              </h3>
              
              <div className="max-h-[300px] overflow-y-auto pr-2 space-y-3 mb-4 custom-scrollbar">
                {cart.map(item => (
                  <div key={item.id} className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded-md">{item.quantity}x</span>
                      <span className="font-medium text-gray-800 line-clamp-1">{item.name}</span>
                    </div>
                    <span className="font-semibold text-gray-900">{rp(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed border-gray-200 pt-4 space-y-2">
                <div className="flex justify-between text-sm text-gray-500 font-medium">
                  <span>Subtotal</span>
                  <span>{rp(subtotal)}</span>
                </div>
                {promoDiscount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 font-bold">
                    <span>Diskon Promo</span>
                    <span>- {rp(promoDiscount)}</span>
                  </div>
                )}
                {pointsApplied > 0 && (
                  <div className="flex justify-between text-sm text-amber-500 font-bold">
                    <span>Poin Digunakan</span>
                    <span>- {rp(pointsApplied)}</span>
                  </div>
                )}
              </div>
            </div>

            {member && (
              <div className="bg-gradient-to-r from-amber-500 to-orange-400 rounded-[24px] shadow-lg p-5 text-white flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-100 mb-0.5">Member Reward</p>
                  <p className="font-semibold text-sm">+{pointsEarned.toLocaleString('id-ID')} Poin didapat</p>
                </div>
                <Coins className="size-8 text-amber-200 opacity-80" />
              </div>
            )}
          </div>

          {/* Right Column: Payment Action (QRIS or Lunas) */}
          <div className="lg:col-span-7 bg-white rounded-[32px] border border-gray-100 shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-8 md:p-12 text-center relative overflow-hidden">
            {/* Subtle background pattern */}
            <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #4f46e5 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
            
            <div className="relative z-10">
              {total === 0 ? (
                <div className="py-12">
                  <div className="mx-auto w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-inner shadow-emerald-200">
                    <CheckCircle2 className="size-12" />
                  </div>
                  <h2 className="text-4xl font-black text-gray-900 mb-3 tracking-tight">Pesanan Lunas!</h2>
                  <p className="text-gray-500 font-medium mb-12 text-lg">Seluruh tagihan telah dibayar menggunakan Poin Loyalitas.</p>
                  
                  <Button onClick={submitCheckout} disabled={isCheckingOut}
                    className="w-full h-16 text-lg font-black uppercase tracking-wider rounded-2xl shadow-[0_8px_20px_rgba(16,185,129,0.3)] bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 transition-all hover:-translate-y-1 hover:shadow-[0_12px_25px_rgba(16,185,129,0.4)] border-none text-white relative group overflow-hidden">
                    <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></span>
                    {isCheckingOut ? (
                      <><Loader2 className="size-6 mr-3 animate-spin" /> Sedang Memproses...</>
                    ) : (
                      <><Sparkles className="size-6 mr-3" /> Selesaikan Transaksi</>
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-sm font-extrabold mb-4 uppercase tracking-widest shadow-sm">
                    <QrCode className="size-4" /> Kode QRIS Aktif
                  </div>
                  
                  <p className="text-gray-500 font-medium mb-1">Total Pembayaran</p>
                  <p className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600 mb-8 tracking-tight">
                    {rp(total)}
                  </p>
                  
                  <div className="mx-auto w-[280px] md:w-[320px] aspect-square rounded-[32px] border-8 border-gray-50 shadow-inner p-4 bg-white relative group transition-transform duration-300 hover:scale-105">
                    <img src={qrUrl} alt="QRIS Payment" className="w-full h-full object-contain mix-blend-multiply" />
                    <div className="absolute inset-0 border-2 border-indigo-500/0 rounded-[24px] group-hover:border-indigo-500/50 transition-colors duration-500"></div>
                    {/* Scanner animation line */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.8)] opacity-0 group-hover:opacity-100 group-hover:animate-[scan_2s_ease-in-out_infinite]"></div>
                  </div>
                  
                  <div className="mt-8 flex flex-col items-center gap-2">
                    <p className="text-sm font-semibold text-gray-600 bg-gray-50 px-6 py-2 rounded-full border border-gray-200">
                      Arahkan kamera e-wallet atau m-banking ke QR code
                    </p>
                  </div>

                  <div className="mt-8">
                    <Button onClick={submitCheckout} disabled={isCheckingOut}
                      className="w-full h-16 text-lg font-black uppercase tracking-wider rounded-2xl shadow-[0_8px_20px_rgba(16,185,129,0.3)] bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 transition-all hover:shadow-[0_12px_25px_rgba(16,185,129,0.4)] border-none text-white overflow-hidden relative group">
                      <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></span>
                      {isCheckingOut ? (
                        <><Loader2 className="size-6 mr-3 animate-spin" /> Sedang Memproses...</>
                      ) : (
                        <><CheckCircle2 className="size-6 mr-3" /> Konfirmasi Pembayaran Selesai</>
                      )}
                    </Button>
                    <p className="text-xs text-gray-400 mt-4 font-medium flex items-center justify-center gap-1">
                      <Clock className="size-3.5" /> Tekan tombol konfirmasi hanya jika dana sudah masuk
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes scan {
          0% { top: 5%; }
          50% { top: 95%; }
          100% { top: 5%; }
        }
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 10px;
        }
      `}</style>
    </main>
  );

  // ─── STEP: RECEIPT ────────────────────────────────────────────────────────────
  const renderReceipt = () => (
    <main className="flex-1 overflow-y-auto bg-slate-50 flex items-center justify-center p-6 md:p-12 relative">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-400/20 via-slate-50 to-slate-50 pointer-events-none" />
      
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-20 items-center relative z-10">
        
        {/* Left Column: Success Message & Actions */}
        <div className="flex flex-col items-center md:items-start text-center md:text-left space-y-6 bg-white/70 backdrop-blur-xl p-8 md:p-12 rounded-[40px] border border-white shadow-xl shadow-emerald-900/5 relative overflow-hidden">
          {/* Decorative glow inside card */}
          <div className="absolute -top-20 -left-20 w-64 h-64 bg-emerald-400/20 blur-[60px] rounded-full pointer-events-none" />
          
          <div className="inline-flex items-center justify-center p-5 rounded-full bg-emerald-100 text-emerald-600 shadow-inner shadow-emerald-200 mb-2 relative z-10">
            <CheckCircle2 className="size-16" />
          </div>
          
          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight mb-4">Pembayaran<br/><span className="text-emerald-600">Berhasil!</span></h2>
            <p className="text-lg text-gray-500 font-medium max-w-sm">Terima kasih telah berbelanja. Transaksi Anda telah tercatat ke dalam sistem.</p>
          </div>

          {receipt?.member && (
            <div className="w-full max-w-md bg-gradient-to-r from-amber-500 to-orange-400 rounded-[24px] p-6 text-white shadow-lg shadow-orange-500/20 flex items-center justify-between mt-2 relative z-10">
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-amber-100 mb-1">Poin Loyalitas Didapat</p>
                <p className="text-3xl font-black">+{receipt.pointsEarned.toLocaleString('id-ID')}</p>
              </div>
              <Sparkles className="size-10 text-amber-200 opacity-80" />
            </div>
          )}

          <div className="w-full max-w-md pt-6 mt-4 border-t border-gray-200/60 relative z-10">
            <Button onClick={resetTransaction} className="w-full h-16 text-xl font-black bg-indigo-600 hover:bg-indigo-700 rounded-2xl shadow-xl shadow-indigo-600/30 hover:-translate-y-1 transition-all">
              <RefreshCw className="size-6 mr-3" /> Transaksi Baru
            </Button>
            
            <Button onClick={openReceiptPreview} variant="outline" className="w-full h-14 mt-4 border-gray-300 text-gray-700 hover:bg-gray-50 rounded-2xl font-bold bg-white/50 backdrop-blur-sm shadow-sm flex items-center justify-center gap-3">
              <FileImage className="size-5 text-gray-500" /> Lihat &amp; Unduh Struk
            </Button>

            <p className="text-center text-sm text-gray-500 mt-5 font-medium">Sistem akan memuat ulang dalam <b className="text-gray-900 bg-gray-100 px-2 py-1 rounded-md">{countdown}</b> detik</p>
          </div>
        </div>

        {/* Right Column: The Receipt Slip */}
        <div className="flex justify-center md:justify-end">
          <div ref={receiptRef} className="w-full max-w-[360px] bg-[#fdfdfd] shadow-2xl relative pt-6 pb-10 font-mono text-gray-800">
            {/* Top jagged edge */}
            <div className="absolute -top-3 left-0 w-full h-3 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PHBvbHlnb24gcG9pbnRzPSIwLDAgNSwxMCAxMCwwIiBmaWxsPSIjZmRmZGZkIi8+PC9zdmc+')] bg-repeat-x z-20" />
            
            <div className="px-6 pb-4 text-center">
              <h3 className="text-xl font-bold tracking-widest uppercase mb-1">AutoCashier</h3>
              <p className="text-xs text-gray-500 uppercase">Struk Pembayaran</p>
              <p className="text-xs text-gray-500 mb-4">{receipt?.invoiceNumber}</p>
              <div className="border-b-2 border-dashed border-gray-300 w-full" />
            </div>
            
            <div className="px-6 py-2 space-y-3 text-sm">
              {receipt?.items?.map((it: CartItem) => (
                <div key={it.id} className="flex justify-between items-start">
                  <div className="flex flex-col max-w-[65%]">
                    <span className="font-semibold uppercase truncate">{it.name}</span>
                    <span className="text-gray-500 text-xs">{it.quantity} x {rp(it.price)}</span>
                  </div>
                  <span className="font-bold">{rp(it.price * it.quantity)}</span>
                </div>
              ))}
            </div>
            
            <div className="px-6 py-4">
              <div className="border-b-2 border-dashed border-gray-300 w-full mb-3" />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{rp(receipt?.subtotal || 0)}</span></div>
                {receipt?.promoDiscount > 0 && <div className="flex justify-between"><span>Diskon</span><span>-{rp(receipt.promoDiscount)}</span></div>}
                {receipt?.pointsApplied > 0 && <div className="flex justify-between"><span>Poin</span><span>-{rp(receipt.pointsApplied)}</span></div>}
              </div>
              <div className="border-b-2 border-dashed border-gray-300 w-full mt-3 mb-3" />
              <div className="flex justify-between items-center">
                <span className="font-bold uppercase text-lg">Total</span>
                <span className="text-xl font-bold">{rp(receipt?.total || 0)}</span>
              </div>
              {receipt?.total === 0 ? (
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs">Tipe Bayar</span>
                  <span className="text-xs font-bold uppercase">LUNAS (POIN)</span>
                </div>
              ) : (
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs">Tipe Bayar</span>
                  <span className="text-xs font-bold uppercase">QRIS</span>
                </div>
              )}
            </div>

            <div className="px-6 text-center text-xs text-gray-500 mt-4 space-y-1">
              <p>Terima Kasih</p>
              <p>Barang yang sudah dibeli<br/>tidak dapat ditukar/dikembalikan</p>
            </div>

            {/* Bottom jagged edge */}
            <div className="absolute -bottom-3 left-0 w-full h-3 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PHBvbHlnb24gcG9pbnRzPSIwLDEwIDUsMCAxMCwxMCIgZmlsbD0id2hpdGUiLz48L3N2Zz4=')] bg-repeat-x z-20" />
          </div>
        </div>

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

      {/* ─── Receipt Preview Modal ──────────────────────────────────────────── */}
      {receiptPreviewUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
          onClick={closeReceiptPreview}
        >
          <div
            className="relative flex flex-col items-center gap-6 max-h-[95vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={closeReceiptPreview}
              className="absolute -top-4 -right-4 z-10 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-xl hover:bg-gray-100 transition-colors text-gray-700"
            >
              <X className="size-5" />
            </button>

            {/* Title */}
            <div className="text-white font-bold text-lg tracking-wide">Preview Struk</div>

            {/* Receipt image */}
            <div className="overflow-y-auto max-h-[65vh] rounded-2xl shadow-2xl border-4 border-white/20">
              <img
                src={receiptPreviewUrl}
                alt="Preview Struk"
                className="block"
                style={{ width: '360px', imageRendering: 'crisp-edges' }}
              />
            </div>

            {/* Download buttons */}
            <div className="flex gap-4 w-full">
              <button
                onClick={handleDownloadPNG}
                className="flex-1 flex items-center justify-center gap-2 h-14 rounded-2xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-900/30 transition-all hover:-translate-y-0.5"
              >
                <FileImage className="size-5" /> Unduh PNG
              </button>
              <button
                onClick={handleDownloadPDF}
                className="flex-1 flex items-center justify-center gap-2 h-14 rounded-2xl font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-900/30 transition-all hover:-translate-y-0.5"
              >
                <FileText className="size-5" /> Unduh PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
