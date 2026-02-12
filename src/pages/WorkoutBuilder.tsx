import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useWorkoutTemplates, useAddWorkoutTemplate, useDeleteWorkoutTemplate, useExercises } from '@/hooks/useWorkoutData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, Plus, Trash2, Search, Dumbbell, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAppSettings, t } from '@/hooks/useAppSettings';

const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 30, duration: 0.5 } } };

interface TemplateExercise {
  exerciseId: string;
  exerciseName: string;
  sets: number;
  reps: number;
  weight: number;
  rpe?: number;
  restSeconds?: number;
  progressionRule?: string;
}

const TYPES = [
  { value: 'push', label: 'Push' },
  { value: 'pull', label: 'Pull' },
  { value: 'legs', label: 'Legs' },
  { value: 'upper', label: 'Upper' },
  { value: 'lower', label: 'Lower' },
  { value: 'full_body', label: 'Full Body' },
  { value: 'custom', label: 'Custom' },
];

const WorkoutBuilder = () => {
  const { user, loading } = useAuth();
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const navigate = useNavigate();
  const { data: templates } = useWorkoutTemplates();
  const { data: exercises } = useExercises();
  const addTemplate = useAddWorkoutTemplate();
  const deleteTemplate = useDeleteWorkoutTemplate();

  const [createOpen, setCreateOpen] = useState(false);
  const [tName, setTName] = useState('');
  const [tType, setTType] = useState('custom');
  const [tExercises, setTExercises] = useState<TemplateExercise[]>([]);
  const [searchEx, setSearchEx] = useState('');

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const filteredExercises = (exercises ?? []).filter(e => !searchEx || e.name.toLowerCase().includes(searchEx.toLowerCase())).slice(0, 15);

  const addExToTemplate = (ex: any) => {
    setTExercises(prev => [...prev, {
      exerciseId: ex.id,
      exerciseName: ex.name,
      sets: 3,
      reps: 10,
      weight: 0,
      rpe: 7,
      restSeconds: 90,
      progressionRule: 'double',
    }]);
    setSearchEx('');
  };

  const updateEx = (idx: number, field: string, value: any) => {
    setTExercises(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };

  const removeEx = (idx: number) => setTExercises(prev => prev.filter((_, i) => i !== idx));

  const handleCreate = async () => {
    if (!tName.trim() || tExercises.length === 0) return;
    try {
      await addTemplate.mutateAsync({ name: tName, type: tType, exercises: tExercises });
      toast.success(i18n.workoutsCreated);
      setCreateOpen(false);
      setTName('');
      setTType('custom');
      setTExercises([]);
    } catch (err: any) { toast.error(err.message); }
  };

  const totalVolume = (exs: any[]) => {
    if (!Array.isArray(exs)) return 0;
    return exs.reduce((s: number, e: any) => s + (e.sets || 0) * (e.reps || 0) * (e.weight || 0), 0);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, hsl(160 84% 39%), transparent 70%)' }} />
      </div>

      <motion.header initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-50 border-b border-border/50" style={{ background: 'hsl(225 15% 6% / 0.7)', backdropFilter: 'blur(24px) saturate(1.5)' }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="rounded-xl"><ArrowLeft className="w-4 h-4" /></Button>
          <h1 className="text-lg font-bold"><span className="text-gradient-green">{i18n.workoutsTitle}</span></h1>
        </div>
      </motion.header>

      <motion.main initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }} className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <motion.div variants={fadeUp} className="flex justify-between items-center">
          <h3 className="text-sm font-semibold">Templates ({templates?.length ?? 0})</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => navigate('/exercises')}>
              <Dumbbell className="w-3.5 h-3.5 mr-1" />{i18n.workoutsExercises}
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-xl"><Plus className="w-3.5 h-3.5 mr-1" />{i18n.workoutsCreateNew}</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{i18n.workoutsCreateTemplate}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>{i18n.supplementsName}</Label><Input value={tName} onChange={e => setTName(e.target.value)} placeholder="Push Day A" /></div>
                    <div className="space-y-2">
                      <Label>{i18n.workoutsType}</Label>
                      <Select value={tType} onValueChange={setTType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{i18n.workoutsAddExercise}</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                      <Input value={searchEx} onChange={e => setSearchEx(e.target.value)} placeholder={i18n.exercisesSearch} className="pl-9" />
                    </div>
                    {searchEx && filteredExercises.length > 0 && (
                      <div className="border border-border rounded-lg max-h-32 overflow-y-auto">
                        {filteredExercises.map(e => (
                          <button key={e.id} onClick={() => addExToTemplate(e)} className="w-full text-left px-3 py-2 hover:bg-secondary/50 text-sm">
                            {e.name} <span className="text-muted-foreground text-xs">({e.muscle_group})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {tExercises.length > 0 && (
                    <div className="space-y-3">
                      <Label>{i18n.workoutsExercisesAdded} ({tExercises.length})</Label>
                      {tExercises.map((ex, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-secondary/20 border border-border/30 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">{ex.exerciseName}</p>
                            <Button variant="ghost" size="sm" onClick={() => removeEx(idx)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                          <div className="grid grid-cols-5 gap-2">
                            <div><Label className="text-[10px]">Sets</Label><Input type="number" value={ex.sets} onChange={e => updateEx(idx, 'sets', Number(e.target.value))} min={1} className="h-8 text-xs" /></div>
                            <div><Label className="text-[10px]">Reps</Label><Input type="number" value={ex.reps} onChange={e => updateEx(idx, 'reps', Number(e.target.value))} min={1} className="h-8 text-xs" /></div>
                            <div><Label className="text-[10px]">kg</Label><Input type="number" value={ex.weight} onChange={e => updateEx(idx, 'weight', Number(e.target.value))} min={0} className="h-8 text-xs" /></div>
                            <div><Label className="text-[10px]">RPE</Label><Input type="number" value={ex.rpe} onChange={e => updateEx(idx, 'rpe', Number(e.target.value))} min={1} max={10} className="h-8 text-xs" /></div>
                            <div><Label className="text-[10px]">Rest(s)</Label><Input type="number" value={ex.restSeconds} onChange={e => updateEx(idx, 'restSeconds', Number(e.target.value))} min={0} step={15} className="h-8 text-xs" /></div>
                          </div>
                          <div>
                            <Label className="text-[10px]">Progressive Overload</Label>
                            <Select value={ex.progressionRule || 'double'} onValueChange={v => updateEx(idx, 'progressionRule', v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="double">{i18n.progressionDouble}</SelectItem>
                                <SelectItem value="linear">{i18n.progressionLinear}</SelectItem>
                                <SelectItem value="none">{i18n.progressionNone}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button onClick={handleCreate} disabled={addTemplate.isPending || !tName.trim() || tExercises.length === 0} className="w-full">
                    {addTemplate.isPending ? i18n.workoutsCreating : i18n.workoutsCreateBtn}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </motion.div>

        {templates && templates.length > 0 ? (
          templates.map(t => {
            const exs = Array.isArray(t.exercises) ? t.exercises as any[] : [];
            return (
              <motion.div key={t.id} variants={fadeUp} className="glass-card p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Dumbbell className="w-4 h-4 text-primary" />
                    <p className="font-medium text-sm">{t.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">{t.type}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {exs.length} {i18n.workoutsExercises} · {i18n.workoutsVolume}: {totalVolume(exs).toLocaleString()} kg
                  </p>
                </div>
                <div className="flex gap-1 items-center">
                  <Button variant="ghost" size="sm" onClick={() => { deleteTemplate.mutate(t.id); toast.success(i18n.deleted); }}>
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </motion.div>
            );
          })
        ) : (
          <motion.div variants={fadeUp} className="text-center py-12 text-muted-foreground">
            <Dumbbell className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{i18n.workoutsNoTemplates}</p>
          </motion.div>
        )}

        <motion.div variants={fadeUp}>
          <Button variant="outline" className="w-full rounded-xl" onClick={() => navigate('/routine')}>
            {i18n.workoutsWeeklyPlan} <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </motion.div>
      </motion.main>
    </div>
  );
};

export default WorkoutBuilder;
