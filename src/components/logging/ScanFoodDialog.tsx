import { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, RotateCcw, Plus, Loader2, ScanBarcode, FileText, X, Zap, FlipHorizontal2, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';
import { motion, AnimatePresence } from 'framer-motion';

export interface ScannedFoodItem {
  food_name: string;
  serving_g: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

type ScanMode = 'food' | 'barcode' | 'label';

interface ScanFoodDialogProps {
  children: React.ReactNode;
  onFoodsScanned?: (items: ScannedFoodItem[]) => void;
}

export default function ScanFoodDialog({ children, onFoodsScanned }: ScanFoodDialogProps) {
  const { lang } = useAppSettings();
  const T = t(lang);
  const [open, setOpen] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>('food');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<ScannedFoodItem[] | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoScanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAnalyzingRef = useRef(false);
  const currentModeRef = useRef<ScanMode>(scanMode);

  // Keep ref in sync
  useEffect(() => {
    currentModeRef.current = scanMode;
  }, [scanMode]);

  const startCamera = useCallback(async (facing: 'environment' | 'user' = 'environment') => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      toast.error(lang === 'vi' ? 'Không thể truy cập camera' : 'Cannot access camera');
    }
  }, [lang]);

  const stopCamera = useCallback(() => {
    if (autoScanTimerRef.current) {
      clearInterval(autoScanTimerRef.current);
      autoScanTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // Auto-scan for barcode mode - capture every 2.5s
  useEffect(() => {
    if (!open || capturedImage || analyzing) return;

    if (scanMode === 'barcode') {
      // Start auto-scanning
      autoScanTimerRef.current = setInterval(() => {
        if (isAnalyzingRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        silentAnalyze(dataUrl);
      }, 2500);
    } else {
      if (autoScanTimerRef.current) {
        clearInterval(autoScanTimerRef.current);
        autoScanTimerRef.current = null;
      }
    }

    return () => {
      if (autoScanTimerRef.current) {
        clearInterval(autoScanTimerRef.current);
        autoScanTimerRef.current = null;
      }
    };
  }, [scanMode, open, capturedImage, analyzing]);

  // Silent analyze for auto-barcode (doesn't freeze camera)
  const silentAnalyze = async (dataUrl: string) => {
    if (isAnalyzingRef.current) return;
    isAnalyzingRef.current = true;
    setAnalyzing(true);
    try {
      const base64 = dataUrl.split(',')[1];
      const { data, error } = await supabase.functions.invoke('scan-food', {
        body: { image_base64: base64, lang, mode: 'barcode' },
      });
      if (error) throw error;
      if (data?.items && data.items.length > 0) {
        // Found a barcode product! Stop camera, show results
        setCapturedImage(dataUrl);
        setResults(data.items);
        stopCamera();
        toast.success(lang === 'vi' ? 'Đã nhận dạng sản phẩm!' : 'Product identified!');
      }
      // If empty, keep scanning silently
    } catch {
      // Silent fail, keep scanning
    } finally {
      isAnalyzingRef.current = false;
      setAnalyzing(false);
    }
  };

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setCapturedImage(null);
      setResults(null);
      setAnalyzing(false);
      isAnalyzingRef.current = false;
      setTimeout(() => startCamera(facingMode), 300);
    } else {
      stopCamera();
    }
  };

  const captureAndAnalyze = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(dataUrl);
    stopCamera();
    analyzeImage(dataUrl);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setCapturedImage(dataUrl);
      stopCamera();
      analyzeImage(dataUrl);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const analyzeImage = async (dataUrl: string) => {
    setAnalyzing(true);
    setResults(null);
    isAnalyzingRef.current = true;
    try {
      const base64 = dataUrl.split(',')[1];
      const { data, error } = await supabase.functions.invoke('scan-food', {
        body: { image_base64: base64, lang, mode: scanMode },
      });
      if (error) throw error;
      if (data?.items && data.items.length > 0) {
        setResults(data.items);
      } else {
        toast.info(T.scanFoodNoFood);
        setResults([]);
      }
    } catch (err: any) {
      console.error('Scan error:', err);
      toast.error(T.scanFoodError);
      setResults([]);
    } finally {
      setAnalyzing(false);
      isAnalyzingRef.current = false;
    }
  };

  const retake = () => {
    setCapturedImage(null);
    setResults(null);
    setAnalyzing(false);
    isAnalyzingRef.current = false;
    startCamera(facingMode);
  };

  const flipCamera = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    if (open && !capturedImage) startCamera(next);
  };

  const handleAddToMeal = () => {
    if (results && results.length > 0 && onFoodsScanned) {
      onFoodsScanned(results);
    }
    setOpen(false);
  };

  const handleModeChange = (mode: ScanMode) => {
    setScanMode(mode);
    if (capturedImage) retake();
  };

  const totals = results?.reduce(
    (acc, item) => ({
      kcal: acc.kcal + item.kcal,
      protein_g: acc.protein_g + item.protein_g,
      carbs_g: acc.carbs_g + item.carbs_g,
      fat_g: acc.fat_g + item.fat_g,
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  const modeConfig: Record<ScanMode, { icon: typeof Camera; label: string; hint: string }> = {
    food: {
      icon: Zap,
      label: lang === 'vi' ? 'AI Scan' : 'AI Scan',
      hint: lang === 'vi' ? 'Hướng camera vào đồ ăn / đồ uống' : 'Point at food or drinks',
    },
    barcode: {
      icon: ScanBarcode,
      label: 'Barcode',
      hint: lang === 'vi' ? 'Tự động quét khi phát hiện barcode' : 'Auto-scans when barcode detected',
    },
    label: {
      icon: FileText,
      label: lang === 'vi' ? 'Nhãn' : 'Label',
      hint: lang === 'vi' ? 'Chụp bảng thông tin dinh dưỡng' : 'Capture nutrition facts panel',
    },
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden border-0 bg-black [&>button]:hidden">
        {/* Fullscreen camera view */}
        <div className="relative w-full" style={{ height: 'min(85vh, 700px)' }}>
          {/* Video feed / captured image */}
          {!capturedImage ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <img src={capturedImage} alt="Captured" className="absolute inset-0 w-full h-full object-cover" />
          )}

          {/* Top bar overlay */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
            <button onClick={() => setOpen(false)} className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
              <X className="w-5 h-5 text-white" />
            </button>
            <div className="text-white text-sm font-semibold tracking-wide">
              {modeConfig[scanMode].label}
            </div>
            <button onClick={flipCamera} className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
              <FlipHorizontal2 className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Scan overlay (only when camera active) */}
          {!capturedImage && (
            <div className="absolute inset-0 pointer-events-none z-[5]">
              <ScanOverlay mode={scanMode} isScanning={scanMode === 'barcode' && !analyzing} />
              {/* Scan line */}
              <motion.div
                className="absolute left-[12%] right-[12%] h-[2px] rounded-full"
                style={{
                  background: scanMode === 'barcode'
                    ? 'linear-gradient(90deg, transparent, hsl(0 100% 60% / 0.9), transparent)'
                    : 'linear-gradient(90deg, transparent, hsl(160 84% 39% / 0.8), transparent)',
                  boxShadow: scanMode === 'barcode'
                    ? '0 0 20px hsl(0 100% 60% / 0.6)'
                    : '0 0 12px hsl(160 84% 39% / 0.5)',
                }}
                animate={{ top: ['20%', '75%', '20%'] }}
                transition={{ duration: scanMode === 'barcode' ? 1.8 : 2.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          )}

          {/* Analyzing overlay */}
          <AnimatePresence>
            {analyzing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-20 bg-black/60 backdrop-blur-sm flex items-center justify-center"
              >
                <div className="text-center space-y-3">
                  <div className="relative w-20 h-20 mx-auto">
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-white/30"
                      animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <motion.div
                      className="absolute inset-3 rounded-full border-2 border-white/50"
                      animate={{ scale: [1, 1.2, 1], opacity: [0.7, 0.2, 0.7] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-white" />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-white">
                    {scanMode === 'barcode'
                      ? (lang === 'vi' ? 'Đang tìm barcode...' : 'Scanning for barcode...')
                      : T.scanFoodAnalyzing}
                  </p>
                  <div className="flex gap-1 justify-center">
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-white"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.3 }}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mode hint */}
          {!capturedImage && !analyzing && (
            <div className="absolute bottom-32 left-0 right-0 z-10 text-center">
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={scanMode}
                className="inline-block text-xs text-white/80 font-medium bg-black/40 backdrop-blur-md px-4 py-1.5 rounded-full"
              >
                {modeConfig[scanMode].hint}
              </motion.span>
            </div>
          )}

          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-12 pb-6 px-4">
            {/* Mode selector pills */}
            <div className="flex justify-center gap-2 mb-5">
              {(Object.keys(modeConfig) as ScanMode[]).map((mode) => {
                const { icon: Icon, label } = modeConfig[mode];
                const active = scanMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => handleModeChange(mode)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                      active
                        ? 'bg-white text-black shadow-lg scale-105'
                        : 'bg-white/15 text-white/70 backdrop-blur-sm'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Capture / retake buttons */}
            {!capturedImage ? (
              <div className="flex items-center justify-center gap-6">
                {/* Gallery */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center"
                >
                  <ImageIcon className="w-5 h-5 text-white" />
                </button>

                {/* Shutter (hidden in barcode auto-mode, shown in food/label) */}
                {scanMode !== 'barcode' ? (
                  <button
                    onClick={captureAndAnalyze}
                    className="w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <div className="w-[58px] h-[58px] rounded-full bg-white" />
                  </button>
                ) : (
                  <div className="w-[72px] h-[72px] rounded-full border-4 border-red-400/60 flex items-center justify-center">
                    <motion.div
                      className="w-[58px] h-[58px] rounded-full bg-red-500/80"
                      animate={{ scale: [1, 0.9, 1], opacity: [1, 0.7, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  </div>
                )}

                {/* Placeholder for symmetry */}
                <div className="w-12 h-12" />
              </div>
            ) : !analyzing ? (
              <div className="space-y-2">
                <Button variant="outline" onClick={retake} className="w-full rounded-2xl h-11 bg-white/10 border-white/20 text-white hover:bg-white/20">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  {T.scanFoodRetake}
                </Button>
              </div>
            ) : null}
          </div>

          {/* Results overlay */}
          <AnimatePresence>
            {results && results.length > 0 && (
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="absolute bottom-0 left-0 right-0 z-30 bg-background rounded-t-3xl max-h-[65%] overflow-y-auto"
              >
                <div className="p-4 space-y-3">
                  {/* Handle bar */}
                  <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto" />

                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {T.scanFoodEstimated} · {results.length} {T.scanFoodItems}
                  </p>

                  {results.map((item, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.08 }}
                      className="bg-secondary/30 rounded-2xl p-3 space-y-1.5 border border-border/10"
                    >
                      <p className="text-sm font-semibold">{item.food_name}</p>
                      <p className="text-xs text-muted-foreground">{item.serving_g}g {T.scanFoodServing}</p>
                      <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono mt-1">
                        <div><div className="text-muted-foreground text-[10px]">Kcal</div><div className="font-bold">{Math.round(item.kcal)}</div></div>
                        <div><div className="text-muted-foreground text-[10px]">P</div><div className="font-bold">{Math.round(item.protein_g)}g</div></div>
                        <div><div className="text-muted-foreground text-[10px]">C</div><div className="font-bold">{Math.round(item.carbs_g)}g</div></div>
                        <div><div className="text-muted-foreground text-[10px]">F</div><div className="font-bold">{Math.round(item.fat_g)}g</div></div>
                      </div>
                    </motion.div>
                  ))}

                  {totals && results.length > 1 && (
                    <div className="bg-primary/10 rounded-2xl p-3 grid grid-cols-4 gap-2 text-center text-xs font-mono border border-primary/20">
                      <div><div className="text-muted-foreground text-[10px]">Total</div><div className="font-bold text-primary">{Math.round(totals.kcal)}</div></div>
                      <div><div className="text-muted-foreground text-[10px]">P</div><div className="font-bold text-primary">{Math.round(totals.protein_g)}g</div></div>
                      <div><div className="text-muted-foreground text-[10px]">C</div><div className="font-bold text-primary">{Math.round(totals.carbs_g)}g</div></div>
                      <div><div className="text-muted-foreground text-[10px]">F</div><div className="font-bold text-primary">{Math.round(totals.fat_g)}g</div></div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={retake} className="flex-1 rounded-2xl h-11">
                      <RotateCcw className="w-4 h-4 mr-2" />
                      {T.scanFoodRetake}
                    </Button>
                    {onFoodsScanned && (
                      <Button onClick={handleAddToMeal} className="flex-1 rounded-2xl h-11">
                        <Plus className="w-4 h-4 mr-2" />
                        {T.scanFoodAddToMeal}
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <canvas ref={canvasRef} className="hidden" />
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      </DialogContent>
    </Dialog>
  );
}

function ScanOverlay({ mode, isScanning }: { mode: ScanMode; isScanning?: boolean }) {
  const frameClass = mode === 'barcode'
    ? 'left-[8%] right-[8%] top-[30%] bottom-[30%]'
    : mode === 'label'
    ? 'left-[10%] right-[10%] top-[20%] bottom-[20%]'
    : 'left-[12%] right-[12%] top-[15%] bottom-[15%]';

  const cornerColor = mode === 'barcode' ? 'border-red-400' : 'border-white';
  const cornerLen = mode === 'barcode' ? 'w-8 h-8' : 'w-7 h-7';

  return (
    <div className={`absolute ${frameClass}`}>
      <div className={`absolute top-0 left-0 ${cornerLen} border-t-[3px] border-l-[3px] ${cornerColor} rounded-tl-xl`} />
      <div className={`absolute top-0 right-0 ${cornerLen} border-t-[3px] border-r-[3px] ${cornerColor} rounded-tr-xl`} />
      <div className={`absolute bottom-0 left-0 ${cornerLen} border-b-[3px] border-l-[3px] ${cornerColor} rounded-bl-xl`} />
      <div className={`absolute bottom-0 right-0 ${cornerLen} border-b-[3px] border-r-[3px] ${cornerColor} rounded-br-xl`} />

      {/* Barcode scanning pulse */}
      {mode === 'barcode' && isScanning && (
        <motion.div
          className="absolute inset-0 border-2 border-red-400/40 rounded-xl"
          animate={{ opacity: [0, 0.6, 0], scale: [1, 1.02, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </div>
  );
}
