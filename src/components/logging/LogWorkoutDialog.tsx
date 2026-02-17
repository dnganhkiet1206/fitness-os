import { useState } from 'react';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogDescription, ResponsiveDialogTrigger } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Dumbbell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { useInvalidateToday } from '@/hooks/useTodayData';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';

interface SetEntry {
  exerciseId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  rpe: number;
}

export default function LogWorkoutDialog({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { lang } = useAppSettings();
  const T = t(lang);
  const invalidate = useInvalidateToday();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [sessionRpe, setSessionRpe] = useState(7);
  const [sets, setSets] = useState<SetEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: exercises } = useQuery({
    queryKey: ['exercises'],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from('exercises').select('*').order('name');
      return data ?? [];
    },
  });

  const addSet = () => {
    const ex = exercises?.[0];
    setSets(prev => [...prev, {
      exerciseId: ex?.id ?? '',
      exerciseName: ex?.name ?? '',
      weight: 0,
      reps: 0,
      rpe: 7,
    }]);
  };

  const updateSet = (idx: number, field: keyof SetEntry, value: any) => {
    setSets(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      if (field === 'exerciseId') {
        const ex = exercises?.find(e => e.id === value);
        return { ...s, exerciseId: value, exerciseName: ex?.name ?? '' };
      }
      return { ...s, [field]: value };
    }));
  };

  const removeSet = (idx: number) => setSets(prev => prev.filter((_, i) => i !== idx));

  const numVal = (v: number) => v === 0 ? '' : v;
  const volumeLoad = sets.reduce((s, set) => s + set.weight * set.reps, 0);

  const handleSave = async () => {
    if (!user || sets.length === 0) return;
    setSaving(true);
    try {
      const setsJson = sets.map((s, i) => ({
        exerciseId: s.exerciseId,
        exerciseName: s.exerciseName,
        setIndex: i + 1,
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
      }));

      await supabase.from('workout_sessions').insert({
        user_id: user.id,
        template_name: name || 'Workout',
        session_rpe: sessionRpe,
        sets: setsJson,
        volume_load: volumeLoad,
        pain_flags: [],
        pr_detected: false,
      });

      const dateStr = new Date().toISOString().split('T')[0];
      await recomputeDailyLog(user.id, dateStr);
      invalidate();
      toast.success(T.logWorkoutSaved);
      setOpen(false);
      setSets([]);
      setName('');
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
          <ResponsiveDialogTitle className="text-lg font-bold">{T.logWorkoutTitle}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <ResponsiveDialogDescription className="sr-only">{T.logWorkoutTitle}</ResponsiveDialogDescription>

        <div className="space-y-5">
          {/* Workout name */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">{T.logWorkoutName}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={T.logWorkoutNamePlaceholder} className="rounded-xl h-11" />
          </div>

          {/* Session RPE */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">{T.logWorkoutSessionRPE}</Label>
            <Input type="number" value={sessionRpe} onChange={e => setSessionRpe(Number(e.target.value))} min={1} max={10} className="rounded-xl h-11 w-20 text-center font-mono" />
          </div>

          {/* Sets */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">{T.logWorkoutSets}</Label>
              <Button variant="outline" size="sm" onClick={addSet} className="rounded-xl gap-1.5 h-7 text-xs border-border/30">
                <Plus className="w-3 h-3" />{T.logWorkoutAddSet}
              </Button>
            </div>

            <AnimatePresence>
              {sets.map((set, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20, height: 0 }}
                  className="bg-secondary/20 rounded-2xl p-3 space-y-2.5 border border-border/30"
                >
                  <div className="flex items-center gap-2">
                    <select
                      value={set.exerciseId}
                      onChange={e => updateSet(idx, 'exerciseId', e.target.value)}
                      className="flex-1 bg-secondary rounded-xl px-3 py-2 text-sm border border-border h-10"
                    >
                      {exercises?.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                    </select>
                    <motion.button whileTap={{ scale: 0.8 }} onClick={() => removeSet(idx)} className="p-2 rounded-full hover:bg-destructive/10 transition-colors">
                      <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive transition-colors" />
                    </motion.button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{T.logWorkoutKg}</span>
                      <Input type="number" value={numVal(set.weight)} onChange={e => updateSet(idx, 'weight', e.target.value === '' ? 0 : Number(e.target.value))} className="rounded-xl h-9 text-center font-mono" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{T.logWorkoutReps}</span>
                      <Input type="number" value={numVal(set.reps)} onChange={e => updateSet(idx, 'reps', e.target.value === '' ? 0 : Number(e.target.value))} className="rounded-xl h-9 text-center font-mono" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{T.logWorkoutRPE}</span>
                      <Input type="number" value={set.rpe} onChange={e => updateSet(idx, 'rpe', Number(e.target.value))} min={1} max={10} className="rounded-xl h-9 text-center font-mono" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Volume load summary */}
          <AnimatePresence>
            {sets.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-secondary/20 rounded-2xl p-4 border border-border/30 text-center"
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Dumbbell className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{T.logWorkoutVolumeLoad}</span>
                </div>
                <div className="text-2xl font-mono font-bold">{volumeLoad.toLocaleString()}</div>
              </motion.div>
            )}
          </AnimatePresence>

          <Button onClick={handleSave} disabled={saving || sets.length === 0} className="w-full rounded-xl h-11 font-semibold">
            {saving ? T.saving : T.logWorkoutSaveBtn}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
