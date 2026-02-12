import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { useInvalidateToday } from '@/hooks/useTodayData';

interface SetEntry {
  exerciseId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  rpe: number;
}

export default function LogWorkoutDialog({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
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
      toast.success('Đã lưu buổi tập!');
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Ghi Buổi Tập</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tên buổi tập</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Push Day A" />
          </div>

          <div className="space-y-2">
            <Label>Session RPE (1-10)</Label>
            <Input type="number" value={sessionRpe} onChange={e => setSessionRpe(Number(e.target.value))} min={1} max={10} />
          </div>

          {/* Sets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Sets</Label>
              <Button variant="outline" size="sm" onClick={addSet}><Plus className="w-3 h-3 mr-1" />Thêm set</Button>
            </div>
            {sets.map((set, idx) => (
              <div key={idx} className="bg-secondary/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <select value={set.exerciseId} onChange={e => updateSet(idx, 'exerciseId', e.target.value)}
                    className="flex-1 bg-secondary rounded-md px-2 py-1 text-sm border border-border">
                    {exercises?.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                  </select>
                  <button onClick={() => removeSet(idx)}><Trash2 className="w-4 h-4 text-muted-foreground" /></button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-[10px] text-muted-foreground">Kg</div>
                    <Input type="number" value={set.weight} onChange={e => updateSet(idx, 'weight', Number(e.target.value))} className="h-8" />
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Reps</div>
                    <Input type="number" value={set.reps} onChange={e => updateSet(idx, 'reps', Number(e.target.value))} className="h-8" />
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">RPE</div>
                    <Input type="number" value={set.rpe} onChange={e => updateSet(idx, 'rpe', Number(e.target.value))} min={1} max={10} className="h-8" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {sets.length > 0 && (
            <div className="bg-secondary/50 rounded-lg p-3 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Volume Load</div>
              <div className="text-xl font-mono font-bold">{volumeLoad.toLocaleString()}</div>
            </div>
          )}

          <Button onClick={handleSave} disabled={saving || sets.length === 0} className="w-full">
            {saving ? 'Đang lưu...' : 'Lưu buổi tập'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
