import { Check, ChevronRight, Trophy, Users } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { type CommunityChallenge, useClaimChallenge, useJoinChallenge } from '@/hooks/use-community';
import { usePalette } from '@/hooks/use-palette';
import { getLocale } from '@/lib/i18n';
import { dayGap, localDateStr } from '@/lib/local-date';
import { nav } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { fillCopy } from '@/lib/copy-fill';

/**
 * Thử thách nổi bật ở đầu Khám phá — mockup màn 1.
 *
 * ── một thẻ, và thẻ nào ──
 *
 * Thử thách đang theo và CHƯA nhận thưởng đứng trước (thứ người ta quay lại
 * để xem), rồi tới thử thách đông người nhất. Một thẻ chứ không một dải
 * cuộn: concept mục 2 dặn "không biến màn hình thành một danh sách quá nhiều
 * category", và thử thách thứ hai nằm ở màn chi tiết.
 *
 * ── không eyebrow ──
 *
 * Mockup đặt chữ "Thử thách" nhỏ TRÊN tiêu đề. Skill impeccable cấm đúng hình
 * dạng đó, không ngoại lệ ("the heading carries its own weight"). Nên nó là
 * một chip có cúp nằm CẠNH con số người tham gia — vẫn nói "đây là thử thách"
 * mà tiêu đề đứng một mình.
 *
 * ── một hành động, đổi theo trạng thái ──
 *
 *   chưa tham gia     Tham gia
 *   đang theo         thanh tiến độ "24 / 30 ngày", không nút (việc cần làm
 *                     là TẬP, không phải bấm)
 *   đã đạt            Nhận 200 xu
 *   đã nhận           dấu tích, "Đã nhận thưởng"
 *
 * Số người tham gia là một phép đếm thật ở server; danh sách thì không lộ ra.
 */
/** Thử thách của thẻ: cái đang theo mà chưa nhận, rồi cái đông người nhất.
    Dùng chung với Khám phá, nơi cần biết thẻ có hiện hay không (#41). */
export function featuredChallenge(items: CommunityChallenge[]): CommunityChallenge | undefined {
  const open = items.filter((x) => dayGap(localDateStr(), x.ends_on) >= 0);
  return open.find((x) => x.joined && !x.claimed) ?? [...open].sort((a, b) => b.participants - a.participants)[0];
}

export function ChallengeHero({ items }: { items: CommunityChallenge[] }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const join = useJoinChallenge();
  const claim = useClaimChallenge();

  const ch = featuredChallenge(items);
  if (!ch) return null;

  const done = ch.joined && ch.progress >= ch.target;
  const left = dayGap(localDateStr(), ch.ends_on);
  const startsIn = dayGap(localDateStr(), ch.starts_on);
  const pct = Math.min(100, (ch.progress / ch.target) * 100);
  const people = ch.participants.toLocaleString(getLocale(lang));

  const openDetail = () => nav.push({ pathname: '/community-challenge', params: { id: ch.id } });

  return (
    <View style={styles.wrap}>
      <PressScale accessible={false} onPress={openDetail}>
        <GlassCard elevation="primary" style={styles.card}>
          <Text style={styles.title}>{ch.title}</Text>
          <View style={styles.metaRow}>
            <View style={styles.badge}>
              <Icon icon={Trophy} size={13} color={c.readinessYellow} />
              <Text style={styles.badgeText}>{i18n.nChBadge}</Text>
            </View>
            <Icon icon={Users} size={14} color={c.mutedForeground} />
            <Text style={styles.meta}>{i18n.nChPeople.replace('{n}', people)}</Text>
          </View>

          {/* "24 / 30 ngày" và "Còn 23 ngày" đứng CÙNG một hàng dưới thanh: cả hai
              trả lời "còn bao xa". Bản đầu để thời hạn ở hàng trên, và ở bề ngang
              402 nó gãy dòng thành "· Còn 23 ngày" mở đầu bằng một dấu chấm. */}
          <View style={styles.progress}>
            {ch.joined ? <ProgressBar pct={pct} color={done ? c.readinessGreen : c.foreground} height={6} /> : null}
            <View style={styles.progressRow}>
              {ch.joined ? (
                <Text style={styles.days}>
                  {fillCopy(i18n.nChDays, { a: String(Math.min(ch.progress, ch.target)), b: String(ch.target) })}
                </Text>
              ) : null}
              <Text style={styles.meta}>
                {startsIn > 0
                  ? fillCopy(i18n.nChStartsIn, { n: String(startsIn) })
                  : fillCopy(i18n.nChEndsIn, { n: String(left) })}
              </Text>
            </View>
          </View>

          {!ch.joined ? (
            <PressScale
              accessibilityRole="button"
              disabled={join.isPending}
              onPress={() => join.mutate({ id: ch.id, on: true }, { onError: (e: Error) => toast.fail(e) })}
              style={styles.solidBtn}>
              <Text style={styles.solidText}>{i18n.nChJoin}</Text>
            </PressScale>
          ) : ch.claimed ? (
            <View style={styles.doneRow}>
              <Icon icon={Check} size={16} color={c.readinessGreen} />
              <Text style={styles.doneText}>{i18n.nChClaimed}</Text>
            </View>
          ) : done ? (
            <PressScale
              accessibilityRole="button"
              disabled={claim.isPending}
              onPress={() =>
                claim.mutate(ch.id, {
                  onSuccess: (n) => {
                    toast.success(n > 0 ? `${i18n.nChDone} ${fillCopy(i18n.nChGot, { n: String(n) })}` : i18n.nChDone);
                    openDetail();
                  },
                  onError: (e: Error) => toast.fail(e),
                })
              }
              style={styles.solidBtn}>
              <Text style={styles.solidText}>{fillCopy(i18n.nChClaim, { n: String(ch.reward_coins) })}</Text>
            </PressScale>
          ) : null}
        </GlassCard>
      </PressScale>
      <SeeAllChallenges />
    </View>
  );
}

/**
 * Lối vào `/community-challenges` (#41) — NGOÀI thẻ, không trong nó: cả thẻ đã
 * là một vùng bấm mở chi tiết, và một nút lồng trong vùng bấm là hai đích cho
 * một ngón tay. Căn phải, chữ nhỏ: nó là đường đi tiếp, không phải việc chính.
 */
export function SeeAllChallenges() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  return (
    <PressScale
      accessibilityRole="link"
      hitSlop={8}
      onPress={() => nav.push('/community-challenges')}
      style={styles.seeAll}>
      <Text style={styles.seeAllText}>{i18n.nClSeeAll}</Text>
      <Icon icon={ChevronRight} size={16} color={c.mutedForeground} />
    </PressScale>
  );
}

const stylesFor = makeStyles((c, m) => ({
  wrap: { gap: spacing.xs },
  card: { gap: spacing.md },
  /* 36 + hitSlop 8 = 52 ≥ 44. */
  seeAll: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 2, height: 36, paddingLeft: spacing.sm },
  seeAllText: { ...type.footnote, color: c.foreground, fontWeight: '600' },
  title: { ...type.title, color: c.foreground },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: -spacing.xs },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
    marginRight: 4,
  },
  badgeText: { ...type.caption, color: c.foreground, fontWeight: '600' },
  meta: { ...type.footnote, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  progress: { gap: 6 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  days: { ...type.footnote, color: c.foreground, fontVariant: ['tabular-nums'] },
  solidBtn: { height: 44, borderRadius: radius.full, backgroundColor: m.actionSurface, alignItems: 'center', justifyContent: 'center' },
  solidText: { ...type.headline, color: c.primaryForeground },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  doneText: { ...type.footnote, color: c.foreground, fontWeight: '600' },
}));
