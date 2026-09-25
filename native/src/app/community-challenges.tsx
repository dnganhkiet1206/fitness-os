import { Check, ChevronRight, Trophy } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { EmptyState } from '@/components/ascnd/empty-state';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { Screen } from '@/components/ascnd/screen';
import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { type ChallengeHistoryItem, type CommunityChallenge, useChallengeHistory, useChallenges } from '@/hooks/use-community';
import { usePalette } from '@/hooks/use-palette';
import { getLocale } from '@/lib/i18n';
import { claimLine, pendingClaims } from '@/lib/challenge-reminders';
import { dayGap, localDateStr } from '@/lib/local-date';
import { nav } from '@/lib/nav';

/**
 * Mọi thử thách, và những cái mình đã hoàn thành — issue #41.
 *
 * Thẻ ở đầu Khám phá cố ý chỉ hiện MỘT thử thách. Trước màn này, thử thách thứ
 * hai trở đi không có chỗ nào để thấy, và thử thách đã hoàn thành biến mất
 * sau 7 ngày: người dùng không có một chỗ để xem mình đã làm được gì.
 *
 * ── bốn nhóm, theo câu hỏi người ta mang tới ──
 *
 *   Đang tham gia    "mình còn bao xa" — tiến độ trước, cái đã đạt mà chưa
 *                    nhận đứng đầu (đó là việc duy nhất ở đây cần bấm)
 *   Đang mở          "có gì để vào" — đông người trước, như thẻ ở Khám phá
 *   Sắp bắt đầu      "sắp có gì" — gần ngày mở trước
 *   Đã hoàn thành    "mình đã làm được gì" — từ `community_challenge_history`,
 *                    với số xu ĐÃ VÀO SỔ, mới nhất trước
 *
 * Nhóm rỗng thì không có tiêu đề: một tiêu đề trên khoảng trống là một lời
 * hứa không giữ. Thử thách đã hết hạn mà mình không tham gia thì không hiện —
 * không còn gì để làm với nó.
 *
 * Mỗi dòng mở màn chi tiết; nút Tham gia / Nhận thưởng ở đó, không ở đây —
 * một danh sách để ĐỌC, không phải một hàng nút.
 */
export default function CommunityChallengesScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const locale = getLocale(lang);
  const list = useChallenges();
  const history = useChallengeHistory();

  const today = localDateStr();
  const all = list.data ?? [];
  const reached = (x: CommunityChallenge) => x.progress >= x.target;
  const joined = all
    .filter((x) => x.joined && !x.claimed)
    .sort((a, b) => Number(reached(b)) - Number(reached(a)) || (a.ends_on < b.ends_on ? -1 : 1));
  const open = all
    .filter((x) => !x.joined && dayGap(today, x.starts_on) <= 0 && dayGap(today, x.ends_on) >= 0)
    .sort((a, b) => b.participants - a.participants);
  const soon = all
    .filter((x) => !x.joined && dayGap(today, x.starts_on) > 0)
    .sort((a, b) => (a.starts_on < b.starts_on ? -1 : 1));
  const done = history.data ?? [];
  /* Đã đạt, đã hết hạn, chưa nhận: dòng nói luôn hạn chót, cùng câu với lời
     nhắc trong hộp thư (#60). */
  const due = new Map(pendingClaims(all, today).map((x) => [x.id, x]));

  const failed = list.isError || history.isError;
  const loading = list.isPending || history.isPending;
  const empty = !joined.length && !open.length && !soon.length && !done.length;

  /* `from: 'all'`: màn chi tiết thôi mời quay lại trang này — nút Quay lại đã
     làm việc ấy, và một link đẩy thêm MỘT trang nữa lên ngăn xếp. */
  const openDetail = (id: string) => nav.push({ pathname: '/community-challenge', params: { id, from: 'all' } });
  const people = (n: number) => i18n.nChPeople.replace('{n}', n.toLocaleString(locale));

  return (
    <Screen back refreshable title={i18n.nClTitle}>
      {failed ? (
        <LoadFailed
          i18n={i18n}
          onRetry={() => {
            list.refetch();
            history.refetch();
          }}
        />
      ) : loading ? (
        <ActivityIndicator color={c.mutedForeground} style={styles.loading} />
      ) : empty ? (
        <GlassCard>
          <EmptyState icon={Trophy} title={i18n.nClNone} hint={i18n.nClNoneHint} />
        </GlassCard>
      ) : (
        <>
          {joined.length ? (
            <Section title={i18n.nClJoined}>
              {joined.map((x, i) => {
                const ended = dayGap(today, x.ends_on) < 0;
                const ok = reached(x);
                const days = i18n.nChDays.replace('{a}', String(Math.min(x.progress, x.target))).replace('{b}', String(x.target));
                return (
                  <Row
                    key={x.id}
                    first={i === 0}
                    title={x.title}
                    meta={
                      due.has(x.id)
                        ? claimLine(due.get(x.id)!, i18n)
                        : ok
                          ? i18n.nClReady
                          : `${days} · ${ended ? i18n.nChEnded : i18n.nChEndsIn.replace('{n}', String(dayGap(today, x.ends_on)))}`
                    }
                    lead={ok ? 'reached' : undefined}
                    pct={ok ? undefined : Math.min(100, (x.progress / x.target) * 100)}
                    onPress={() => openDetail(x.id)}
                  />
                );
              })}
            </Section>
          ) : null}

          {open.length ? (
            <Section title={i18n.nClOpen}>
              {open.map((x, i) => (
                <Row
                  key={x.id}
                  first={i === 0}
                  title={x.title}
                  meta={`${people(x.participants)} · ${i18n.nChEndsIn.replace('{n}', String(dayGap(today, x.ends_on)))}`}
                  onPress={() => openDetail(x.id)}
                />
              ))}
            </Section>
          ) : null}

          {soon.length ? (
            <Section title={i18n.nClSoon}>
              {soon.map((x, i) => (
                <Row
                  key={x.id}
                  first={i === 0}
                  title={x.title}
                  meta={i18n.nChStartsIn.replace('{n}', String(dayGap(today, x.starts_on)))}
                  onPress={() => openDetail(x.id)}
                />
              ))}
            </Section>
          ) : null}

          {done.length ? (
            <Section title={i18n.nClDone} count={done.length}>
              {done.map((x, i) => (
                <Row
                  key={x.id}
                  first={i === 0}
                  title={x.title}
                  meta={doneMeta(x, i18n, locale)}
                  lead="claimed"
                  onPress={() => openDetail(x.id)}
                />
              ))}
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/* "Hoàn thành 12 thg 8 · +150 xu". Năm chỉ hiện khi khác năm nay — một lịch
   sử dài vài tháng không cần nhắc năm ở mỗi dòng, một lịch sử qua năm thì cần. */
function doneMeta(x: ChallengeHistoryItem, i18n: ReturnType<typeof useI18n>, locale: string) {
  const at = new Date(x.claimed_at);
  const sameYear = at.getFullYear() === new Date().getFullYear();
  const day = at.toLocaleDateString(locale, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  const when = i18n.nClClaimedOn.replace('{d}', day);
  return x.coins > 0 ? `${when} · ${i18n.nChGot.replace('{n}', String(x.coins))}` : when;
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <View style={styles.section}>
      <View style={styles.headRow}>
        <Text style={styles.heading} accessibilityRole="header">
          {title}
        </Text>
        {count ? <Text style={styles.count}>{count}</Text> : null}
      </View>
      <GlassCard style={styles.list}>{children}</GlassCard>
    </View>
  );
}

function Row({
  title,
  meta,
  first,
  lead,
  pct,
  onPress,
}: {
  title: string;
  meta: string;
  first: boolean;
  /** dấu ở đầu dòng: đã đạt (chờ nhận) hay đã nhận */
  lead?: 'reached' | 'claimed';
  pct?: number;
  onPress: () => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${meta}`}
      onPress={onPress}
      style={[styles.row, !first && styles.rowRule]}>
      {lead ? (
        <View style={styles.lead}>
          <Icon icon={lead === 'reached' ? Trophy : Check} size={16} color={lead === 'reached' ? c.readinessYellow : c.readinessGreen} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.meta}>{meta}</Text>
        {pct != null ? <ProgressBar pct={pct} color={c.foreground} height={4} style={styles.bar} /> : null}
      </View>
      <Icon icon={ChevronRight} size={18} color={c.mutedForeground} />
    </PressScale>
  );
}

const stylesFor = makeStyles((c) => ({
  loading: { marginTop: spacing.xl },
  /* Khoảng trên tiêu đề nhóm lớn hơn khoảng dưới: tiêu đề thuộc về danh sách
     bên dưới nó, không lơ lửng giữa hai nhóm. */
  section: { gap: spacing.sm, marginTop: spacing.xs },
  headRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, paddingHorizontal: spacing.xs },
  heading: { ...type.headline, color: c.foreground },
  count: { ...type.footnote, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  list: { paddingVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 2, minHeight: 60 },
  rowRule: { borderTopWidth: 1, borderTopColor: c.border },
  lead: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: c.secondary },
  text: { flex: 1, minWidth: 0, gap: 3 },
  title: { ...type.body, color: c.foreground, fontWeight: '600' },
  meta: { ...type.footnote, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  bar: { marginTop: 4 },
}));
