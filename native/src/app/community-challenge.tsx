import { useLocalSearchParams } from 'expo-router';
import { Check, Trophy } from 'lucide-react-native';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

import { SeeAllChallenges } from '@/components/ascnd/challenge-hero';
import { EmptyState } from '@/components/ascnd/empty-state';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { MascotFigure } from '@/components/ascnd/mascot-figure';
import { PressScale } from '@/components/ascnd/press-scale';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { Screen } from '@/components/ascnd/screen';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { type CommunityChallenge, useChallengeHistory, useChallenges, useClaimChallenge, useJoinChallenge } from '@/hooks/use-community';
import { useMascot } from '@/hooks/use-mascot';
import { usePalette } from '@/hooks/use-palette';
import { getLocale } from '@/lib/i18n';
import { dayGap, localDateStr, parseLocalDate } from '@/lib/local-date';
import { toast } from '@/lib/toast';

/**
 * Một thử thách: luật, khoảng thời gian, phần thưởng, tiến độ của mình.
 *
 * Linh vật của người dùng đứng trên đầu màn và ĐỔI theo tiến độ — ăn mừng khi
 * đã đạt hoặc đã nhận. Concept mục 10: "khi người dùng hoàn thành một
 * challenge, mascot có thể trở thành phần thưởng hoặc visual feedback".
 *
 * Câu "tính những ngày có ít nhất một buổi tập, theo giờ địa phương" đứng
 * ngay dưới thanh tiến độ: con số 24/30 là một phép tính, và người ta phải
 * biết nó đếm gì để tin nó.
 */
export default function CommunityChallengeScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();
  const list = useChallenges();
  const join = useJoinChallenge();
  const claim = useClaimChallenge();
  const mascot = useMascot();

  const live = (list.data ?? []).find((x) => x.id === id);
  /*
    Hết hạn quá 7 ngày thì tổng quan không còn nó — nhưng mở từ "Đã hoàn thành"
    (#41) là mở đúng những thử thách ấy. Dựng lại từ lịch sử: đã tham gia, đã
    đạt, đã nhận, và phần thưởng là số ĐÃ VÀO SỔ. Số người tham gia thì lịch sử
    không có, nên dòng ấy không hiện thay vì hiện một con số bịa.
  */
  const history = useChallengeHistory(list.isSuccess && !live);
  const past = history.data?.find((x) => x.id === id);
  const ch: (CommunityChallenge & { fromHistory?: boolean }) | undefined =
    live ??
    (past && {
      id: past.id, title: past.title, description: past.description, target: past.target,
      starts_on: past.starts_on, ends_on: past.ends_on, reward_coins: past.coins,
      participants: 0, joined: true, progress: past.target, claimed: true, fromHistory: true,
    });
  const locale = getLocale(lang);
  const fmt = (d: string) => parseLocalDate(d).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  const done = !!ch && ch.joined && ch.progress >= ch.target;
  const open = !!ch && dayGap(localDateStr(), ch.ends_on) >= 0;

  const leave = () =>
    ch &&
    Alert.alert(i18n.nChLeave, i18n.nChLeaveBody, [
      { text: i18n.cancel, style: 'cancel' },
      { text: i18n.nChLeave, style: 'destructive', onPress: () => join.mutate({ id: ch.id, on: false }, { onError: (e: Error) => toast.fail(e) }) },
    ]);

  return (
    <Screen back refreshable title={i18n.nChTitle}>
      {list.isError || (!live && history.isError) ? (
        /* Lịch sử đọc hỏng mà nói "không còn nữa" là nói sai về một thử thách
           mình đã hoàn thành. */
        <LoadFailed
          i18n={i18n}
          onRetry={() => {
            list.refetch();
            history.refetch();
          }}
        />
      ) : list.isPending || (!live && history.isPending) ? (
        <ActivityIndicator color={c.mutedForeground} style={styles.loading} />
      ) : !ch ? (
        <GlassCard>
          <EmptyState icon={Trophy} title={i18n.nChGone} />
        </GlassCard>
      ) : (
        <>
          <View style={styles.hero}>
            <MascotFigure mascot={mascot.mascot} size={120} emotion={done || ch.claimed ? 'celebrate' : 'idle'} />
            <Text style={styles.title}>{ch.title}</Text>
            {ch.description ? <Text style={styles.desc}>{ch.description}</Text> : null}
          </View>

          <GlassCard style={styles.card}>
            {ch.joined ? (
              <>
                <Text style={styles.big}>
                  {i18n.nChDays.replace('{a}', String(Math.min(ch.progress, ch.target))).replace('{b}', String(ch.target))}
                </Text>
                <ProgressBar pct={Math.min(100, (ch.progress / ch.target) * 100)} color={done ? c.readinessGreen : c.foreground} height={8} />
              </>
            ) : null}
            <Text style={styles.how}>{i18n.nChHow}</Text>
            <Row label={`${fmt(ch.starts_on)} → ${fmt(ch.ends_on)}`} value={open ? i18n.nChEndsIn.replace('{n}', String(dayGap(localDateStr(), ch.ends_on))) : i18n.nChEnded} />
            {ch.reward_coins > 0 ? <Row label={i18n.nChReward} value={i18n.nChCoins.replace('{n}', String(ch.reward_coins))} /> : null}
            {ch.fromHistory ? null : <Row label={i18n.nChPeople.replace('{n}', ch.participants.toLocaleString(locale))} value="" />}
          </GlassCard>

          {!ch.joined ? (
            open ? (
              <PressScale
                accessibilityRole="button"
                disabled={join.isPending}
                onPress={() => join.mutate({ id: ch.id, on: true }, { onError: (e: Error) => toast.fail(e) })}
                style={styles.solidBtn}>
                <Text style={styles.solidText}>{i18n.nChJoin}</Text>
              </PressScale>
            ) : null
          ) : ch.claimed ? (
            <View style={styles.doneRow}>
              <Icon icon={Check} size={18} color={c.readinessGreen} />
              <Text style={styles.doneText}>{i18n.nChClaimed}</Text>
            </View>
          ) : done ? (
            <PressScale
              accessibilityRole="button"
              disabled={claim.isPending}
              onPress={() =>
                claim.mutate(ch.id, {
                  onSuccess: (n) => toast.success(n > 0 ? `${i18n.nChDone} ${i18n.nChGot.replace('{n}', String(n))}` : i18n.nChDone),
                  onError: (e: Error) => toast.fail(e),
                })
              }
              style={styles.solidBtn}>
              <Text style={styles.solidText}>{i18n.nChClaim.replace('{n}', String(ch.reward_coins))}</Text>
            </PressScale>
          ) : (
            <PressScale accessibilityRole="button" onPress={leave} style={styles.quietBtn}>
              <Text style={styles.quietText}>{i18n.nChLeave}</Text>
            </PressScale>
          )}
        </>
      )}
      {/* Lối vào thứ hai của trang thử thách (#41), cả khi thử thách này không
          còn: "không còn nữa" mà không có đường đi tiếp là một ngõ cụt. */}
      {list.isPending || from === 'all' ? null : <SeeAllChallenges />}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  loading: { marginTop: spacing.xl },
  hero: { alignItems: 'center', gap: spacing.sm },
  title: { ...type.title, color: c.foreground, textAlign: 'center' },
  desc: { ...type.body, color: c.mutedForeground, textAlign: 'center', paddingHorizontal: spacing.md, lineHeight: 21 },
  card: { gap: spacing.md },
  big: { ...type.title2, color: c.foreground, fontVariant: ['tabular-nums'] },
  how: { ...type.footnote, color: c.mutedForeground, lineHeight: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 },
  rowLabel: { ...type.body, color: c.foreground },
  rowValue: { ...type.body, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  solidBtn: { height: 50, borderRadius: radius.full, backgroundColor: m.actionSurface, alignItems: 'center', justifyContent: 'center' },
  solidText: { ...type.headline, color: c.primaryForeground },
  quietBtn: { height: 44, borderRadius: radius.full, backgroundColor: c.secondary, alignItems: 'center', justifyContent: 'center' },
  quietText: { ...type.headline, color: c.foreground },
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44 },
  doneText: { ...type.headline, color: c.foreground },
}));
