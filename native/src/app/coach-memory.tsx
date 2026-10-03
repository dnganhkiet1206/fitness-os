import { useQuery, useQueryClient } from '@tanstack/react-query';
import { haptics as Haptics } from '@/lib/haptics';
import { Trash2 } from 'lucide-react-native';
import { Alert, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { Screen } from '@/components/ascnd/screen';
import { toast } from '@/lib/toast';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles, type PaletteKey } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { press } from '@/constants/motion';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useOnlineMutation } from '@/hooks/use-online-mutation';
import { now } from '@/lib/offline-class';
import { supabase } from '@/integrations/supabase/client';
import { localDateStr } from '@/lib/local-date';
import { confirmWrite } from '@/lib/write-result';

interface Memory {
  id: string;
  kind: 'constraint' | 'preference' | 'goal' | 'context';
  fact: string;
  last_confirmed: string;
  source_excerpt: string | null;
}

/** The four kinds, in the order they change what a coach should say. */
/*
  Khoá của bảng màu, không phải mã màu: một mã màu ở phạm vi module bị ĐÓNG BĂNG
  lúc import và sẽ giữ màu của theme tối kể cả khi người dùng bật theme sáng.
  Bảng vẫn là hằng thật; chỗ vẽ — nơi luôn có `c` — mới đổi khoá thành màu.
*/
const GROUPS: { kind: Memory['kind']; vi: string; en: string; es: string; tint: PaletteKey }[] = [
  { kind: 'constraint', vi: 'Giới hạn', en: 'Limits', es: 'Límites', tint: 'readinessRed' },
  { kind: 'goal', vi: 'Mục tiêu', en: 'Goals', es: 'Objetivos', tint: 'readinessGreen' },
  { kind: 'preference', vi: 'Thói quen', en: 'Habits', es: 'Hábitos', tint: 'metricBlue' },
  { kind: 'context', vi: 'Hoàn cảnh', en: 'Context', es: 'Contexto', tint: 'metricPurple' },
];

/**
 * What the coach remembers, and the button that makes it forget.
 *
 * ── why this screen exists at all ──
 *
 * The memory could have worked invisibly. It would still improve the answers,
 * and nobody would know why — which loses most of what it is worth. The
 * retention data on subscription health apps is blunt about this: people stay
 * for products that feel like they know them, and a personalisation nobody can
 * see does not feel like anything.
 *
 * ── and why it is deletable ──
 *
 * These are health facts somebody said out loud: an injury, a food they avoid,
 * a diagnosis mentioned in passing. Storing that and giving no way to look at
 * it is surveillance with a friendly name, and asking someone to pay for it
 * makes it worse rather than better.
 *
 * Each row carries the date it was last mentioned and the words that produced
 * it, so "why does it think that?" is answered on the screen rather than in a
 * log nobody can read. A wrong fact you can point at and delete is a small
 * annoyance; a wrong fact you can only sense is a reason to stop trusting the
 * whole thing.
 */
export default function CoachMemoryScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const { user } = useAuth();
  const qc = useQueryClient();

  const memories = useQuery({
    queryKey: ['coach_memory', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Memory[]> => {
      const { data, error } = await supabase
        .from('coach_memory')
        .select('id, kind, fact, last_confirmed, source_excerpt')
        .eq('user_id', user!.id)
        .order('last_confirmed', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Memory[];
    },
  });

  const forget = useOnlineMutation({
    meta: { offline: now(3) },
    mutationFn: async (id: string) => {
      await confirmWrite(
        supabase.from('coach_memory').delete().eq('id', id),
        'Không xoá được ghi nhớ này',
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coach_memory', user?.id] }),
  });

  const forgetAll = useOnlineMutation({
    meta: { offline: now(3) },
    mutationFn: async () => {
      await confirmWrite(
        supabase.from('coach_memory').delete().eq('user_id', user!.id),
        'Không xoá được ghi nhớ này',
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coach_memory', user?.id] }),
  });

  const rows = memories.data ?? [];

  return (
    <Screen refreshable back title={vi ? 'Coach nhớ gì' : "What the coach remembers"}>
      <Text style={styles.intro}>
        {vi
          ? 'Những điều bạn đã kể trong các cuộc trò chuyện, để coach không hỏi lại. Số liệu hằng ngày không nằm ở đây — app đã có sẵn.'
          : 'Things you mentioned in past conversations, so the coach does not ask again. Daily numbers are not here — the app already has those.'}
      </Text>

      {memories.isPending ? (
        <GlassCard>
          <Text style={styles.muted}>{vi ? 'Đang tải…' : 'Loading…'}</Text>
        </GlassCard>
      ) : memories.isError ? (
        <GlassCard>
          <Text style={styles.muted}>
            {vi ? 'Chưa đọc được. Kéo xuống để thử lại.' : 'Could not load. Pull to retry.'}
          </Text>
        </GlassCard>
      ) : rows.length === 0 ? (
        <GlassCard>
          <Text style={styles.emptyTitle}>{vi ? 'Chưa có gì' : 'Nothing yet'}</Text>
          <Text style={styles.muted}>
            {vi
              ? 'Coach sẽ ghi nhớ khi bạn kể những điều bền lâu — chấn thương, món không ăn được, lịch tập, mục tiêu. Nó bỏ qua những thứ đổi theo ngày.'
              : 'The coach remembers durable things — an injury, a food you avoid, when you train, what you are working towards. It skips anything that changes day to day.'}
          </Text>
        </GlassCard>
      ) : (
        GROUPS.map((g) => {
          const items = rows.filter((r) => r.kind === g.kind);
          if (items.length === 0) return null;
          return (
            <View key={g.kind} style={styles.group}>
              <View style={styles.groupHead}>
                <View style={[styles.dot, { backgroundColor: c[g.tint] }]} />
                <Text style={styles.groupTitle} accessibilityRole="header">
                  {g[lang] ?? g.en}
                </Text>
              </View>
              {items.map((m) => (
                <GlassCard elevation="inset" key={m.id} style={styles.row}>
                  <View style={styles.rowBody}>
                    <Text style={styles.fact}>{m.fact}</Text>
                    {/* `localDateStr(new Date(…))`, not `.split('T')[0]`.
                        `last_confirmed` is a `timestamptz` and its ISO text is
                        the instant in **UTC**, so cutting the date out of the
                        string printed the previous day for anything confirmed
                        before 07:00 in Hanoi — a date the user can read, off by
                        one, on the screen whose whole subject is what the coach
                        remembers and when. */}
                    <Text style={styles.meta}>
                      {(vi ? 'Nhắc lần cuối ' : 'Last mentioned ') +
                        localDateStr(new Date(m.last_confirmed))}
                    </Text>
                  </View>
                  <PressScale
                    accessibilityRole="button"
                    accessibilityLabel={vi ? `Quên: ${m.fact}` : `Forget: ${m.fact}`}
                    to={press.deep}
                    hitSlop={8}
                    style={styles.forgetBtn}
                    onPress={() => {
                      Haptics.selection();
                      /*
                        ── the write can now say it did nothing, so somebody has
                           to be listening ──

                        These deletes used to end with `if (error) throw error`
                        and nothing else, which meant a delete that matched **no
                        rows** looked exactly like one that worked: PostgREST
                        answers both with `error: null`. The round that added
                        `confirmWrite` made the app able to tell the difference —
                        and then left this screen with nowhere for the answer to
                        go, so the row vanished optimistically, came back on the
                        refetch, and nobody was told why.

                        Adding the check without adding the ear is half the job,
                        and the half that shows is the one that reads as a bug.
                      */
                      /*
                        ── and it asks first (#144) ──

                        This row is a health fact somebody said out loud — an
                        injury, a diagnosis in passing. "Erase everything" below
                        asked before it deleted; this button, one tap from the
                        same screen, deleted at once. The press pass never saw
                        it because "Forget" / "Quên" was not a destructive verb
                        to it (`DESTRUCTIVE`, live-press.mjs). The question
                        quotes the fact, so the tap that confirms is a tap on
                        the right row.
                      */
                      Alert.alert(
                        vi ? 'Quên điều này?' : 'Forget this?',
                        `“${m.fact}”\n\n` +
                          (vi
                            ? 'Coach sẽ không còn nhớ điều này. Nếu nó vẫn đúng, bạn có thể kể lại trong một cuộc trò chuyện.'
                            : 'The coach will no longer remember this. If it is still true, you can mention it again in a conversation.'),
                        [
                          { text: vi ? 'Huỷ' : 'Cancel', style: 'cancel' },
                          {
                            text: vi ? 'Quên' : 'Forget',
                            style: 'destructive',
                            onPress: () =>
                              forget.mutate(m.id, {
                                onError: (e: Error) => toast.fail(e),
                              }),
                          },
                        ],
                      );
                    }}>
                    <Icon icon={Trash2} size={16} color={c.mutedForeground} />
                  </PressScale>
                </GlassCard>
              ))}
            </View>
          );
        })
      )}

      {rows.length > 0 ? (
        <PressScale
          accessibilityRole="button"
          style={styles.clearAll}
          disabled={forgetAll.isPending}
          onPress={() => {
            Haptics.selection();
            Alert.alert(
              vi ? 'Xoá toàn bộ trí nhớ?' : 'Erase everything?',
              vi
                ? 'Coach sẽ bắt đầu lại từ con số không. Dữ liệu tập luyện và dinh dưỡng của bạn không bị ảnh hưởng.'
                : 'The coach will start from nothing. Your training and nutrition data is untouched.',
              [
                { text: vi ? 'Huỷ' : 'Cancel', style: 'cancel' },
                {
                  text: vi ? 'Xoá hết' : 'Erase',
                  style: 'destructive',
                  onPress: () =>
                    forgetAll.mutate(undefined, {
                      onError: (e: Error) => toast.fail(e),
                    }),
                },
              ],
            );
          }}>
          <Text style={styles.clearAllText}>{vi ? 'Xoá toàn bộ trí nhớ' : 'Erase all memory'}</Text>
        </PressScale>
      ) : null}
    </Screen>
  );
}

const stylesFor = makeStyles((c) => ({
  intro: { ...type.footnote, color: c.mutedForeground, lineHeight: 19, marginBottom: spacing.xs },
  muted: { ...type.footnote, color: c.mutedForeground, lineHeight: 19 },
  emptyTitle: { ...type.headline, color: c.foreground, marginBottom: 4 },
  group: { gap: spacing.sm },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  dot: { width: 7, height: 7, borderRadius: 4 },
  groupTitle: {
    ...type.caption,
    color: c.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowBody: { flex: 1, gap: 2 },
  fact: { ...type.body, color: c.foreground, lineHeight: 20 },
  meta: { ...type.caption, color: c.mutedForeground },
  forgetBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  clearAll: {
    marginTop: spacing.md,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.secondary,
  },
  clearAllText: { ...type.headline, color: c.readinessRed },
}));
