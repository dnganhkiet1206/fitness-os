import { useState } from 'react';
import PageLoader from '@/components/PageLoader';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { useExercises, useAddExercise, useDeleteExercise } from '@/hooks/useWorkoutData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogTrigger } from '@/components/ui/responsive-dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Plus, Trash2, Dumbbell, Search, Video, AlertTriangle, CheckCircle2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useAppSettings, t } from '@/hooks/useAppSettings';

const spring = { type: 'spring' as const, stiffness: 500, damping: 35 };
const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { ...spring, duration: 0.5 } } };

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
  const [editing, setEditing] = useState(false);

  const MUSCLE_GROUPS = [i18n.muscleChest, i18n.muscleBack, i18n.muscleShoulders, i18n.muscleBiceps, i18n.muscleTriceps, i18n.muscleQuads, i18n.muscleHamstrings, i18n.muscleGlutes, i18n.muscleAbs, i18n.muscleFullBody, i18n.muscleCardio];

  const [form, setForm] = useState({ name: '', muscle_group: MUSCLE_GROUPS[0], equipment: '', form_cues: '', common_mistakes: '', video_url: '' });

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;

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
          <motion.div layout transition={spring}>
            <Button size="sm" variant={editing ? "default" : "outline"} className="rounded-xl" onClick={() => setEditing(e => !e)}>
              <motion.span
                key={editing ? 'done' : 'edit'}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1"
              >
                <Pencil className="w-3.5 h-3.5" />
                {editing ? (lang === 'vi' ? 'Xong' : 'Done') : (lang === 'vi' ? 'Chỉnh sửa' : 'Edit')}
              </motion.span>
            </Button>
          </motion.div>
        </motion.div>

        <LayoutGroup>
          <Accordion type="multiple" className="space-y-3">
            <AnimatePresence mode="popLayout">
              {Object.entries(grouped).map(([group, exs]) => (
                <motion.div
                  key={group}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10, transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] } }}
                  transition={spring}
                >
                  <AccordionItem value={group} className="glass-card border-none">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center gap-2 flex-1">
                        <Dumbbell className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-sm">{group}</span>
                        <span className="text-[10px] text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded-full">{exs.length}</span>
                        <AnimatePresence>
                          {editing && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.5, x: -8 }}
                              animate={{ opacity: 1, scale: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.5, x: -8 }}
                              transition={{ ...spring, duration: 0.2 }}
                              className="ml-auto mr-2"
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 hover:bg-destructive/10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  exs.forEach(ex => deleteEx.mutate(ex.id));
                                  toast.success(lang === 'vi' ? `Đã xoá nhóm ${group}` : `Deleted group ${group}`);
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-3">
                      <AnimatePresence mode="popLayout">
                        {exs.map(ex => (
                          <motion.div
                            key={ex.id}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -60, scale: 0.95, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } }}
                            transition={spring}
                            className="p-3 rounded-xl bg-secondary/20 border border-border/30 space-y-2 overflow-hidden"
                          >
                            <div className="flex items-center justify-between">
                              <AnimatePresence>
                                {editing && (
                                  <motion.div
                                    initial={{ opacity: 0, width: 0, marginRight: 0 }}
                                    animate={{ opacity: 1, width: 28, marginRight: 8 }}
                                    exit={{ opacity: 0, width: 0, marginRight: 0 }}
                                    transition={{ ...spring, duration: 0.25 }}
                                    className="shrink-0 overflow-hidden"
                                  >
                                    <motion.button
                                      whileTap={{ scale: 0.8 }}
                                      onClick={() => { deleteEx.mutate(ex.id); toast.success(i18n.deleted); }}
                                      className="flex items-center justify-center w-7 h-7 rounded-full bg-destructive/10 text-destructive"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </motion.button>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm">{ex.name}</p>
                                {ex.equipment && <p className="text-[10px] text-muted-foreground">{ex.equipment}</p>}
                              </div>
                              <div className="flex gap-1 items-center shrink-0">
                                {ex.video_url && (
                                  <a href={ex.video_url} target="_blank" rel="noopener noreferrer">
                                    <Button variant="ghost" size="sm"><Video className="w-3.5 h-3.5 text-metric-blue" /></Button>
                                  </a>
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
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </AccordionContent>
                  </AccordionItem>
                </motion.div>
              ))}
            </AnimatePresence>
          </Accordion>
        </LayoutGroup>

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
