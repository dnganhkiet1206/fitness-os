import { useState, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { useExercises, useAddExercise, useDeleteExercise } from '@/hooks/useWorkoutData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogTrigger } from '@/components/ui/responsive-dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Plus, Trash2, Dumbbell, Search, Video, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppSettings, t } from '@/hooks/useAppSettings';

const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 30, duration: 0.5 } } };

// Common gym exercises for quick-add
const PRESET_EXERCISES = [
  { name: 'Bench Press', muscle_group: 'Chest', equipment: 'Barbell', form_cues: ['Retract scapula', 'Feet flat on floor', 'Bar path: nipple line'] },
  { name: 'Incline Bench Press', muscle_group: 'Chest', equipment: 'Barbell', form_cues: ['30-45° angle', 'Controlled eccentric'] },
  { name: 'Dumbbell Fly', muscle_group: 'Chest', equipment: 'Dumbbell', form_cues: ['Slight elbow bend', 'Squeeze at top'] },
  { name: 'Cable Crossover', muscle_group: 'Chest', equipment: 'Cable', form_cues: ['Step forward', 'Cross hands at bottom'] },
  { name: 'Squat', muscle_group: 'Legs', equipment: 'Barbell', form_cues: ['Break at hips first', 'Knees track toes', 'Below parallel'] },
  { name: 'Leg Press', muscle_group: 'Legs', equipment: 'Machine', form_cues: ['Full ROM', 'Don\'t lock knees'] },
  { name: 'Romanian Deadlift', muscle_group: 'Hamstrings', equipment: 'Barbell', form_cues: ['Hinge at hips', 'Slight knee bend', 'Feel hamstring stretch'] },
  { name: 'Leg Curl', muscle_group: 'Hamstrings', equipment: 'Machine', form_cues: ['Control the negative', 'Full contraction'] },
  { name: 'Leg Extension', muscle_group: 'Quads', equipment: 'Machine', form_cues: ['Squeeze at top', 'Controlled tempo'] },
  { name: 'Bulgarian Split Squat', muscle_group: 'Legs', equipment: 'Dumbbell', form_cues: ['Rear foot elevated', 'Upright torso'] },
  { name: 'Deadlift', muscle_group: 'Back', equipment: 'Barbell', form_cues: ['Neutral spine', 'Drive through heels', 'Lock out hips'] },
  { name: 'Barbell Row', muscle_group: 'Back', equipment: 'Barbell', form_cues: ['45° torso angle', 'Pull to navel', 'Squeeze lats'] },
  { name: 'Lat Pulldown', muscle_group: 'Back', equipment: 'Cable', form_cues: ['Wide grip', 'Pull to upper chest', 'Lean slightly back'] },
  { name: 'Seated Cable Row', muscle_group: 'Back', equipment: 'Cable', form_cues: ['Chest up', 'Squeeze shoulder blades'] },
  { name: 'Pull Up', muscle_group: 'Back', equipment: 'Bodyweight', form_cues: ['Full hang at bottom', 'Chin over bar'] },
  { name: 'Overhead Press', muscle_group: 'Shoulders', equipment: 'Barbell', form_cues: ['Brace core', 'Press straight up', 'Full lockout'] },
  { name: 'Lateral Raise', muscle_group: 'Shoulders', equipment: 'Dumbbell', form_cues: ['Slight bend in elbow', 'Lead with elbows', 'Control descent'] },
  { name: 'Face Pull', muscle_group: 'Shoulders', equipment: 'Cable', form_cues: ['High rope attachment', 'Pull to face', 'External rotate'] },
  { name: 'Rear Delt Fly', muscle_group: 'Shoulders', equipment: 'Dumbbell', form_cues: ['Bent over', 'Squeeze rear delts'] },
  { name: 'Barbell Curl', muscle_group: 'Biceps', equipment: 'Barbell', form_cues: ['No swinging', 'Full ROM', 'Squeeze at top'] },
  { name: 'Hammer Curl', muscle_group: 'Biceps', equipment: 'Dumbbell', form_cues: ['Neutral grip', 'No momentum'] },
  { name: 'Preacher Curl', muscle_group: 'Biceps', equipment: 'EZ Bar', form_cues: ['Full extension', 'Controlled negative'] },
  { name: 'Tricep Pushdown', muscle_group: 'Triceps', equipment: 'Cable', form_cues: ['Elbows locked at sides', 'Full extension'] },
  { name: 'Skull Crusher', muscle_group: 'Triceps', equipment: 'EZ Bar', form_cues: ['Lower to forehead', 'Elbows in'] },
  { name: 'Overhead Tricep Extension', muscle_group: 'Triceps', equipment: 'Cable', form_cues: ['Full stretch', 'Lock out at top'] },
  { name: 'Hip Thrust', muscle_group: 'Glutes', equipment: 'Barbell', form_cues: ['Back on bench', 'Squeeze glutes at top', 'Chin tucked'] },
  { name: 'Calf Raise', muscle_group: 'Calves', equipment: 'Machine', form_cues: ['Full stretch at bottom', 'Pause at top'] },
  { name: 'Hanging Leg Raise', muscle_group: 'Abs', equipment: 'Bodyweight', form_cues: ['No swinging', 'Curl pelvis up'] },
  { name: 'Cable Crunch', muscle_group: 'Abs', equipment: 'Cable', form_cues: ['Hinge at waist', 'Squeeze abs'] },
  { name: 'Plank', muscle_group: 'Abs', equipment: 'Bodyweight', form_cues: ['Straight line', 'Brace core', 'Don\'t sag hips'] },
  { name: 'Shrug', muscle_group: 'Traps', equipment: 'Barbell', form_cues: ['Straight up', 'Hold at top'] },
  { name: 'Dip', muscle_group: 'Chest', equipment: 'Bodyweight', form_cues: ['Lean forward for chest', 'Upright for triceps', 'Full ROM'] },
];

const ExerciseLibrary = () => {
  const { user, loading } = useAuth();
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const navigate = useNavigate();
  const { data: exercises } = useExercises();
  const addEx = useAddExercise();
  const deleteEx = useDeleteExercise();
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');

  const MUSCLE_GROUPS = [i18n.muscleChest, i18n.muscleBack, i18n.muscleShoulders, i18n.muscleBiceps, i18n.muscleTriceps, i18n.muscleQuads, i18n.muscleHamstrings, i18n.muscleGlutes, i18n.muscleAbs, i18n.muscleFullBody, i18n.muscleCardio];

  const [form, setForm] = useState({ name: '', muscle_group: MUSCLE_GROUPS[0], equipment: '', form_cues: '', common_mistakes: '', video_url: '' });

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const existingNames = new Set((exercises ?? []).map(e => e.name.toLowerCase()));

  // Filter presets not already in library
  const availablePresets = PRESET_EXERCISES.filter(p => !existingNames.has(p.name.toLowerCase()));
  const filteredPresets = quickSearch 
    ? availablePresets.filter(p => p.name.toLowerCase().includes(quickSearch.toLowerCase()) || p.muscle_group.toLowerCase().includes(quickSearch.toLowerCase()))
    : availablePresets;

  const handleQuickAdd = async (preset: typeof PRESET_EXERCISES[0]) => {
    try {
      await addEx.mutateAsync({
        name: preset.name,
        muscle_group: preset.muscle_group,
        equipment: preset.equipment,
        form_cues: preset.form_cues,
      });
      toast.success(lang === 'vi' ? `Đã thêm ${preset.name}` : `Added ${preset.name}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const filtered = (exercises ?? []).filter(e => {
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterGroup !== 'all' && e.muscle_group !== filterGroup) return false;
    return true;
  });

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, e) => {
    const g = e.muscle_group || i18n.other;
    (acc[g] = acc[g] || []).push(e);
    return acc;
  }, {});

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    try {
      await addEx.mutateAsync({
        name: form.name,
        muscle_group: form.muscle_group,
        equipment: form.equipment || undefined,
        form_cues: form.form_cues ? form.form_cues.split('\n').filter(Boolean) : undefined,
        common_mistakes: form.common_mistakes ? form.common_mistakes.split('\n').filter(Boolean) : undefined,
        video_url: form.video_url || undefined,
      });
      toast.success(i18n.exercisesAdded);
      setAddOpen(false);
      setForm({ name: '', muscle_group: MUSCLE_GROUPS[0], equipment: '', form_cues: '', common_mistakes: '', video_url: '' });
    } catch (err: any) { toast.error(err.message); }
  };

  // Group presets by muscle for organized display
  const presetsByMuscle = filteredPresets.reduce<Record<string, typeof PRESET_EXERCISES>>((acc, p) => {
    (acc[p.muscle_group] = acc[p.muscle_group] || []).push(p);
    return acc;
  }, {});

  return (
    <div className="bg-background">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, hsl(217 91% 60%), transparent 70%)' }} />
      </div>

      <PageHeader title={i18n.exercisesTitle} gradient />

      <motion.main initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }} className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <motion.div variants={fadeUp} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={i18n.exercisesSearch} className="pl-9" />
          </div>
          <Select value={filterGroup} onValueChange={setFilterGroup}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{i18n.all}</SelectItem>
              {MUSCLE_GROUPS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </motion.div>

        <motion.div variants={fadeUp} className="flex gap-2">
          <ResponsiveDialog open={addOpen} onOpenChange={setAddOpen}>
            <ResponsiveDialogTrigger asChild>
              <Button size="sm" className="rounded-xl"><Plus className="w-3.5 h-3.5 mr-1" />{i18n.exercisesAdd}</Button>
            </ResponsiveDialogTrigger>
            <ResponsiveDialogContent>
              <ResponsiveDialogHeader><ResponsiveDialogTitle>{i18n.exercisesAddTitle}</ResponsiveDialogTitle></ResponsiveDialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>{i18n.exercisesName}</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="VD: Bench Press" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{i18n.exercisesMuscleGroup}</Label>
                    <Select value={form.muscle_group} onValueChange={v => setForm(f => ({ ...f, muscle_group: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{MUSCLE_GROUPS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>{i18n.exercisesEquipment}</Label><Input value={form.equipment} onChange={e => setForm(f => ({ ...f, equipment: e.target.value }))} placeholder="Barbell" /></div>
                </div>
                <div className="space-y-2"><Label>{i18n.exercisesFormCues}</Label><textarea value={form.form_cues} onChange={e => setForm(f => ({ ...f, form_cues: e.target.value }))} className="w-full h-24 rounded-xl bg-secondary/40 border border-border/50 p-3 text-sm resize-none" /></div>
                <div className="space-y-2"><Label>{i18n.exercisesCommonMistakes}</Label><textarea value={form.common_mistakes} onChange={e => setForm(f => ({ ...f, common_mistakes: e.target.value }))} className="w-full h-20 rounded-xl bg-secondary/40 border border-border/50 p-3 text-sm resize-none" /></div>
                <div className="space-y-2"><Label>{i18n.exercisesVideoUrl}</Label><Input value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} placeholder="https://..." /></div>
                <Button onClick={handleAdd} disabled={addEx.isPending} className="w-full">{addEx.isPending ? i18n.exercisesAdding : i18n.exercisesAddBtn}</Button>
              </div>
            </ResponsiveDialogContent>
          </ResponsiveDialog>
        </motion.div>

        {/* Quick-add preset exercises */}
        {availablePresets.length > 0 && (
          <motion.div variants={fadeUp} className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {lang === 'vi' ? '⚡ Thêm nhanh bài tập chuẩn Gym' : '⚡ Quick-Add Gym Exercises'}
              </p>
              <span className="text-[10px] text-muted-foreground">{availablePresets.length} {lang === 'vi' ? 'bài' : 'available'}</span>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-muted-foreground" />
              <Input 
                value={quickSearch} 
                onChange={e => setQuickSearch(e.target.value)} 
                placeholder={lang === 'vi' ? 'Tìm bài tập...' : 'Search presets...'} 
                className="pl-8 h-8 text-xs rounded-xl"
              />
            </div>

            <div className="space-y-2 max-h-[280px] overflow-y-auto overscroll-contain rounded-2xl">
              {Object.entries(presetsByMuscle).map(([muscle, presets]) => (
                <div key={muscle}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">{muscle}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {presets.map(p => (
                      <motion.button
                        key={p.name}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => handleQuickAdd(p)}
                        disabled={addEx.isPending}
                        className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1.5 rounded-full bg-secondary/50 border border-border/40 text-xs font-medium text-foreground/80 hover:bg-secondary/80 active:bg-secondary transition-colors disabled:opacity-50"
                      >
                        <span className="truncate max-w-[140px]">{p.name}</span>
                        <span className="flex items-center justify-center w-4.5 h-4.5 rounded-full bg-primary/10 text-primary">
                          <Plus className="w-2.5 h-2.5" />
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              ))}
              {filteredPresets.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">{lang === 'vi' ? 'Không tìm thấy' : 'No presets found'}</p>
              )}
            </div>
          </motion.div>
        )}

        <Accordion type="multiple" className="space-y-3">
          {Object.entries(grouped).map(([group, exs]) => (
            <motion.div key={group} variants={fadeUp}>
              <AccordionItem value={group} className="glass-card border-none">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Dumbbell className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">{group}</span>
                    <span className="text-[10px] text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded-full">{exs.length}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-3">
                  {exs.map(ex => (
                    <div key={ex.id} className="p-3 rounded-xl bg-secondary/20 border border-border/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{ex.name}</p>
                          {ex.equipment && <p className="text-[10px] text-muted-foreground">{ex.equipment}</p>}
                        </div>
                        <div className="flex gap-1">
                          {ex.video_url && (
                            <a href={ex.video_url} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="sm"><Video className="w-3.5 h-3.5 text-metric-blue" /></Button>
                            </a>
                          )}
                          {ex.user_id && (
                            <Button variant="ghost" size="sm" onClick={() => { deleteEx.mutate(ex.id); toast.success(i18n.deleted); }}>
                              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {ex.form_cues && ex.form_cues.length > 0 && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-readiness-green" />Form cues</p>
                          <ul className="text-xs text-muted-foreground space-y-0.5 pl-4">
                            {ex.form_cues.map((c, i) => <li key={i} className="list-disc">{c}</li>)}
                          </ul>
                        </div>
                      )}
                      {ex.common_mistakes && ex.common_mistakes.length > 0 && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-readiness-yellow" />{i18n.exercisesCommonMistakes}</p>
                          <ul className="text-xs text-muted-foreground space-y-0.5 pl-4">
                            {ex.common_mistakes.map((m, i) => <li key={i} className="list-disc">{m}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            </motion.div>
          ))}
        </Accordion>

        {filtered.length === 0 && (
          <motion.div variants={fadeUp} className="text-center py-12 text-muted-foreground">
            <Dumbbell className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{i18n.exercisesNotFound}</p>
          </motion.div>
        )}
      </motion.main>
    </div>
  );
};

export default ExerciseLibrary;
