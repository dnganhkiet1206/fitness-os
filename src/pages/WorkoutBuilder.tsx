import { useState } from 'react';
import PageLoader from '@/components/PageLoader';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import LargeTitle from '@/components/LargeTitle';
import { useAuth } from '@/hooks/useAuth';
import { useWorkoutTemplates, useAddWorkoutTemplate, useDeleteWorkoutTemplate, useExercises, useAddExercise } from '@/hooks/useWorkoutData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogTrigger } from '@/components/ui/responsive-dialog';
import { Plus, Trash2, Search, Dumbbell, ChevronRight, PlusCircle, X } from 'lucide-react';
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
  tempo?: string;
  superset?: string;
  notes?: string;
}

const TYPES = [
  { value: 'push', label: 'Push' },
  { value: 'pull', label: 'Pull' },
  { value: 'legs', label: 'Legs' },
  { value: 'upper', label: 'Upper Body' },
  { value: 'lower', label: 'Lower Body' },
  { value: 'full_body', label: 'Full Body' },
  { value: 'chest_triceps', label: 'Chest & Triceps' },
  { value: 'back_biceps', label: 'Back & Biceps' },
  { value: 'shoulders_arms', label: 'Shoulders & Arms' },
  { value: 'chest_back', label: 'Chest & Back' },
  { value: 'arms', label: 'Arms' },
  { value: 'core', label: 'Core / Abs' },
  { value: 'glutes', label: 'Glutes & Hamstrings' },
  { value: 'ppl_push', label: 'PPL - Push' },
  { value: 'ppl_pull', label: 'PPL - Pull' },
  { value: 'ppl_legs', label: 'PPL - Legs' },
  { value: 'strength', label: 'Strength' },
  { value: 'hypertrophy', label: 'Hypertrophy' },
  { value: 'power', label: 'Power' },
  { value: 'cardio', label: 'Cardio / HIIT' },
  { value: 'mobility', label: 'Mobility / Recovery' },
  { value: 'custom', label: 'Custom' },
];

const MUSCLE_GROUPS_EN = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Abs', 'Full Body', 'Cardio', 'Calves', 'Forearms', 'Traps'];

const EQUIPMENT_OPTIONS = ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Smith Machine', 'Bodyweight', 'Kettlebell', 'Resistance Band', 'EZ Bar', 'Trap Bar', 'Other'];

const WorkoutBuilder = () => {
  const { user, loading } = useAuth();
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const navigate = useNavigate();
  const { data: templates } = useWorkoutTemplates();
  const { data: exercises } = useExercises();
  const addTemplate = useAddWorkoutTemplate();
  const deleteTemplate = useDeleteWorkoutTemplate();
  const addExercise = useAddExercise();

  const [createOpen, setCreateOpen] = useState(false);
  const [tName, setTName] = useState('');
  const [tType, setTType] = useState('custom');
  const [tExercises, setTExercises] = useState<TemplateExercise[]>([]);
  const [searchEx, setSearchEx] = useState('');
  
  // Inline custom exercise creation
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customMuscle, setCustomMuscle] = useState('Chest');
  const [customEquipment, setCustomEquipment] = useState('Barbell');

  if (loading) return <PageLoader />;
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
      tempo: '',
      superset: '',
      notes: '',
    }]);
    setSearchEx('');
  };

  const handleCreateCustomExercise = async () => {
    if (!customName.trim()) return;
    try {
      const result = await addExercise.mutateAsync({
        name: customName.trim(),
        muscle_group: customMuscle,
        equipment: customEquipment,
      });
      // After creating, find it in the refreshed list and add to template
      // We use a temporary ID approach since mutation invalidates the query
      const tempEx = { id: 'temp-' + Date.now(), name: customName.trim() };
      addExToTemplate(tempEx);
      toast.success(lang === 'vi' ? 'Đã tạo bài tập mới' : 'Exercise created');
      setCustomName('');
      setShowCustomForm(false);
    } catch (err: any) {
      toast.error(err.message);
    }
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
    <div className="bg-background">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, hsl(160 84% 39%), transparent 70%)' }} />
      </div>

      <LargeTitle title={i18n.workoutsTitle} />

      <motion.main initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }} className="max-w-3xl mx-auto px-4 py-3 space-y-5">
        <motion.div variants={fadeUp} className="flex justify-between items-center">
          <h3 className="text-sm font-semibold">Templates ({templates?.length ?? 0})</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => navigate('/exercises')}>
              <Dumbbell className="w-3.5 h-3.5 mr-1" />{i18n.workoutsExercises}
            </Button>
            <ResponsiveDialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) setShowCustomForm(false); }}>
              <ResponsiveDialogTrigger asChild>
                <Button size="sm" className="rounded-xl"><Plus className="w-3.5 h-3.5 mr-1" />{i18n.workoutsCreateNew}</Button>
              </ResponsiveDialogTrigger>
              <ResponsiveDialogContent className="max-w-lg">
                <ResponsiveDialogHeader><ResponsiveDialogTitle>{i18n.workoutsCreateTemplate}</ResponsiveDialogTitle></ResponsiveDialogHeader>
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

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>{i18n.workoutsAddExercise}</Label>
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={() => setShowCustomForm(!showCustomForm)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-primary bg-primary/10 border border-primary/20 active:bg-primary/20 transition-colors"
                      >
                        {showCustomForm ? <X className="w-3 h-3" /> : <PlusCircle className="w-3 h-3" />}
                        {showCustomForm 
                          ? (lang === 'vi' ? 'Đóng' : 'Cancel') 
                          : (lang === 'vi' ? 'Tạo bài tập mới' : 'Create Exercise')
                        }
                      </motion.button>
                    </div>

                    {/* Inline custom exercise form */}
                    <AnimatePresence>
                      {showCustomForm && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-3 rounded-2xl border border-primary/20 bg-primary/5 space-y-3">
                            <p className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                              {lang === 'vi' ? '✦ Tạo bài tập của bạn' : '✦ Create Your Exercise'}
                            </p>
                            <Input 
                              value={customName} 
                              onChange={e => setCustomName(e.target.value)} 
                              placeholder={lang === 'vi' ? 'Tên bài tập (VD: Incline DB Press)' : 'Exercise name (e.g. Incline DB Press)'} 
                              className="h-9 text-sm"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-[10px]">{lang === 'vi' ? 'Nhóm cơ' : 'Muscle Group'}</Label>
                                <Select value={customMuscle} onValueChange={setCustomMuscle}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {MUSCLE_GROUPS_EN.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-[10px]">{lang === 'vi' ? 'Dụng cụ' : 'Equipment'}</Label>
                                <Select value={customEquipment} onValueChange={setCustomEquipment}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {EQUIPMENT_OPTIONS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <Button 
                              onClick={handleCreateCustomExercise} 
                              disabled={!customName.trim() || addExercise.isPending} 
                              size="sm" 
                              className="w-full rounded-xl"
                            >
                              <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
                              {addExercise.isPending 
                                ? (lang === 'vi' ? 'Đang tạo...' : 'Creating...') 
                                : (lang === 'vi' ? 'Tạo & thêm vào template' : 'Create & Add to Template')
                              }
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Search existing exercises */}
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                      <Input value={searchEx} onChange={e => setSearchEx(e.target.value)} placeholder={i18n.exercisesSearch} className="pl-9" />
                    </div>
                    {searchEx && filteredExercises.length > 0 && (
                      <div className="border border-border rounded-xl max-h-36 overflow-y-auto">
                        {filteredExercises.map(e => (
                          <button key={e.id} onClick={() => addExToTemplate(e)} className="w-full text-left px-3 py-2.5 hover:bg-secondary/50 active:bg-secondary/80 text-sm flex items-center justify-between transition-colors">
                            <div>
                              <span className="font-medium">{e.name}</span>
                              <span className="text-muted-foreground text-xs ml-1.5">({e.muscle_group})</span>
                            </div>
                            {e.equipment && <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded-full bg-secondary/60">{e.equipment}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {searchEx && filteredExercises.length === 0 && (
                      <div className="text-center py-4 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          {lang === 'vi' ? 'Không tìm thấy bài tập' : 'No exercises found'}
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="rounded-xl text-xs"
                          onClick={() => { setCustomName(searchEx); setShowCustomForm(true); setSearchEx(''); }}
                        >
                          <PlusCircle className="w-3 h-3 mr-1" />
                          {lang === 'vi' ? `Tạo "${searchEx}" mới` : `Create "${searchEx}"`}
                        </Button>
                      </div>
                    )}

                    {/* Quick-add suggestion chips */}
                    {!searchEx && !showCustomForm && (exercises ?? []).length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-muted-foreground font-medium">{lang === 'vi' ? 'Gợi ý' : 'Suggestions'}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(exercises ?? [])
                            .filter(e => !tExercises.some(te => te.exerciseId === e.id))
                            .slice(0, 12)
                            .map(e => (
                              <motion.button
                                key={e.id}
                                whileTap={{ scale: 0.92 }}
                                onClick={() => addExToTemplate(e)}
                                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-secondary/50 border border-border/40 text-xs font-medium text-foreground/80 hover:bg-secondary/80 active:bg-secondary transition-colors"
                              >
                                <span className="truncate max-w-[120px]">{e.name}</span>
                                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary/10 text-primary">
                                  <Plus className="w-2.5 h-2.5" />
                                </span>
                              </motion.button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {tExercises.length > 0 && (
                    <div className="space-y-3">
                      <Label>{i18n.workoutsExercisesAdded} ({tExercises.length})</Label>
                      {tExercises.map((ex, idx) => (
                        <div key={idx} className="p-3 rounded-2xl bg-secondary/20 border border-border/30 space-y-2">
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
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[10px]">Progressive Overload</Label>
                              <Select value={ex.progressionRule || 'double'} onValueChange={v => updateEx(idx, 'progressionRule', v)}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="double">{i18n.progressionDouble}</SelectItem>
                                  <SelectItem value="linear">{i18n.progressionLinear}</SelectItem>
                                  <SelectItem value="rpe_based">RPE Auto-regulate</SelectItem>
                                  <SelectItem value="wave">Wave Loading</SelectItem>
                                  <SelectItem value="deload_cycle">Deload Cycle</SelectItem>
                                  <SelectItem value="none">{i18n.progressionNone}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-[10px]">Tempo (e.g. 3-1-2-0)</Label>
                              <Input value={ex.tempo || ''} onChange={e => updateEx(idx, 'tempo', e.target.value)} placeholder="3-1-2-0" className="h-8 text-xs" />
                            </div>
                          </div>
                          <div>
                            <Label className="text-[10px]">Notes</Label>
                            <Input value={ex.notes || ''} onChange={e => updateEx(idx, 'notes', e.target.value)} placeholder="Drop set, pause rep, etc." className="h-8 text-xs" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button onClick={handleCreate} disabled={addTemplate.isPending || !tName.trim() || tExercises.length === 0} className="w-full">
                    {addTemplate.isPending ? i18n.workoutsCreating : i18n.workoutsCreateBtn}
                  </Button>
                </div>
              </ResponsiveDialogContent>
            </ResponsiveDialog>
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
          <motion.div variants={fadeUp} className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Dumbbell className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm font-medium">{i18n.workoutsNoTemplates}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Tap + to create your first template</p>
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
