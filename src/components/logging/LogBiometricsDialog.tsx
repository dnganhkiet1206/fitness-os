import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { toast } from 'sonner';
import { useInvalidateToday } from '@/hooks/useTodayData';

export default function LogBiometricsDialog({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const invalidate = useInvalidateToday();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hrBpm, setHrBpm] = useState<string>('');
  const [hrvMs, setHrvMs] = useState<string>('');
  const [spo2, setSpo2] = useState<string>('');
  const [vo2max, setVo2max] = useState<string>('');
  const [respRate, setRespRate] = useState<string>('');

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from('biometric_samples').insert({
        user_id: user.id,
        source: 'manual',
        hr_bpm: hrBpm ? Number(hrBpm) : null,
        hrv_rmssd_ms: hrvMs ? Number(hrvMs) : null,
        spo2_pct: spo2 ? Number(spo2) : null,
        vo2max_mlkgmin: vo2max ? Number(vo2max) : null,
        resp_rate_rpm: respRate ? Number(respRate) : null,
        confidence: 0.7,
      });

      const dateStr = new Date().toISOString().split('T')[0];
      await recomputeDailyLog(user.id, dateStr);
      invalidate();
      toast.success('Đã lưu chỉ số sinh trắc!');
      setOpen(false);
      setHrBpm(''); setHrvMs(''); setSpo2(''); setVo2max(''); setRespRate('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Nhập Chỉ Số Sinh Trắc</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nhịp tim nghỉ (bpm)</Label>
            <Input type="number" value={hrBpm} onChange={e => setHrBpm(e.target.value)} placeholder="VD: 55" />
          </div>
          <div className="space-y-1">
            <Label>HRV RMSSD (ms)</Label>
            <Input type="number" value={hrvMs} onChange={e => setHrvMs(e.target.value)} placeholder="VD: 62" />
          </div>
          <div className="space-y-1">
            <Label>SpO₂ (%)</Label>
            <Input type="number" value={spo2} onChange={e => setSpo2(e.target.value)} placeholder="VD: 97" />
          </div>
          <div className="space-y-1">
            <Label>VO₂max (ml/kg/min) — ước tính</Label>
            <Input type="number" value={vo2max} onChange={e => setVo2max(e.target.value)} placeholder="VD: 44" />
          </div>
          <div className="space-y-1">
            <Label>Nhịp thở (rpm)</Label>
            <Input type="number" value={respRate} onChange={e => setRespRate(e.target.value)} placeholder="VD: 14" />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Đang lưu...' : 'Lưu chỉ số'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
