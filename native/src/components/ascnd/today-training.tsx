import { CheckCircle2, ChevronRight, Moon, Play, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import {
  DAY_LONG_EN,
  DAY_LONG_VI,
  DAY_SHORT_EN,
  DAY_SHORT_VI,
  WeekStrip,
} from '@/components/ascnd/week-strip';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useWorkoutSessions } from '@/hooks/use-fitness-data';
import { useRoutineDays, useWorkoutTemplates } from '@/hooks/use-library';
import type { TplExercise } from '@/components/ascnd/template-list';
import { estimatedMinutes } from '@/lib/prescription';
import { localDateStr, routineIndex, weekDates } from '@/lib/local-date';
import { nav } from '@/lib/nav';

/**
 * Hôm nay: câu trả lời, và cái nút.
 *
 * ── vì sao khối này tồn tại ──
 *
 * Tab Tập luyện từng mở ra với năm đích đến ngang hàng nhau — thẻ Plan, ba pill
 * (tiến bộ, thư viện, tạo mới) và một thanh "Ghi buổi tập" — và không cái nào
 * nói cho bạn biết nên bấm cái nào. Đó là một BẢNG CHỌN, không phải một luồng.
 *
 * Người mở tab này gần như luôn muốn đúng một trong hai việc: TẬP BÂY GIỜ, hoặc
 * sửa kế hoạch. Việc thứ nhất là việc hằng ngày, và trước bản này nó không có
 * nút nào cả: bạn phải tự biết rằng đường vào buổi tập hôm nay là chạm vào thẻ
 * Plan, rồi tìm đúng ngày, rồi cuộn xuống panel.
 *
 * Khối này trả lời "hôm nay tập gì" ngay tại chỗ và mang theo MỘT hành động
 * chính. Đó là chỗ mà "flow hoàn chỉnh" bắt đầu: hôm nay → tập → xong → lịch sử.
 *
 * ── bốn trạng thái, bốn câu, bốn nút khác nhau ──
 *
 * Một khối "hôm nay" chỉ trung thực nếu nó nói khác nhau ở bốn tình huống khác
 * nhau. Một nút "Bắt đầu" sáng rực trên một ngày nghỉ là app không biết bạn
 * đang ở đâu trong tuần của chính mình.
 *
 *   có kế hoạch, chưa tập   tên buổi + số bài + phút   → Bắt đầu (nút đặc)
 *   đã tập xong             tên buổi + đã hoàn thành   → Ghi buổi nữa (nhạt)
 *   ngày nghỉ               Ngày nghỉ                  → Ghi buổi tập (nhạt)
 *   chưa có kế hoạch        Chưa có buổi tập           → Chọn buổi tập
 *
 * Chỉ trạng thái thứ nhất có nút ĐẶC. Ba trạng thái còn lại không có việc gì
 * cấp bách để làm, nên nút của chúng là nút nhạt — màu là thứ dành cho việc
 * đang chờ bạn, không phải cho mọi thứ bấm được.
 *
 * ── dải ngày ở lại ──
 *
 * Cùng `week-strip` mà Plan dùng, nên tuần vẫn đọc được ở đây và chạm một ngày
 * vẫn mở đúng ngày đó. Khác biệt: hôm nay không còn là "một ô trong bảy ô" —
 * nó là dòng chữ phía trên, vì hôm nay là ngày duy nhất bạn có thể tập.
 */

/** Đọc `exercises` JSONB của template một cách phòng thủ — cột là free-form. */
function exercisesOf(tpl: { exercises?: unknown } | null | undefined): TplExercise[] {
  const raw = tpl?.exercises;
  return Array.isArray(raw) ? (raw as TplExercise[]) : [];
}

export function TodayTraining() {
  const c = usePalette();
  const styles = stylesFor(c);
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

  const openPlan = (day: number) => {
    Haptics.selectionAsync();
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

  const items = exercisesOf(tpl);
  const line = planned
    ? `${i18n.nExerciseCount.replace('{n}', String(items.length))} · ${i18n.nAboutMinutes.replace(
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

  return (
    <GlassCard style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headCopy}>
          <Text style={styles.eyebrow}>
            {i18n.nTodayTraining} · {longNames[today]}
          </Text>
          <Text style={styles.title} numberOfLines={1}>{heading}</Text>
          {sub ? (
            <View style={styles.subRow}>
              {done && planned ? (
                <Icon icon={CheckCircle2} size={13} color={c.readinessGreen} />
              ) : day?.is_rest && !unknown ? (
                <Icon icon={Moon} size={13} color={c.metricPurple} />
              ) : null}
              <Text style={styles.sub} numberOfLines={1}>{sub}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/*
        Một hành động, và nó nói ra việc nó làm.

        Nút ĐẶC chỉ xuất hiện đúng một trường hợp: hôm nay có buổi tập và bạn
        chưa tập. Mọi trường hợp khác dùng nút nhạt — không có gì đang chờ, nên
        không có gì phải sáng lên.
      */}
      {unknown ? null : planned && !done ? (
        /*
          HAI nút, không phải một.

          Bản trước thay nút "Ghi buổi tập" bằng "Bắt đầu buổi tập" ở trạng thái
          này — và thế là vào một ngày có kế hoạch, tức là hầu hết các ngày tập,
          KHÔNG còn đường nào ghi một buổi tự do trên cả tab. Người dùng báo
          "mất luôn một số thẻ rồi", và đó chính là nó.

          Hai việc ấy không thay thế nhau: một cái là làm theo kế hoạch, một cái
          là ghi lại thứ bạn vừa tập ngoài kế hoạch. Nút đặc dành cho cái thứ
          nhất vì hôm nay nó đang chờ bạn; nút thứ hai đứng cạnh, nhạt hơn, và
          không bao giờ biến mất.
        */
        <View style={styles.actions}>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.nStartWorkout}
            style={styles.primary}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              nav.push({ pathname: '/workouts/plan', params: { day: String(today) } });
            }}>
            <Icon icon={Play} size={15} color={c.primaryForeground} strokeWidth={2.5} />
            <Text style={styles.primaryText}>{i18n.nStartWorkout}</Text>
          </PressScale>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.nLogFree}
            style={styles.secondary}
            onPress={() => {
              Haptics.selectionAsync();
              nav.push('/log-workout');
            }}>
            <Icon icon={Plus} size={17} color={c.foreground} strokeWidth={2.5} />
          </PressScale>
        </View>
      ) : (
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={planned || day?.is_rest ? i18n.nLogFree : i18n.nTodayPick}
          style={styles.quiet}
          onPress={() => {
            Haptics.selectionAsync();
            if (!planned && !day?.is_rest) nav.push({ pathname: '/workouts/plan', params: { day: String(today) } });
            else nav.push('/log-workout');
          }}>
          <Icon
            icon={planned || day?.is_rest ? Plus : ChevronRight}
            size={15}
            color={c.foreground}
            strokeWidth={2.5}
          />
          <Text style={styles.quietText}>
            {planned || day?.is_rest ? i18n.nLogFree : i18n.nTodayPick}
          </Text>
        </PressScale>
      )}

      <View style={styles.rule} />

      <WeekStrip
        dates={dates}
        hasWork={hasWork}
        /* Không ô nào được TÔ. Ô tô nghĩa là "ngày bạn đang đọc", mà ở đây bạn
           không đọc ngày nào — hôm nay đã là dòng chữ phía trên, và vòng tròn
           quanh số của nó đã nói đúng điều cần nói. */
        selected={null}
        todayStr={todayStr}
        trained={trained}
        longNames={longNames}
        shortNames={shortNames}
        onPick={openPlan}
      />

    </GlassCard>
  );
}

const stylesFor = makeStyles((c) => ({
  card: { gap: spacing.sm, borderRadius: radius.xl },
  head: { flexDirection: 'row', alignItems: 'center' },
  headCopy: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: {
    ...type.caption,
    color: c.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '600',
  },
  title: { ...type.title, color: c.foreground },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sub: { ...type.footnote, color: c.mutedForeground, flexShrink: 1 },
  /* Nút đặc, cao 48 — nó là hành động chính của cả tab, không phải một pill
     trong một hàng pill. */
  primary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: c.primary,
    marginTop: 2,
  },
  primaryText: { ...type.headline, fontWeight: '700', color: c.primaryForeground },
  quiet: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginTop: 2,
  },
  quietText: { ...type.headline, fontWeight: '600', color: c.foreground },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginTop: 2 },
  /* Nút chính và nút phụ nằm cùng một hàng: nút phụ chỉ là một ô vuông mang dấu
     cộng, vì việc của nó đã được nói bằng nhãn trợ năng và bằng chỗ đứng. */
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
  secondary: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
}));
