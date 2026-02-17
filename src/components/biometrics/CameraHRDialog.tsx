import { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Heart, X, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogTrigger } from '@/components/ui/responsive-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { useInvalidateToday } from '@/hooks/useTodayData';
import { toast } from 'sonner';

type Phase = 'idle' | 'countdown' | 'measuring' | 'done' | 'error';

const MEASURE_DURATION = 15; // seconds
const SAMPLE_RATE = 30; // ~30fps

function extractRedChannel(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const frame = ctx.getImageData(0, 0, w, h);
  const data = frame.data;
  let sum = 0;
  let count = 0;
  // Sample center region only
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  const radius = Math.floor(Math.min(w, h) * 0.2);
  for (let y = cy - radius; y < cy + radius; y++) {
    for (let x = cx - radius; x < cx + radius; x++) {
      if (x >= 0 && x < w && y >= 0 && y < h) {
        const i = (y * w + x) * 4;
        sum += data[i]; // Red channel
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 0;
}

function estimateHR(signal: number[]): number | null {
  if (signal.length < SAMPLE_RATE * 5) return null;

  // Simple peak detection on detrended signal
  // Moving average for detrend
  const windowSize = Math.floor(SAMPLE_RATE * 1.5);
  const detrended: number[] = [];
  for (let i = 0; i < signal.length; i++) {
    const start = Math.max(0, i - windowSize);
    const end = Math.min(signal.length, i + windowSize);
    let avg = 0;
    for (let j = start; j < end; j++) avg += signal[j];
    avg /= (end - start);
    detrended.push(signal[i] - avg);
  }

  // Count zero crossings (positive-going)
  let crossings = 0;
  for (let i = 1; i < detrended.length; i++) {
    if (detrended[i - 1] < 0 && detrended[i] >= 0) {
      crossings++;
    }
  }

  const durationSec = signal.length / SAMPLE_RATE;
  const beatsPerSec = crossings / durationSec;
  const bpm = Math.round(beatsPerSec * 60);

  // Sanity check
  if (bpm < 40 || bpm > 200) return null;
  return bpm;
}

export default function CameraHRDialog({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const invalidate = useInvalidateToday();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const signalRef = useRef<number[]>([]);

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    cancelAnimationFrame(animFrameRef.current);
    signalRef.current = [];
  }, []);

  useEffect(() => {
    if (!open) {
      cleanup();
      setPhase('idle');
      setCountdown(3);
      setElapsed(0);
      setResult(null);
    }
  }, [open, cleanup]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 320, height: 240 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      // Countdown
      setPhase('countdown');
      let c = 3;
      setCountdown(c);
      const interval = setInterval(() => {
        c--;
        setCountdown(c);
        if (c <= 0) {
          clearInterval(interval);
          startMeasuring();
        }
      }, 1000);
    } catch {
      setPhase('error');
    }
  };

  const startMeasuring = () => {
    setPhase('measuring');
    signalRef.current = [];
    const startTime = performance.now();

    const sample = () => {
      if (!videoRef.current || !canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      const w = 320, h = 240;
      canvasRef.current.width = w;
      canvasRef.current.height = h;
      ctx.drawImage(videoRef.current, 0, 0, w, h);

      const redVal = extractRedChannel(ctx, w, h);
      signalRef.current.push(redVal);

      const elapsedSec = (performance.now() - startTime) / 1000;
      setElapsed(Math.min(elapsedSec, MEASURE_DURATION));

      if (elapsedSec >= MEASURE_DURATION) {
        const hr = estimateHR(signalRef.current);
        setResult(hr);
        setPhase(hr ? 'done' : 'error');
        cleanup();
        return;
      }

      animFrameRef.current = requestAnimationFrame(sample);
    };

    animFrameRef.current = requestAnimationFrame(sample);
  };

  const handleSave = async () => {
    if (!user || !result) return;
    setSaving(true);
    try {
      await supabase.from('biometric_samples').insert({
        user_id: user.id,
        source: 'camera_rppg',
        hr_bpm: result,
        confidence: 0.5,
        notes: 'Camera rPPG ước tính',
      });
      const dateStr = new Date().toISOString().split('T')[0];
      await recomputeDailyLog(user.id, dateStr);
      invalidate();
      toast.success(`Đã lưu nhịp tim: ${result} bpm (ước tính)`);
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const progress = elapsed / MEASURE_DURATION;

  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen}>
      <ResponsiveDialogTrigger asChild>{children}</ResponsiveDialogTrigger>
      <ResponsiveDialogContent className="max-w-sm p-0 overflow-hidden bg-card border-border/30">
        <div className="p-5 space-y-4">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary" />
              Đo Nhịp Tim qua Camera
            </ResponsiveDialogTitle>
          </ResponsiveDialogHeader>

          {/* Video feed */}
          <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
              style={{ transform: 'scaleX(-1)' }}
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Overlay guide circle */}
            {(phase === 'countdown' || phase === 'measuring') && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-28 h-28 rounded-full border-2 border-white/40 flex items-center justify-center">
                  {phase === 'countdown' && (
                    <motion.span
                      key={countdown}
                      initial={{ scale: 2, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-4xl font-bold text-white drop-shadow-lg"
                    >
                      {countdown}
                    </motion.span>
                  )}
                  {phase === 'measuring' && (
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                    >
                      <Heart className="w-8 h-8 text-red-500 fill-red-500 drop-shadow-lg" />
                    </motion.div>
                  )}
                </div>
              </div>
            )}

            {/* Measuring progress */}
            {phase === 'measuring' && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                <motion.div
                  className="h-full bg-gradient-to-r from-primary to-readiness-green"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            )}

            {/* Idle state */}
            {phase === 'idle' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-3">
                <Camera className="w-10 h-10 text-white/60" />
                <p className="text-xs text-white/60 text-center px-8">
                  Đặt ngón tay che nhẹ camera hoặc để camera nhìn khuôn mặt
                </p>
              </div>
            )}
          </div>

          {/* Instructions / Result */}
          <AnimatePresence mode="wait">
            {phase === 'idle' && (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="text-xs text-muted-foreground text-center mb-3">
                  Sử dụng camera để ước tính nhịp tim. Giữ yên trong 15 giây.
                </p>
                <Button onClick={startCamera} className="w-full rounded-xl">
                  <Camera className="w-4 h-4 mr-2" /> Bắt đầu đo
                </Button>
              </motion.div>
            )}

            {phase === 'measuring' && (
              <motion.div key="measuring" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                <p className="text-sm text-muted-foreground">Đang đo... giữ yên</p>
                <p className="text-xs text-muted-foreground font-mono mt-1">{Math.ceil(MEASURE_DURATION - elapsed)}s còn lại</p>
              </motion.div>
            )}

            {phase === 'done' && result && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-3">
                <div className="flex items-center justify-center gap-3">
                  <Heart className="w-6 h-6 text-red-500 fill-red-500" />
                  <span className="text-3xl font-bold font-mono">{result}</span>
                  <span className="text-sm text-muted-foreground">bpm</span>
                </div>
                <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Ước tính qua camera · độ tin cậy thấp
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setPhase('idle'); setResult(null); }}>
                    Đo lại
                  </Button>
                  <Button className="flex-1 rounded-xl" onClick={handleSave} disabled={saving}>
                    <Check className="w-4 h-4 mr-1" /> {saving ? 'Đang lưu...' : 'Lưu kết quả'}
                  </Button>
                </div>
              </motion.div>
            )}

            {phase === 'error' && (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-3">
                <p className="text-sm text-destructive">Không thể đo được. Hãy thử lại với ánh sáng tốt hơn.</p>
                <Button variant="outline" className="w-full rounded-xl" onClick={() => { cleanup(); setPhase('idle'); }}>
                  Thử lại
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
