import { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, RotateCcw, Plus, Loader2, ScanBarcode, FileText, X, Zap, FlipHorizontal2, ImageIcon, Trash2, Minus, Clock, Flashlight, FlashlightOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { useBottomBar } from '@/components/AppLayout';

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
type ViewMode = 'camera' | 'history';

interface ScanHistoryEntry {
  id: string;
  scanned_at: string;
  mode: string;
  items: ScannedFoodItem[];
}

interface ScanFoodDialogProps {
  children: React.ReactNode;
  onFoodsScanned?: (items: ScannedFoodItem[]) => void;
}

// Haptic feedback helper
const haptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
  if ('vibrate' in navigator) {
    navigator.vibrate(style === 'light' ? 10 : style === 'medium' ? 20 : 30);
  }
};

export default function ScanFoodDialog({ children, onFoodsScanned }: ScanFoodDialogProps) {
  const { lang } = useAppSettings();
  const T = t(lang);
  const { hideBottomBar, showBottomBar } = useBottomBar();
  const [open, setOpen] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>('food');
  const [viewMode, setViewMode] = useState<ViewMode>('camera');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<ScannedFoodItem[] | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [flashOn, setFlashOn] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<1 | 2>(1);
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [barcodeScanActive, setBarcodeScanActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoScanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAnalyzingRef = useRef(false);

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
      // Reset flash and zoom on new stream
      setFlashOn(false);
      setZoomLevel(1);
    } catch {
      toast.error(lang === 'vi' ? 'Không thể truy cập camera' : 'Cannot access camera');
    }
  }, [lang]);

  const toggleFlash = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const caps = track.getCapabilities?.() as any;
      if (!caps?.torch) { toast.info(lang === 'vi' ? 'Thiết bị không hỗ trợ flash' : 'Flash not supported'); return; }
      const next = !flashOn;
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setFlashOn(next);
      haptic('light');
    } catch { toast.info(lang === 'vi' ? 'Không thể bật flash' : 'Cannot toggle flash'); }
  }, [flashOn, lang]);

  const toggleZoom = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const caps = track.getCapabilities?.() as any;
      const next = zoomLevel === 1 ? 2 : 1;
      if (caps?.zoom) {
        const maxZoom = Math.min(caps.zoom.max, next);
        await track.applyConstraints({ advanced: [{ zoom: maxZoom } as any] });
      }
      setZoomLevel(next);
      haptic('light');
    } catch { /* zoom not supported, just update UI */ setZoomLevel(zoomLevel === 1 ? 2 : 1); }
  }, [zoomLevel]);

  const stopCamera = useCallback(() => {
    if (autoScanTimerRef.current) {
      clearInterval(autoScanTimerRef.current);
      autoScanTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // Lookup barcode from Open Food Facts
  const lookupBarcode = async (code: string): Promise<ScannedFoodItem[] | null> => {
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
      if (!res.ok) return null;
      const json = await res.json();
      if (json.status !== 1 || !json.product) return null;
      const p = json.product;
      const n = p.nutriments || {};
      const servingG = p.serving_quantity ? Number(p.serving_quantity) : (p.product_quantity ? Number(p.product_quantity) : 100);
      const name = (lang === 'vi' ? p.product_name_vi : null) || p.product_name || p.product_name_en || code;
      const factor = servingG / 100;
      return [{
        food_name: name,
        serving_g: servingG,
        kcal: Math.round((n['energy-kcal_100g'] || n['energy-kcal'] || 0) * factor * 10) / 10,
        protein_g: Math.round((n.proteins_100g || 0) * factor * 10) / 10,
        carbs_g: Math.round((n.carbohydrates_100g || 0) * factor * 10) / 10,
        fat_g: Math.round((n.fat_100g || 0) * factor * 10) / 10,
        fiber_g: Math.round((n.fiber_100g || 0) * factor * 10) / 10,
      }];
    } catch {
      return null;
    }
  };

  // Auto-scan for barcode mode using native BarcodeDetector API + Open Food Facts
  useEffect(() => {
    if (!open || capturedImage || viewMode !== 'camera') return;
    if (scanMode === 'barcode') {
      setBarcodeScanActive(true);

      const hasBarcodeDetector = 'BarcodeDetector' in window;
      let detector: any = null;
      if (hasBarcodeDetector) {
        try {
          detector = new (window as any).BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'data_matrix'],
          });
        } catch { /* fallback to AI */ }
      }

      autoScanTimerRef.current = setInterval(async () => {
        if (isAnalyzingRef.current) return;
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;

        // Try native BarcodeDetector first
        if (detector) {
          try {
            const barcodes = await detector.detect(video);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              if (!code) return;
              isAnalyzingRef.current = true;
              const canvas = canvasRef.current;
              if (canvas) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.getContext('2d')?.drawImage(video, 0, 0);
              }
              const dataUrl = canvas ? canvasRef.current!.toDataURL('image/jpeg', 0.85) : '';

              const items = await lookupBarcode(code);
              if (items && items.length > 0) {
                setCapturedImage(dataUrl);
                setResults(items);
                setBarcodeScanActive(false);
                stopCamera();
                haptic('heavy');
                saveToHistory(items, 'barcode');
                toast.success(lang === 'vi' ? `Đã nhận dạng: ${code}` : `Found: ${code}`);
                isAnalyzingRef.current = false;
                return;
              } else {
                // Not in Open Food Facts → fallback to AI
                if (dataUrl) await silentAnalyze(dataUrl);
              }
              isAnalyzingRef.current = false;
              return;
            }
          } catch { /* fallback below */ }
        }

        // Fallback: send frame to AI
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        silentAnalyze(dataUrl);
      }, detector ? 500 : 3000);
    } else {
      setBarcodeScanActive(false);
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
  }, [scanMode, open, capturedImage, viewMode]);

  // Fully silent barcode analyze via AI fallback
  const silentAnalyze = async (dataUrl: string) => {
    if (isAnalyzingRef.current) return;
    isAnalyzingRef.current = true;
    try {
      const base64 = dataUrl.split(',')[1];
      const { data, error } = await supabase.functions.invoke('scan-food', {
        body: { image_base64: base64, lang, mode: 'barcode' },
      });
      if (error) throw error;
      if (data?.items && data.items.length > 0) {
        setCapturedImage(dataUrl);
        setResults(data.items);
        setBarcodeScanActive(false);
        stopCamera();
        haptic('heavy');
        saveToHistory(data.items, 'barcode');
        toast.success(lang === 'vi' ? 'Đã nhận dạng sản phẩm!' : 'Product identified!');
      }
    } catch {
      // Silent fail
    } finally {
      isAnalyzingRef.current = false;
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data } = await supabase
        .from('scan_history')
        .select('id, scanned_at, mode, items')
        .order('scanned_at', { ascending: false })
        .limit(20);
      if (data) setHistory(data as unknown as ScanHistoryEntry[]);
    } catch { /* ignore */ }
    setLoadingHistory(false);
  };

  const saveToHistory = async (items: ScannedFoodItem[], mode: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('scan_history').insert({
        user_id: user.id,
        mode,
        items: items as any,
      });
    } catch { /* ignore */ }
  };

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      hideBottomBar();
      setCapturedImage(null);
      setResults(null);
      setAnalyzing(false);
      setEditingIdx(null);
      setViewMode('camera');
      isAnalyzingRef.current = false;
      setTimeout(() => startCamera(facingMode), 300);
    } else {
      stopCamera();
      showBottomBar();
    }
  };

  const captureAndAnalyze = () => {
    haptic('medium');
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
        haptic('heavy');
        saveToHistory(data.items, scanMode);
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
    setEditingIdx(null);
    isAnalyzingRef.current = false;
    startCamera(facingMode);
  };

  const flipCamera = () => {
    haptic('light');
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    if (open && !capturedImage) startCamera(next);
  };

  // Edit helpers
  const removeItem = (idx: number) => {
    haptic('medium');
    setResults(prev => {
      if (!prev) return prev;
      const next = prev.filter((_, i) => i !== idx);
      return next.length > 0 ? next : [];
    });
    setEditingIdx(null);
  };

  const updateServing = (idx: number, newServing: number) => {
    setResults(prev => {
      if (!prev) return prev;
      const item = prev[idx];
      const ratio = newServing / item.serving_g;
      return prev.map((it, i) => i !== idx ? it : {
        ...it,
        serving_g: newServing,
        kcal: Math.round(it.kcal * ratio * 10) / 10,
        protein_g: Math.round(it.protein_g * ratio * 10) / 10,
        carbs_g: Math.round(it.carbs_g * ratio * 10) / 10,
        fat_g: Math.round(it.fat_g * ratio * 10) / 10,
        fiber_g: Math.round(it.fiber_g * ratio * 10) / 10,
      });
    });
  };

  const handleAddToMeal = () => {
    if (results && results.length > 0 && onFoodsScanned) {
      haptic('heavy');
      onFoodsScanned(results);
    }
    setOpen(false);
  };

  const handleAddFromHistory = (items: ScannedFoodItem[]) => {
    if (onFoodsScanned) {
      haptic('heavy');
      onFoodsScanned(items);
    }
    setOpen(false);
  };

  const handleModeChange = (mode: ScanMode) => {
    haptic('light');
    setScanMode(mode);
    if (capturedImage) retake();
  };

  const switchToHistory = () => {
    haptic('light');
    setViewMode('history');
    stopCamera();
    fetchHistory();
  };

  const switchToCamera = () => {
    haptic('light');
    setViewMode('camera');
    setCapturedImage(null);
    setResults(null);
    setTimeout(() => startCamera(facingMode), 200);
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
      label: 'AI Scan',
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
        <div className="relative w-full" style={{ height: 'min(85vh, 700px)' }}>

          {/* === CAMERA VIEW === */}
          {viewMode === 'camera' && (
            <>
              {!capturedImage ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-300"
                  style={{ transform: `scale(${zoomLevel})` }}
                />
              ) : (
                <img src={capturedImage} alt="Captured" className="absolute inset-0 w-full h-full object-cover" />
              )}

              {/* Top bar */}
              <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
                <button onClick={() => setOpen(false)} className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
                  <X className="w-5 h-5 text-white" />
                </button>
                <div className="text-white text-sm font-semibold tracking-wide">
                  {modeConfig[scanMode].label}
                </div>
                <div className="flex gap-2">
                  <button onClick={toggleFlash} className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center ${flashOn ? 'bg-yellow-500/80' : 'bg-black/40'}`}>
                    {flashOn ? <Flashlight className="w-5 h-5 text-black" /> : <FlashlightOff className="w-5 h-5 text-white" />}
                  </button>
                  <button onClick={switchToHistory} className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
                    <Clock className="w-5 h-5 text-white" />
                  </button>
                  <button onClick={flipCamera} className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center">
                    <FlipHorizontal2 className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              {/* Scan overlay */}
              {!capturedImage && (
                <>
                  <div className="absolute inset-0 pointer-events-none z-[5]">
                    <ScanOverlay mode={scanMode} isScanning={barcodeScanActive} />
                    <motion.div
                      className="absolute left-[12%] right-[12%] h-[2px] rounded-full"
                      style={{
                        background: scanMode === 'barcode'
                          ? 'linear-gradient(90deg, transparent, hsl(0 100% 60% / 0.9), transparent)'
                          : 'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.8), transparent)',
                        boxShadow: scanMode === 'barcode'
                          ? '0 0 20px hsl(0 100% 60% / 0.6)'
                          : '0 0 12px hsl(var(--primary) / 0.5)',
                      }}
                      animate={{ top: ['20%', '75%', '20%'] }}
                      transition={{ duration: scanMode === 'barcode' ? 1.8 : 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </div>

                  {/* Zoom control */}
                  <div className="absolute top-1/2 right-3 z-10">
                    <button
                      onClick={toggleZoom}
                      className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white text-xs font-bold"
                    >
                      {zoomLevel}x
                    </button>
                  </div>
                </>
              )}

              {/* Analyzing overlay - only for food/label modes, NOT barcode */}
              <AnimatePresence>
                {analyzing && scanMode !== 'barcode' && (
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
                      <p className="text-sm font-medium text-white">{T.scanFoodAnalyzing}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Mode hint */}
              {!capturedImage && !analyzing && (
                <div className="absolute bottom-44 left-0 right-0 z-10 text-center">
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
              <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-16 pb-6 px-4" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}>
                <div className="flex justify-center gap-3 mb-5">
                  {(Object.keys(modeConfig) as ScanMode[]).map((mode) => {
                    const { icon: Icon, label } = modeConfig[mode];
                    const active = scanMode === mode;
                    return (
                      <button
                        key={mode}
                        onClick={() => handleModeChange(mode)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-semibold transition-all ${
                          active ? 'bg-white text-black shadow-lg scale-105' : 'bg-white/15 text-white/70 backdrop-blur-sm'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </button>
                    );
                  })}
                </div>

                {!capturedImage ? (
                  <div className="flex items-center justify-center gap-6">
                    <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-white" />
                    </button>
                    {scanMode !== 'barcode' ? (
                      <button onClick={captureAndAnalyze} className="w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform">
                        <div className="w-[58px] h-[58px] rounded-full bg-white" />
                      </button>
                    ) : (
                      <div className="w-[72px] h-[72px] rounded-full border-4 border-destructive/60 flex items-center justify-center">
                        <motion.div
                          className="w-[58px] h-[58px] rounded-full bg-destructive/80"
                          animate={{ scale: [1, 0.9, 1], opacity: [1, 0.7, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        />
                      </div>
                    )}
                    <div className="w-12 h-12" />
                  </div>
                ) : !analyzing ? (
                  <Button variant="outline" onClick={retake} className="w-full rounded-2xl h-11 bg-white/10 border-white/20 text-white hover:bg-white/20">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {T.scanFoodRetake}
                  </Button>
                ) : null}
              </div>

              {/* Results overlay with edit/delete */}
              <AnimatePresence>
                {results && results.length > 0 && (
                  <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="absolute bottom-0 left-0 right-0 z-30 bg-background rounded-t-3xl max-h-[70%] overflow-y-auto"
                  >
                    <div className="p-4 space-y-3">
                      <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {T.scanFoodEstimated} · {results.length} {T.scanFoodItems}
                      </p>

                      {results.map((item, idx) => (
                        <motion.div
                          key={`${item.food_name}-${idx}`}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20, height: 0 }}
                          transition={{ delay: idx * 0.06 }}
                          layout
                          className="bg-secondary/30 rounded-2xl p-3 space-y-2 border border-border/10"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-semibold">{item.food_name}</p>
                              {/* Editable serving */}
                              <div className="flex items-center gap-2 mt-1">
                                {editingIdx === idx ? (
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="number"
                                      defaultValue={item.serving_g}
                                      className="w-20 h-7 text-xs bg-background"
                                      onBlur={(e) => {
                                        const v = parseFloat(e.target.value);
                                        if (v > 0) updateServing(idx, v);
                                        setEditingIdx(null);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          const v = parseFloat((e.target as HTMLInputElement).value);
                                          if (v > 0) updateServing(idx, v);
                                          setEditingIdx(null);
                                        }
                                      }}
                                      autoFocus
                                    />
                                    <span className="text-xs text-muted-foreground">g</span>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { haptic('light'); setEditingIdx(idx); }}
                                    className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 decoration-dashed"
                                  >
                                    {item.serving_g}g {T.scanFoodServing}
                                  </button>
                                )}
                              </div>
                            </div>
                            <motion.button
                              whileTap={{ scale: 0.8 }}
                              onClick={() => removeItem(idx)}
                              className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center hover:bg-destructive/20 transition-colors"
                            >
                              <Minus className="w-4 h-4 text-destructive" />
                            </motion.button>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
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
            </>
          )}

          {/* === HISTORY VIEW === */}
          {viewMode === 'history' && (
            <div className="absolute inset-0 bg-background overflow-y-auto">
              <div className="sticky top-0 z-10 flex items-center gap-3 p-4 bg-background/90 backdrop-blur-md border-b border-border/10">
                <button onClick={switchToCamera} className="w-9 h-9 rounded-full bg-secondary/50 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
                <h3 className="text-sm font-semibold flex-1">
                  {lang === 'vi' ? 'Lịch sử quét' : 'Scan History'}
                </h3>
              </div>

              <div className="p-4 space-y-3">
                {loadingHistory && (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                )}

                {!loadingHistory && history.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    {lang === 'vi' ? 'Chưa có lịch sử quét' : 'No scan history yet'}
                  </div>
                )}

                {history.map((entry) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-secondary/20 rounded-2xl p-3 border border-border/10 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(entry.scanned_at).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground/60 uppercase">{entry.mode}</p>
                      </div>
                      {onFoodsScanned && (
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleAddFromHistory(entry.items)}
                          className="px-3 py-1.5 rounded-full bg-primary/15 text-primary text-xs font-semibold"
                        >
                          <Plus className="w-3 h-3 inline mr-1" />
                          {lang === 'vi' ? 'Thêm' : 'Add'}
                        </motion.button>
                      )}
                    </div>
                    {entry.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="font-medium truncate flex-1">{item.food_name}</span>
                        <span className="text-muted-foreground ml-2">{Math.round(item.kcal)} kcal</span>
                      </div>
                    ))}
                  </motion.div>
                ))}
              </div>
            </div>
          )}
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

  const cornerColor = mode === 'barcode' ? 'border-destructive' : 'border-white';
  const cornerLen = mode === 'barcode' ? 'w-8 h-8' : 'w-7 h-7';

  return (
    <div className={`absolute ${frameClass}`}>
      <div className={`absolute top-0 left-0 ${cornerLen} border-t-[3px] border-l-[3px] ${cornerColor} rounded-tl-xl`} />
      <div className={`absolute top-0 right-0 ${cornerLen} border-t-[3px] border-r-[3px] ${cornerColor} rounded-tr-xl`} />
      <div className={`absolute bottom-0 left-0 ${cornerLen} border-b-[3px] border-l-[3px] ${cornerColor} rounded-bl-xl`} />
      <div className={`absolute bottom-0 right-0 ${cornerLen} border-b-[3px] border-r-[3px] ${cornerColor} rounded-br-xl`} />

      {mode === 'barcode' && isScanning && (
        <motion.div
          className="absolute inset-0 border-2 border-destructive/40 rounded-xl"
          animate={{ opacity: [0, 0.6, 0], scale: [1, 1.02, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </div>
  );
}
