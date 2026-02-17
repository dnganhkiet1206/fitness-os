import { useState } from 'react';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogDescription, ResponsiveDialogTrigger } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Heart, Activity, Wind } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { toast } from 'sonner';
import { useInvalidateToday } from '@/hooks/useTodayData';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';

export default function LogBiometricsDialog({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { lang } = useAppSettings();
  const T = t(lang);
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
      toast.success(T.logBioSaved);
      setOpen(false);
      setHrBpm(''); setHrvMs(''); setSpo2(''); setVo2max(''); setRespRate('');
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
          <ResponsiveDialogTitle className="text-lg font-bold">{T.logBioTitle}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <ResponsiveDialogDescription className="sr-only">{T.logBioTitle}</ResponsiveDialogDescription>

        <div className="space-y-5">
          {/* Heart metrics */}
          <div className="bg-secondary/20 rounded-2xl p-4 border border-border/30">
            <div className="flex items-center gap-2 mb-3">
              <Heart className="w-4 h-4 text-destructive" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {lang === 'vi' ? 'Tim mạch' : 'Cardiac'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <BioInput label={T.logBioHR} value={hrBpm} onChange={setHrBpm} placeholder="55" unit="bpm" />
              <BioInput label={T.logBioHRV} value={hrvMs} onChange={setHrvMs} placeholder="62" unit="ms" />
            </div>
          </div>

          {/* Oxygen & VO2 */}
          <div className="bg-secondary/20 rounded-2xl p-4 border border-border/30">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {lang === 'vi' ? 'Oxy & Thể lực' : 'Oxygen & Fitness'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <BioInput label={T.logBioSpO2} value={spo2} onChange={setSpo2} placeholder="97" unit="%" />
              <BioInput label={T.logBioVO2} value={vo2max} onChange={setVo2max} placeholder="44" unit="ml/kg" />
            </div>
          </div>

          {/* Respiratory */}
          <div className="bg-secondary/20 rounded-2xl p-4 border border-border/30">
            <div className="flex items-center gap-2 mb-3">
              <Wind className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {lang === 'vi' ? 'Hô hấp' : 'Respiratory'}
              </span>
            </div>
            <BioInput label={T.logBioResp} value={respRate} onChange={setRespRate} placeholder="14" unit="rpm" />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl h-11 font-semibold">
            {saving ? T.saving : T.save}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function BioInput({ label, value, onChange, placeholder, unit }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  unit: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</Label>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="rounded-xl h-10 text-center font-mono flex-1"
        />
        <span className="text-[10px] text-muted-foreground w-8">{unit}</span>
      </div>
    </div>
  );
}
