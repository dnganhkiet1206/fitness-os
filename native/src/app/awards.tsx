import * as Haptics from 'expo-haptics';
import { Medal as MedalIcon, Share2, Sparkles, Trophy } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

import { PressScale } from '@/components/ascnd/press-scale';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { Icon } from '@/components/ascnd/icon';
import { ICON_MAP, Medal, TIER_CONFIG } from '@/components/ascnd/medal';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { press } from '@/constants/motion';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { AWARD_DEFINITIONS, useAwardProgress, useAwards, useCheckAwards } from '@/hooks/use-extras';
import type { AwardSources } from '@/lib/award-grant';
import { awardText } from '@/lib/gamification-i18n';
import type { AppLang } from '@/lib/i18n';

/**
 * Nhóm theo MIỀN, không theo hạng.
 *
 * ── vì sao đổi ──
 *
 * Bản cũ gom theo hạng, nên năm huy chương chuỗi ngày (30/60/100/180/365) nằm
 * rải trong mục "PLATINUM" cạnh "hoàn thành 100 buổi tập" — bốn cái thang khác
 * nhau trộn vào nhau, và không cái nào đọc ra là một cái thang. Người muốn biết
 * "chuỗi ngày của tôi tới đâu rồi" phải tự quét cả bốn mục.
 *
 * Và chữ "PLATINUM" hiện bảy lần trên một màn: một lần ở tiêu đề mục, một lần
 * trên mỗi thẻ. Hạng vẫn còn trên thẻ — ở đó nó nói điều gì đó — nhưng thôi làm
 * cách chia.
 *
 * Thứ tự: thang dài nhất trước, vì đó là thứ người ta theo lâu nhất.
 */
const DOMAINS: { types: string[]; vi: string; en: string }[] = [
  { types: ['streak'], vi: 'Chuỗi ngày', en: 'Streaks' },
  /*
    `first_workout` gộp vào Buổi tập, không đứng riêng.

    Nó là `type` riêng ở tầng dữ liệu vì luật trao khác nhau — một cái xét
    `>= 1`, ba cái kia xét ngưỡng — nhưng với người đọc thì cả bốn đều trả lời
    cùng một câu: "tôi đã tập bao nhiêu buổi". Cho nó một mục riêng nghĩa là
    một tiêu đề, một đường kẻ, một bộ đếm "0/1" rồi đúng MỘT thẻ; khung nhiều
    hơn nội dung.

    Vì thế nhóm ở đây nhận một DANH SÁCH type chứ không phải một type. Cách
    chia của màn hình thôi phải trùng khít với cách chia của bảng dữ liệu —
    hai thứ ấy trả lời hai câu hỏi khác nhau.
  */
  { types: ['first_workout', 'volume_milestone'], vi: 'Buổi tập', en: 'Workouts' },
  { types: ['pr'], vi: 'Kỷ lục cá nhân', en: 'Personal records' },
  { types: ['steps_goal'], vi: 'Bước chân', en: 'Steps' },
  { types: ['nutrition'], vi: 'Dinh dưỡng', en: 'Nutrition' },
  { types: ['water'], vi: 'Nước uống', en: 'Water' },
  { types: ['sleep'], vi: 'Giấc ngủ', en: 'Sleep' },
  { types: ['body'], vi: 'Cân nặng', en: 'Body' },
];

/**
 * Con số hiện tại cho mỗi miền, để thẻ chưa mở nói được "12 / 30".
 *
 * Tra tìm được ghi lại: huy chương chưa mở mà không nói bạn đang ở đâu thì nó
 * chỉ là một ô xám. "Log 30 days in a row" đúng ở mọi ngày kể từ ngày đầu, nên
 * nó không nói gì; "12 / 30" thì nói.
 */
function currentFor(type: string, src: AwardSources | undefined): number | null {
  if (!src) return null;
  switch (type) {
    case 'streak': return src.streak;
    case 'volume_milestone':
    case 'first_workout': return src.workoutCount;
    case 'pr': return src.prCount;
    case 'steps_goal': return src.steps;
    case 'nutrition': return src.mealCount;
    case 'water': return src.waterDays;
    case 'sleep': return src.sleepCount;
    case 'body': return src.weighCount;
    default: return null;
  }
}

type AwardDef = (typeof AWARD_DEFINITIONS)[number];
interface EarnedAward {
  id: string;
  award_key: string | null;
  earned_at: string;
}

function MedalCard({
  award,
  earned,
  locale,
  lang,
  index,
  current,
}: {
  award: AwardDef;
  earned: EarnedAward | undefined;
  locale: string;
  lang: AppLang;
  index: number;
  /** con số hiện tại của miền này, hoặc `null` khi chưa đọc được */
  current: number | null;
}) {
  const i18n = useI18n();
  const tier = TIER_CONFIG[award.tier] ?? TIER_CONFIG.bronze;
  const AwardIcon = ICON_MAP[award.icon] ?? Trophy;
  const isEarned = !!earned;
  const { title, desc } = awardText(award.key, lang);
  /*
    Phần đã đi được, chỉ khi biết CẢ HAI đầu.

    `need` vắng mặt ở những huy chương không có ngưỡng (`first_workout`,
    `first_pr`) — chúng chỉ có hai trạng thái, nên không có gì để vẽ dở.
    `current` là `null` khi truy vấn hỏng, và một truy vấn hỏng KHÔNG được vẽ
    thành 0% — đó là cùng bất biến mà `usable()` giữ ở phía trao huy chương.
  */
  const need = 'requirement' in award ? award.requirement : null;
  const pct =
    isEarned || need == null || current == null ? 0 : Math.max(0, Math.min(1, current / need));
  const showCount = !isEarned && need != null && current != null;

  const share = async () => {
    Haptics.selectionAsync();
    try {
      await Share.share({
        message: `🏅 ${title} — ${desc}! #ASCND`,
      });
    } catch {
      // user cancelled
    }
  };

  return (
    <Animated.View
      style={styles.medalCard}
      entering={FadeInDown.springify().damping(26).stiffness(180).delay(Math.min(index, 12) * 45)}>
      <Medal
        type={award.type}
        tier={award.tier}
        icon={award.icon}
        requirement={need}
        earned={isEarned}
        size={72}
      />

      <Text style={[styles.medalTitle, !isEarned && styles.medalTitleLocked]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.medalDesc} numberOfLines={2}>
        {desc}
      </Text>

      {/*
        Tiến độ là một THANH NGANG dưới cùng, không phải vòng cung quanh đĩa.

        Vòng cung đọc sai ở hai điểm. Nó bám sát mép kim loại nên ở mức thấp —
        1/60, 1/100 — nó chỉ là một vạch ngắn ở đỉnh, trông như một khiếm
        khuyết của hình chứ không như tiến độ. Và nó cạnh tranh với chính cái
        vành: hai đường tròn đồng tâm cách nhau một điểm ảnh.

        Thanh ngang thì có điểm đầu và điểm cuối nhìn thấy được, nên 1/100 đọc
        ra là "mới bắt đầu" chứ không phải "hình bị sứt".
      */}
      {showCount ? (
        <View style={styles.barWrap}>
          {/*
            `<ProgressBar>`, không phải một bản chép thứ bảy.

            Bản đầu dựng track + fill tại chỗ và cho fill một `width` phần trăm.
            Hai thứ hỏng cùng lúc: một `width` phần trăm KHÔNG chạy hoạt hoạ nên
            thanh nhảy cóc mỗi lần con số đổi, và nếu có cho nó chạy thì đó là
            một thuộc tính bố cục — layout phải tính lại mỗi khung hình.
            `progress-bar.tsx` đã đo và giải quyết đúng hai chuyện đó một lần
            cho cả app; `tools/progress-bar.mjs` tồn tại vì đây là bản chép thứ
            bảy chứ không phải thứ nhất.

            Sàn 2% được GIỮ, và nó chuyển sang chỗ gọi vì nó là một quyết định
            về màn hình này: một thanh có điểm đầu và điểm cuối nhìn thấy được
            thì 1/100 phải đọc ra là "mới bắt đầu", không phải "hình bị sứt".
          */}
          <ProgressBar
            pct={Math.max(0.02, pct)}
            color={tier.color}
            height={4}
            trackColor="rgba(255,255,255,0.08)"
          />
          <Text style={styles.medalProgress}>
            {current!.toLocaleString(locale)} / {need!.toLocaleString(locale)}
          </Text>
        </View>
      ) : null}

      {earned && (
        <View style={styles.earnedRow}>
          <Text style={styles.earnedDate}>
            {new Date(earned.earned_at).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </Text>
          <PressScale to={press.deep} accessibilityRole="button" accessibilityLabel={i18n.a11yShare} hitSlop={8} onPress={share}>
            <Icon icon={Share2} size={14} color={colors.mutedForeground} />
          </PressScale>
        </View>
      )}
    </Animated.View>
  );
}

export default function AwardsScreen() {
  const { data: awards } = useAwards();
  const { data: sources } = useAwardProgress();
  const { checkAndGrant, ready } = useCheckAwards();
  const checkedRef = useRef(false);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';

  // Web Awards runs the grant check on open too
  useEffect(() => {
    if (ready && !checkedRef.current) {
      checkedRef.current = true;
      checkAndGrant();
    }
  }, [ready, checkAndGrant]);

  const earnedMap = new Map((awards ?? []).map((a) => [a.award_key, a]));
  const earnedCount = earnedMap.size;
  const totalCount = AWARD_DEFINITIONS.length;
  const pct = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;
  const R = 32;
  const C = 2 * Math.PI * R;

  return (
    <Screen refreshable back title={i18n.awardsTitle}>
      {/* Hero: medal tile + progress ring (web) */}
      <View style={styles.hero}>
        <View style={styles.heroTile}>
          <Icon icon={MedalIcon} size={30} color="#ffd93d" />
        </View>
        <Text style={styles.heroCount}>
          {i18n.awardsEarned} <Text style={styles.heroCountNum}>{earnedCount}</Text> / {totalCount}{' '}
          {i18n.awardsOf}
        </Text>
        <View style={styles.progressWrap}>
          <Svg width={80} height={80} viewBox="0 0 80 80">
            <Defs>
              <SvgGradient id="awards-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#ffd93d" />
                <Stop offset="100%" stopColor="#ff9130" />
              </SvgGradient>
            </Defs>
            <Circle cx={40} cy={40} r={R} fill="none" stroke="#17171c" strokeWidth={4} />
            <Circle
              cx={40}
              cy={40}
              r={R}
              fill="none"
              stroke="url(#awards-grad)"
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={`${C}`}
              strokeDashoffset={C * (1 - pct / 100)}
              transform="rotate(-90 40 40)"
            />
          </Svg>
          <View style={styles.progressCenter}>
            <Text style={styles.progressPct}>{pct}%</Text>
          </View>
        </View>
      </View>

      {DOMAINS.map((dom) => {
        const list = AWARD_DEFINITIONS.filter((a) => dom.types.includes(a.type));
        if (list.length === 0) return null;
        const done = list.filter((a) => earnedMap.has(a.key)).length;
        /* Mọi type trong một nhóm đọc cùng một nguồn — `first_workout` và
           `volume_milestone` đều là `workoutCount` — nên lấy type đầu là đủ. */
        const now = currentFor(dom.types[0], sources);
        return (
          <View key={dom.types[0]} style={styles.tierSection}>
            <View style={styles.tierHeader}>
              {/* Icon của chính miền, không phải Sparkles cho mọi mục — bản cũ
                  vẽ cùng một ngôi sao trên cả bốn tiêu đề, nên nó không phân
                  biệt được gì và chỉ là trang trí. */}
              <Icon icon={ICON_MAP[list[0].icon] ?? Trophy} size={14} color={colors.mutedForeground} />
              <Text style={styles.tierTitle}>{lang === 'vi' ? dom.vi : dom.en}</Text>
              <View style={styles.tierLine} />
              <Text style={styles.tierCount}>
                {done}/{list.length}
              </Text>
            </View>
            <View style={styles.grid}>
              {list.map((award, i) => (
                <MedalCard
                  key={award.key}
                  award={award}
                  earned={earnedMap.get(award.key)}
                  locale={locale}
                  lang={lang}
                  index={i}
                  current={now}
                />
              ))}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm },
  heroTile: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,217,61,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,217,61,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ffd93d',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  heroCount: { ...type.footnote, color: colors.mutedForeground },
  heroCountNum: { ...type.mono, fontWeight: '700', color: colors.foreground },
  progressWrap: { width: 80, height: 80 },
  progressCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressPct: { ...type.mono, fontSize: 17, fontWeight: '700', color: '#ffd93d' },

  tierSection: { gap: spacing.sm + 4 },
  tierHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  /*
    `color` PHẢI có ở đây.

    Trước đây màu đến từ inline `{ color: tc.color }` — màu của hạng. Khi đổi
    sang nhóm theo miền tôi bỏ dòng inline ấy và không cấp màu thay thế, nên
    chữ rơi về màu mặc định của hệ thống: đen trên nền đen. Tiêu đề mục biến
    mất hoàn toàn.

    `tsc` không thấy được: thiếu `color` là style hợp lệ. Guard cũng không —
    không luật nào nói "mỗi Text phải có màu". Chỉ mắt người bắt được, và đó
    là lần thứ hai trong phiên này một thay đổi qua hết mọi cửa tự động rồi
    hỏng trên màn hình.
  */
  tierTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: colors.foreground,
  },
  tierLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(43,43,49,0.4)' },
  tierCount: { ...type.mono, fontSize: 11, color: colors.mutedForeground },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 4 },
  medalCard: {
    width: '47.5%',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.5)',
    backgroundColor: 'rgba(14,14,17,0.6)',
  },
  /* Số đứng riêng một dòng, chữ số đều bề rộng để cột không nhảy khi con số
     đổi từ 9 sang 10. */
  barWrap: { width: '100%', alignItems: 'center', gap: 4, marginTop: 2 },
  /* `width` là phần trăm nên nó co theo thẻ; `minWidth` 2% để mức 1/365 vẫn
     hiện ra một đầu mút thay vì biến mất hoàn toàn. */
  medalProgress: {
    ...type.footnote,
    fontWeight: '700',
    color: colors.mutedForeground,
    fontVariant: ['tabular-nums'],
  },
  medalTitle: { fontSize: 13, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  /*
    `mutedForeground`, không phải xám 50% alpha.

    Bản cũ để `rgba(140,140,150,0.5)` — trên nền thẻ tối thì tên huy chương tụt
    dưới ngưỡng đọc được, và đó là trạng thái của MỌI huy chương ở ngày đầu.
    Mờ để nói "chưa mở" là đúng; mờ tới mức phải nheo mắt thì cả màn không dùng
    được đúng lúc nó cần thuyết phục người ta nhất. Kim loại xám đã nói "chưa
    mở" rồi — chữ không cần nói lại bằng cách tự xoá mình.
  */
  medalTitleLocked: { color: colors.mutedForeground },
  medalDesc: { fontSize: 11, color: colors.mutedForeground, textAlign: 'center', lineHeight: 14 },
  earnedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  earnedDate: { ...type.mono, fontSize: 11, color: colors.mutedForeground },
});
