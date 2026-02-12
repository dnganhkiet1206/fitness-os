import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Scale, Ruler, Camera, Trash2, Plus, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useWeightHistoryExtended, useBodyMeasurements, useUpsertBodyMeasurement, useProgressPhotos, useUploadProgressPhoto, useDeleteProgressPhoto } from '@/hooks/useProgressData';
import { useProfile } from '@/hooks/useTodayData';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Area, AreaChart } from 'recharts';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { ...spring, duration: 0.6 } },
};

export default function Progress() {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: weightHistory } = useWeightHistoryExtended(90);
  const { data: measurements } = useBodyMeasurements();
  const upsertMeasurement = useUpsertBodyMeasurement();
  const { data: photos } = useProgressPhotos();
  const uploadPhoto = useUploadProgressPhoto();
  const deletePhoto = useDeleteProgressPhoto();

  const [measureDialog, setMeasureDialog] = useState(false);
  const [photoDialog, setPhotoDialog] = useState(false);
  const [mDate, setMDate] = useState(new Date().toISOString().split('T')[0]);
  const [mFields, setMFields] = useState<Record<string, string>>({});
  const [photoPose, setPhotoPose] = useState('front');
  const [photoNotes, setPhotoNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Weight chart data
  const weightData = (weightHistory ?? []).map(w => ({
    date: new Date(w.date).toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' }),
    weight: Number(w.weight_kg),
  }));

  const currentWeight = weightData.length > 0 ? weightData[weightData.length - 1].weight : null;
  const startWeight = weightData.length > 0 ? weightData[0].weight : null;
  const weightDelta = currentWeight && startWeight ? currentWeight - startWeight : null;

  // Measurement trend data
  const measurementFields = [
    { key: 'waist_cm', label: 'Vòng eo' },
    { key: 'chest_cm', label: 'Ngực' },
    { key: 'bicep_left_cm', label: 'Bắp tay T' },
    { key: 'thigh_left_cm', label: 'Đùi T' },
    { key: 'body_fat_pct', label: 'Body fat %' },
  ];

  const measureData = (measurements ?? []).map(m => ({
    date: new Date(m.date).toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' }),
    waist: m.waist_cm ? Number(m.waist_cm) : null,
    chest: m.chest_cm ? Number(m.chest_cm) : null,
    bicep: m.bicep_left_cm ? Number(m.bicep_left_cm) : null,
    thigh: m.thigh_left_cm ? Number(m.thigh_left_cm) : null,
    bf: m.body_fat_pct ? Number(m.body_fat_pct) : null,
  }));

  const handleSaveMeasurement = async () => {
    const data: any = { date: mDate };
    const fieldMap: Record<string, string> = {
      neck: 'neck_cm', shoulders: 'shoulders_cm', chest: 'chest_cm',
      waist: 'waist_cm', hips: 'hips_cm', bicepL: 'bicep_left_cm', bicepR: 'bicep_right_cm',
      thighL: 'thigh_left_cm', thighR: 'thigh_right_cm', calfL: 'calf_left_cm', calfR: 'calf_right_cm',
      bf: 'body_fat_pct',
    };
    for (const [k, dbCol] of Object.entries(fieldMap)) {
      if (mFields[k]) data[dbCol] = Number(mFields[k]);
    }
    try {
      await upsertMeasurement.mutateAsync(data);
      toast.success('Đã lưu số đo!');
      setMeasureDialog(false);
      setMFields({});
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadPhoto.mutateAsync({ file, pose: photoPose, notes: photoNotes });
      toast.success('Đã tải ảnh!');
      setPhotoDialog(false);
      setPhotoNotes('');
    } catch (err: any) { toast.error(err.message); }
  };

  const chartConfig = {
    weight: { label: 'Cân nặng (kg)', color: 'hsl(160 84% 39%)' },
    waist: { label: 'Vòng eo', color: 'hsl(43 96% 56%)' },
    chest: { label: 'Ngực', color: 'hsl(217 91% 60%)' },
    bicep: { label: 'Bắp tay', color: 'hsl(265 90% 66%)' },
    thigh: { label: 'Đùi', color: 'hsl(190 95% 50%)' },
    bf: { label: 'Body fat %', color: 'hsl(0 84% 60%)' },
  };

  return (
    <div className="min-h-screen bg-background">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-50 border-b border-border/50"
        style={{ background: 'hsl(225 15% 6% / 0.7)', backdropFilter: 'blur(24px) saturate(1.5)' }}
      >
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="rounded-xl">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-lg font-bold">Tiến Trình</h1>
        </div>
      </motion.header>

      <motion.main
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.08 } } }}
        className="max-w-4xl mx-auto px-4 py-8 space-y-6"
      >
        <Tabs defaultValue="weight" className="space-y-6">
          <TabsList className="bg-secondary/60">
            <TabsTrigger value="weight"><Scale className="w-3.5 h-3.5 mr-1.5" />Cân nặng</TabsTrigger>
            <TabsTrigger value="measurements"><Ruler className="w-3.5 h-3.5 mr-1.5" />Số đo</TabsTrigger>
            <TabsTrigger value="photos"><Camera className="w-3.5 h-3.5 mr-1.5" />Ảnh tiến trình</TabsTrigger>
          </TabsList>

          {/* Weight Tab */}
          <TabsContent value="weight" className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Hiện tại', value: currentWeight ? `${currentWeight}kg` : '—' },
                { label: 'Thay đổi', value: weightDelta !== null ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)}kg` : '—', good: weightDelta !== null && ((profile?.goal === 'bulk' && weightDelta > 0) || (profile?.goal === 'cut' && weightDelta < 0)) },
                { label: 'Số bản ghi', value: `${weightData.length}` },
              ].map((c, i) => (
                <motion.div key={i} variants={fadeUp} className="metric-card text-center space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{c.label}</p>
                  <p className={`text-xl font-mono font-bold ${(c as any).good === false ? 'text-destructive' : ''}`}>{c.value}</p>
                </motion.div>
              ))}
            </div>

            {weightData.length > 0 && (
              <motion.div variants={fadeUp} className="metric-card space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Biểu Đồ Cân Nặng</h3>
                <ChartContainer config={chartConfig} className="h-[250px]">
                  <AreaChart data={weightData}>
                    <defs>
                      <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(160 84% 39%)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(160 84% 39%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(225 10% 14%)" />
                    <XAxis dataKey="date" tick={{ fill: 'hsl(220 8% 46%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fill: 'hsl(220 8% 46%)', fontSize: 10 }} axisLine={false} tickLine={false} unit="kg" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="weight" stroke="hsl(160 84% 39%)" strokeWidth={2} fill="url(#weightGrad)" dot={{ r: 3, fill: 'hsl(160 84% 39%)' }} />
                  </AreaChart>
                </ChartContainer>
              </motion.div>
            )}
          </TabsContent>

          {/* Measurements Tab */}
          <TabsContent value="measurements" className="space-y-6">
            <motion.div variants={fadeUp} className="flex justify-end">
              <Dialog open={measureDialog} onOpenChange={setMeasureDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" className="rounded-xl"><Plus className="w-3 h-3 mr-1.5" />Nhập số đo</Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Nhập Số Đo</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Ngày</Label>
                      <Input type="date" value={mDate} onChange={e => setMDate(e.target.value)} />
                    </div>
                    {[
                      { k: 'neck', l: 'Cổ (cm)' }, { k: 'shoulders', l: 'Vai (cm)' },
                      { k: 'chest', l: 'Ngực (cm)' }, { k: 'waist', l: 'Eo (cm)' },
                      { k: 'hips', l: 'Hông (cm)' }, { k: 'bicepL', l: 'Bắp tay trái (cm)' },
                      { k: 'bicepR', l: 'Bắp tay phải (cm)' }, { k: 'thighL', l: 'Đùi trái (cm)' },
                      { k: 'thighR', l: 'Đùi phải (cm)' }, { k: 'calfL', l: 'Bắp chân trái (cm)' },
                      { k: 'calfR', l: 'Bắp chân phải (cm)' }, { k: 'bf', l: 'Body fat (%)' },
                    ].map(({ k, l }) => (
                      <div key={k} className="space-y-1">
                        <Label className="text-[10px]">{l}</Label>
                        <Input type="number" step="0.1" value={mFields[k] || ''} onChange={e => setMFields(prev => ({ ...prev, [k]: e.target.value }))} placeholder="—" />
                      </div>
                    ))}
                    <Button onClick={handleSaveMeasurement} disabled={upsertMeasurement.isPending} className="w-full">
                      {upsertMeasurement.isPending ? 'Đang lưu...' : 'Lưu'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </motion.div>

            {measureData.length > 0 && (
              <motion.div variants={fadeUp} className="metric-card space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Xu Hướng Số Đo</h3>
                <ChartContainer config={chartConfig} className="h-[250px]">
                  <LineChart data={measureData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(225 10% 14%)" />
                    <XAxis dataKey="date" tick={{ fill: 'hsl(220 8% 46%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'hsl(220 8% 46%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="waist" stroke="hsl(43 96% 56%)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="chest" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="bicep" stroke="hsl(265 90% 66%)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="thigh" stroke="hsl(190 95% 50%)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ChartContainer>
                <div className="flex gap-4 justify-center flex-wrap text-[10px] text-muted-foreground">
                  {[
                    { label: 'Eo', color: 'hsl(43 96% 56%)' },
                    { label: 'Ngực', color: 'hsl(217 91% 60%)' },
                    { label: 'Bắp tay', color: 'hsl(265 90% 66%)' },
                    { label: 'Đùi', color: 'hsl(190 95% 50%)' },
                  ].map(l => (
                    <span key={l.label} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm" style={{ background: l.color }} />
                      {l.label}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Latest measurements table */}
            {(measurements ?? []).length > 0 && (
              <motion.div variants={fadeUp} className="metric-card space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Lịch Sử Số Đo</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2 text-muted-foreground font-medium">Ngày</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Eo</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Ngực</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Tay</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Đùi</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">BF%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(measurements ?? []).slice(-10).reverse().map(m => (
                        <tr key={m.id} className="border-b border-border/30">
                          <td className="py-1.5 text-muted-foreground">{new Date(m.date).toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' })}</td>
                          <td className="py-1.5 text-right font-mono">{m.waist_cm ?? '—'}</td>
                          <td className="py-1.5 text-right font-mono">{m.chest_cm ?? '—'}</td>
                          <td className="py-1.5 text-right font-mono">{m.bicep_left_cm ?? '—'}</td>
                          <td className="py-1.5 text-right font-mono">{m.thigh_left_cm ?? '—'}</td>
                          <td className="py-1.5 text-right font-mono">{m.body_fat_pct ? `${m.body_fat_pct}%` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {(measurements ?? []).length === 0 && (
              <motion.div variants={fadeUp} className="metric-card text-center py-12">
                <Ruler className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Chưa có số đo. Nhấn nút phía trên để bắt đầu theo dõi.</p>
              </motion.div>
            )}
          </TabsContent>

          {/* Photos Tab */}
          <TabsContent value="photos" className="space-y-6">
            <motion.div variants={fadeUp} className="flex justify-end">
              <Dialog open={photoDialog} onOpenChange={setPhotoDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" className="rounded-xl"><Camera className="w-3 h-3 mr-1.5" />Tải ảnh</Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle>Tải Ảnh Tiến Trình</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Tư thế</Label>
                      <Select value={photoPose} onValueChange={setPhotoPose}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="front">Mặt trước</SelectItem>
                          <SelectItem value="side">Mặt bên</SelectItem>
                          <SelectItem value="back">Mặt sau</SelectItem>
                          <SelectItem value="flex">Flex</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ghi chú</Label>
                      <Input value={photoNotes} onChange={e => setPhotoNotes(e.target.value)} placeholder="Tùy chọn..." />
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadPhoto} />
                    <Button onClick={() => fileInputRef.current?.click()} disabled={uploadPhoto.isPending} className="w-full">
                      {uploadPhoto.isPending ? 'Đang tải...' : 'Chọn ảnh & Tải lên'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </motion.div>

            {(photos ?? []).length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {(photos ?? []).map(p => (
                  <motion.div key={p.id} variants={fadeUp} className="metric-card p-0 overflow-hidden group">
                    <div className="aspect-[3/4] relative">
                      <img src={p.photo_url} alt={p.pose || 'progress'} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-3 left-3 right-3">
                          <p className="text-xs font-semibold">{new Date(p.date).toLocaleDateString('vi-VN')}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{p.pose}</p>
                          {p.notes && <p className="text-[10px] text-muted-foreground mt-1">{p.notes}</p>}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 w-7 h-7 bg-destructive/80 hover:bg-destructive text-destructive-foreground rounded-lg"
                          onClick={() => deletePhoto.mutate({ id: p.id, photo_url: p.photo_url })}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <motion.div variants={fadeUp} className="metric-card text-center py-12">
                <Camera className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Chưa có ảnh tiến trình. Tải ảnh đầu tiên để bắt đầu!</p>
              </motion.div>
            )}
          </TabsContent>
        </Tabs>

        <div className="h-8" />
      </motion.main>
    </div>
  );
}
