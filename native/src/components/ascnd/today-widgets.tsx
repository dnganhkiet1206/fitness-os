import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { nav } from '@/lib/nav';
import { Check, PartyPopper, Sparkles } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { PressScale } from '@/components/ascnd/press-scale';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useLogWeight, useReadinessHistory, useTodayWeight } from '@/hooks/use-fitness-data';
import { useAuth } from '@/hooks/use-auth';
import { offlineNow } from '@/lib/offline';
import { OFFLINE_WRITE_KEY, type OfflineWrite } from '@/lib/offline-write';
import { BOUNDS, plausible } from '@/lib/plausible';
import { toast } from '@/lib/toast';
import { useSupplementChecklist, useToggleSupplement } from '@/hooks/use-library';
import { useSmartNudges } from '@/hooks/use-smart-nudges';
import { useProfile } from '@/hooks/useTodayData';
import { useUnits } from '@/hooks/use-units';
import { localDateStr, parseLocalDate } from '@/lib/local-date';
import { displayWeight, weightLabel, weightToKg } from '@/lib/units';
import { decText } from '@/lib/number-input';
import { beginInteraction, endInteraction } from '@/lib/interaction';

const NEUTRAL = '#9aa0aa';

/**
 * Colour a weight change by health goal, not just direction: for an
 * underweight person gaining is good (green) and losing is bad (red); for an
 * overweight person it's reversed; in the normal range (or unknown BMI) any
 * change is neutral grey. `diff` sign is the direction; BMI decides meaning.
 */
function weightDiffTone(bmi: number | null, diff: number): { color: string; bg: string } {
  const green = { color: colors.readinessGreen, bg: 'rgba(32,181,131,0.12)' };
  const red = { color: colors.readinessRed, bg: 'rgba(220,47,47,0.12)' };
  const neutral = { color: NEUTRAL, bg: 'rgba(154,160,170,0.12)' };
  if (bmi == null || (bmi >= 18.5 && bmi < 25)) return neutral; // normal / unknown
  const gaining = diff > 0;
  if (bmi < 18.5) return gaining ? green : red; // underweight: gain good
  return gaining ? red : green; // overweight (bmi >= 25): lose good
}

/** Weight check-in — shows today's weight vs profile, or an inline logger */
export function WeightCheckinCard({ profileWeight }: { profileWeight: number | null }) {
  const i18n = useI18n();
  const { weight: wUnit } = useUnits();
  const { data: todayWeight } = useTodayWeight();
  const { data: profile } = useProfile();
  const logWeight = useLogWeight();
  const { user } = useAuth();
  /* The durable twin — no local `mutationFn`, because what comes back from
     storage after a restart is the default registered in `offline-write`. */
  const queue = useMutation<void, Error, OfflineWrite>({ mutationKey: [...OFFLINE_WRITE_KEY] });
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  // BMI from the current weight (kg) + height decides how a change reads
  const heightCm = Number(profile?.height_cm) || 0;
  const currentKg = todayWeight ?? profileWeight ?? 0;
  const bmi = heightCm > 0 && currentKg > 0 ? currentKg / Math.pow(heightCm / 100, 2) : null;

  // Stored values are kg; show + accept entry in the user's unit
  const todayDisp = todayWeight != null ? displayWeight(todayWeight, wUnit) : null;
  const profileDisp = profileWeight != null ? displayWeight(profileWeight, wUnit) : null;

  useEffect(() => {
    setValue(todayDisp?.toString() ?? profileDisp?.toString() ?? '');
  }, [todayDisp, profileDisp]);

  const diff = todayDisp != null && profileDisp != null ? todayDisp - profileDisp : null;
  const showLogger = editing || todayWeight == null;

  /*
    ── checked in kg, typed in whatever they use ──

    The box holds the display unit, so 300 is a plausible weight in pounds
    (136 kg) and an impossible one in kilograms. Judging the typed number
    against a kg range would refuse a real reading from anybody on lb, which is
    worse than the bug being fixed. So the conversion happens first and the
    bound is applied to the value that will actually be stored.

    Worth being clear about what this cannot do: 175 for a 75 kg person passes,
    because 175 kg is a weight a person can have. That typo is the one this
    card's own delete button exists for. What this stops is the slipped decimal
    and the wrong unit — and weight is the input with the longest tail, running
    through the BMI band, the chart's scale, and `adaptiveTDEE`'s least-squares
    fit, which has no outlier defence and now sets a suggested calorie target.
  */
  const typed = parseFloat(value);
  const kg = isNaN(typed) ? null : weightToKg(typed, wUnit);
  const weightError = kg == null || kg <= 0 ? null : plausible('weight_kg', kg) ? null
    : i18n.outOfRange
        .replace('{min}', String(displayWeight(BOUNDS.weight_kg.min, wUnit)))
        .replace('{max}', String(displayWeight(BOUNDS.weight_kg.max, wUnit)))
        .replace('{unit}', weightLabel(wUnit));

  const submit = () => {
    if (kg == null || kg <= 0 || weightError) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    /*
      ── offline, down the durable pipe; and either way it says what happened ──

      Two faults met in this one line. Fired offline the mutation paused, the
      tile sat in its editing state for ever, and the paused write was restored
      on the next launch with no `mutationFn` registered for its key and
      dropped — a weigh-in silently gone. And online, a rejected write had no
      `onError` at all, so the field simply closed as though it had worked.

      Weight is not a cosmetic number here: `adaptiveTDEE` runs a least-squares
      regression over fourteen days of it to suggest a calorie target.

      `kind: 'weight'` and its handler have been in `lib/offline-write.ts` since
      that file was written, with nothing ever producing one.
    */
    if (offlineNow() && user) {
      /* Closed here rather than in a callback: a paused mutation never calls
         one, which is the whole failure being fixed. */
      setEditing(false);
      queue.mutate({ kind: 'weight', userId: user.id, kg, date: localDateStr() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.success(i18n.logMealQueued);
      return;
    }
    logWeight.mutate(kg, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setEditing(false);
      },
      onError: (e: Error) => toast.fail(e),
    });
  };

  return (
    <GlassCard>
      <Text style={styles.cardTitle}>{i18n.nWeightTitle}</Text>
      {showLogger ? (
        <View style={styles.weightLogger}>
          <TextInput
            style={styles.weightInput}
            keyboardType="decimal-pad"
            value={value}
            onChangeText={(v) => setValue(decText(v))}
            /*
              Ô đang gõ cũng là "tay đang chạm". Bàn phím mở ra làm cả trang
              co giãn, và đó đúng là lúc không nên chia ngân sách khung hình cho
              một hoạt ảnh trang trí — xem `lib/interaction`.

              Cặp focus/blur luôn khớp nhau, kể cả khi ô mất focus vì trang bị
              rời đi, nên bộ đếm không kẹt.
            */
            onFocus={() => beginInteraction()}
            onBlur={() => endInteraction(320)}
            placeholder="70.0"
            placeholderTextColor={colors.mutedForeground}
          />
          <Text style={styles.weightUnit}>{weightLabel(wUnit)}</Text>
          <PressScale
            style={[styles.weightBtn, weightError ? styles.weightBtnOff : null]}
            /* Mảng màu 36 điểm, vùng chạm 44+ — xem ghi chú ở `weightBtn`. */
            hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
            onPress={submit}
            /*
              ── the offline branch is a submit too ──

              `logWeight` is the online mutation; offline the tap goes to
              `queue`, whose state nothing here read, so the button stayed live.

              And it stays *visible*: `setEditing(false)` above is meant to close
              the logger, but `showLogger` is `editing || todayWeight == null`,
              and on the first weigh-in of a day `todayWeight` is null and — with
              no signal — is not going to stop being null. So the form sat open
              with the number still typed in it, one tap away from a second
              write, which is exactly the shape that produces one.

              The value is not patched into the cache to close it, deliberately:
              `lib/offline.ts` is the rule that a paused mutation never rolls
              back, so an optimistic weight would sit in the persisted cache as a
              reading nobody took. Disabling is the honest half — the toast has
              already said what happened.
            */
            disabled={
              logWeight.isPending || queue.isPending || queue.isSuccess || !!weightError
            }>
            {logWeight.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Text style={styles.weightBtnText}>{i18n.nLogWeight}</Text>
            )}
          </PressScale>
        </View>
      ) : null}
      {showLogger && weightError ? <Text style={styles.weightError}>{weightError}</Text> : null}
      {showLogger ? null : (
        <PressScale style={styles.weightDisplay} onPress={() => setEditing(true)}>
          <View style={styles.weightValueRow}>
            <Text style={styles.weightValue}>{todayDisp}</Text>
            <Text style={styles.weightUnit}>{weightLabel(wUnit)}</Text>
          </View>
          {diff != null && Math.abs(diff) >= 0.05 && (() => {
            const tone = weightDiffTone(bmi, diff);
            return (
              <View style={[styles.diffPill, { backgroundColor: tone.bg }]}>
                <Text style={[styles.diffText, { color: tone.color }]}>
                  {diff > 0 ? '↑ +' : '↓ '}
                  {diff.toFixed(1)}
                </Text>
              </View>
            );
          })()}
        </PressScale>
      )}
    </GlassCard>
  );
}

/** Supplement checklist — tap to toggle taken; hidden when user has none */
export function SupplementChecklistCard() {
  const i18n = useI18n();
  const { data: supplements } = useSupplementChecklist();
  const toggle = useToggleSupplement();

  if (!supplements || supplements.length === 0) return null;

  const takenCount = supplements.filter((s) => s.taken).length;
  const allDone = takenCount === supplements.length;

  return (
    <GlassCard>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>{i18n.nSupplements}</Text>
        <Text style={styles.cardHint}>
          {takenCount}/{supplements.length} {i18n.nTakenToday}
        </Text>
      </View>
      {allDone ? (
        <View style={styles.allDoneRow}>
          <Icon icon={PartyPopper} size={15} color={colors.readinessYellow} />
          <Text style={styles.allDone}>{i18n.nAllSupplementsDone}</Text>
        </View>
      ) : (
        <View style={styles.suppList}>
          {supplements.map((s) => (
            <PressScale
              key={s.id}
              style={styles.suppRow}
              onPress={() => toggle.mutate({ supplementId: s.id, taken: !s.taken })}>
              <View style={[styles.checkbox, s.taken && styles.checkboxOn]}>
                {s.taken && <Icon icon={Check} size={15} color="#fff" strokeWidth={3} />}
              </View>
              <View style={styles.suppInfo}>
                <Text style={[styles.suppName, s.taken && styles.suppNameDone]} numberOfLines={1}>
                  {s.name}
                </Text>
                {s.dose_text ? <Text style={styles.suppDose}>{s.dose_text}</Text> : null}
              </View>
            </PressScale>
          ))}
        </View>
      )}
    </GlassCard>
  );
}

const readinessZone = (v: number) =>
  v >= 75 ? colors.readinessGreen : v >= 50 ? colors.readinessYellow : colors.readinessRed;

/**
 * Readiness 7-day analysis — matches the web "Phân tích": one bar per day
 * coloured by zone, avg/max/min stats, and the three-zone legend. Hidden
 * until there are 2+ points.
 */
export function ReadinessTrendCard() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { data: history } = useReadinessHistory(7);

  if (!history || history.length < 2) return null;

  const values = history.map((h) => h.value);
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';

  const stats = [
    { label: lang === 'vi' ? 'TB' : 'Avg', value: avg },
    { label: lang === 'vi' ? 'Cao nhất' : 'Max', value: max },
    { label: lang === 'vi' ? 'Thấp nhất' : 'Min', value: min },
  ];
  const legend = [
    { c: colors.readinessGreen, t: lang === 'vi' ? '75+ Tập luyện' : '75+ Train' },
    { c: colors.readinessYellow, t: lang === 'vi' ? '50–74 Vừa phải' : '50–74 Moderate' },
    { c: colors.readinessRed, t: lang === 'vi' ? '<50 Phục hồi' : '<50 Recover' },
  ];

  return (
    <GlassCard style={styles.trendCard}>
      <View>
        <Text style={styles.cardTitle}>{i18n.nReadinessTrend}</Text>
        <Text style={styles.cardHint}>
          {lang === 'vi'
            ? 'Mức độ sẵn sàng tập luyện của bạn trong tuần qua'
            : 'Your training readiness over the past week'}
        </Text>
      </View>

      <View style={styles.trendBars}>
        {history.map((h, i) => {
          const day = parseLocalDate(h.date).toLocaleDateString(locale, { weekday: 'short' });
          const zone = readinessZone(h.value);
          return (
            <View key={h.date} style={styles.trendRow}>
              <Text style={styles.trendDay}>{day}</Text>
              <ProgressBar pct={h.value} color={zone} height={8} radius={4} delay={i * 60} style={styles.trendBar} />
              <Text style={[styles.trendVal, { color: zone }]}>{Math.round(h.value)}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.trendStats}>
        {stats.map((s) => (
          <View key={s.label} style={styles.trendStat}>
            <Text style={styles.trendStatLabel}>{s.label}</Text>
            <Text style={[styles.trendStatValue, { color: readinessZone(s.value) }]}>{s.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.trendLegend}>
        {legend.map((z) => (
          <View key={z.t} style={styles.trendLegendItem}>
            <View style={[styles.trendLegendDot, { backgroundColor: z.c }]} />
            <Text style={styles.trendLegendText}>{z.t}</Text>
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

/**
 * The dashboard's door into today's insight.
 *
 * ── it used to compute them here ──
 *
 * This card called the edge function on tap and dropped the result when it
 * unmounted, so pressing it twice produced two different readings of the same
 * unchanged day — a paid model call each time, and advice that looked like it
 * was being made up on the spot because in a sense it was.
 *
 * The insight lives on the Health Assistant now, where the hero says what the
 * app can see and this says what it means. Two places computing it would be two
 * answers to one question, so this one only points.
 *
 * ── it still shows something ──
 *
 * `enabled: false` reads the day's cache without ever requesting: if the
 * assistant has already been opened today, the card says how many there are.
 * If not, it says what is behind the door. Either way it costs nothing, and it
 * never triggers the call itself — that belongs to the page that displays the
 * result.
 *
 * ── and it goes quiet again when the day moves ──
 *
 * The key carries a coarse stamp of today (see `use-smart-nudges`), so logging
 * a meal invalidates the count this card is showing. It falls back to
 * "Xem insight hôm nay", which is right rather than a gap: the number would be
 * a promise about a reading that no longer matches the day, and tapping now
 * genuinely does produce a different one.
 */
export function SmartTipsCard() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const cached = useSmartNudges(false);
  const count = cached.data?.length ?? null;

  return (
    <GlassCard>
      <View style={styles.cardHeaderRow}>
        <View style={styles.tipsTitleWrap}>
          <View style={styles.tipsTitleRow}>
            <Icon icon={Sparkles} size={16} />
            <Text style={styles.cardTitle}>{i18n.nSmartTips}</Text>
          </View>
          <Text style={styles.cardHint}>{i18n.nTipsHint}</Text>
        </View>
      </View>

      <PressScale
        accessibilityRole="button"
        style={styles.tipsBtn}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          nav.push('/assistant');
        }}>
        <Text style={styles.tipsBtnText}>
          {count != null && count > 0
            ? vi
              ? `${count} gợi ý cho hôm nay`
              : `${count} suggestions for today`
            : vi
              ? 'Xem insight hôm nay'
              : 'See today’s insight'}
        </Text>
      </PressScale>
    </GlassCard>
  );
}


const styles = StyleSheet.create({
  // Web dashboard micro-title: 12px semibold uppercase, wide tracking
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: colors.mutedForeground,
  },
  cardHint: { ...type.footnote, color: colors.mutedForeground, marginTop: 2 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },

  // Weight
  /*
    ── một thẻ, một hình dạng ──

    Thẻ này có hai trạng thái và trước đây chúng vẽ CÙNG một con số theo hai
    cách khác nhau: đã ghi thì `weightValue` — 28 điểm, mono, màu đầy; chưa ghi
    thì `fontSize: 18` nằm trong một cái hộp có viền và nền riêng. Nên mỗi ngày
    một lần, đúng lúc bạn ghi cân, cả thẻ đổi hình.

    Nay hai trạng thái dùng chung một bộ xương: số lớn mono bên trái, đơn vị
    trên cùng đường chân chữ, hành động bên phải. Cái đổi giữa hai trạng thái
    chỉ còn là gạch chân của ô nhập và viên chênh lệch — tức là thứ THẬT SỰ
    khác nhau, chứ không phải toàn bộ bố cục.

    ── vì sao bỏ hộp ──

    Cái hộp (viền + nền + bo góc) là chrome của một cái FORM. Trên một trang
    tổng quan, một ô nhập có hộp đọc ra như việc chưa làm xong. Số thì vẫn sửa
    được, chỉ là nó thôi mặc đồng phục biểu mẫu: gạch chân mảnh nói "gõ được"
    mà không dựng thêm một hình chữ nhật thứ hai bên trong thẻ.
  */
  /*
    `center`, KHÔNG phải `baseline` — và đây là lý do bản đầu bị trả về.

    Căn theo đường chân chữ đọc thì đúng hơn: "kg" ngồi trên cùng đường với đáy
    con số, y như trạng thái đã ghi. Nhưng nó là thứ DUY NHẤT trong cả thẻ này
    làm đổi CÁCH TÍNH bố cục — Yoga phải đo đường chân chữ của từng con, mà một
    trong ba con là `TextInput`. Bỏ viền hộp, chốt bề rộng, thu nhỏ nút đều là
    giá trị tĩnh; chỉ mình nó kéo thêm một lượt đo.

    Người dùng báo bấm Ghi thì giật, và mốc bắt đầu đúng là lúc thẻ này đổi
    thiết kế. `center` cho ra hình gần như y hệt ở cỡ chữ này, nên đây là chỗ
    nhường rẻ nhất: giữ toàn bộ phần nhìn, bỏ đúng một dòng đắt.
  */
  weightLogger: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  weightInput: {
    /*
      Bề rộng CHỐT, không phải `minWidth`.

      Với `minWidth` thì ô nhập giãn chiếm hết chỗ trống tới tận cái nút: gạch
      chân kéo dài lê thê sau một con số ngắn, và "kg" bị đẩy văng sang phải,
      dính vào nút, tách khỏi chính con số nó thuộc về. Đo được trên bản dựng:
      số hết ở ~100px, vạch chạy tới ~285px.

      104 là chỗ cho năm ký tự mono ở 28 điểm — "100.5", giá trị dài nhất hợp
      lý ở cả kg lẫn lb — cộng chỗ cho con trỏ. Phần thừa sau số ngắn là có ý:
      nó nói còn chỗ để gõ, đúng việc của một ô nhập.
    */
    width: 104,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    color: colors.foreground,
    ...type.largeTitle,
    ...type.mono,
  },
  weightUnit: { ...type.body, color: colors.mutedForeground },
  /*
    Nút thôi là vật sáng nhất trên thẻ.

    `colors.primary` là #a8afbd — bạc sáng — trên thẻ tối, nên ở 44 điểm với
    đệm 24 nó là mảng tương phản mạnh nhất ở đây. Một thẻ nói về MỘT CON SỐ mà
    thứ mắt bắt trước tiên lại là cái nút thì thứ bậc đang ngược.

    Nhỏ lại còn 36 và chữ 13/600 thì nó đọc ra là một control cạnh con số, chứ
    không phải một tấm biển. Vẫn nền đặc, vì đây vẫn là hành động chính duy
    nhất của thẻ — hạ xuống viền rỗng là nói dối về vai trò của nó.

    36 dưới sàn chạm 44 điểm, nên `hitSlop` bù lại: vùng chạm không đổi, chỉ
    có mảng màu nhỏ đi.
  */
  weightBtn: {
    marginLeft: 'auto',
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightBtnOff: { opacity: 0.4 },
  weightBtnText: { ...type.footnote, fontWeight: '700', color: colors.primaryForeground },
  weightError: { ...type.footnote, color: colors.readinessRed, marginTop: 6 },
  weightDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  weightValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  /* Cùng `gap` và cùng đường chân chữ như `weightLogger`, để hai trạng thái
     đặt số và đơn vị vào đúng một chỗ. */
  weightValue: { ...type.largeTitle, ...type.mono, color: colors.foreground },
  diffPill: { paddingHorizontal: spacing.sm + 2, paddingVertical: 4, borderRadius: radius.full },
  diffText: { ...type.footnote, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // Readiness 7-day analysis
  trendCard: { gap: spacing.md },
  trendBars: { gap: spacing.sm },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trendDay: { width: 34, fontSize: 11, color: colors.mutedForeground, textTransform: 'capitalize' },
  trendBar: { flex: 1 },
  trendVal: { width: 28, textAlign: 'right', fontSize: 12, fontFamily: 'Menlo', fontWeight: '700', fontVariant: ['tabular-nums'] },
  trendStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  trendStat: { alignItems: 'center', gap: 2 },
  trendStatLabel: { fontSize: 11, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.6 },
  trendStatValue: { fontSize: 20, fontFamily: 'Menlo', fontWeight: '700', fontVariant: ['tabular-nums'] },
  trendLegend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md, rowGap: 4 },
  trendLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  trendLegendDot: { width: 7, height: 7, borderRadius: 4 },
  trendLegendText: { fontSize: 11, color: colors.mutedForeground },

  // Supplements
  allDone: { ...type.body, color: colors.readinessGreen },
  allDoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  suppList: { marginTop: spacing.sm, gap: spacing.sm },
  suppRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.readinessGreen, borderColor: colors.readinessGreen },
  checkmark: { color: '#fff', fontSize: 15, fontWeight: '700' },
  suppInfo: { flex: 1, minWidth: 0 },
  suppName: { ...type.body, color: colors.foreground },
  suppNameDone: { color: colors.mutedForeground, textDecorationLine: 'line-through' },
  suppDose: { ...type.caption, color: colors.mutedForeground },

  // Smart tips
  tipsTitleWrap: { flex: 1, minWidth: 0 },
  tipsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tipsBtn: {
    marginTop: spacing.md,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipsBtnText: { ...type.headline, color: colors.foreground },
});
