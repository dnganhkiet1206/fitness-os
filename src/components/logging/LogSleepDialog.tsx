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

export default function LogSleepDialog({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const invalidate = useInvalidateToday();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const [bedtime, setBedtime] = useState(`${yesterday.toISOString().split('T')[0]}T23:00`);
  const [waketime, setWaketime] = useState(`${new Date().toISOString().split('T')[0]}T07:00`);
  const [quality, setQuality] = useState(7);
  const [deepMin, setDeepMin] = useState(0);
  const [remMin, setRemMin] = useState(0);
  const [lightMin, setLightMin] = useState(0);
  const [caffeineCutoff, setCaffeineCutoff] = useState('');
  const [screenOff, setScreenOff] = useState('');

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from('sleep_logs').insert({
        user_id: user.id,
        bedtime: new Date(bedtime).toISOString(),
        waketime: new Date(waketime).toISOString(),
        quality,
        deep_min: deepMin,
        rem_min: remMin,
        light_min: lightMin,
        caffeine_cutoff_time: caffeineCutoff ? new Date(caffeineCutoff).toISOString() : null,
        screen_off_time: screenOff ? new Date(screenOff).toISOString() : null,
      } as any);

      const dateStr = new Date().toISOString().split('T')[0];
      await recomputeDailyLog(user.id, dateStr);
      invalidate();
      toast.success('Đã lưu giấc ngủ!');
      setOpen(false);
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
        <DialogHeader><DialogTitle>Ghi Giấc Ngủ</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Giờ ngủ</Label>
              <Input type="datetime-local" value={bedtime} onChange={e => setBedtime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Giờ dậy</Label>
              <Input type="datetime-local" value={waketime} onChange={e => setWaketime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Chất lượng (1-10)</Label>
            <Input type="number" value={quality} onChange={e => setQuality(Number(e.target.value))} min={1} max={10} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Deep (phút)</Label>
              <Input type="number" value={deepMin} onChange={e => setDeepMin(Number(e.target.value))} min={0} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">REM (phút)</Label>
              <Input type="number" value={remMin} onChange={e => setRemMin(Number(e.target.value))} min={0} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Light (phút)</Label>
              <Input type="number" value={lightMin} onChange={e => setLightMin(Number(e.target.value))} min={0} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px]">☕ Caffeine cutoff</Label>
              <Input type="datetime-local" value={caffeineCutoff} onChange={e => setCaffeineCutoff(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">📱 Screen off</Label>
              <Input type="datetime-local" value={screenOff} onChange={e => setScreenOff(e.target.value)} />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Đang lưu...' : 'Lưu giấc ngủ'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
