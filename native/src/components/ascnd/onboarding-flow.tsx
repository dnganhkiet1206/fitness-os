import DateTimePicker from '@react-native-community/datetimepicker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  HeartPulse,
  Moon,
  Pill,
  Sparkles,
  Target,
  User,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, SlideInLeft, SlideInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { COMMON_ALLERGIES, parseDislikes } from '@/lib/food-preferences';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { planFromEntry } from '@/lib/fitness-calc';
import { isHealthKitAvailable, requestHealthPermissions } from '@/lib/health';
import { getLegal, type LegalDoc } from '@/lib/legal-content';
import { localDateStr } from '@/lib/local-date';
import { statMessage } from '@/lib/plausible';
import { requestNotificationPermission } from '@/lib/notifications';
import { displayVolume, volumeLabel } from '@/lib/units';
import { errorText } from '@/lib/error-copy';
import { useVolumeUnit } from '@/hooks/use-volume-unit';
import { decText } from '@/lib/number-input';

const TOTAL_STEPS = 7;
const STEP_ICONS: LucideIcon[] = [User, Target, Dumbbell, Moon, Utensils, Pill, HeartPulse];

const COMMON_SUPPLEMENTS = [
  { name: 'Whey Protein', category: 'protein', dose: '30g', timing: 'post-workout' },
  { name: 'Creatine Monohydrate', category: 'creatine', dose: '5g', timing: 'morning' },
  { name: 'Vitamin D3', category: 'vitamin', dose: '2000 IU', timing: 'morning' },
  { name: 'Omega-3 Fish Oil', category: 'other', dose: '1000mg', timing: 'with meals' },
  { name: 'Magnesium', category: 'mineral', dose: '400mg', timing: 'before bed' },
  { name: 'ZMA', category: 'mineral', dose: '1 tablet', timing: 'before bed' },
  { name: 'Caffeine', category: 'other', dose: '200mg', timing: 'pre-workout' },
  { name: 'BCAA', category: 'protein', dose: '5g', timing: 'pre-workout' },
  { name: 'Multivitamin', category: 'vitamin', dose: '1 tablet', timing: 'morning' },
  { name: 'Ashwagandha', category: 'nootropic', dose: '600mg', timing: 'morning' },
];

function timeToHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Onboarding: Personal → Goal → Training → Lifestyle → Diet → Supplements →
 * Connect, with the live BMR/TDEE auto-calc box, goal summary, and the
 * terms-acceptance checkbox (legal docs open in a native sheet since the router
 * isn't mounted while onboarding gates the app).
 *
 * The first six steps are a faithful port of the web Onboarding page. The
 * seventh is not in the web app and could not be: it offers Apple Health and
 * notifications, which existed here but were reachable only from a button on
 * Today and a screen in Settings respectively. Somebody finished onboarding,
 * landed on a dashboard of empty rings, and was never told the app could fill
 * them in — so the readiness score, which needs HRV, resting heart rate and
 * sleep, had nothing to work with on the one device where it could have.
 */
export function OnboardingFlow() {
  const c = usePalette();
  const styles = stylesFor(c);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { unit: vUnit } = useVolumeUnit();

  const STEP_TITLES = [
    i18n.onboardingStepPersonal,
    i18n.onboardingStepGoal,
    i18n.onboardingStepTraining,
    i18n.onboardingStepLifestyle,
    i18n.onboardingStepDiet,
    i18n.onboardingStepSupplements,
    i18n.onboardingStepConnect,
  ];

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const [name, setName] = useState('');
  const [sex, setSex] = useState('male');
  const [dob, setDob] = useState(new Date(2000, 0, 1));
  const [heightCm, setHeightCm] = useState('170');
  const [weightKg, setWeightKg] = useState('70');
  const [goal, setGoal] = useState('maintain');
  const [trainingLevel, setTrainingLevel] = useState('intermediate');
  const [activityLevel, setActivityLevel] = useState('moderate');
  const [waketime, setWaketime] = useState(new Date(2000, 0, 1, 7, 0));
  const [bedtime, setBedtime] = useState(new Date(2000, 0, 1, 23, 0));
  const [dietaryPreference, setDietaryPreference] = useState('omnivore');
  const [allergies, setAllergies] = useState<string[]>([]);
  const [dislikedFoods, setDislikedFoods] = useState('');
  const [selectedSupps, setSelectedSupps] = useState<Set<number>>(new Set());
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [legalTab, setLegalTab] = useState<'terms' | 'privacy' | 'health' | null>(null);

  /*
    ── the two optional connections ──

    `granted` here means "this device said yes", which is the only thing worth
    reflecting on screen. Neither is stored on the profile: iOS owns both
    answers, a person can revoke either in Settings without the app hearing
    about it, and a row in our database claiming otherwise would be a second,
    less truthful copy of a fact somebody else is responsible for.

    Health is hidden entirely where HealthKit is unavailable — the simulator,
    Expo Go, an iPad without it. An offer that cannot be accepted is worse than
    no offer.
  */
  const healthAvailable = isHealthKitAvailable();
  const [healthGranted, setHealthGranted] = useState(false);
  const [notifyGranted, setNotifyGranted] = useState(false);

  const connectHealth = async () => {
    Haptics.selectionAsync();
    /* No error path. A refusal is an answer, not a failure, and the app works
       without it — telling somebody off for declining is how the next prompt
       gets declined too. */
    setHealthGranted(await requestHealthPermissions());
  };

  const enableReminders = async () => {
    Haptics.selectionAsync();
    setNotifyGranted(await requestNotificationPermission());
  };

  /*
    ── the two numbers the whole account is built from ──

    `Number(weightKg) || 70` and `Number(heightCm) || 170` used to stand here,
    and between them they did both halves of the same damage. A cleared field
    became a 70 kg, 170 cm person without saying so, and a typo was accepted at
    face value: measured on this exact chain, a height typed as `17` prescribes
    1,500 kcal a day, and one typed as `70` prescribes 1,570 instead of 2,539 —
    a thousand calories a day, arrived at silently. A weight typed as `700`
    prescribes 12,304 kcal and 17.5 litres of water.

    None of it announces itself, because `proteinReferenceWeight` and
    `calcWaterTarget` both read a height under 100 cm as *"no height was
    given"*: the mistyped digit turns their guards off rather than tripping
    them, and the plan comes out looking like any other plan.

    `edit-profile` has validated these same two fields against these same
    bounds since it was written. This screen — the one that decides what the
    numbers are in the first place, and stores them with
    `onboarding_completed: true` — did not.
  */
  const attempt = planFromEntry({
    heightText: heightCm,
    weightText: weightKg,
    dob: localDateStr(dob),
    sex: sex as 'male' | 'female' | 'other',
    goal,
    activity_level: activityLevel,
  });
  const statsBad = !attempt.ok;
  const missing = attempt.ok ? [] : attempt.missing;
  const heightError = missing.includes('height_cm') ? statMessage('height_cm', 'out-of-range', i18n.outOfRange) : null;
  const weightError = missing.includes('weight_kg') ? statMessage('weight_kg', 'out-of-range', i18n.outOfRange) : null;

  // Live targets (web auto-calc box) — null until there is a body to compute for
  const plan = attempt.ok ? attempt.plan : null;
  const sleepHours = (() => {
    const bedMin = bedtime.getHours() * 60 + bedtime.getMinutes();
    const wakeMin = waketime.getHours() * 60 + waketime.getMinutes();
    let diff = wakeMin - bedMin;
    if (diff <= 0) diff += 24 * 60;
    return Math.round((diff / 60) * 10) / 10;
  })();

  const goNext = () => {
    Haptics.selectionAsync();
    setDirection(1);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };
  const goPrev = () => {
    Haptics.selectionAsync();
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 0));
  };

  const finish = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');
      /* The Next button on step 0 makes this unreachable. It is here anyway
         because the row this writes is the one every later number is derived
         from, and "unreachable" is a claim about a screen, not about a write. */
      if (!attempt.ok) {
        throw new Error(i18n.statsRequired);
      }
      const { error } = await supabase.from('profiles').upsert(
        {
          user_id: user.id,
          name: name.trim() || 'Athlete',
          sex,
          dob: localDateStr(dob),
          height_cm: attempt.height_cm,
          weight_kg: attempt.weight_kg,
          goal,
          activity_level: activityLevel,
          training_level: trainingLevel,
          dietary_preference: dietaryPreference,
          allergies,
          disliked_foods: dislikedFoods
            ? parseDislikes(dislikedFoods)
            : [],
          tdee_target_kcal: attempt.plan.tdee_target_kcal,
          macro_protein_g: attempt.plan.macro_protein_g,
          macro_carbs_g: attempt.plan.macro_carbs_g,
          macro_fat_g: attempt.plan.macro_fat_g,
          macro_fiber_g: attempt.plan.macro_fiber_g,
          water_target_ml: attempt.plan.water_target_ml,
          sleep_target_hours: sleepHours,
          sleep_target_bedtime: timeToHHMM(bedtime),
          sleep_target_waketime: timeToHHMM(waketime),
          onboarding_completed: true,
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;

      for (const idx of selectedSupps) {
        const s = COMMON_SUPPLEMENTS[idx];
        await supabase.from('supplements').insert({
          user_id: user.id,
          name: s.name,
          category: s.category,
          dose_text: s.dose,
          timing: s.timing,
          notes: '',
        });
      }
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['supplement_checklist'] });
    },
    onError: (e: Error) => Alert.alert('ASCND', errorText(e, i18n)),
  });

  const toggleAllergy = (a: string) => {
    Haptics.selectionAsync();
    setAllergies((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  };

  const toggleSupp = (i: number) => {
    Haptics.selectionAsync();
    setSelectedSupps((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const StepIcon = STEP_ICONS[step];
  const legal = getLegal(lang);
  const legalDoc: LegalDoc | null = legalTab ? legal[legalTab] : null;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg },
        ]}
        keyboardShouldPersistTaps="handled">
        {/* Brand header (web: gradient wordmark + setup line) */}
        <View style={styles.hero}>
          <Text style={styles.brand}>ASCND</Text>
          <Text style={styles.heroSub}>{i18n.onboardingSetup}</Text>
        </View>

        {/* Progress dots */}
        <View style={styles.dots}>
          {STEP_TITLES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === step && styles.dotActive,
                i < step && styles.dotDone,
                i > step && styles.dotFuture,
              ]}
            />
          ))}
        </View>

        {/* Step header: icon tile + Step x/6 + title */}
        <View style={styles.stepHeader}>
          <View style={styles.stepIconTile}>
            <Icon icon={StepIcon} size={16} color={c.primary} />
          </View>
          <View>
            <Text style={styles.stepCount}>
              {i18n.onboardingStep} {step + 1}/{TOTAL_STEPS}
            </Text>
            <Text style={styles.stepTitle}>{STEP_TITLES[step]}</Text>
          </View>
        </View>

        <Animated.View
          key={step}
          entering={(direction > 0 ? SlideInRight : SlideInLeft).springify().stiffness(300).damping(30)}>
          <GlassCard style={styles.card}>
            {step === 0 && (
              <>
                <Field label={i18n.settingsName}>
                  <TextInput
                    style={styles.input}
                    placeholder={i18n.nYourName}
                    placeholderTextColor={c.mutedForeground}
                    autoCapitalize="words"
                    value={name}
                    onChangeText={setName}
                  />
                </Field>
                <Field label={i18n.settingsSex}>
                  <View style={styles.chips}>
                    {[
                      { val: 'male', label: i18n.settingsSexMale },
                      { val: 'female', label: i18n.settingsSexFemale },
                      { val: 'other', label: i18n.settingsSexOther },
                    ].map((s) => (
                      <Chip key={s.val} label={s.label} active={sex === s.val} onPress={() => setSex(s.val)} />
                    ))}
                  </View>
                </Field>
                <Field label={i18n.settingsDob}>
                  <View style={styles.pickerWrap}>
                    <DateTimePicker
                      value={dob}
                      mode="date"
                      display="spinner"
                      themeVariant="dark"
                      maximumDate={new Date()}
                      onChange={(_, d) => d && setDob(d)}
                    />
                  </View>
                </Field>
                <View style={styles.rowFields}>
                  <View style={styles.halfField}>
                    <Field label={`${i18n.settingsHeight} (cm)`}>
                      <TextInput
                        style={[styles.input, heightError && styles.inputBad]}
                        keyboardType="number-pad"
                        value={heightCm}
                        onChangeText={(v) => setHeightCm(decText(v))}
                      />
                    </Field>
                  </View>
                  <View style={styles.halfField}>
                    <Field label={`${i18n.settingsWeight} (kg)`}>
                      <TextInput
                        style={[styles.input, weightError && styles.inputBad]}
                        keyboardType="decimal-pad"
                        value={weightKg}
                        onChangeText={setWeightKg}
                      />
                    </Field>
                  </View>
                </View>
                {heightError ? <Text style={styles.fieldError}>{heightError}</Text> : null}
                {weightError ? <Text style={styles.fieldError}>{weightError}</Text> : null}
              </>
            )}

            {step === 1 && (
              <>
                <Text style={styles.fieldLabel}>{i18n.onboardingYourGoal}</Text>
                {[
                  { val: 'bulk', label: i18n.onboardingGoalBulk, desc: i18n.onboardingGoalBulkDesc },
                  { val: 'cut', label: i18n.onboardingGoalCut, desc: i18n.onboardingGoalCutDesc },
                  { val: 'maintain', label: i18n.onboardingGoalMaintain, desc: i18n.onboardingGoalMaintainDesc },
                  { val: 'recomp', label: i18n.onboardingGoalRecomp, desc: i18n.onboardingGoalRecompDesc },
                  { val: 'strength', label: i18n.onboardingGoalStrength, desc: i18n.onboardingGoalStrengthDesc },
                  { val: 'endurance', label: i18n.onboardingGoalEndurance, desc: i18n.onboardingGoalEnduranceDesc },
                ].map((g) => (
                  <OptionCard
                    key={g.val}
                    label={g.label}
                    desc={g.desc}
                    active={goal === g.val}
                    onPress={() => setGoal(g.val)}
                  />
                ))}
              </>
            )}

            {step === 2 && (
              <>
                <Text style={styles.fieldLabel}>{i18n.onboardingTrainingLevel}</Text>
                {[
                  { val: 'beginner', label: i18n.onboardingBeginner, desc: i18n.onboardingBeginnerDesc },
                  { val: 'intermediate', label: i18n.onboardingIntermediate, desc: i18n.onboardingIntermediateDesc },
                  { val: 'advanced', label: i18n.onboardingAdvanced, desc: i18n.onboardingAdvancedDesc },
                ].map((t) => (
                  <OptionCard
                    key={t.val}
                    label={t.label}
                    desc={t.desc}
                    active={trainingLevel === t.val}
                    onPress={() => setTrainingLevel(t.val)}
                  />
                ))}
                <Field label={i18n.onboardingDailyActivity}>
                  {/*
                    ── the five bare adjectives were doing all the work ──

                    "Ít vận động / Nhẹ / Trung bình / Cao / Vận động viên", and
                    nothing saying whether they meant your job or your training.
                    Somebody with a desk job who lifts five times a week could
                    read the first one and be hundreds of kcal under, or read
                    the fourth and be right, with no way to tell which.

                    The multipliers behind them (1.2 / 1.375 / 1.55 / 1.725 /
                    1.9) have standard definitions and they are all in
                    sessions per week — training *is* the axis. Putting that on
                    the chip is the whole fix, and the line underneath is the
                    answer to the question this choice creates: why the calorie
                    target does not move after a workout.
                  */}
                  <View style={[styles.chips, styles.chipsWrap]}>
                    {[
                      { val: 'sedentary', label: `${i18n.activitySedentary} · ${i18n.activityFreqSedentary}` },
                      { val: 'light', label: `${i18n.activityLight} · ${i18n.activityFreqLight}` },
                      { val: 'moderate', label: `${i18n.activityModerate} · ${i18n.activityFreqModerate}` },
                      { val: 'high', label: `${i18n.activityHigh} · ${i18n.activityFreqHigh}` },
                      { val: 'athlete', label: `${i18n.activityAthlete} · ${i18n.activityFreqAthlete}` },
                    ].map((a) => (
                      <Chip
                        key={a.val}
                        label={a.label}
                        active={activityLevel === a.val}
                        onPress={() => setActivityLevel(a.val)}
                        wrap
                      />
                    ))}
                  </View>
                  <Text style={styles.activityNote}>{i18n.activityIncludesTraining}</Text>
                </Field>
              </>
            )}

            {step === 3 && (
              <>
                <View style={styles.rowFields}>
                  <View style={styles.halfField}>
                    <Field label={i18n.onboardingWakeTime}>
                      <View style={styles.pickerWrap}>
                        <DateTimePicker
                          value={waketime}
                          mode="time"
                          display="spinner"
                          themeVariant="dark"
                          onChange={(_, d) => d && setWaketime(d)}
                        />
                      </View>
                    </Field>
                  </View>
                  <View style={styles.halfField}>
                    <Field label={i18n.onboardingSleepTime}>
                      <View style={styles.pickerWrap}>
                        <DateTimePicker
                          value={bedtime}
                          mode="time"
                          display="spinner"
                          themeVariant="dark"
                          onChange={(_, d) => d && setBedtime(d)}
                        />
                      </View>
                    </Field>
                  </View>
                </View>
                {/*
                  ── the work-type question is gone ──

                  It wrote `profiles.work_type` and **nothing in the app has
                  ever read that column** — not the BMR chain, not the TDEE
                  multiplier, not the coach. Asking somebody a question and then
                  never using the answer is taking information without a reason,
                  and every extra onboarding step costs completions.

                  Not folded into the TDEE maths either: the question directly
                  above already asks for `activity_level`, which is the same
                  quantity in different words. Two inputs meaning one thing is
                  the drift this repository has now been bitten by five separate
                  times.

                  The column stays — dropping one is irreversible and an empty
                  column costs nothing.
                */}
                {/* Auto-calc box (web) */}
                <View style={styles.calcBox}>
                  <View style={styles.calcHeader}>
                    <Icon icon={Sparkles} size={12} />
                    <Text style={styles.calcTitle}>{i18n.onboardingAutoCalc}</Text>
                  </View>
                  <View style={styles.calcGrid}>
                    <CalcItem label="BMR" value={plan ? `${plan.bmr} kcal` : '—'} />
                    <CalcItem label="TDEE" value={plan ? `${plan.tdee} kcal` : '—'} />
                    <CalcItem label={i18n.target} value={plan ? `${plan.tdee_target_kcal} kcal` : '—'} highlight />
                    <CalcItem label={i18n.navSleep} value={`${sleepHours}h`} />
                  </View>
                </View>
              </>
            )}

            {step === 4 && (
              <>
                <Text style={styles.fieldLabel}>{i18n.onboardingDiet}</Text>
                {[
                  { val: 'omnivore', label: i18n.onboardingDietOmnivore },
                  { val: 'vegetarian', label: i18n.onboardingDietVegetarian },
                  { val: 'halal', label: i18n.onboardingDietHalal },
                ].map((d) => (
                  <OptionCard
                    key={d.val}
                    label={d.label}
                    active={dietaryPreference === d.val}
                    onPress={() => setDietaryPreference(d.val)}
                  />
                ))}
                <Field label={i18n.onboardingAllergies}>
                  <View style={[styles.chips, styles.chipsWrap]}>
                    {COMMON_ALLERGIES.map((a) => (
                      <Pressable
                        key={a.value}
                        onPress={() => toggleAllergy(a.value)}
                        hitSlop={4}
                        style={[styles.badge, allergies.includes(a.value) && styles.badgeActive]}>
                        <Text
                          style={[styles.badgeText, allergies.includes(a.value) && styles.badgeTextActive]}>
                          {a.label[lang]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </Field>
                <Field label={i18n.onboardingDislikedFoods}>
                  <TextInput
                    style={styles.input}
                    placeholder={i18n.onboardingDislikedFoodsPlaceholder}
                    placeholderTextColor={c.mutedForeground}
                    value={dislikedFoods}
                    onChangeText={setDislikedFoods}
                  />
                </Field>
              </>
            )}

            {step === 5 && (
              <>
                <Text style={styles.fieldLabel}>{i18n.onboardingSelectSupplements}</Text>
                {COMMON_SUPPLEMENTS.map((s, i) => {
                  const selected = selectedSupps.has(i);
                  return (
                    <Pressable
                      key={s.name}
                      onPress={() => toggleSupp(i)}
                      style={[styles.suppRow, selected && styles.suppRowActive]}>
                      <View style={[styles.checkbox, selected && styles.checkboxActive]}>
                        {selected && <Icon icon={Check} size={13} color={c.primaryForeground} />}
                      </View>
                      <View style={styles.suppInfo}>
                        <Text style={styles.suppName}>{s.name}</Text>
                        <Text style={styles.suppMeta}>
                          {s.dose} · {s.timing}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}

                {/* Goal summary (web) */}
                <View style={styles.calcBox}>
                  <View style={styles.calcHeader}>
                    <Icon icon={Sparkles} size={12} />
                    <Text style={styles.calcTitle}>{i18n.onboardingSummary}</Text>
                  </View>
                  <View style={styles.calcGrid}>
                    <CalcItem label="Calories" value={plan ? `${plan.tdee_target_kcal} kcal` : '—'} highlight />
                    <CalcItem label="Protein" value={plan ? `${plan.macro_protein_g}g` : '—'} />
                    <CalcItem label="Carbs" value={plan ? `${plan.macro_carbs_g}g` : '—'} />
                    <CalcItem label="Fat" value={plan ? `${plan.macro_fat_g}g` : '—'} />
                    <CalcItem
                      label={i18n.navWater}
                      value={plan ? `${displayVolume(plan.water_target_ml, vUnit)} ${volumeLabel(vUnit)}` : '—'}
                    />
                    <CalcItem label="Supps" value={`${selectedSupps.size}`} />
                  </View>
                </View>
              </>
            )}

            {/*
              ── the two permissions, asked where they make sense ──

              Both existed and neither was ever offered. Apple Health was
              reachable only from a button on Today, and notifications only from
              the reminders screen — so somebody finished onboarding, landed on
              a dashboard of empty rings, and had no reason to think the app
              could fill them in. The most considered thing in the product, the
              readiness score, needs HRV, resting heart rate and sleep, and all
              three arrive through a sheet nobody was shown.

              Asked here rather than on launch because by this point the person
              has spent six screens saying what they want, and each prompt can
              be preceded by the reason it is being asked — which is the whole
              difference between a permission somebody grants and one they
              dismiss. iOS only offers each sheet once.

              Neither blocks finishing. `onboardingConnectLater` is not a button
              because the Next/Done control already is one; making "skip" a
              second button would imply the other is required.
            */}
            {step === 6 && (
              <>
                <Text style={styles.connectIntro}>{i18n.onboardingConnectIntro}</Text>

                {healthAvailable && (
                  <PermissionCard
                    icon={HeartPulse}
                    title={i18n.onboardingHealthTitle}
                    why={i18n.onboardingHealthWhy}
                    cta={i18n.onboardingHealthConnect}
                    done={i18n.onboardingHealthConnected}
                    granted={healthGranted}
                    onPress={connectHealth}
                  />
                )}

                <PermissionCard
                  icon={Bell}
                  title={i18n.onboardingRemindTitle}
                  why={i18n.onboardingRemindWhy}
                  cta={i18n.onboardingRemindEnable}
                  done={i18n.onboardingRemindEnabled}
                  granted={notifyGranted}
                  onPress={enableReminders}
                />

                <Text style={styles.connectLater}>{i18n.onboardingConnectLater}</Text>
              </>
            )}
          </GlassCard>
        </Animated.View>

        {/* Terms acceptance (final step, web) */}
        {step === 6 && (
          <Animated.View entering={FadeIn.duration(220)} style={styles.termsRow}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={i18n.a11yAcceptTerms}
              accessibilityState={{ checked: termsAccepted }}
              onPress={() => {
                Haptics.selectionAsync();
                setTermsAccepted((v) => !v);
              }}
              // 20pt drawn; 12 of slop reaches 44
              hitSlop={12}
              style={[styles.checkbox, termsAccepted && styles.checkboxActive]}>
              {termsAccepted && <Icon icon={Check} size={13} color={c.primaryForeground} />}
            </Pressable>
            <Text style={styles.termsText}>
              {lang === 'vi' ? 'Tôi đã đọc và đồng ý với ' : 'I have read and agree to the '}
              <Text style={styles.termsLink} onPress={() => setLegalTab('terms')}>
                {legal.tabTerms}
              </Text>
              {', '}
              <Text style={styles.termsLink} onPress={() => setLegalTab('privacy')}>
                {legal.tabPrivacy}
              </Text>
              {lang === 'vi' ? ' và ' : ' and '}
              <Text style={styles.termsLink} onPress={() => setLegalTab('health')}>
                {legal.tabHealth}
              </Text>
              .
            </Text>
          </Animated.View>
        )}

        {/* Prev / Next nav */}
        <View style={styles.nav}>
          <PressScale
            style={[styles.prevBtn, step === 0 && styles.disabled]}
            disabled={step === 0}
            onPress={goPrev}>
            <Icon icon={ChevronLeft} size={16} color={c.mutedForeground} />
            <Text style={styles.prevText}>{i18n.onboardingPrev}</Text>
          </PressScale>

          {step < TOTAL_STEPS - 1 ? (
            <PressScale
              /* Step 0 is where height and weight are typed, and every number
                 the account gets is derived from them. Nothing past this step
                 is worth filling in for a body that has not been described. */
              style={[styles.nextBtn, step === 0 && statsBad && styles.disabled]}
              disabled={step === 0 && statsBad}
              onPress={goNext}>
              <Text style={styles.nextText}>{i18n.onboardingNext}</Text>
              <Icon icon={ChevronRight} size={16} color={c.primaryForeground} />
            </PressScale>
          ) : (
            <PressScale
              style={[styles.nextBtn, (!termsAccepted || statsBad || finish.isPending) && styles.disabled]}
              disabled={!termsAccepted || statsBad || finish.isPending}
              onPress={() => finish.mutate()}>
              {finish.isPending ? (
                <ActivityIndicator color={c.primaryForeground} />
              ) : (
                <>
                  <Icon icon={Check} size={16} color={c.primaryForeground} />
                  <Text style={styles.nextText}>{i18n.onboardingDone}</Text>
                </>
              )}
            </PressScale>
          )}
        </View>
      </ScrollView>

      {/* Legal doc sheet — the stack router isn't mounted during onboarding */}
      <Modal
        visible={legalTab !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLegalTab(null)}>
        <View style={styles.legalRoot}>
          <View style={styles.legalHeader}>
            <Text style={styles.legalTitle} numberOfLines={1}>
              {legalDoc?.title}
            </Text>
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={i18n.a11yClose}
              hitSlop={8}
              style={styles.legalClose}
              onPress={() => {
                Haptics.selectionAsync();
                setLegalTab(null);
              }}>
              <Icon icon={X} size={18} color={c.foreground} />
            </PressScale>
          </View>
          <ScrollView contentContainerStyle={styles.legalContent}>
            {legalDoc?.blocks.map((b, i) => (
              <GlassCard key={i}>
                <Text style={styles.legalBlockTitle}>{b.title}</Text>
                {b.body ? <Text style={styles.legalBlockBody}>{b.body}</Text> : null}
                {b.intro ? <Text style={[styles.legalBlockBody, styles.legalIntro]}>{b.intro}</Text> : null}
                {b.bullets?.map((line, j) => (
                  <View key={j} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{line}</Text>
                  </View>
                ))}
              </GlassCard>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  wrap,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  wrap?: boolean;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.chip, wrap && styles.chipWrap, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function OptionCard({
  label,
  desc,
  active,
  onPress,
}: {
  label: string;
  desc?: string;
  active: boolean;
  onPress: () => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <PressScale
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.optionCard, active && styles.optionCardActive]}>
      <Text style={styles.optionLabel}>{label}</Text>
      {desc ? <Text style={styles.optionDesc}>{desc}</Text> : null}
    </PressScale>
  );
}

/**
 * One optional connection: what it is, why it is worth it, and a way to say yes.
 *
 * The `why` line is the point of the whole card. iOS shows its own permission
 * sheet once and that sheet cannot explain anything specific to this app — so
 * the reason has to be on screen *before* the sheet appears, or the person is
 * deciding with no information. "Reads sleep and HRV to work out your readiness
 * each morning" is a decision somebody can make; a bare system prompt is a
 * decision they can only guess at.
 *
 * Once granted, the button becomes a statement rather than a disabled control:
 * there is nothing more to do, and a greyed-out button invites a second tap
 * that will do nothing.
 */
function PermissionCard({
  icon,
  title,
  why,
  cta,
  done,
  granted,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  why: string;
  cta: string;
  done: string;
  granted: boolean;
  onPress: () => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <View style={styles.permCard}>
      <View style={styles.permHead}>
        <Icon icon={icon} size={16} color={granted ? c.primary : c.foreground} />
        <Text style={styles.permTitle}>{title}</Text>
      </View>
      <Text style={styles.permWhy}>{why}</Text>
      {granted ? (
        <View style={styles.permDone}>
          <Icon icon={Check} size={13} color={c.primary} />
          <Text style={styles.permDoneText}>{done}</Text>
        </View>
      ) : (
        <PressScale accessibilityRole="button" style={styles.permBtn} onPress={onPress}>
          <Text style={styles.permBtnText}>{cta}</Text>
        </PressScale>
      )}
    </View>
  );
}

function CalcItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <View style={styles.calcItem}>
      <Text style={styles.calcLabel}>{label}:</Text>
      <Text style={[styles.calcValue, highlight && styles.calcValueHighlight]}>{value}</Text>
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  root: { flex: 1, backgroundColor: c.background },
  content: { flexGrow: 1, paddingHorizontal: spacing.md, gap: spacing.lg },

  hero: { alignItems: 'center', gap: 4 },
  brand: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 3.6,
    color: c.readinessGreen,
    textShadowColor: alpha(c.readinessGreen, 0.4),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  heroSub: { ...type.footnote, color: c.mutedForeground },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.primary },
  dotActive: { transform: [{ scale: 1.3 }] },
  dotDone: { opacity: 0.6 },
  dotFuture: { backgroundColor: c.muted, opacity: 0.5 },

  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepIconTile: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: alpha(c.primary, 0.15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCount: { ...type.caption, color: c.mutedForeground },
  stepTitle: { ...type.headline, fontSize: 18, color: c.foreground },

  card: { gap: spacing.md },
  field: { gap: spacing.sm },
  fieldLabel: { ...type.footnote, fontWeight: '600', color: c.foreground },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    backgroundColor: alpha(c.primaryForeground, 0.5),
    paddingHorizontal: spacing.md,
    color: c.foreground,
    fontSize: 16,
  },
  /* Same two rules as `edit-profile`, which has always shown these — the point
     of this round is that one screen refused a bad stat and the other did not. */
  inputBad: { borderColor: c.readinessRed, borderWidth: 1 },
  fieldError: { ...type.footnote, color: c.readinessRed },
  rowFields: { flexDirection: 'row', gap: spacing.md },
  halfField: { flex: 1 },
  pickerWrap: {
    borderRadius: radius.md,
    backgroundColor: alpha(c.primaryForeground, 0.5),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    overflow: 'hidden',
    alignItems: 'center',
  },

  activityNote: { ...type.footnote, color: c.mutedForeground, lineHeight: 18, marginTop: spacing.xs },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chipsWrap: { flexWrap: 'wrap' },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    backgroundColor: alpha(c.secondary, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  chipWrap: { flexBasis: '30%', flexGrow: 1 },
  chipActive: { borderColor: c.primary, backgroundColor: alpha(c.primary, 0.1) },
  chipText: { ...type.footnote, fontWeight: '500', color: c.mutedForeground },
  chipTextActive: { color: c.foreground },

  optionCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: alpha(c.border, 0.5),
    backgroundColor: alpha(c.secondary, 0.3),
    gap: 2,
  },
  optionCardActive: { borderColor: c.primary, backgroundColor: alpha(c.primary, 0.1) },
  optionLabel: { ...type.footnote, fontSize: 14, fontWeight: '600', color: c.foreground },
  optionDesc: { ...type.caption, color: c.mutedForeground },

  calcBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: alpha(c.secondary, 0.3),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    gap: spacing.sm,
  },
  calcHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  calcTitle: { ...type.caption, fontWeight: '600', color: c.mutedForeground },
  calcGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
  calcItem: { width: '50%', flexDirection: 'row', gap: 4 },
  calcLabel: { ...type.footnote, color: c.mutedForeground },
  calcValue: { ...type.footnote, fontWeight: '600', color: c.foreground },
  calcValueHighlight: { color: c.primary },

  /*
    ── the allergy chips, and why the slop is exactly 4 ──

    30pt with no `hitSlop` is a 30pt target, on a control every new user taps
    during onboarding. It went unmeasured because `tap-targets.mjs` skipped any
    pressable without a fixed `width`, and a chip sized to its own text has none.

    36 + 4 + 4 lands on Apple's 44 without making a wrapped row of eight chips
    into a wall. The 4 is not a round number picked for tidiness: the row's gap
    is `spacing.sm`, so four points of slop on each side meet exactly in the
    middle of the gap and never overlap. Eight would overlap, and `tap-targets`
    already records what that costs — a tap in the overlap goes to whichever
    chip happens to sit later in the tree.
  */
  badge: {
    paddingHorizontal: spacing.sm + 4,
    height: 36,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeActive: { backgroundColor: c.primary, borderColor: c.primary },
  badgeText: { ...type.caption, fontWeight: '500', color: c.mutedForeground },
  badgeTextActive: { color: c.primaryForeground },

  suppRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.sm + 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: alpha(c.border, 0.5),
    backgroundColor: alpha(c.secondary, 0.3),
  },
  suppRowActive: { borderColor: c.primary, backgroundColor: alpha(c.primary, 0.1) },
  suppInfo: { flex: 1 },
  suppName: { ...type.footnote, fontSize: 14, fontWeight: '600', color: c.foreground },
  suppMeta: { ...type.caption, color: c.mutedForeground },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: c.primary, borderColor: c.primary },

  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 2, paddingHorizontal: 4 },
  termsText: { ...type.caption, color: c.mutedForeground, flex: 1, lineHeight: 18 },
  termsLink: { color: c.primary, textDecorationLine: 'underline' },

  connectIntro: { ...type.footnote, color: c.mutedForeground, lineHeight: 19, marginBottom: spacing.md },
  connectLater: { ...type.caption, color: c.mutedForeground, textAlign: 'center', marginTop: spacing.xs },
  permCard: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    backgroundColor: c.muted,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  permHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  permTitle: { ...type.footnote, fontWeight: '600', color: c.foreground },
  permWhy: { ...type.caption, color: c.mutedForeground, lineHeight: 18 },
  permBtn: {
    alignSelf: 'flex-start',
    // 32 drawn + 12 vertical padding either side reaches the 44pt target
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: c.primary,
  },
  permBtnText: { ...type.caption, fontWeight: '600', color: c.primaryForeground },
  permDone: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  permDoneText: { ...type.caption, fontWeight: '600', color: c.primary },

  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  prevBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  prevText: { ...type.headline, fontSize: 15, color: c.mutedForeground },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: c.primary,
  },
  nextText: { ...type.headline, fontSize: 15, color: c.primaryForeground },
  disabled: { opacity: 0.4 },

  legalRoot: { flex: 1, backgroundColor: c.background },
  legalHeader: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    borderBottomWidth: m.inset.borderWidth,
    borderBottomColor: m.inset.border,
  },
  legalTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: c.foreground },
  legalClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(m.ink, 0.06),
  },
  legalContent: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  legalBlockTitle: { ...type.headline, color: c.foreground, marginBottom: 4 },
  legalBlockBody: { ...type.footnote, color: c.mutedForeground, lineHeight: 20 },
  legalIntro: { color: c.foreground, marginBottom: spacing.xs },
  bulletRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 6 },
  bulletDot: { ...type.footnote, color: c.primary },
  bulletText: { ...type.footnote, color: c.mutedForeground, flex: 1, lineHeight: 20 },
}));
