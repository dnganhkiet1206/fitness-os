import { useState } from 'react';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogDescription, ResponsiveDialogTrigger } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Moon, Coffee, MonitorOff } from 'lucide-react';
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

  const numVal = (v: number) => v === 0 ? '' : v;

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
      <ResponsiveDialogContent className="max-w-md rounded-3xl border-border/30">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="text-lg font-bold">{T.logSleepTitle}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <ResponsiveDialogDescription className="sr-only">{T.logSleepTitle}</ResponsiveDialogDescription>

        <div className="space-y-5">
          {/* Bedtime / Waketime */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">{T.logSleepBedtime}</Label>
              <Input type="datetime-local" value={bedtime} onChange={e => setBedtime(e.target.value)} className="rounded-xl h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">{T.logSleepWaketime}</Label>
              <Input type="datetime-local" value={waketime} onChange={e => setWaketime(e.target.value)} className="rounded-xl h-11" />
            </div>
          </div>

          {/* Quality */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">{T.logSleepQuality}</Label>
            <Input type="number" value={quality} onChange={e => setQuality(Number(e.target.value))} min={1} max={10} className="rounded-xl h-11 w-20 text-center font-mono" />
          </div>

          {/* Sleep stages */}
          <div className="bg-secondary/20 rounded-2xl p-4 border border-border/30">
            <div className="flex items-center gap-2 mb-3">
              <Moon className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {lang === 'vi' ? 'Giai đoạn giấc ngủ' : 'Sleep Stages'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-secondary/50 rounded-xl p-2.5 space-y-1.5 border border-border/30">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{T.logSleepDeep}</span>
                <Input type="number" value={numVal(deepMin)} onChange={e => setDeepMin(e.target.value === '' ? 0 : Number(e.target.value))} min={0} className="rounded-lg h-8 text-center font-mono text-base font-bold border border-border" />
                <span className="text-[9px] text-muted-foreground block text-center">{T.logSleepMinutes}</span>
              </div>
              <div className="bg-secondary/50 rounded-xl p-2.5 space-y-1.5 border border-border/30">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{T.logSleepREM}</span>
                <Input type="number" value={numVal(remMin)} onChange={e => setRemMin(e.target.value === '' ? 0 : Number(e.target.value))} min={0} className="rounded-lg h-8 text-center font-mono text-base font-bold border border-border" />
                <span className="text-[9px] text-muted-foreground block text-center">{T.logSleepMinutes}</span>
              </div>
              <div className="bg-secondary/50 rounded-xl p-2.5 space-y-1.5 border border-border/30">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{T.logSleepLight}</span>
                <Input type="number" value={numVal(lightMin)} onChange={e => setLightMin(e.target.value === '' ? 0 : Number(e.target.value))} min={0} className="rounded-lg h-8 text-center font-mono text-base font-bold border border-border" />
                <span className="text-[9px] text-muted-foreground block text-center">{T.logSleepMinutes}</span>
              </div>
            </div>
          </div>

          {/* Extra tracking */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Coffee className="w-3 h-3" />{T.logSleepCaffeine}
              </Label>
              <Input type="datetime-local" value={caffeineCutoff} onChange={e => setCaffeineCutoff(e.target.value)} className="rounded-xl h-11 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <MonitorOff className="w-3 h-3" />{T.logSleepScreen}
              </Label>
              <Input type="datetime-local" value={screenOff} onChange={e => setScreenOff(e.target.value)} className="rounded-xl h-11 text-xs" />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl h-11 font-semibold">
            {saving ? T.saving : T.logSleepSaveBtn}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
