import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Trash2 } from 'lucide-react-native';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { press } from '@/constants/motion';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';

interface Memory {
  id: string;
  kind: 'constraint' | 'preference' | 'goal' | 'context';
  fact: string;
  last_confirmed: string;
  source_excerpt: string | null;
}

/** The four kinds, in the order they change what a coach should say. */
const GROUPS: { kind: Memory['kind']; vi: string; en: string; tint: string }[] = [
  { kind: 'constraint', vi: 'Giới hạn', en: 'Limits', tint: colors.readinessRed },
  { kind: 'goal', vi: 'Mục tiêu', en: 'Goals', tint: colors.readinessGreen },
  { kind: 'preference', vi: 'Thói quen', en: 'Habits', tint: colors.metricBlue },
  { kind: 'context', vi: 'Hoàn cảnh', en: 'Context', tint: colors.metricPurple },
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

  const forget = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('coach_memory').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coach_memory', user?.id] }),
  });

  const forgetAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('coach_memory').delete().eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coach_memory', user?.id] }),
  });

  const rows = memories.data ?? [];

  return (
    <Screen back title={vi ? 'Coach nhớ gì' : "What the coach remembers"}>
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
                <View style={[styles.dot, { backgroundColor: g.tint }]} />
                <Text style={styles.groupTitle}>{vi ? g.vi : g.en}</Text>
              </View>
              {items.map((m) => (
                <GlassCard key={m.id} style={styles.row}>
                  <View style={styles.rowBody}>
                    <Text style={styles.fact}>{m.fact}</Text>
                    <Text style={styles.meta}>
                      {(vi ? 'Nhắc lần cuối ' : 'Last mentioned ') + m.last_confirmed.split('T')[0]}
                    </Text>
                  </View>
                  <PressScale
                    accessibilityRole="button"
                    accessibilityLabel={vi ? `Quên: ${m.fact}` : `Forget: ${m.fact}`}
                    to={press.deep}
                    hitSlop={8}
                    style={styles.forgetBtn}
                    onPress={() => {
                      Haptics.selectionAsync();
                      forget.mutate(m.id);
                    }}>
                    <Icon icon={Trash2} size={16} color={colors.mutedForeground} />
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
            Haptics.selectionAsync();
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
                  onPress: () => forgetAll.mutate(),
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

const styles = StyleSheet.create({
  intro: { ...type.footnote, color: colors.mutedForeground, lineHeight: 19, marginBottom: spacing.xs },
  muted: { ...type.footnote, color: colors.mutedForeground, lineHeight: 19 },
  emptyTitle: { ...type.headline, color: colors.foreground, marginBottom: 4 },
  group: { gap: spacing.sm },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  dot: { width: 7, height: 7, borderRadius: 4 },
  groupTitle: {
    ...type.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowBody: { flex: 1, gap: 2 },
  fact: { ...type.body, color: colors.foreground, lineHeight: 20 },
  meta: { ...type.caption, color: colors.mutedForeground },
  forgetBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  clearAll: {
    marginTop: spacing.md,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  clearAllText: { ...type.headline, color: colors.readinessRed },
});
