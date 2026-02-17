import { useState } from 'react';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogDescription, ResponsiveDialogTrigger } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { toast } from 'sonner';
import { useInvalidateToday } from '@/hooks/useTodayData';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';

export default function LogSleepDialog({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { lang } = useAppSettings();
  const T = t(lang);
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
      toast.success(T.logSleepSaved);
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen}>
      <ResponsiveDialogTrigger asChild>{children}</ResponsiveDialogTrigger>
      <ResponsiveDialogContent className="max-w-sm">
        <ResponsiveDialogHeader><ResponsiveDialogTitle>{T.logSleepTitle}</ResponsiveDialogTitle></ResponsiveDialogHeader>
        <ResponsiveDialogDescription className="sr-only">{T.logSleepTitle}</ResponsiveDialogDescription>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{T.logSleepBedtime}</Label>
              <Input type="datetime-local" value={bedtime} onChange={e => setBedtime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{T.logSleepWaketime}</Label>
              <Input type="datetime-local" value={waketime} onChange={e => setWaketime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{T.logSleepQuality}</Label>
            <Input type="number" value={quality} onChange={e => setQuality(Number(e.target.value))} min={1} max={10} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">{T.logSleepDeep} ({T.logSleepMinutes})</Label>
              <Input type="number" value={deepMin} onChange={e => setDeepMin(Number(e.target.value))} min={0} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">{T.logSleepREM} ({T.logSleepMinutes})</Label>
              <Input type="number" value={remMin} onChange={e => setRemMin(Number(e.target.value))} min={0} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">{T.logSleepLight} ({T.logSleepMinutes})</Label>
              <Input type="number" value={lightMin} onChange={e => setLightMin(Number(e.target.value))} min={0} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px]">{T.logSleepCaffeine}</Label>
              <Input type="datetime-local" value={caffeineCutoff} onChange={e => setCaffeineCutoff(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">{T.logSleepScreen}</Label>
              <Input type="datetime-local" value={screenOff} onChange={e => setScreenOff(e.target.value)} />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? T.saving : T.logSleepSaveBtn}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
