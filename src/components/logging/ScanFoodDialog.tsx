import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Camera, RotateCcw, Plus, Loader2, ScanBarcode, FileText } from 'lucide-react';
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      // Camera not available
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setCapturedImage(null);
      setResults(null);
      setTimeout(startCamera, 300);
    } else {
      stopCamera();
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
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
    }
  };

  const retake = () => {
    setCapturedImage(null);
    setResults(null);
    startCamera();
  };

  const handleAddToMeal = () => {
    if (results && results.length > 0 && onFoodsScanned) {
      onFoodsScanned(results);
    }
    setOpen(false);
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

  const modeLabels: Record<ScanMode, { icon: typeof Camera; label: string }> = {
    food: { icon: Camera, label: lang === 'vi' ? 'Đồ ăn' : 'Food' },
    barcode: { icon: ScanBarcode, label: 'Barcode' },
    label: { icon: FileText, label: lang === 'vi' ? 'Nhãn' : 'Label' },
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            {T.scanFoodTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 p-4 pt-0">
          {/* Scan mode tabs */}
          <Tabs value={scanMode} onValueChange={v => setScanMode(v as ScanMode)}>
            <TabsList className="grid grid-cols-3 w-full bg-secondary/30 h-9">
              {(Object.keys(modeLabels) as ScanMode[]).map((mode) => {
                const { icon: Icon, label } = modeLabels[mode];
                return (
                  <TabsTrigger key={mode} value={mode} className="text-xs gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          {/* Camera / Preview */}
          <div className="relative aspect-[4/3] bg-secondary/20 rounded-2xl overflow-hidden">
            {!capturedImage ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Scan overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Corner brackets */}
                  <ScanOverlay mode={scanMode} />
                  {/* Scan line animation */}
                  <motion.div
                    className="absolute left-[15%] right-[15%] h-[2px] rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, transparent, hsl(160 84% 39% / 0.8), transparent)',
                      boxShadow: '0 0 12px hsl(160 84% 39% / 0.5)',
                    }}
                    animate={{ top: ['20%', '75%', '20%'] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
              </>
            ) : (
              <img src={capturedImage} alt="Captured food" className="w-full h-full object-cover" />
            )}

            {/* Analyzing overlay */}
            <AnimatePresence>
              {analyzing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-background/70 backdrop-blur-md flex items-center justify-center"
                >
                  <div className="text-center space-y-3">
                    <div className="relative w-16 h-16 mx-auto">
                      <motion.div
                        className="absolute inset-0 rounded-full border-2 border-primary/30"
                        animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                      <motion.div
                        className="absolute inset-2 rounded-full border-2 border-primary/50"
                        animate={{ scale: [1, 1.2, 1], opacity: [0.7, 0.2, 0.7] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-7 h-7 animate-spin text-primary" />
                      </div>
                    </div>
                    <p className="text-sm font-medium text-foreground">{T.scanFoodAnalyzing}</p>
                    <div className="flex gap-1 justify-center">
                      {[0, 1, 2].map(i => (
                        <motion.div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-primary"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.3 }}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <canvas ref={canvasRef} className="hidden" />
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />

          {/* Action buttons */}
          {!capturedImage && (
            <div className="flex gap-2">
              <Button onClick={capturePhoto} className="flex-1 rounded-2xl h-12 text-sm font-semibold">
                <Camera className="w-4 h-4 mr-2" />
                {T.scanFoodCapture}
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="rounded-2xl h-12 w-12 p-0">
                📁
              </Button>
            </div>
          )}

          {capturedImage && !analyzing && (
            <Button variant="outline" onClick={retake} className="w-full rounded-2xl h-11">
              <RotateCcw className="w-4 h-4 mr-2" />
              {T.scanFoodRetake}
            </Button>
          )}

          {/* Results */}
          <AnimatePresence>
            {results && results.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {T.scanFoodEstimated} · {results.length} {T.scanFoodItems}
                </p>

                {results.map((item, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
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

                {onFoodsScanned && (
                  <Button onClick={handleAddToMeal} className="w-full rounded-2xl h-11">
                    <Plus className="w-4 h-4 mr-2" />
                    {T.scanFoodAddToMeal}
                  </Button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScanOverlay({ mode }: { mode: ScanMode }) {
  const cornerSize = mode === 'barcode' ? 'w-8 h-16' : 'w-10 h-10';
  const frameClass = mode === 'barcode'
    ? 'left-[10%] right-[10%] top-[25%] bottom-[25%]'
    : 'left-[15%] right-[15%] top-[15%] bottom-[15%]';

  return (
    <div className={`absolute ${frameClass}`}>
      {/* Top-left corner */}
      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl-lg" />
      {/* Top-right corner */}
      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr-lg" />
      {/* Bottom-left corner */}
      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl-lg" />
      {/* Bottom-right corner */}
      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br-lg" />

      {/* Mode-specific hint */}
      <div className="absolute -bottom-7 left-0 right-0 text-center">
        <span className="text-[10px] text-primary/70 font-medium bg-background/50 px-2 py-0.5 rounded-full backdrop-blur-sm">
          {mode === 'barcode' ? '📦 Barcode' : mode === 'label' ? '🏷️ Nutrition Label' : '🍽️ Food'}
        </span>
      </div>
    </div>
  );
}
