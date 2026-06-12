import * as React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { toast } from 'sonner';
import {
  Cpu, Database, Play, Loader2, CheckCircle2, XCircle, RefreshCw, AlertTriangle, Server, Upload, ImageOff,
  BarChart3, ShieldCheck, Cloud,
} from 'lucide-react';
import { useLanguage } from '@/shared/context/LanguageContext';

const API = '/api/kasir/vision';

function getToken(): string {
  try { return JSON.parse(localStorage.getItem('autocashier_user') || '{}')?.token || ''; } catch { return ''; }
}
function authHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  const t = getToken();
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

interface TrainStatus {
  state: 'idle' | 'running' | 'done' | 'error' | 'offline';
  message?: string;
  detail?: {
    accuracy?: number | null;
    eval_loss?: number | null;
    num_classes?: number;
    labels?: string[];
    candidate_rejected?: boolean;
    active_accuracy?: number | null;
    end_to_end_evaluation?: {
      scanner_outcome_accuracy?: number;
      false_accept_rate?: number;
    };
    temperature_scaling?: {
      temperature?: number;
      ece_before?: number;
      ece_after?: number;
    };
  };
}

interface EvaluationReport {
  generated_at: string;
  samples: number;
  classes?: number;
  expected_classes?: number;
  coverage_rate?: number;
  metrics: {
    admin_raw_classifier_accuracy: number;
    runtime_crop_classifier_accuracy: number;
    final_prediction_accuracy: number;
    scanner_outcome_accuracy: number;
    admin_to_scanner_gap: number;
    auto_accept_rate: number;
    auto_accept_precision: number;
    confirmation_rate: number;
    reject_rate: number;
    false_accept_rate: number;
    false_reject_rate: number;
  };
  decisions: Record<string, number>;
  per_class: Record<string, { samples: number; scanner_outcome_accuracy: number; false_accepts: number; false_rejects: number }>;
}

interface DatasetSummary {
  classes: Record<string, number>;
  total_images: number;
  num_classes: number;
  has_background: boolean;
  raw_sync?: { downloaded?: number; cached?: number; failed?: number; duration_seconds?: number };
  preprocessing?: {
    processed_images?: number;
    cached_images?: number;
    accelerator?: string;
    batch_size?: number;
    half?: boolean;
    images_per_second?: number;
    gpu_peak_allocated_mb?: number;
    detection_rate?: number;
  } | null;
}

interface ModelVersion {
  local: {
    exists: boolean;
    accuracy?: number | null;
    num_classes?: number;
    labels?: string[];
    train_runtime?: number;
    synced_at?: string;
    source_machine?: string;
  };
  cloud: {
    exists: boolean;
    file_name?: string;
    updated_at?: string;
    size_bytes?: number;
    error?: string;
  } | null;
}

const percent = (value?: number) => `${((value || 0) * 100).toFixed(1)}%`;

export default function AITrainingPage() {
  const { language } = useLanguage();
  const [health, setHealth] = React.useState<any>(null);
  const [dataset, setDataset] = React.useState<DatasetSummary | null>(null);
  const [building, setBuilding] = React.useState(false);
  const [status, setStatus] = React.useState<TrainStatus>({ state: 'idle' });
  const [starting, setStarting] = React.useState(false);
  const [evaluationState, setEvaluationState] = React.useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [evaluationReport, setEvaluationReport] = React.useState<EvaluationReport | null>(null);
  const [evaluationMessage, setEvaluationMessage] = React.useState('');
  const [versionInfo, setVersionInfo] = React.useState<ModelVersion | null>(null);
  const [syncState, setSyncState] = React.useState<{ state: 'idle' | 'running' | 'done' | 'error'; message?: string }>({ state: 'idle' });
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const evaluationPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const syncPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const [bgCount, setBgCount] = React.useState<number | null>(null);
  const [bgUploading, setBgUploading] = React.useState(false);
  const bgInputRef = React.useRef<HTMLInputElement>(null);

  const [buildLog, setBuildLog] = React.useState<string[]>([]);
  const [trainLog, setTrainLog] = React.useState<string[]>([]);

  const isTraining = status.state === 'running' || starting;

  const checkHealth = React.useCallback(async () => {
    try {
      const res = await fetch(`${API}/health`, { headers: authHeaders(false) });
      setHealth(await res.json());
    } catch {
      setHealth({ vision_server: 'offline' });
    }
  }, []);

  const fetchStatus = React.useCallback(async () => {
    try {
      const res = await fetch(`${API}/train-status`, { headers: authHeaders(false) });
      const data = await res.json();
      setStatus(data);
      return data as TrainStatus;
    } catch {
      setStatus({ state: 'offline', message: 'Vision server tidak dapat dijangkau' });
      return { state: 'offline' } as TrainStatus;
    }
  }, []);

  const fetchTrainLog = React.useCallback(async () => {
    try {
      const r = await (await fetch(`${API}/train-log`, { headers: authHeaders(false) })).json();
      setTrainLog(r.log || []);
    } catch { /* ignore */ }
  }, []);

  const fetchEvaluationReport = React.useCallback(async () => {
    try {
      const res = await fetch(`${API}/evaluation-report`, { headers: authHeaders(false) });
      if (res.ok) setEvaluationReport(await res.json());
    } catch { /* no report yet */ }
  }, []);

  const fetchVersionInfo = React.useCallback(async () => {
    try {
      const res = await fetch(`${API}/model-version`, { headers: authHeaders(false) });
      if (res.ok) setVersionInfo(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchSyncStatus = React.useCallback(async () => {
    try {
      const res = await fetch(`${API}/sync-model-status`, { headers: authHeaders(false) });
      const data = await res.json();
      setSyncState(data);
      return data;
    } catch {
      return { state: 'error', message: 'Gagal menghubungi server' };
    }
  }, []);

  const fetchBg = React.useCallback(async () => {
    try {
      const res = await fetch('/api/shared/products/background', { headers: authHeaders(false) });
      const d = await res.json();
      if (d.status === 'success') setBgCount(d.count);
    } catch { /* ignore */ }
  }, []);

  React.useEffect(() => {
    checkHealth();
    fetchStatus();
    fetchBg();
    fetchEvaluationReport();
    fetchVersionInfo();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (evaluationPollRef.current) clearInterval(evaluationPollRef.current);
      if (syncPollRef.current) clearInterval(syncPollRef.current);
    };
  }, [checkHealth, fetchStatus, fetchBg, fetchEvaluationReport, fetchVersionInfo]);

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    setBgUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach(f => fd.append('files', f));
      const res = await fetch('/api/shared/products/background', { method: 'POST', headers: authHeaders(false), body: fd });
      const d = await res.json();
      if (res.ok && d.status === 'success') { toast.success(`${d.uploaded} file background diunggah`); fetchBg(); }
      else toast.error(d.error || 'Gagal mengunggah background');
    } catch { toast.error('Gagal mengunggah background'); }
    finally { setBgUploading(false); if (bgInputRef.current) bgInputRef.current.value = ''; }
  };

  const handleBgClear = async () => {
    if (!confirm('Hapus semua file background?')) return;
    try {
      const res = await fetch('/api/shared/products/background', { method: 'DELETE', headers: authHeaders(false) });
      const d = await res.json();
      if (res.ok && d.status === 'success') { toast.success(`${d.removed} file background dihapus`); fetchBg(); }
      else toast.error(d.error || 'Gagal menghapus background');
    } catch { toast.error('Gagal menghapus background'); }
  };

  // Poll while training is running
  React.useEffect(() => {
    if (status.state === 'running') {
      if (!pollRef.current) {
        pollRef.current = setInterval(async () => {
          const s = await fetchStatus();
          fetchTrainLog();
          if (s.state !== 'running') {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            if (s.state === 'done') {
              const acc = s.detail?.accuracy;
              toast.success(`Pelatihan selesai! ${acc != null ? `Akurasi: ${(acc * 100).toFixed(1)}%` : ''}`);
              fetchVersionInfo();
            } else if (s.state === 'error') {
              if (s.detail?.candidate_rejected) {
                toast.warning('Kandidat training ditolak. Model aktif yang lebih akurat tetap digunakan.');
              } else {
                toast.error(`Pelatihan gagal: ${s.message || ''}`);
              }
            }
          }
        }, 3000);
      }
    } else if (pollRef.current) {
      clearInterval(pollRef.current); pollRef.current = null;
    }
  }, [status.state, fetchStatus, fetchTrainLog]);

  const handleBuild = async () => {
    setBuilding(true);
    setDataset(null);
    try {
      const res = await fetch(`${API}/build-dataset`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          prepare_classifier: true,
          download_workers: 6,
          gpu_batch_size: 8,
          gpu_half: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || 'Gagal memulai build dataset');
        setBuilding(false);
        return;
      }
      // Runs in background on the GPU machine — poll until done
      const poll = async () => {
        try {
          const s = await (await fetch(`${API}/build-status`, { headers: authHeaders(false) })).json();
          setBuildLog(s.log || []);
          if (s.state === 'running') { setTimeout(poll, 3000); return; }
          if (s.state === 'done') {
            const d = s.detail || {};
            setDataset({
              classes: d.classes || {},
              total_images: d.total_images || 0,
              num_classes: d.num_classes || 0,
              has_background: !!d.has_background,
              raw_sync: d.raw_sync,
              preprocessing: d.preprocessing,
            });
            toast.success(`Dataset siap: ${d.num_classes} kelas, ${d.total_images} foto`);
          } else if (s.state === 'error') {
            toast.error(`Gagal build dataset: ${s.message || ''}`);
          } else {
            toast.error('Build dataset tidak berjalan');
          }
        } catch {
          toast.error('Gagal cek status build');
        } finally {
          setBuilding(false);
        }
      };
      setTimeout(poll, 1500);
    } catch {
      toast.error('Vision server tidak dapat dijangkau');
      setBuilding(false);
    }
  };

  const handleTrain = async () => {
    setStarting(true);
    setTrainLog([]);
    try {
      const res = await fetch(`${API}/train`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          video_aug_repeats: 3,
          use_classifier_cache: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Pelatihan dimulai. Ini berjalan di komputer GPU...');
        setStatus({ state: 'running', message: 'Training in progress...' });
      } else {
        toast.error(data.message || 'Gagal memulai pelatihan');
      }
    } catch {
      toast.error('Vision server tidak dapat dijangkau');
    } finally {
      setStarting(false);
    }
  };

  const handleEvaluation = async () => {
    setEvaluationState('running');
    setEvaluationMessage('Menjalankan pipeline scanner pada validation source...');
    try {
      const res = await fetch(`${API}/evaluate`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ max_images_per_class: 5, include_ocr: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Gagal memulai evaluasi');

      evaluationPollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API}/evaluation-status`, { headers: authHeaders(false) });
          const evaluation = await statusRes.json();
          setEvaluationMessage(evaluation.message || '');
          if (evaluation.state === 'done') {
            if (evaluationPollRef.current) clearInterval(evaluationPollRef.current);
            evaluationPollRef.current = null;
            setEvaluationState('done');
            setEvaluationReport(evaluation.detail);
            toast.success('Evaluasi scanner selesai');
          } else if (evaluation.state === 'error') {
            if (evaluationPollRef.current) clearInterval(evaluationPollRef.current);
            evaluationPollRef.current = null;
            setEvaluationState('error');
            toast.error(evaluation.message || 'Evaluasi scanner gagal');
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch (error: any) {
      setEvaluationState('error');
      setEvaluationMessage(error.message || 'Evaluasi scanner gagal');
      toast.error(error.message || 'Evaluasi scanner gagal');
    }
  };

  const handleSyncModel = async () => {
    setSyncState({ state: 'running', message: 'Memulai sinkronisasi...' });
    try {
      const res = await fetch(`${API}/sync-model`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || 'Gagal memulai sinkronisasi model');
        setSyncState({ state: 'error', message: data.message || 'Gagal memulai sinkronisasi' });
        return;
      }

      toast.info('Sinkronisasi model ke cloud dimulai...');
      
      syncPollRef.current = setInterval(async () => {
        const status = await fetchSyncStatus();
        if (status.state === 'done') {
          if (syncPollRef.current) clearInterval(syncPollRef.current);
          syncPollRef.current = null;
          toast.success('Model berhasil disinkronisasi dan di-reload!');
          fetchVersionInfo();
          checkHealth();
        } else if (status.state === 'error') {
          if (syncPollRef.current) clearInterval(syncPollRef.current);
          syncPollRef.current = null;
          toast.error(`Sinkronisasi gagal: ${status.message || ''}`);
        }
      }, 2000);
    } catch {
      toast.error('Vision server tidak dapat dijangkau');
      setSyncState({ state: 'error', message: 'Vision server tidak terjangkau' });
    }
  };

  const online = health && health.vision_server !== 'offline';
  const acc = status.detail?.accuracy;
  const candidateRejected = status.detail?.candidate_rejected === true;
  const evaluationRunning = evaluationState === 'running';
  const evaluationCoverageComplete = evaluationReport?.coverage_rate === 1;
  const weakestClasses = evaluationReport
    ? Object.entries(evaluationReport.per_class).sort((a, b) => a[1].scanner_outcome_accuracy - b[1].scanner_outcome_accuracy).slice(0, 5)
    : [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-600"><Cpu className="size-6" /></div>
        <div>
          <h1 className="text-2xl font-black text-gray-900">Pelatihan AI</h1>
          <p className="text-sm text-gray-500">Bangun dataset dari foto produk & latih model scanner — semua dari sini.</p>
        </div>
      </div>

      {/* Server status */}
      <Card className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server className={`size-5 ${online ? 'text-emerald-500' : 'text-rose-500'}`} />
          <div>
            <p className="text-sm font-semibold text-gray-800">Vision Server (komputer GPU)</p>
            <p className="text-xs text-gray-500">
              {online ? 'Online — siap melatih' : 'Offline — jalankan vision server di komputer GPU dulu'}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => { checkHealth(); fetchStatus(); }}>
          <RefreshCw className="size-4 mr-1.5" /> Cek
        </Button>
      </Card>

      {!online && (
        <Card className="p-4 bg-amber-50 border-amber-200 flex items-start gap-3">
          <AlertTriangle className="size-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Vision server harus menyala di komputer ber-GPU agar dataset & pelatihan bisa dijalankan dari sini.
            Jalankan: <code className="bg-amber-100 px-1.5 py-0.5 rounded">python vision_server.py</code>
          </p>
        </Card>
      )}

      {/* Background media */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ImageOff className="size-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-gray-900">Background (kondisi tanpa produk)</h2>
        </div>
        <p className="text-sm text-gray-600">
          Unggah foto/video suasana <b>kosong</b> (meja, tangan, orang lewat, benda non-produk, berbagai cahaya) agar
          scanner menolak saat tak ada produk. Video pendek beragam paling efektif. Disarankan total ≥150 frame.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => bgInputRef.current?.click()} disabled={!online || bgUploading} className="bg-indigo-600 hover:bg-indigo-700">
            {bgUploading ? <><Loader2 className="size-4 mr-2 animate-spin" /> Mengunggah...</> : <><Upload className="size-4 mr-2" /> Unggah Background</>}
          </Button>
          <span className="text-sm text-gray-500">Tersimpan: <b>{bgCount ?? '—'}</b> file</span>
          {bgCount !== null && bgCount > 0 && (
            <Button onClick={handleBgClear} variant="outline" size="sm" className="text-rose-600 border-rose-200 hover:bg-rose-50">
              Hapus semua
            </Button>
          )}
        </div>
        <input ref={bgInputRef} type="file" accept="image/*,video/*" multiple onChange={handleBgUpload} className="hidden" />
      </Card>

      {/* Step 1: Build dataset */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Database className="size-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-gray-900">1. Bangun Dataset</h2>
        </div>
        <p className="text-sm text-gray-600">
          Mengunduh semua foto produk (yang AI-nya aktif) dari database ke komputer GPU untuk pelatihan.
          Tidak perlu menaruh file ke folder secara manual.
        </p>
        <Button onClick={handleBuild} disabled={!online || building || isTraining} className="bg-indigo-600 hover:bg-indigo-700">
          {building ? <><Loader2 className="size-4 mr-2 animate-spin" /> Membangun...</> : <><Database className="size-4 mr-2" /> Bangun Dataset</>}
        </Button>

        {dataset && (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-800 mb-2">
              {dataset.num_classes} kelas · {dataset.total_images} foto
              {!dataset.has_background && <span className="ml-2 text-xs text-amber-600">(belum ada kelas "background")</span>}
            </p>
            {(dataset.raw_sync || dataset.preprocessing) && (
              <div className="mb-3 grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
                {dataset.raw_sync && (
                  <div className="rounded-lg border border-gray-200 bg-white p-2">
                    Raw sync: {dataset.raw_sync.cached || 0} cache, {dataset.raw_sync.downloaded || 0} download
                    {dataset.raw_sync.failed ? `, ${dataset.raw_sync.failed} gagal` : ''} Â· {dataset.raw_sync.duration_seconds?.toFixed?.(1) || 0}s
                  </div>
                )}
                {dataset.preprocessing && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-800">
                    GPU crop: {dataset.preprocessing.accelerator || 'cpu'} batch {dataset.preprocessing.batch_size || 1}
                    {dataset.preprocessing.half ? ' FP16' : ''} Â· {dataset.preprocessing.processed_images || 0} proses,
                    {' '}{dataset.preprocessing.cached_images || 0} cache Â· peak {dataset.preprocessing.gpu_peak_allocated_mb || 0} MB
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {Object.entries(dataset.classes).map(([cls, n]) => (
                <span key={cls} className="text-xs px-2 py-1 rounded-md bg-white border border-gray-200 text-gray-700">
                  {cls}: <b>{n}</b>
                </span>
              ))}
            </div>
          </div>
        )}

        {buildLog.length > 0 && (
          <pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 text-slate-100 text-xs p-3 font-mono whitespace-pre-wrap">
            {buildLog.join('\n')}
          </pre>
        )}
      </Card>

      {/* Step 2: Train */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Play className="size-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-gray-900">2. Latih Model</h2>
        </div>
        <p className="text-sm text-gray-600">
          Melatih ulang ResNet-50 secara bersih dari microsoft/resnet-50 menggunakan augmentasi crop,
          pencahayaan, blur, dan random erasing tanpa horizontal flip. Saat pelatihan berlangsung,
          scanner kasir sementara nonaktif (~beberapa menit). Kandidat hanya dipakai jika hasil evaluasinya
          tidak lebih buruk dari model aktif.
        </p>

        <div className="flex items-center gap-3">
          <Button onClick={handleTrain} disabled={!online || isTraining || building} className="bg-emerald-600 hover:bg-emerald-700">
            {isTraining ? <><Loader2 className="size-4 mr-2 animate-spin" /> Sedang Melatih...</> : <><Play className="size-4 mr-2" /> Latih Model</>}
          </Button>

          {/* Status badge */}
          {status.state === 'running' && (
            <span className="flex items-center gap-1.5 text-sm text-amber-600 font-semibold">
              <Loader2 className="size-4 animate-spin" /> Training berjalan...
            </span>
          )}
          {status.state === 'done' && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-semibold">
              <CheckCircle2 className="size-4" /> Selesai{acc != null ? ` · Akurasi ${(acc * 100).toFixed(1)}%` : ''}
            </span>
          )}
          {status.state === 'error' && candidateRejected && (
            <span className="flex items-center gap-1.5 text-sm text-amber-600 font-semibold">
              <AlertTriangle className="size-4" /> Kandidat ditolak
            </span>
          )}
          {status.state === 'error' && !candidateRejected && (
            <span className="flex items-center gap-1.5 text-sm text-rose-600 font-semibold">
              <XCircle className="size-4" /> Gagal
            </span>
          )}
        </div>

        {status.message && status.state !== 'idle' && (
          <p className="text-xs text-gray-500">{status.message}</p>
        )}
        {candidateRejected && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Model aktif dipertahankan</p>
            <p className="mt-1 text-xs text-amber-800">
              Kandidat clean training tidak lolos deployment gate karena akurasi validasinya
              {' '}{percent(status.detail?.accuracy ?? undefined)}, sedangkan model aktif
              {' '}{percent(status.detail?.active_accuracy ?? undefined)}.
              {status.detail?.end_to_end_evaluation?.scanner_outcome_accuracy != null
                ? ` Outcome scanner kandidat: ${percent(status.detail.end_to_end_evaluation.scanner_outcome_accuracy)}.`
                : ''}
              {status.detail?.end_to_end_evaluation?.false_accept_rate != null
                ? ` False accept kandidat: ${percent(status.detail.end_to_end_evaluation.false_accept_rate)}.`
                : ''}
            </p>
          </div>
        )}
        {status.state === 'done' && status.detail?.labels && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm">
            <p className="font-semibold text-emerald-800 mb-1">Model aktif — {status.detail.num_classes} kelas</p>
            <p className="text-xs text-emerald-700">{status.detail.labels.join(', ')}</p>
          </div>
        )}

        {trainLog.length > 0 && (
          <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 text-slate-100 text-xs p-3 font-mono whitespace-pre-wrap">
            {trainLog.join('\n')}
          </pre>
        )}
      </Card>

      {/* Step 3: End-to-end scanner evaluation */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-gray-900">3. Evaluasi Admin vs Scanner</h2>
        </div>
        <p className="text-sm text-gray-600">
          Mengukur model pada source validation yang tidak pernah masuk training, lalu membandingkan gambar mentah,
          crop runtime, OCR correction, dan keputusan scanner. Evaluasi ini tidak menulis scan log kasir.
        </p>
        <div className="flex items-center gap-3">
          <Button onClick={handleEvaluation} disabled={!online || isTraining || evaluationRunning} className="bg-indigo-600 hover:bg-indigo-700">
            {evaluationRunning ? <><Loader2 className="size-4 mr-2 animate-spin" /> Mengevaluasi...</> : <><ShieldCheck className="size-4 mr-2" /> Jalankan Evaluasi Scanner</>}
          </Button>
          {evaluationMessage && <span className="text-xs text-gray-500">{evaluationMessage}</span>}
        </div>

        {evaluationReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['Admin raw', evaluationReport.metrics.admin_raw_classifier_accuracy],
                ['Runtime crop', evaluationReport.metrics.runtime_crop_classifier_accuracy],
                ['Outcome scanner', evaluationReport.metrics.scanner_outcome_accuracy],
                ['False accept', evaluationReport.metrics.false_accept_rate],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-xl font-black text-gray-900">{percent(value as number)}</p>
                </div>
              ))}
            </div>
            <div className={`rounded-xl border p-4 ${evaluationReport.metrics.admin_to_scanner_gap > 0.1 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
              <p className="text-sm font-semibold">
                Gap admin ke scanner: {percent(evaluationReport.metrics.admin_to_scanner_gap)}
              </p>
              <p className="text-xs mt-1">
                Sampel: {evaluationReport.samples} · Coverage kelas:{' '}
                {evaluationReport.expected_classes
                  ? `${evaluationReport.classes}/${evaluationReport.expected_classes} (${percent(evaluationReport.coverage_rate)})`
                  : 'belum diverifikasi'}
                {' '}· Auto accept: {percent(evaluationReport.metrics.auto_accept_rate)}
                {' '}· Precision accept: {percent(evaluationReport.metrics.auto_accept_precision)}
                {' '}· Perlu konfirmasi: {percent(evaluationReport.metrics.confirmation_rate)}
                {' '}· False reject: {percent(evaluationReport.metrics.false_reject_rate)}
              </p>
            </div>
            {!evaluationCoverageComplete && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Laporan ini belum mencakup seluruh kelas model. Jangan gunakan angka akurasi ini sebagai patokan scanner live.
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-gray-800 mb-2">Kelas dengan outcome scanner terendah</p>
              <div className="flex flex-wrap gap-2">
                {weakestClasses.map(([className, data]) => (
                  <span key={className} className="text-xs px-2 py-1 rounded-md bg-white border border-gray-200 text-gray-700">
                    {className}: <b>{percent(data.scanner_outcome_accuracy)}</b>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Step 4: Cloud model sync */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Cloud className="size-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-gray-900">
            {language === 'id' ? '4. Sinkronisasi Model' : '4. Model Sync'}
          </h2>
        </div>
        <p className="text-sm text-gray-600">
          {language === 'id'
            ? 'Gunakan panel ini di laptop kasir untuk mengunduh model terbaru yang sudah dilatih di laptop training. Server akan mengunduh model dari Supabase Storage dan me-reload model baru secara otomatis tanpa restart.'
            : 'Use this panel on the cashier laptop to download the latest model trained on the training laptop. The server will download the model from Supabase Storage and reload it automatically without restarting.'}
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Local Model Info */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>{' '}
              {language === 'id' ? 'Model Aktif di Laptop Ini' : 'Active Model on This Laptop'}
            </h3>
            {versionInfo?.local?.exists ? (
              <div className="text-xs space-y-1 text-gray-600">
                <p>
                  {language === 'id' ? 'Akurasi: ' : 'Accuracy: '}
                  <span className="font-bold text-gray-900">{percent(versionInfo.local.accuracy ?? undefined)}</span>
                </p>
                <p>
                  {language === 'id' ? 'Jumlah Kelas: ' : 'Classes Count: '}
                  <span className="font-bold text-gray-900">{versionInfo.local.num_classes}</span>
                </p>
                {versionInfo.local.synced_at && (
                  <p>
                    {language === 'id' ? 'Tanggal Sinkronisasi: ' : 'Sync Date: '}
                    <span className="font-bold text-gray-900">
                      {new Date(versionInfo.local.synced_at).toLocaleString(language === 'id' ? 'id-ID' : 'en-US')}
                    </span>
                  </p>
                )}
                {versionInfo.local.labels && (
                  <p className="line-clamp-2">
                    {language === 'id' ? 'Kelas: ' : 'Classes: '}
                    {versionInfo.local.labels.join(', ')}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                {language === 'id' ? 'Belum ada model aktif lokal.' : 'No active local model found.'}
              </p>
            )}
          </div>

          {/* Cloud Model Info */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>{' '}
              {language === 'id' ? 'Model Terbaru di Cloud' : 'Latest Model in Cloud'}
            </h3>
            {versionInfo?.cloud?.exists ? (
              <div className="text-xs space-y-1 text-gray-600">
                <p>
                  {language === 'id' ? 'Ukuran Zip: ' : 'Zip Size: '}
                  <span className="font-bold text-gray-900">
                    {(versionInfo.cloud.size_bytes / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </p>
                <p>
                  {language === 'id' ? 'Diperbarui: ' : 'Updated: '}
                  <span className="font-bold text-gray-900">
                    {new Date(versionInfo.cloud.updated_at).toLocaleString(language === 'id' ? 'id-ID' : 'en-US')}
                  </span>
                </p>
                {versionInfo.local.synced_at && versionInfo.cloud.updated_at && 
                 new Date(versionInfo.cloud.updated_at) > new Date(versionInfo.local.synced_at) && (
                  <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    <AlertTriangle className="size-3 text-amber-500" />{' '}
                    {language === 'id' ? 'Update Tersedia' : 'Update Available'}
                  </div>
                )}
              </div>
            ) : versionInfo?.cloud?.exists === false ? (
              <p className="text-xs text-gray-500">
                {language === 'id' ? 'Belum ada model yang diunggah ke cloud.' : 'No cloud model uploaded yet.'}
              </p>
            ) : (
              <p className="text-xs text-gray-500">
                {language === 'id' ? 'Menghubungi cloud...' : 'Connecting to cloud...'}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            onClick={handleSyncModel} 
            disabled={!online || isTraining || syncState.state === 'running'} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {syncState.state === 'running' ? (
              <><Loader2 className="size-4 mr-2 animate-spin" /> {language === 'id' ? 'Sinkronisasi...' : 'Syncing...'}</>
            ) : (
              <><Cloud className="size-4 mr-2" /> {language === 'id' ? 'Sync Model dari Cloud' : 'Sync Model from Cloud'}</>
            )}
          </Button>

          {syncState.state === 'running' && syncState.message && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 font-semibold">
              <Loader2 className="size-3 animate-spin" /> {syncState.message}
            </span>
          )}
          {syncState.state === 'done' && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
              <CheckCircle2 className="size-3" /> {language === 'id' ? 'Berhasil disinkronkan' : 'Synced successfully'}
            </span>
          )}
          {syncState.state === 'error' && (
            <span className="flex items-center gap-1.5 text-xs text-rose-600 font-semibold">
              <XCircle className="size-3" /> {language === 'id' ? 'Gagal: ' : 'Failed: '}{syncState.message}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
