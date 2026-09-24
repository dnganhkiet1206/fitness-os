import { Lock, UserRound } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { EmptyState } from '@/components/ascnd/empty-state';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PostCard } from '@/components/ascnd/post-card';
import { PressScale } from '@/components/ascnd/press-scale';
import { Screen } from '@/components/ascnd/screen';
import { Segmented } from '@/components/ascnd/segmented';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import {
  type FeedPost,
  ProfileRequiredError,
  useCommunitySettings,
  useMyCommunityProfile,
  useProgressPreview,
  useShareProgress,
} from '@/hooks/use-community';
import { useWorkoutSessions } from '@/hooks/use-fitness-data';
import { usePalette } from '@/hooks/use-palette';
import { nav } from '@/lib/nav';
import { toast } from '@/lib/toast';

const RANGES = [4, 8, 12, 24] as const;
type Range = (typeof RANGES)[number];

/** Sáu bài hay tập nhất — đủ để chọn bài mình muốn khoe, không thành một danh sách tìm kiếm. */
const LIFT_CHOICES = 6;

/**
 * Chia sẻ tiến trình: khoảng thời gian → những số nào → xem trước → đăng.
 *
 * ── xem trước là bản của SERVER ──
 *
 * Mỗi lần đổi lựa chọn, màn gọi `build_progress_payload` — đúng hàm
 * `share_progress` sẽ gọi khi đăng. Không có bản tính thứ hai ở client, nên
 * không có chuyện thẻ xem trước nói một đằng, bài đăng nói một nẻo.
 *
 * ── mặc định ──
 *
 * 12 tuần (con số của mockup), cân nặng BẬT, vòng eo và bài sức mạnh TẮT.
 * Cân nặng bật sẵn vì đó là thứ người ta mở màn này để khoe; vòng eo là số đo
 * cơ thể, nhạy cảm hơn, nên phải chủ động bật (concept mục 12).
 *
 * Không đủ dữ liệu (mỗi số cần ít nhất hai lần ghi trong khoảng) thì server
 * từ chối, và màn nói đúng lý do đó thay vì hiện một thẻ rỗng.
 */
export default function CommunityShareProgressScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const me = useMyCommunityProfile();
  const sessions = useWorkoutSessions(90);
  const share = useShareProgress();

  const [weeks, setWeeks] = useState<Range>(12);
  const [weight, setWeight] = useState(true);
  const [waist, setWaist] = useState(false);
  const [lift, setLift] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  /* Chưa chạm thì theo "Mặc định khi đăng" trong Quyền riêng tư; đã chọn thì
     giữ lựa chọn — cài đặt về muộn không được lật ngược thứ người ta vừa bấm. */
  const settings = useCommunitySettings();
  const [visPick, setVis] = useState<'public' | 'followers' | null>(null);
  const vis = visPick ?? settings.data?.defaultVisibility ?? 'public';

  const preview = useProgressPreview({ weeks, weight, waist, liftId: lift });

  /* Bài để chọn: những bài có tạ trong 90 ngày, hay tập nhất trước. */
  const lifts = useMemo(() => {
    const count = new Map<string, { name: string; n: number }>();
    for (const s of sessions.data ?? []) {
      for (const x of (Array.isArray(s.sets) ? s.sets : []) as { exerciseId?: string; exerciseName?: string; weight?: number; warmup?: boolean }[]) {
        if (!x.exerciseId || x.warmup || !(Number(x.weight) > 0)) continue;
        const cur = count.get(x.exerciseId) ?? { name: x.exerciseName ?? '?', n: 0 };
        cur.n += 1;
        count.set(x.exerciseId, cur);
      }
    }
    return [...count.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, LIFT_CHOICES);
  }, [sessions.data]);

  const card: FeedPost | null =
    preview.data && me.data
      ? {
          id: 'preview',
          kind: 'progress',
          payload: { title: null, performedAt: null, volumeKg: 0, pr: false, minutes: null, exerciseCount: 0, exercises: [] },
          raw: preview.data,
          caption: caption.trim(),
          visibility: vis,
          like_count: 0,
          comment_count: 0,
          save_count: 0,
          hidden: false,
          created_at: new Date().toISOString(),
          author: me.data,
          liked: false,
          saved: false,
          mine: true,
        }
      : null;

  const post = () => {
    if (!card || share.isPending) return;
    share.mutate(
      { weeks, weight, waist, liftId: lift, caption, visibility: vis },
      {
        onSuccess: () => {
          toast.success(i18n.nCmPosted);
          nav.back();
        },
        onError: (e: Error) => (e instanceof ProfileRequiredError ? nav.push('/community-profile') : toast.fail(e)),
      },
    );
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen back title={i18n.nPgShareTitle}>
        {me.isPending ? (
          <ActivityIndicator color={c.mutedForeground} style={styles.loading} />
        ) : me.isError ? (
          <LoadFailed i18n={i18n} onRetry={() => me.refetch()} />
        ) : !me.data ? (
          <GlassCard>
            <EmptyState
              icon={UserRound}
              title={i18n.nCmSetupTitle}
              hint={i18n.nCmSetupHint}
              action={{ label: i18n.nCmSetupCta, onPress: () => nav.push('/community-profile') }}
            />
          </GlassCard>
        ) : (
          <>
            <GlassCard style={styles.form}>
              <Text style={styles.label}>{i18n.nPgRange}</Text>
              <Segmented
                value={String(weeks)}
                onChange={(v) => setWeeks(Number(v) as Range)}
                options={RANGES.map((r) => ({ key: String(r), label: i18n.nPgWeeks.replace('{n}', String(r)) }))}
              />
              <Text style={[styles.label, styles.gapTop]}>{i18n.nPgInclude}</Text>
              <ToggleRow label={i18n.nPgWeight} value={weight} onChange={setWeight} />
              <ToggleRow label={i18n.nPgWaist} value={waist} onChange={setWaist} />
              <Text style={[styles.label, styles.gapTop]}>{i18n.nPgLift}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {[[null, { name: i18n.nPgNoLift, n: 0 }] as const, ...lifts].map(([id, v]) => (
                  <Pressable
                    key={id ?? 'none'}
                    accessibilityRole="button"
                    accessibilityState={{ selected: lift === id }}
                    onPress={() => setLift(id)}
                    /* Chip cao 36 cho hàng gọn; 36 + 2×4 = 44, sàn của HIG. */
                    hitSlop={4}
                    style={[styles.chip, lift === id && styles.chipOn]}>
                    <Text style={[styles.chipText, lift === id && styles.chipTextOn]} numberOfLines={1}>
                      {v.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </GlassCard>

            {preview.isFetching && !preview.data ? (
              <ActivityIndicator color={c.mutedForeground} />
            ) : preview.error ? (
              <Text style={styles.nothing}>{i18n.nPgNothing}</Text>
            ) : card ? (
              <PostCard post={card} preview />
            ) : null}

            <GlassCard style={styles.form}>
              <Text style={styles.label}>{i18n.nCmCaption}</Text>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder={i18n.nPgCaptionPh}
                placeholderTextColor={c.mutedForeground}
                maxLength={500}
                multiline
                style={styles.input}
              />
              <Text style={styles.label}>{i18n.nCmVisibility}</Text>
              <Segmented
                value={vis}
                onChange={setVis}
                options={[
                  { key: 'public', label: i18n.nCmPublic },
                  { key: 'followers', label: i18n.nCmFollowersOnly },
                ]}
              />
            </GlassCard>

            <View style={styles.note}>
              <Icon icon={Lock} size={14} color={c.mutedForeground} />
              <Text style={styles.noteText}>{i18n.nPgPrivacy}</Text>
            </View>

            <PressScale
              accessibilityRole="button"
              accessibilityState={{ disabled: !card }}
              disabled={!card || share.isPending}
              onPress={post}
              style={[styles.postBtn, (!card || share.isPending) && styles.off]}>
              {share.isPending ? <ActivityIndicator color={c.primaryForeground} /> : <Text style={styles.postText}>{i18n.nCmPost}</Text>}
            </PressScale>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <View style={styles.toggle}>
      <Text style={styles.toggleText}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.readinessGreen, false: c.secondary }} accessibilityLabel={label} />
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  root: { flex: 1, backgroundColor: c.background },
  loading: { marginTop: spacing.xl },
  form: { gap: spacing.sm },
  label: { ...type.footnote, color: c.mutedForeground },
  gapTop: { marginTop: spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  toggleText: { ...type.body, color: c.foreground },
  chips: { gap: spacing.sm },
  chip: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
    borderWidth: 1,
    borderColor: 'transparent',
    justifyContent: 'center',
  },
  chipOn: { borderColor: c.foreground },
  chipText: { ...type.footnote, color: c.mutedForeground },
  chipTextOn: { color: c.foreground, fontWeight: '600' },
  nothing: { ...type.footnote, color: c.mutedForeground, textAlign: 'center', paddingHorizontal: spacing.lg },
  input: {
    ...type.body,
    color: c.foreground,
    backgroundColor: c.secondary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
  note: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', paddingHorizontal: spacing.xs },
  noteText: { ...type.footnote, color: c.mutedForeground, flex: 1, lineHeight: 18 },
  postBtn: { height: 50, borderRadius: radius.full, backgroundColor: m.actionSurface, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.4 },
  postText: { ...type.headline, color: c.primaryForeground },
}));
