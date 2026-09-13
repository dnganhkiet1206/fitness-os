import * as Haptics from 'expo-haptics';
import { nav } from '@/lib/nav';
import { Lightbulb, Moon, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { GlassCard } from '@/components/ascnd/glass-card';
import { HeroMetric } from '@/components/ascnd/hero-metric';
import { MetricPill } from '@/components/ascnd/metric-pill';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { EmptyState } from '@/components/ascnd/empty-state';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { Screen } from '@/components/ascnd/screen';
import { radius, spacing, type } from '@/constants/ascnd';
import { BOUNCE, spring } from '@/constants/motion';
import { alpha, makeStyles } from '@/constants/theme';
import { useSleepRamp, usePalette } from '@/hooks/use-palette';
import { useMuted } from '@/hooks/use-wash';
import { useRise } from '@/lib/entrance';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useProfile, useSleepHistory } from '@/hooks/useTodayData';
import { useDeleteSleepLog } from '@/hooks/use-fitness-data';
import { getLocale } from '@/lib/i18n';
import { asleepMinutes } from '@/lib/daily-log-service';
import { toast } from '@/lib/toast';

/*
  Khoá của bảng màu, không phải mã màu: một mã màu ở phạm vi module bị ĐÓNG BĂNG
  lúc import và sẽ giữ màu của theme tối kể cả khi người dùng bật theme sáng.
  Ba hằng này cũng vậy; chỗ vẽ — nơi luôn có `c` — mới đổi khoá thành màu.
*/
/* Ba giai đoạn giờ đọc từ MỘT nguồn — `sleepRamps` trong `constants/palette.ts`.
   Ba hằng cũ ở đây là bản thứ hai của cùng một quyết định, và hai bản đã trôi
   khỏi nhau: giấc ngủ nông là `#565663` ở màn này và `#3f4048` ở thẻ Hôm nay.
   Cùng một khái niệm, hai màu, không gì báo. */

/* Chiều cao của một cột và của hàng nhãn thứ dưới nó. Hai con số này được
   DÙNG CHUNG giữa `styles.barTrack` và mốc mục tiêu — đặt rời hai chỗ là để
   đường mục tiêu trôi khỏi các cột nó đang đo. */
const BAR_H = 140;
const LABEL_H = 22;

export default function SleepInsightsScreen() {
  const c = usePalette();
  const sleep = useSleepRamp();
  /* Màn này bật `aura`, nên chữ hạng hai dùng token của kính-trên-wash —
     xem `use-wash.tsx` và phép đo trong chú thích ở `return` bên dưới. */
  const muted = useMuted();
  const styles = stylesFor(c);
  /* Lần vẽ đầu hiện NGAY, cascade chỉ chạy cho thứ mount vào một màn hình
     đã ở đó — xem `useRise`. Bản trước gọi `rise` trần, tức là ba cái
     lò xo bắt đầu bên trong giây đầu tiên của một màn cũng đang chạy truy
     vấn; khung hình rơi trong quãng đó để lại đúng giá trị đầu, và giá trị
     đầu của `FadeInDown` là chưa nhìn thấy. */
  const rise = useRise();
  const { lang } = useAppSettings();
  const i18n = useI18n();
  const locale = getLocale(lang);
  const { data: sleepLogs, isError, refetch, isRefetching } = useSleepHistory(7);
  const { data: profile } = useProfile();
  const vi = lang === 'vi';
  const remove = useDeleteSleepLog();
  const targetHours = Number(profile?.sleep_target_hours) || 8;

  const nights = useMemo(
    () =>
      (sleepLogs ?? []).map((s) => {
        const deep = Number(s.deep_min ?? 0);
        const rem = Number(s.rem_min ?? 0);
        const light = Number(s.light_min ?? 0);
        /*
          ── how long the night was, and how long it looked like ──

          `total` used to be `deep + rem + light`, which is only a night's
          length for a night HealthKit wrote. A night typed into `log-sleep`
          has a bedtime and a waketime and leaves the three stage boxes empty,
          stored as 0 — so this screen told anybody logging by hand that they
          slept **0.0h**, computed a full week of sleep debt from it, and then
          printed "Bạn ngủ trung bình 0.0h, thiếu 8.0h so với mục tiêu" as a
          finding about their body.

          Same mistake had already been found and fixed twice, in the readiness
          engine and in the two AI functions. `asleepMinutes` is the app's one
          definition of a night's length and it now lives in one place.

          The stages are still the stages. `stagesKnown` is what separates "you
          had no deep sleep" from "nobody measured your deep sleep", and every
          reader below has to respect that difference.
        */
        const stagesKnown = deep + rem + light > 0;
        const total = asleepMinutes(s);
        const wake = new Date(s.waketime);
        return {
          day: wake.toLocaleDateString(locale, { weekday: 'short' }),
          total_h: total / 60,
          deep_h: deep / 60,
          rem_h: rem / 60,
          light_h: light / 60,
          stagesKnown,
          quality: Number(s.quality ?? 0),
        };
      }),
    [sleepLogs, locale],
  );

  const stats = useMemo(() => {
    if (nights.length === 0) return null;
    const n = nights.length;
    const sum = (f: (x: (typeof nights)[number]) => number) => nights.reduce((a, x) => a + f(x), 0);
    const avgTotal = sum((d) => d.total_h) / n;
    const avgQuality = sum((d) => d.quality) / n;
    /*
      Averaged over the nights that actually have stages, not over the week.
      Counting a hand-logged night as zero deep sleep pulls the average under
      the threshold below and produces "Deep sleep thấp (<1h)" — a statement
      about somebody's sleep architecture, derived entirely from nights on
      which nobody measured their sleep architecture.
    */
    const staged = nights.filter((d) => d.stagesKnown);
    const avgDeep = staged.length ? staged.reduce((a, d) => a + d.deep_h, 0) / staged.length : null;
    const avgRem = staged.length ? staged.reduce((a, d) => a + d.rem_h, 0) / staged.length : null;
    const debt = Math.max(0, targetHours * 7 - sum((d) => d.total_h));
    return { avgTotal, avgQuality, avgDeep, avgRem, debt };
  }, [nights, targetHours]);

  const insights = useMemo(() => {
    if (!stats) return [];
    const out: string[] = [];
    if (stats.avgTotal < targetHours - 0.5) {
      out.push(
        lang === 'vi'
          ? `Bạn ngủ trung bình ${stats.avgTotal.toFixed(1)}h, thiếu ${(targetHours - stats.avgTotal).toFixed(1)}h so với mục tiêu.`
          : `You sleep ${stats.avgTotal.toFixed(1)}h on average, short by ${(targetHours - stats.avgTotal).toFixed(1)}h vs target.`,
      );
    }
    /* `null` means no night this week reported stages — so there is nothing to
       say about deep or REM, and saying it anyway is the bug this guards. */
    if (stats.avgDeep !== null && stats.avgDeep < 1) {
      out.push(
        lang === 'vi'
          ? 'Deep sleep thấp (<1h). Hãy tránh rượu và caffeine trước giờ ngủ.'
          : 'Deep sleep is low (<1h). Avoid alcohol and caffeine before bed.',
      );
    }
    if (stats.avgRem !== null && stats.avgRem < 1.2) {
      out.push(
        lang === 'vi'
          ? 'REM sleep thấp. Cố gắng đi ngủ đều giờ hơn.'
          : 'REM sleep is low. Try to keep a consistent bedtime.',
      );
    }
    if (stats.debt > 5) {
      out.push(
        lang === 'vi'
          ? `Nợ giấc ngủ tuần: ${stats.debt.toFixed(1)}h. Cân nhắc ngủ bù cuối tuần.`
          : `Weekly sleep debt: ${stats.debt.toFixed(1)}h. Consider catching up on weekends.`,
      );
    }
    if (stats.avgQuality >= 7) {
      out.push(lang === 'vi' ? 'Chất lượng giấc ngủ tốt! Giữ vững thói quen.' : 'Sleep quality is good! Keep it up.');
    }
    return out;
  }, [stats, targetHours, lang]);

  /*
    Trần của thang, và nó chừa KHOẢNG THỞ trên mốc mục tiêu.

    `Math.max(8, …)` cũ đặt trần đúng bằng đêm dài nhất, nên khi đêm ấy vừa
    chạm mục tiêu thì đường mốc bị đẩy sát mép trên và đọc ra như một cái viền
    của thẻ chứ không phải một mốc để đối chiếu. Nhân 1,15 cho mục tiêu là cách
    quen thuộc của một trục biểu đồ: luôn còn chỗ phía trên đường tham chiếu để
    mắt thấy nó là một đường NẰM TRONG khung.

    Vẫn `Math.max` với đêm dài nhất, nên một đêm 10h không bao giờ bị cắt cụt.
  */
  const maxH = Math.max(targetHours * 1.15, ...nights.map((n) => n.total_h));

  /*
    ── lớp sáng của TRANG, và nó đã chờ sẵn ở đây từ lâu ──

    `Screen` có prop `aura` dựng `PageAura` phía sau nội dung, kèm một lớp
    dập `AURA_DIM = 0.44` đã được hiệu chỉnh trên máy thật. Nó **chưa có một
    chỗ gọi nào** trong cả app — cơ chế dựng xong rồi không màn nào dùng,
    đúng hình dạng mà `?date=` của `log-meal` đã mắc.

    Đây là chỗ gọi đầu tiên. Tím → lơ, vì giấc ngủ trong app này là tím
    (`sleepRamps.deep` = `metricPurple`) và lơ là sắc lạnh kề nó.

    ── và vì sao chữ phụ dưới đây đổi sang `glassMuted` ──

    Đo cả chồng — trang → wash → lớp dập → mặt kính → chữ:

        `mutedForeground` #828282 trên kính primary phủ wash   4,37:1  ✗
        cùng chỗ, kính elevated                                3,53:1  ✗
        `glassMuted` #c8ccd4 ở đúng hai chỗ ấy          10,44 · 8,44   ✓

    Không phải một token mới: `glassMuted` đã sinh ra cho đúng tình huống này
    ở hai màn trợ lý, và chú thích của nó ghi rõ `mutedForeground` chỉ được
    đo trên "một mặt phẳng tối và ĐỨNG YÊN". Trang có wash thì không còn là
    mặt phẳng ấy nữa. `tools/glass-stack.mjs` canh cả chồng.
  */
  return (
    <Screen refreshable back title={i18n.sleepTitle} aura={['metricPurple', 'metricBlue']}>
      {/* A failed read is not an empty history. `data` comes back undefined, the
        zero branch below renders, and the screen tells somebody they have
        never recorded anything — a statement about their account, not about
        the network. The failure is answered first so the empty state stays
        true. */}
      {isError ? (
        <LoadFailed i18n={i18n} onRetry={() => void refetch()} busy={isRefetching} />
      ) : !stats ? (
        <GlassCard>
          {/* Told a new user there was no sleep data and stopped there, leaving
              them to go and find the log sheet on another tab. */}
          <EmptyState
            icon={Moon}
            title={i18n.sleepNoData}
            hint={i18n.sleepNoDataMsg}
            action={{ label: i18n.nLogSleepTitle, onPress: () => nav.push('/log-sleep') }}
          />
        </GlassCard>
      ) : (
        <>
          {/*
            ── MỘT câu trả lời, ba con số chống lưng ──

            Bản trước là bốn thẻ bằng nhau: giấc trung bình, chất lượng, deep,
            nợ ngủ — cùng cỡ, cùng mặt nền, cùng viền. Bốn câu trả lời ngang
            hàng cho một màn chỉ hỏi một câu, nên mắt phải tự chọn cái nào
            quan trọng. Quyết hộ người đọc chính là việc của thứ bậc thị giác.

            Màn này hỏi: "tuần rồi tôi ngủ đủ chưa?" Giờ ngủ trung bình là câu
            trả lời; ba con số kia là bằng chứng, và chúng lùi xuống `MetricPill`.

            `caption` là dòng đáng giá nhất và là dòng bản cũ không có: `7.2h`
            là dữ liệu, `7.2h · thiếu 0,8h so với mục tiêu` là một câu trả lời.
          */}
          <Animated.View entering={rise(0)}>
            <GlassCard>
              <HeroMetric
                eyebrow={vi ? '7 đêm gần nhất' : 'Last 7 nights'}
                value={stats.avgTotal}
                unit="h"
                caption={
                  stats.avgTotal >= targetHours
                    ? vi
                      ? `Đạt mục tiêu ${targetHours}h`
                      : `Meeting your ${targetHours}h target`
                    : vi
                      ? `Thiếu ${(targetHours - stats.avgTotal).toFixed(1)}h so với mục tiêu ${targetHours}h`
                      : `${(targetHours - stats.avgTotal).toFixed(1)}h short of your ${targetHours}h target`
                }
              />
            </GlassCard>
          </Animated.View>

          <Animated.View style={styles.pillRow} entering={rise(1)}>
            <MetricPill label={i18n.sleepAvgQuality} value={stats.avgQuality.toFixed(1)} />
            {/* Dấu gạch ngang chứ không phải "0.0h": không ai ngủ deep bằng 0,
                app chỉ là không được cho biết. */}
            <MetricPill
              label={i18n.sleepAvgDeep}
              value={stats.avgDeep === null ? '—' : `${stats.avgDeep.toFixed(1)}h`}
              tint={stats.avgDeep === null ? undefined : sleep.deep}
            />
            <MetricPill label={i18n.sleepDebt} value={`${stats.debt.toFixed(1)}h`} />
          </Animated.View>

          {/* Stage chart */}
          <Animated.View entering={rise(2)}>
          <GlassCard>
            <Text style={styles.cardTitle}>{i18n.sleepStages}</Text>
            <View style={styles.legend}>
              <LegendDot color={sleep.deep} label={i18n.sleepDeep} />
              <LegendDot color={sleep.rem} label="REM" />
              <LegendDot color={sleep.light} label="Light" />
            </View>
            <View style={styles.chart}>
              {/*
                ── mốc mục tiêu: thứ biến bảy cột thành một câu trả lời ──

                Không có nó, biểu đồ nói "bảy đêm dài thế này" và để người đọc
                tự nhớ mục tiêu của mình rồi tự so. Có nó, cùng bảy cột ấy nói
                "bốn đêm dưới mục tiêu" mà không cần đọc một con số nào — đúng
                thứ brief gọi là contextual highlight, và đúng câu mà cả màn
                này sinh ra để trả lời.

                Đặt theo cùng phép tỉ lệ mà các cột dùng (`/ maxH`), nên nó
                không thể lệch khỏi chúng: `maxH` đã kẹp sàn ở 8, và khi có một
                đêm dài hơn mục tiêu thì cả cột lẫn đường cùng co lại.

                Một nét tóc màu mực mờ, không phải một đường kẻ: nó là thứ để
                ĐỐI CHIẾU, không phải thứ để nhìn.
              */}
              <View pointerEvents="none" style={[styles.targetLine, { bottom: BAR_H * (targetHours / maxH) + LABEL_H }]}>
                <View style={styles.targetRule} />
                <Text style={styles.targetTag}>{`${targetHours}h`}</Text>
              </View>
              {nights.map((n, i) => (
                <StageBar key={i} n={n} maxH={maxH} index={i} muted={muted} />
              ))}
            </View>
          </GlassCard>
          </Animated.View>

          {/* Insights */}
          {insights.length > 0 && (
            <Animated.View entering={rise(3)}>
            <GlassCard>
              <View style={styles.cardTitleRow}>
                {/* Mực mờ, không phải vàng rực. Brief mục 11: icon đỡ thứ bậc chứ không
                    tranh chỗ với số liệu — và ở đây nó đứng cạnh một tiêu đề đã
                    đủ rõ, nên màu của nó không mang thêm nghĩa nào. */}
                <Icon icon={Lightbulb} size={15} color={muted} />
                <Text style={styles.cardTitle}>{i18n.sleepInsights}</Text>
              </View>
              <View style={styles.insightList}>
                {insights.map((text, i) => (
                  <View key={i} style={styles.insightRow}>
                    <Text style={styles.insightBullet}>•</Text>
                    <Text style={styles.insightText}>{text}</Text>
                  </View>
                ))}
              </View>
            </GlassCard>
            </Animated.View>
          )}
        </>
      )}
      {/*
        Every night, and the way to take one back.

        ── why this was the missing half ──

        The log screen could only `.insert()`, and nothing anywhere listed a
        night, so a mistyped bedtime was permanent. That matters more than it
        looks: `daily-log-service` reads the *latest* night ending on a day, so
        a bad entry logged afterwards **hides** the correct one — and the
        seven-night average behind the readiness score keeps quoting it for a
        week.

        Newest first: the night somebody wants to undo is the one they just
        entered, usually about ten seconds ago.
      */}
      {(sleepLogs ?? []).length > 0 ? (
        <View style={styles.logSection}>
          <Text style={[styles.logTitle, { color: muted }]}>{vi ? 'Các đêm đã ghi' : 'Logged nights'}</Text>
          {[...(sleepLogs ?? [])].reverse().map((s) => {
            const bed = new Date(s.bedtime);
            const wake = new Date(s.waketime);
            const mins = Math.round((wake.getTime() - bed.getTime()) / 60000);
            const t = (d: Date) => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
            return (
              <GlassCard elevation="inset" key={s.id} style={styles.logRow}>
                <View style={styles.logBody}>
                  <Text style={styles.logWhen}>
                    {wake.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                  <Text style={[styles.logVals, { color: muted }]}>
                    {`${t(bed)} → ${t(wake)} · ${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`}
                  </Text>
                </View>
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={vi ? 'Xoá đêm này' : 'Delete this night'}
                  hitSlop={8}
                  style={styles.logDelete}
                  disabled={remove.isPending}
                  onPress={() => {
                    Haptics.selectionAsync();
                    Alert.alert(
                      vi ? 'Xoá đêm này?' : 'Delete this night?',
                      vi
                        ? 'Điểm sẵn sàng của ngày đó và của hôm nay sẽ được tính lại.'
                        : "That day's readiness and today's will be recomputed.",
                      [
                        { text: vi ? 'Huỷ' : 'Cancel', style: 'cancel' },
                        {
                          text: vi ? 'Xoá' : 'Delete',
                          style: 'destructive',
                          onPress: () =>
                            remove.mutate(
                              { id: s.id, waketime: s.waketime },
                              {
                                onSuccess: () => {
                                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                  toast.success(i18n.deleted);
                                },
                                onError: (e: Error) => toast.fail(e),
                              },
                            ),
                        },
                      ],
                    );
                  }}>
                  <Icon icon={Trash2} size={16} color={muted} />
                </PressScale>
              </GlassCard>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}


/**
 * Một đêm, và nó MỌC LÊN từ mặt đất.
 *
 * ── vì sao `scaleY` chứ không phải chiều cao ──
 *
 * Cột lớn lên là chuyện của một cái thước đo đang được đọc, và Health của Apple
 * làm đúng thế. Nhưng animate `flexGrow` hay `height` ở đây sẽ phạm luật của
 * `tools/motion.mjs` — `useAnimatedStyle` chỉ được chạm `transform` và
 * `opacity` — và luật ấy có lý do: mọi thứ khác chạy trên luồng JS qua một
 * vòng bố cục mỗi khung hình.
 *
 * `scaleY` neo ở ĐÁY cho đúng hình ảnh ấy mà chỉ chạm transform. Khác với
 * `today-meals.tsx`, nơi animate chiều cao là ĐÚNG vì thứ bên dưới phải đi
 * theo từng khung hình: ở đây không có gì bên dưới để mang theo, cột chỉ cao
 * lên trong chỗ của nó.
 *
 * ── nhịp so le, và vì sao 45ms ──
 *
 * Bảy cột cùng mọc một lúc đọc ra là một khối nhảy lên; so le thì mắt đi từ
 * trái sang phải và đọc ra là một tuần đang được kể lại. 45 × 6 = 270ms cho cột
 * cuối — dưới `duration.swap` (320), nên cả hàng xong trước khi người ta kịp
 * thấy nó chậm. Apple gọi đây là "quick, precise": đủ để thấy, không đủ để chờ.
 *
 * Lò xo `smooth` (bounce 0) vì một cái thước đo không nhún: nó dừng ở con số
 * nó đo được. `withSpring` của Reanimated tôn trọng Giảm chuyển động sẵn.
 */
function StageBar({
  n,
  maxH,
  index,
  muted,
}: {
  n: { day: string; total_h: number; deep_h: number; rem_h: number; light_h: number; stagesKnown: boolean };
  maxH: number;
  index: number;
  muted: string;
}) {
  const c = usePalette();
  const sleep = useSleepRamp();
  const styles = stylesFor(c);
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withDelay(index * 45, withSpring(1, spring(0.42, BOUNCE.smooth)));
  }, [grow, index]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: grow.value }] }));

  return (
    <View style={styles.barCol}>
      <View style={styles.barTrack}>
        <View style={{ flexGrow: Math.max(0, maxH - n.total_h) }} />
        {/* Hộp mọc: neo đáy, nên cột dâng lên chứ không phình ra hai đầu. */}
        <Animated.View style={[styles.barGrow, { flexGrow: n.total_h }, style]}>
          {n.stagesKnown ? (
            <>
              <View style={[styles.barSeg, { flexGrow: n.light_h, backgroundColor: sleep.light }]} />
              <View style={[styles.barSeg, { flexGrow: n.rem_h, backgroundColor: sleep.rem }]} />
              <View style={[styles.barSeg, { flexGrow: n.deep_h, backgroundColor: sleep.deep }]} />
            </>
          ) : (
            /* The night's length is known and its breakdown is not.
               One plain bar says both of those; three segments summing
               to zero would draw nothing at all and read as a night
               that never happened. */
            <View style={[styles.barSeg, styles.barUnknown, { flexGrow: 1 }]} />
          )}
        </Animated.View>
      </View>
      <Text style={[styles.barLabel, { color: muted }]}>{n.day}</Text>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const c = usePalette();
  const muted = useMuted();
  const styles = stylesFor(c);
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color: muted }]}>{label}</Text>
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  cardTitle: { ...type.headline, color: c.foreground },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  empty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs },
  emptyTitle: { ...type.body, color: c.foreground, fontWeight: '600' },
  emptyMsg: { ...type.footnote, color: c.mutedForeground, textAlign: 'center' },
  pillRow: { flexDirection: 'row', gap: spacing.sm },
  legend: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  /* Tròn, 8: một ô vuông 9 điểm đọc ra là một mẫu tô, một chấm tròn đọc ra là
     một nhãn. Chú giải là nhãn. */
  legendDot: { width: 8, height: 8, borderRadius: radius.full },
  legendText: { ...type.caption, color: c.mutedForeground },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: 160, marginTop: spacing.md },
  barCol: { flex: 1, alignItems: 'center', gap: 6 },
  /*
    ── cái rãnh, không phải một cái hộp đen ──

    Nền cũ là `c.background` (#070708), TỐI HƠN mặt thẻ nó nằm trên (#0e0e11),
    nên phần chưa lấp đọc ra là một lỗ thủng chứ không phải phần còn trống của
    một thanh đo. Trên giấy cũng cùng lỗi ấy, lộn ngược.

    `m.inset.track` là token của đúng vai này — rãnh chưa chạy của mọi vòng và
    thanh tiến trình trong app — nên thanh ngủ thôi tự phát minh một nền riêng.

    Bo TRÒN HẲN và `maxWidth` 28: bảy đêm thì mỗi cột rộng ~46 và thanh 70% ra
    vừa đẹp, nhưng MỘT đêm thì cột là cả bề ngang thẻ và thanh phình thành một
    khối màu 258 điểm. Brief gọi đúng thứ đó — "không dùng màu quá bão hoà" là
    chuyện DIỆN TÍCH nhiều hơn chuyện sắc.
  */
  barTrack: {
    width: '70%',
    maxWidth: 28,
    height: BAR_H,
    flexDirection: 'column',
    backgroundColor: m.inset.track,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  /* Neither of the three stage colours — it is not a stage, it is the absence
     of a breakdown, and giving it one of their colours would name it wrongly. */
  barUnknown: { backgroundColor: alpha(m.ink, 0.14) },
  barSeg: { width: '100%', flexBasis: 0 },
  /* `transformOrigin` ở đáy là thứ biến một cú phóng to thành một cú MỌC LÊN. */
  barGrow: { width: '100%', flexBasis: 0, flexDirection: 'column', transformOrigin: 'bottom' },
  barLabel: { ...type.caption, color: c.mutedForeground },
  targetLine: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  targetRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: alpha(m.ink, 0.22) },
  targetTag: { ...type.caption, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  insightList: { marginTop: spacing.sm, gap: spacing.sm },
  insightRow: { flexDirection: 'row', gap: spacing.sm },
  insightBullet: { ...type.body, color: c.primary },
  insightText: { ...type.footnote, color: c.foreground, flex: 1, lineHeight: 19 },
  logSection: { gap: spacing.sm, marginTop: spacing.md },
  logTitle: {
    ...type.caption,
    color: c.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logBody: { flex: 1, gap: 2 },
  logWhen: { ...type.footnote, color: c.foreground },
  logVals: { ...type.caption, color: c.mutedForeground },
  logDelete: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
}));
