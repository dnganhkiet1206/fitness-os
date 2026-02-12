import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, RotateCcw, Plus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';

export interface ScannedFoodItem {
  food_name: string;
  serving_g: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

interface ScanFoodDialogProps {
  children: React.ReactNode;
  onFoodsScanned?: (items: ScannedFoodItem[]) => void;
}

export default function ScanFoodDialog({ children, onFoodsScanned }: ScanFoodDialogProps) {
  const { lang } = useAppSettings();
  const T = t(lang);
  const [open, setOpen] = useState(false);
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
      // Camera not available, user can use file upload
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
  };

  const analyzeImage = async (dataUrl: string) => {
    setAnalyzing(true);
    setResults(null);
    try {
      const base64 = dataUrl.split(',')[1];
      const { data, error } = await supabase.functions.invoke('scan-food', {
        body: { image_base64: base64, lang },
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

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            {T.scanFoodTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-4">
          {/* Camera / Preview */}
          <div className="relative aspect-[4/3] bg-secondary/30 rounded-xl overflow-hidden">
            {!capturedImage ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-48 h-48 border-2 border-primary/40 rounded-2xl" />
                </div>
              </>
            ) : (
              <img src={capturedImage} alt="Captured food" className="w-full h-full object-cover" />
            )}

            {analyzing && (
              <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center">
                <div className="text-center space-y-2">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                  <p className="text-sm font-medium">{T.scanFoodAnalyzing}</p>
                </div>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />

          {/* Action buttons */}
          {!capturedImage && (
            <div className="flex gap-2">
              <Button onClick={capturePhoto} className="flex-1 rounded-xl">
                <Camera className="w-4 h-4 mr-2" />
                {T.scanFoodCapture}
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="rounded-xl">
                📁
              </Button>
            </div>
          )}

          {capturedImage && !analyzing && (
            <Button variant="outline" onClick={retake} className="w-full rounded-xl">
              <RotateCcw className="w-4 h-4 mr-2" />
              {T.scanFoodRetake}
            </Button>
          )}

          {/* Results */}
          {results && results.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {T.scanFoodEstimated} · {results.length} {T.scanFoodItems}
              </p>

              {results.map((item, idx) => (
                <div key={idx} className="bg-secondary/30 rounded-xl p-3 space-y-1">
                  <p className="text-sm font-semibold">{item.food_name}</p>
                  <p className="text-xs text-muted-foreground">{item.serving_g}g {T.scanFoodServing}</p>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono mt-1">
                    <div>
                      <div className="text-muted-foreground text-[10px]">Kcal</div>
                      <div className="font-bold">{Math.round(item.kcal)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">P</div>
                      <div className="font-bold">{Math.round(item.protein_g)}g</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">C</div>
                      <div className="font-bold">{Math.round(item.carbs_g)}g</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">F</div>
                      <div className="font-bold">{Math.round(item.fat_g)}g</div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Totals */}
              {totals && results.length > 1 && (
                <div className="bg-primary/10 rounded-xl p-3 grid grid-cols-4 gap-2 text-center text-xs font-mono">
                  <div>
                    <div className="text-muted-foreground text-[10px]">Total</div>
                    <div className="font-bold text-primary">{Math.round(totals.kcal)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[10px]">P</div>
                    <div className="font-bold text-primary">{Math.round(totals.protein_g)}g</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[10px]">C</div>
                    <div className="font-bold text-primary">{Math.round(totals.carbs_g)}g</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-[10px]">F</div>
                    <div className="font-bold text-primary">{Math.round(totals.fat_g)}g</div>
                  </div>
                </div>
              )}

              {onFoodsScanned && (
                <Button onClick={handleAddToMeal} className="w-full rounded-xl">
                  <Plus className="w-4 h-4 mr-2" />
                  {T.scanFoodAddToMeal}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
