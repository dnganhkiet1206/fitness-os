import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useTodayData';
import { useSupplements, useAddSupplement } from '@/hooks/useSupplements';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { calcBMR, calcTDEE, calcTargetCalories, calcMacros, calcWaterTarget, calcAge } from '@/lib/fitness-calc';
import { ChevronLeft, ChevronRight, Check, User, Target, Dumbbell, Moon, Utensils, Pill, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAppSettings, t } from '@/hooks/useAppSettings';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0, filter: 'blur(8px)' }),
  center: { x: 0, opacity: 1, filter: 'blur(0px)', transition: { ...spring, duration: 0.5 } },
  exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0, filter: 'blur(8px)', transition: { duration: 0.3 } }),
};

const STEP_ICONS = [User, Target, Dumbbell, Moon, Utensils, Pill];

const COMMON_ALLERGIES_VI = ['Sữa', 'Đậu phộng', 'Hạt cây', 'Trứng', 'Đậu nành', 'Lúa mì', 'Hải sản', 'Cá'];
const COMMON_ALLERGIES_EN = ['Dairy', 'Peanuts', 'Tree nuts', 'Eggs', 'Soy', 'Wheat', 'Shellfish', 'Fish'];

const COMMON_SUPPLEMENTS = [
  { name: 'Whey Protein', category: 'protein', dose: '30g', timing: 'post-workout' },
  { name: 'Creatine Monohydrate', category: 'creatine', dose: '5g', timing: 'morning' },
  { name: 'Vitamin D3', category: 'vitamin', dose: '2000 IU', timing: 'morning' },
  { name: 'Omega-3 Fish Oil', category: 'other', dose: '1000mg', timing: 'with meals' },
  { name: 'Magnesium', category: 'mineral', dose: '400mg', timing: 'before bed' },
  { name: 'ZMA', category: 'mineral', dose: '1 viên', timing: 'before bed' },
  { name: 'Caffeine', category: 'other', dose: '200mg', timing: 'pre-workout' },
  { name: 'BCAA', category: 'protein', dose: '5g', timing: 'pre-workout' },
  { name: 'Multivitamin', category: 'vitamin', dose: '1 viên', timing: 'morning' },
  { name: 'Ashwagandha', category: 'nootropic', dose: '600mg', timing: 'morning' },
];

const Onboarding = () => {
  const { user, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const addSupplement = useAddSupplement();
  const { lang } = useAppSettings();
  const i18n = t(lang);

  const STEP_TITLES = [i18n.onboardingStepPersonal, i18n.onboardingStepGoal, i18n.onboardingStepTraining, i18n.onboardingStepLifestyle, i18n.onboardingStepDiet, i18n.onboardingStepSupplements];
  const COMMON_ALLERGIES = lang === 'vi' ? COMMON_ALLERGIES_VI : COMMON_ALLERGIES_EN;

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [sex, setSex] = useState('male');
  const [dob, setDob] = useState('');
  const [heightCm, setHeightCm] = useState(170);
  const [weightKg, setWeightKg] = useState(70);
  const [goal, setGoal] = useState('maintain');
  const [trainingLevel, setTrainingLevel] = useState('intermediate');
  const [activityLevel, setActivityLevel] = useState('moderate');
  const [wakeTime, setWakeTime] = useState('07:00');
  const [sleepTime, setSleepTime] = useState('23:00');
  const [workType, setWorkType] = useState('sedentary');
  const [dietaryPreference, setDietaryPreference] = useState('omnivore');
  const [allergies, setAllergies] = useState<string[]>([]);
  const [dislikedFoods, setDislikedFoods] = useState('');
  const [selectedSupps, setSelectedSupps] = useState<Set<number>>(new Set());
  const [customSuppName, setCustomSuppName] = useState('');

  useState(() => {
    if (profile) {
      setName(profile.name || '');
      setSex(profile.sex || 'male');
      setDob(profile.dob || '');
      setHeightCm(profile.height_cm || 170);
      setWeightKg(profile.weight_kg || 70);
      setGoal(profile.goal || 'maintain');
      setActivityLevel(profile.activity_level || 'moderate');
      setWakeTime(profile.sleep_target_waketime || '07:00');
      setSleepTime(profile.sleep_target_bedtime || '23:00');
    }
  });

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-primary animate-pulse" />
          </div>
          <span className="text-sm text-muted-foreground">{i18n.loading}</span>
        </motion.div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (profile?.onboarding_completed) return <Navigate to="/" replace />;

  const age = dob ? calcAge(dob) : 25;
  const bmr = calcBMR(weightKg, heightCm, age, sex as 'male' | 'female' | 'other');
  const tdee = calcTDEE(bmr, activityLevel);
  const targetKcal = calcTargetCalories(tdee, goal);
  const macros = calcMacros(targetKcal, weightKg, goal);
  const waterTarget = calcWaterTarget(weightKg);
  const sleepHours = (() => {
    const [sh, sm] = sleepTime.split(':').map(Number);
    const [wh, wm] = wakeTime.split(':').map(Number);
    let diff = (wh * 60 + wm) - (sh * 60 + sm);
    if (diff <= 0) diff += 24 * 60;
    return Math.round(diff / 60 * 10) / 10;
  })();

  const goNext = () => { setDirection(1); setStep(s => Math.min(s + 1, 5)); };
  const goPrev = () => { setDirection(-1); setStep(s => Math.max(s - 1, 0)); };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({
        name,
        sex,
        dob: dob || null,
        height_cm: heightCm,
        weight_kg: weightKg,
        goal,
        activity_level: activityLevel,
        training_level: trainingLevel,
        work_type: workType,
        dietary_preference: dietaryPreference,
        allergies,
        disliked_foods: dislikedFoods ? dislikedFoods.split(',').map(s => s.trim()).filter(Boolean) : [],
        tdee_target_kcal: targetKcal,
        macro_protein_g: macros.protein_g,
        macro_carbs_g: macros.carbs_g,
        macro_fat_g: macros.fat_g,
        macro_fiber_g: macros.fiber_g,
        water_target_ml: waterTarget,
        sleep_target_hours: sleepHours,
        sleep_target_bedtime: sleepTime,
        sleep_target_waketime: wakeTime,
        onboarding_completed: true,
      }).eq('user_id', user.id);

      if (error) throw error;

      for (const idx of selectedSupps) {
        const s = COMMON_SUPPLEMENTS[idx];
        await addSupplement.mutateAsync({
          name: s.name,
          category: s.category,
          dose_text: s.dose,
          timing: s.timing,
          notes: '',
        });
      }

      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success(i18n.onboardingComplete);
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || i18n.error);
    } finally {
      setSaving(false);
    }
  };

  const toggleAllergy = (a: string) => {
    setAllergies(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
  };

  const toggleSupp = (i: number) => {
    setSelectedSupps(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const StepIcon = STEP_ICONS[step];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.04]" style={{ background: 'radial-gradient(circle, hsl(160 84% 39%), transparent 70%)' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, hsl(217 91% 60%), transparent 70%)' }} />
      </div>

      <div className="relative max-w-lg mx-auto px-4 py-8 min-h-screen flex flex-col">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="text-center mb-8">
          <h1 className="text-2xl font-bold">
            <span className="text-gradient-green">Fitness</span> <span className="text-foreground">OS</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{i18n.onboardingSetup}</p>
        </motion.div>

        <div className="flex items-center justify-center gap-2 mb-8">
          {STEP_TITLES.map((_, i) => (
            <motion.div
              key={i}
              animate={{ scale: i === step ? 1.3 : 1, opacity: i <= step ? 1 : 0.3 }}
              transition={spring}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${i === step ? 'bg-primary' : i < step ? 'bg-primary/60' : 'bg-muted'}`}
            />
          ))}
        </div>

        <motion.div key={`title-${step}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
            <StepIcon className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{i18n.onboardingStep} {step + 1}/6</p>
            <h2 className="text-lg font-semibold">{STEP_TITLES[step]}</h2>
          </div>
        </motion.div>

        <div className="flex-1 relative">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="glass-card p-6 space-y-5"
            >
              {step === 0 && (
                <>
                  <div className="space-y-2">
                    <Label>{i18n.settingsName}</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder={i18n.authYourName} />
                  </div>
                  <div className="space-y-2">
                    <Label>{i18n.settingsSex}</Label>
                    <Select value={sex} onValueChange={setSex}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">{i18n.settingsSexMale}</SelectItem>
                        <SelectItem value="female">{i18n.settingsSexFemale}</SelectItem>
                        <SelectItem value="other">{i18n.settingsSexOther}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{i18n.settingsDob}</Label>
                    <Input type="date" value={dob} onChange={e => setDob(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{i18n.settingsHeight} (cm)</Label>
                      <Input type="number" value={heightCm} onChange={e => setHeightCm(Number(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>{i18n.settingsWeight} (kg)</Label>
                      <Input type="number" value={weightKg} onChange={e => setWeightKg(Number(e.target.value))} />
                    </div>
                  </div>
                </>
              )}

              {step === 1 && (
                <div className="space-y-3">
                  <Label>{i18n.onboardingYourGoal}</Label>
                  {[
                    { val: 'bulk', label: i18n.onboardingGoalBulk, desc: i18n.onboardingGoalBulkDesc },
                    { val: 'cut', label: i18n.onboardingGoalCut, desc: i18n.onboardingGoalCutDesc },
                    { val: 'maintain', label: i18n.onboardingGoalMaintain, desc: i18n.onboardingGoalMaintainDesc },
                    { val: 'recomp', label: i18n.onboardingGoalRecomp, desc: i18n.onboardingGoalRecompDesc },
                    { val: 'strength', label: i18n.onboardingGoalStrength, desc: i18n.onboardingGoalStrengthDesc },
                    { val: 'endurance', label: i18n.onboardingGoalEndurance, desc: i18n.onboardingGoalEnduranceDesc },
                  ].map(g => (
                    <motion.button
                      key={g.val}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setGoal(g.val)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${goal === g.val ? 'border-primary bg-primary/10' : 'border-border/50 bg-secondary/30 hover:bg-secondary/50'}`}
                    >
                      <p className="font-medium text-sm">{g.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{g.desc}</p>
                    </motion.button>
                  ))}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div className="space-y-3">
                    <Label>{i18n.onboardingTrainingLevel}</Label>
                    {[
                      { val: 'beginner', label: i18n.onboardingBeginner, desc: i18n.onboardingBeginnerDesc },
                      { val: 'intermediate', label: i18n.onboardingIntermediate, desc: i18n.onboardingIntermediateDesc },
                      { val: 'advanced', label: i18n.onboardingAdvanced, desc: i18n.onboardingAdvancedDesc },
                    ].map(t => (
                      <motion.button
                        key={t.val}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setTrainingLevel(t.val)}
                        className={`w-full text-left p-4 rounded-xl border transition-all ${trainingLevel === t.val ? 'border-primary bg-primary/10' : 'border-border/50 bg-secondary/30 hover:bg-secondary/50'}`}
                      >
                        <p className="font-medium text-sm">{t.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                      </motion.button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label>{i18n.onboardingDailyActivity}</Label>
                    <Select value={activityLevel} onValueChange={setActivityLevel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sedentary">{i18n.activitySedentary}</SelectItem>
                        <SelectItem value="light">{i18n.activityLight}</SelectItem>
                        <SelectItem value="moderate">{i18n.activityModerate}</SelectItem>
                        <SelectItem value="high">{i18n.activityHigh}</SelectItem>
                        <SelectItem value="athlete">{i18n.activityAthlete}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{i18n.onboardingWakeTime}</Label>
                      <Input type="time" value={wakeTime} onChange={e => setWakeTime(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{i18n.onboardingSleepTime}</Label>
                      <Input type="time" value={sleepTime} onChange={e => setSleepTime(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{i18n.onboardingWorkType}</Label>
                    <Select value={workType} onValueChange={setWorkType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sedentary">{i18n.onboardingWorkSedentary}</SelectItem>
                        <SelectItem value="active">{i18n.onboardingWorkActive}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="mt-4 p-4 rounded-xl bg-secondary/30 border border-border/40 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-primary" /> {i18n.onboardingAutoCalc}
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-muted-foreground">BMR:</span> <span className="font-semibold">{bmr} kcal</span></div>
                      <div><span className="text-muted-foreground">TDEE:</span> <span className="font-semibold">{tdee} kcal</span></div>
                      <div><span className="text-muted-foreground">{i18n.target}:</span> <span className="font-semibold text-primary">{targetKcal} kcal</span></div>
                      <div><span className="text-muted-foreground">{i18n.navSleep}:</span> <span className="font-semibold">{sleepHours}h</span></div>
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-5">
                  <div className="space-y-3">
                    <Label>{i18n.onboardingDiet}</Label>
                    {[
                      { val: 'omnivore', label: i18n.onboardingDietOmnivore },
                      { val: 'vegetarian', label: i18n.onboardingDietVegetarian },
                      { val: 'halal', label: i18n.onboardingDietHalal },
                    ].map(d => (
                      <motion.button
                        key={d.val}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setDietaryPreference(d.val)}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${dietaryPreference === d.val ? 'border-primary bg-primary/10' : 'border-border/50 bg-secondary/30'}`}
                      >
                        <p className="font-medium text-sm">{d.label}</p>
                      </motion.button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label>{i18n.onboardingAllergies}</Label>
                    <div className="flex flex-wrap gap-2">
                      {COMMON_ALLERGIES.map(a => (
                        <Badge
                          key={a}
                          variant={allergies.includes(a) ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => toggleAllergy(a)}
                        >
                          {a}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{i18n.onboardingDislikedFoods}</Label>
                    <Input value={dislikedFoods} onChange={e => setDislikedFoods(e.target.value)} placeholder={i18n.onboardingDislikedFoodsPlaceholder} />
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-5">
                  <Label>{i18n.onboardingSelectSupplements}</Label>
                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    {COMMON_SUPPLEMENTS.map((s, i) => (
                      <motion.div
                        key={i}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => toggleSupp(i)}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedSupps.has(i) ? 'border-primary bg-primary/10' : 'border-border/50 bg-secondary/30'}`}
                      >
                        <Checkbox checked={selectedSupps.has(i)} className="pointer-events-none" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.dose} · {s.timing}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="p-4 rounded-xl bg-secondary/30 border border-border/40 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-primary" /> {i18n.onboardingSummary}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Calories:</span> <span className="font-semibold text-primary">{targetKcal} kcal</span></div>
                      <div><span className="text-muted-foreground">Protein:</span> <span className="font-semibold">{macros.protein_g}g</span></div>
                      <div><span className="text-muted-foreground">Carbs:</span> <span className="font-semibold">{macros.carbs_g}g</span></div>
                      <div><span className="text-muted-foreground">Fat:</span> <span className="font-semibold">{macros.fat_g}g</span></div>
                      <div><span className="text-muted-foreground">{i18n.navWater}:</span> <span className="font-semibold">{waterTarget}ml</span></div>
                      <div><span className="text-muted-foreground">Supps:</span> <span className="font-semibold">{selectedSupps.size}</span></div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex items-center justify-between mt-6 gap-3">
          <Button
            variant="ghost"
            onClick={goPrev}
            disabled={step === 0}
            className="rounded-xl"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> {i18n.onboardingPrev}
          </Button>

          {step < 5 ? (
            <Button onClick={goNext} className="rounded-xl">
              {i18n.onboardingNext} <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleFinish} disabled={saving} className="rounded-xl bg-primary">
              {saving ? i18n.onboardingCompleting : <><Check className="w-4 h-4 mr-1" /> {i18n.onboardingDone}</>}
            </Button>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Onboarding;
