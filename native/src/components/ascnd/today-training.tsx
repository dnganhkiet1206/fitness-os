import { CalendarDays, CheckCircle2, ChevronRight, Clock, Dumbbell, Leaf, Moon, MoreHorizontal, PersonStanding, Play, Plus, Sun } from 'lucide-react-native';
import { haptics as Haptics } from '@/lib/haptics';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { WorkoutPickerSheet } from '@/components/ascnd/workout-picker-sheet';
import {
  DAY_LONG_EN,
  DAY_LONG_VI,
  DAY_SHORT_EN,
  DAY_SHORT_VI,
  WeekStrip,
} from '@/components/ascnd/week-strip';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useWorkoutSessions } from '@/hooks/use-fitness-data';
import { useRoutineDays, useWorkoutTemplates } from '@/hooks/use-library';
import type { TplExercise } from '@/components/ascnd/template-list';
import { estimatedMinutes } from '@/lib/prescription';
import { todayCta } from '@/lib/today-cta';
import { localDateStr, routineIndex, weekDates } from '@/lib/local-date';
import { nav } from '@/lib/nav';
import { fillCopy } from '@/lib/copy-fill';

/**
 * Hôm nay: hero card theo concept Workout Redesign.
 *
 * ── cấu trúc theo concept ──
 *
 * WeekStrip nằm NGOÀI card (do parent render), card chỉ chứa:
 * - Eyebrow: "HÔM NAY · THỨ 7"
 * - Title: tên buổi tập (lớn, đậm)
 * - Ảnh workout bên phải
 * - Metadata: "3 bài · 9 sets" và "◷ ~25 phút"
 * - Progress bar
 * - CTA đen full-width: "▶ Bắt đầu buổi tập"
 * - Nút "..." góc trên phải
 *
 * ── bốn trạng thái ──
 *
 *   có kế hoạch, chưa tập   → Bắt đầu (nút đặc đen)
 *   đã tập xong             → Xem kết quả (nút nhạt)
 *   ngày nghỉ               → UI nghỉ ngơi (không phải hero card)
 *   chưa có kế hoạch        → Chọn buổi tập (nút nhạt)
 */

/** Đọc `exercises` JSONB của template một cách phòng thủ — cột là free-form. */
function exercisesOf(tpl: { exercises?: unknown } | null | undefined): TplExercise[] {
  const raw = tpl?.exercises;
  return Array.isArray(raw) ? (raw as TplExercise[]) : [];
}

export function TodayTraining() {
  const c = usePalette();
  const styles = stylesFor(c);
  const [pickerVisible, setPickerVisible] = useState(false);
  const { data: days, isPending: daysPending, isError: daysFailed } = useRoutineDays();
  const { data: templates } = useWorkoutTemplates();
  /* Cùng cửa sổ 14 ngày mà phần lịch sử bên dưới đã hỏi, nên khối này không tốn
     thêm một lượt đọc nào. */
  const { data: sessions } = useWorkoutSessions(14);
  const { lang } = useAppSettings();
  const i18n = useI18n();

  const vi = lang === 'vi';
  const longNames = vi ? DAY_LONG_VI : DAY_LONG_EN;
  const shortNames = vi ? DAY_SHORT_VI : DAY_SHORT_EN;

  const dates = weekDates();
  const todayStr = localDateStr();
  const today = routineIndex(new Date());
  const trained = new Set((sessions ?? []).map((s) => localDateStr(new Date(s.date_time))));

  const byDay = new Map((days ?? []).map((d) => [d.day_of_week, d]));
  const hasWork = Array.from({ length: 7 }, (_, i) => {
    const d = byDay.get(i);
    return !!d?.template_id && !d?.is_rest;
  });
  const isRest = Array.from({ length: 7 }, (_, i) => !!byDay.get(i)?.is_rest);

  const openPlan = (day: number) => {
    Haptics.selection();
    nav.push({ pathname: '/workouts/plan', params: { day: String(day) } });
  };

  const day = byDay.get(today);
  const tpl = day?.template_id ? templates?.find((t) => t.id === day.template_id) ?? null : null;
  const planned = !!tpl && !day?.is_rest;
  const done = trained.has(todayStr);

  /*
    Chưa đọc xong thì KHÔNG đoán.

    "Chưa có buổi tập" là một câu khẳng định về tài khoản, và trong lúc truy vấn
    còn đang bay — hoặc sau khi nó hỏng — câu ấy sai. Khối vẫn dựng (dải ngày,
    đường sang Plan vẫn dùng được), chỉ phần lời và nút là im cho tới khi biết.
  */
  const unknown = daysPending || daysFailed;

  /* Bốn cờ, mười sáu tổ hợp, và cái sai cũ là một tổ hợp chứ không phải một
     dòng gõ nhầm — nên quyết định nằm ở `lib/today-cta.ts` để bước gác chạy
     được đủ cả mười sáu. */
  const cta = todayCta({ unknown, planned, rest: !!day?.is_rest, done });

  const items = exercisesOf(tpl);
  const line = planned
    ? `${fillCopy(i18n.nExerciseCount, { n: String(items.length) })} · ${i18n.nAboutMinutes.replace(
        '{n}',
        String(estimatedMinutes(items)),
      )}`
    : null;

  /** Tiêu đề của hôm nay: tên buổi tập nếu có, còn không thì trạng thái. */
  const heading = unknown
    ? longNames[today]
    : planned
      ? tpl!.name
      : day?.is_rest
        ? i18n.nTodayRest
        : i18n.nTodayNone;

  const sub = unknown
    ? null
    : planned
      ? done
        ? i18n.nTodayDone
        : line
      : day?.is_rest
        ? i18n.nTodayRestHint
        : i18n.nTodayNoneHint;

  // Progress: 0% nếu chưa tập, 100% nếu đã xong
  const progress = done ? 1 : 0;

  // ── Ngày nghỉ: thẻ riêng theo concept khung 2 (issue 221) ──
  // Không có thanh tiến độ, không danh sách bài tập, không nút ⋯.
  if (!unknown && day?.is_rest) {
    return (
      <>
        <WeekStrip
          dates={dates}
          hasWork={hasWork}
          isRest={isRest}
          selected={null}
          todayStr={todayStr}
          trained={trained}
          longNames={longNames}
          shortNames={shortNames}
          onPick={openPlan}
        />
        <GlassCard style={[styles.card, styles.restCardBg]}>
          {/* Minh hoạ SVG: trăng lưỡi liềm trong đĩa tròn sáng + mây mờ */}
          <View style={styles.restVisual} accessibilityRole="image">
            <Svg width={120} height={96} viewBox="0 0 120 96">
              {/* đĩa tròn sáng */}
              <Circle cx={60} cy={44} r={34} fill={c.secondary} opacity={0.55} />
              {/* mây mờ */}
              <Circle cx={30} cy={66} r={14} fill={c.secondary} opacity={0.35} />
              <Circle cx={92} cy={70} r={11} fill={c.secondary} opacity={0.3} />
              {/* trăng lưỡi liềm */}
              <Path
                d="M72 22a22 22 0 1 0 12 40A26 26 0 0 1 72 22Z"
                fill="#8b7cf0"
              />
            </Svg>
          </View>
          <Text style={styles.eyebrowCenter}>
            {i18n.nTodayTraining} · {longNames[today]}
          </Text>
          <Text style={styles.restTitle}>{i18n.nTodayRest}</Text>
          <Text style={styles.restDesc}>{i18n.nTodayRestHint}</Text>

          <Text style={styles.suggestTitle}>
            {vi ? 'Gợi ý hôm nay' : lang === 'es' ? 'Sugerencias de hoy' : "Today's suggestions"}
          </Text>
          <View style={styles.suggestRow}>
            <PressScale
              style={styles.suggestTile}
              accessibilityRole="button"
              onPress={() => Haptics.selection()}>
              <Icon icon={PersonStanding} size={24} color="#f59e0b" />
              <Text style={styles.suggestLabel}>{vi ? 'Đi bộ nhẹ' : lang === 'es' ? 'Caminata' : 'Easy walk'}</Text>
              <Text style={styles.suggestSub}>20–30 {vi ? 'phút' : 'min'}</Text>
            </PressScale>
            <PressScale
              style={styles.suggestTile}
              accessibilityRole="button"
              onPress={() => Haptics.selection()}>
              <Icon icon={Leaf} size={24} color="#22c55e" />
              <Text style={styles.suggestLabel}>{vi ? 'Giãn cơ' : lang === 'es' ? 'Estirar' : 'Stretch'}</Text>
              <Text style={styles.suggestSub}>10–15 {vi ? 'phút' : 'min'}</Text>
            </PressScale>
            <PressScale
              style={styles.suggestTile}
              accessibilityRole="button"
              onPress={() => Haptics.selection()}>
              <Icon icon={Sun} size={24} color="#eab308" />
              <Text style={styles.suggestLabel}>{vi ? 'Vận động nhẹ' : lang === 'es' ? 'Suave' : 'Light activity'}</Text>
              <Text style={styles.suggestSub}>{vi ? 'Tuỳ chọn' : lang === 'es' ? 'Opcional' : 'Optional'}</Text>
            </PressScale>
          </View>

          <PressScale
            style={styles.restPrimary}
            accessibilityRole="button"
            onPress={() => Haptics.selection()}>
            <Text style={styles.restPrimaryText}>
              {vi ? 'Vận động nhẹ' : lang === 'es' ? 'Actividad suave' : 'Light activity'} ›
            </Text>
          </PressScale>
          <PressScale
            style={styles.restSecondary}
            accessibilityRole="button"
            onPress={() => {
              Haptics.selection();
              setPickerVisible(true);
            }}>
            <Icon icon={CalendarDays} size={16} color={c.foreground} />
            <Text style={styles.restSecondaryText}>{i18n.nTodayPick}</Text>
          </PressScale>
        </GlassCard>
        <WorkoutPickerSheet
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          dateLabel={`${longNames[today]}`}
          templates={(templates ?? []).map((t) => ({
            id: t.id,
            name: t.name,
            exerciseCount: Array.isArray(t.exercises) ? t.exercises.length : 0,
            setCount: Array.isArray(t.exercises)
              ? t.exercises.reduce((s: number, e: any) => s + (e.sets ?? 0), 0)
              : 0,
            minutes: 25,
          }))}
          selectedTemplateId={tpl?.id ?? null}
          isRestSelected={!!day?.is_rest}
          onSelectRest={() => {
            // TODO: ghi is_rest=true qua mutation (issue 221)
            Haptics.selection();
          }}
          onSelectTemplate={(id) => {
            // TODO: ghi template_id qua mutation (issue 221)
            Haptics.selection();
          }}
          onCreateNew={() => {
            setPickerVisible(false);
            nav.push('/workout-builder');
          }}
        />
      </>
    );
  }

  return (
    <>
      {/* Lịch tuần — nằm NGOÀI card, theo concept */}
      <WeekStrip
        dates={dates}
        hasWork={hasWork}
        isRest={isRest}
        selected={null}
        todayStr={todayStr}
        trained={trained}
        longNames={longNames}
        shortNames={shortNames}
        onPick={openPlan}
      />
      <GlassCard style={styles.card}>
      {/* Nút "..." góc trên phải */}
      <PressScale
        style={styles.overflow}
        /* Vùng chạm 44pt theo chuẩn iOS — giữ hình 36pt, nới hitSlop. */
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={vi ? 'Tuỳ chọn' : lang === 'es' ? 'Más opciones' : 'More options'}
        onPress={() => {
          Haptics.selection();
          nav.push({ pathname: '/workouts/plan', params: { day: String(today) } });
        }}>
        <Icon icon={MoreHorizontal} size={20} color={c.mutedForeground} />
      </PressScale>

      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>
            {i18n.nTodayTraining} · {longNames[today]}
          </Text>
          <Text style={styles.title} numberOfLines={2}>{heading}</Text>
          {planned && !unknown ? (
            <View style={styles.meta}>
              <View style={styles.metaRow}>
                <Icon icon={Dumbbell} size={13} color={c.mutedForeground} />
                <Text style={styles.metaText}>
                  {fillCopy(i18n.nExerciseCount, { n: String(items.length) })} · {items.reduce((s, e) => s + (e.sets ?? 0), 0)} sets
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Icon icon={Clock} size={13} color={c.mutedForeground} />
                <Text style={styles.metaText}>{fillCopy(i18n.nCmMinutes, { n: String(estimatedMinutes(items)) })}</Text>
              </View>
            </View>
          ) : sub ? (
            <Text style={styles.sub} numberOfLines={2}>{sub}</Text>
          ) : null}
        </View>
        {/* Ảnh workout bên phải — 3D dumbbell theo concept */}
        {planned && tpl ? (
          <View style={styles.heroImage}>
            <Image
              source={require('@/assets/images/dumbbell-hero.png')}
              style={styles.heroImg}
              resizeMode="contain"
              accessible={false}
            />
          </View>
        ) : null}
      </View>

      {/* Progress bar — dùng component dùng chung (trượt bằng transform,
          không dùng width % gây chạy lại layout). */}
      {planned && !unknown ? (
        <View style={styles.progressWrap}>
          <View style={styles.progressBarFlex}>
            <ProgressBar pct={progress} color={c.primary} height={6} />
          </View>
          <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
        </View>
      ) : null}

      {/* CTA */}
      {cta === 'none' ? null : cta === 'start' ? (
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.nStartWorkout}
          style={styles.primary}
          onPress={() => {
            Haptics.medium();
            nav.push({ pathname: '/workouts/plan', params: { day: String(today) } });
          }}>
          <Icon icon={Play} size={16} color="#fff" strokeWidth={2.5} />
          <Text style={styles.primaryText}>{i18n.nStartWorkout}</Text>
        </PressScale>
      ) : cta === 'extra' ? (
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.nTodayExtra}
          style={styles.quiet}
          onPress={() => {
            Haptics.selection();
            nav.push('/log-workout');
          }}>
          <Text style={styles.quietText}>{i18n.nTodayExtra}</Text>
        </PressScale>
      ) : (
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={cta === 'log-free' ? i18n.nLogFree : i18n.nTodayPick}
          style={styles.quiet}
          onPress={() => {
            Haptics.selection();
            if (cta === 'pick') nav.push({ pathname: '/workouts/plan', params: { day: String(today) } });
            else nav.push('/log-workout');
          }}>
          <Text style={styles.quietText}>
            {cta === 'log-free' ? i18n.nLogFree : i18n.nTodayPick}
          </Text>
        </PressScale>
      )}
    </GlassCard>
    </>
  );
}

const stylesFor = makeStyles((c, m) => ({
  card: { gap: spacing.md, borderRadius: radius.xl, padding: spacing.lg },
  overflow: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    zIndex: 1,
  },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  heroImage: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  heroImg: { width: 96, height: 96 },
  eyebrow: {
    ...type.caption,
    color: c.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '600',
  },
  title: { ...type.largeTitle, color: c.foreground, fontWeight: '700' },
  meta: { gap: 4, marginTop: spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { ...type.footnote, color: c.mutedForeground },
  sub: { ...type.footnote, color: c.mutedForeground, marginTop: spacing.xs },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progressBarFlex: { flex: 1 },
  progressText: { ...type.caption, color: c.mutedForeground, fontWeight: '600', minWidth: 36, textAlign: 'right' },
  /* CTA đen full-width theo concept */
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: '#1a1a1a',
  },
  primaryText: { ...type.headline, fontWeight: '700', color: '#fff' },
  quiet: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: c.secondary,
  },
  quietText: { ...type.headline, fontWeight: '600', color: c.foreground },
  /* ── Ngày nghỉ (khung 2, issue 221) ── */
  restCardBg: { alignItems: 'center' },
  restVisual: { marginVertical: spacing.sm },
  eyebrowCenter: {
    ...type.caption,
    color: c.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '600',
    textAlign: 'center',
  },
  restTitle: { ...type.largeTitle, fontWeight: '700', color: c.foreground, textAlign: 'center', marginTop: spacing.xs },
  restDesc: { ...type.body, color: c.mutedForeground, textAlign: 'center', marginTop: spacing.xs, paddingHorizontal: spacing.lg },
  suggestTitle: { ...type.footnote, fontWeight: '700', color: c.foreground, alignSelf: 'flex-start', marginTop: spacing.lg },
  suggestRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignSelf: 'stretch' },
  suggestTile: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    backgroundColor: c.secondary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    minHeight: 44,
  },
  suggestLabel: { ...type.footnote, fontWeight: '600', color: c.foreground, textAlign: 'center' },
  suggestSub: { ...type.caption, color: c.mutedForeground, textAlign: 'center' },
  restPrimary: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
    marginTop: spacing.lg,
  },
  restPrimaryText: { ...type.headline, fontWeight: '600', color: c.foreground },
  restSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  restSecondaryText: { ...type.body, color: c.foreground },
}));
