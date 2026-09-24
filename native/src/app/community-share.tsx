import { useLocalSearchParams } from 'expo-router';
import { Check, ChevronRight, Dumbbell, Lock, UserRound } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState } from '@/components/ascnd/empty-state';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { Screen } from '@/components/ascnd/screen';
import { Segmented } from '@/components/ascnd/segmented';
import { WorkoutPostCard } from '@/components/ascnd/workout-post-card';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import {
  AlreadySharedError,
  type FeedPost,
  payloadFromSession,
  ProfileRequiredError,
  useCommunitySettings,
  useMyCommunityProfile,
  useMySharedSessions,
  useShareWorkout,
} from '@/hooks/use-community';
import { useWorkoutSessions } from '@/hooks/use-fitness-data';
import { usePalette } from '@/hooks/use-palette';
import { useUnits } from '@/hooks/use-units';
import { trainingMinutes } from '@/lib/activity';
import { getLocale } from '@/lib/i18n';
import { nav } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { displayWeight, weightLabel } from '@/lib/units';

/** Ba mươi ngày — đủ để chia sẻ một buổi tuần trước, đủ ngắn để danh sách
    không thành một kho lưu trữ. */
const DAYS = 30;

/**
 * Chia sẻ một buổi tập: chọn buổi → xem trước ĐÚNG cái thẻ sẽ được đăng →
 * viết chú thích → chọn ai thấy → Đăng.
 *
 * ── dòng "chỉ những gì trên thẻ" ──
 *
 * Concept mục 12 và App Store 5.1.3: người dùng phải BIẾT họ đang chia sẻ gì.
 * Thẻ xem trước là câu trả lời đầy đủ, và dòng dưới nó nói nốt phần không thấy
 * được: cân nặng, số đo và lịch sử buổi tập không rời khỏi tài khoản.
 *
 * Buổi đã chia sẻ hiện dấu "Đã chia sẻ" và không chọn được — server sẽ từ chối
 * lần hai (một buổi một bài), và một nút dẫn tới lời từ chối là một nút nói
 * dối.
 */
export default function CommunityShareScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { weight: wUnit } = useUnits();
  const wl = weightLabel(wUnit);
  const params = useLocalSearchParams<{ session?: string }>();
  const me = useMyCommunityProfile();
  const sessions = useWorkoutSessions(DAYS);
  const shared = useMySharedSessions();
  const share = useShareWorkout();

  const [picked, setPicked] = useState<string | null>(params.session ?? null);
  const [caption, setCaption] = useState('');
  /* Chưa chạm thì theo "Mặc định khi đăng" trong Quyền riêng tư; đã chọn thì
     giữ lựa chọn — cài đặt về muộn không được lật ngược thứ người ta vừa bấm. */
  const settings = useCommunitySettings();
  const [visPick, setVis] = useState<'public' | 'followers' | null>(null);
  const vis = visPick ?? settings.data?.defaultVisibility ?? 'public';

  const list = useMemo(
    () => [...(sessions.data ?? [])].sort((a, b) => b.date_time.localeCompare(a.date_time)),
    [sessions.data],
  );
  const session = list.find((s) => s.id === picked) ?? null;
  const minutes = session ? trainingMinutes((session.sets ?? []) as never) || null : null;

  const preview: FeedPost | null =
    session && me.data
      ? {
          id: 'preview',
          kind: 'workout',
          payload: payloadFromSession(session, minutes),
          raw: null,
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
    if (!session || share.isPending) return;
    share.mutate(
      { sessionId: session.id, caption, visibility: vis, minutes },
      {
        onSuccess: () => {
          toast.success(i18n.nCmPosted);
          nav.back();
        },
        onError: (e: Error) => {
          if (e instanceof AlreadySharedError) toast.fail(new Error(i18n.nCmAlreadyShared));
          else if (e instanceof ProfileRequiredError) nav.push('/community-profile');
          else toast.fail(e);
        },
      },
    );
  };

  const locale = getLocale(lang);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen back title={i18n.nCmShareTitle}>
        {me.isPending || sessions.isPending ? (
          <ActivityIndicator color={c.mutedForeground} style={styles.loading} />
        ) : me.isError || sessions.isError ? (
          <LoadFailed i18n={i18n} onRetry={() => (me.refetch(), sessions.refetch())} />
        ) : !me.data ? (
          /* Không có hồ sơ thì không đăng được — bài cần một cái tên. */
          <GlassCard>
            <EmptyState
              icon={UserRound}
              title={i18n.nCmSetupTitle}
              hint={i18n.nCmSetupHint}
              action={{ label: i18n.nCmSetupCta, onPress: () => nav.push('/community-profile') }}
            />
          </GlassCard>
        ) : !session ? (
          list.length === 0 ? (
            <GlassCard>
              <EmptyState icon={Dumbbell} title={i18n.nCmNoSessions} />
            </GlassCard>
          ) : (
            <GlassCard style={styles.pickCard}>
              <Text style={styles.label}>{i18n.nCmPickSession}</Text>
              {list.map((s, i) => {
                const done = shared.data?.includes(s.id) ?? false;
                return (
                  <Pressable
                    key={s.id}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: done }}
                    disabled={done}
                    onPress={() => setPicked(s.id)}
                    style={[styles.pickRow, i > 0 && styles.rule]}>
                    <View style={styles.pickText}>
                      <Text style={[styles.pickName, done && styles.dim]} numberOfLines={1}>
                        {s.template_name?.trim() || i18n.nCmWorkout}
                      </Text>
                      <Text style={styles.pickMeta}>
                        {new Date(s.date_time).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                        {Number(s.volume_load) > 0
                          ? ` · ${Math.round(displayWeight(Number(s.volume_load), wUnit)).toLocaleString(locale)} ${wl}`
                          : ''}
                      </Text>
                    </View>
                    {done ? (
                      <View style={styles.sharedTag}>
                        <Icon icon={Check} size={14} color={c.mutedForeground} />
                        <Text style={styles.sharedText}>{i18n.nCmShared}</Text>
                      </View>
                    ) : (
                      <Icon icon={ChevronRight} size={18} color={c.mutedForeground} />
                    )}
                  </Pressable>
                );
              })}
            </GlassCard>
          )
        ) : (
          <>
            {preview ? <WorkoutPostCard post={preview} preview /> : null}

            <GlassCard style={styles.form}>
              <Text style={styles.label}>{i18n.nCmCaption}</Text>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder={i18n.nCmCaptionPh}
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
              <Text style={styles.noteText}>{i18n.nCmPrivacyNote}</Text>
            </View>

            <PressScale
              accessibilityRole="button"
              disabled={share.isPending}
              onPress={post}
              style={[styles.postBtn, share.isPending && styles.busy]}>
              {share.isPending ? (
                <ActivityIndicator color={c.primaryForeground} />
              ) : (
                <Text style={styles.postText}>{i18n.nCmPost}</Text>
              )}
            </PressScale>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const stylesFor = makeStyles((c, m) => ({
  root: { flex: 1, backgroundColor: c.background },
  loading: { marginTop: spacing.xl },
  label: { ...type.footnote, color: c.mutedForeground },
  pickCard: { gap: spacing.xs },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  pickText: { flex: 1, minWidth: 0, gap: 2 },
  pickName: { ...type.headline, color: c.foreground },
  pickMeta: { ...type.footnote, color: c.mutedForeground },
  dim: { color: c.mutedForeground },
  sharedTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sharedText: { ...type.footnote, color: c.mutedForeground },
  form: { gap: spacing.sm },
  input: {
    ...type.body,
    color: c.foreground,
    backgroundColor: c.secondary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 88,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
  note: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', paddingHorizontal: spacing.xs },
  noteText: { ...type.footnote, color: c.mutedForeground, flex: 1, lineHeight: 18 },
  postBtn: { height: 50, borderRadius: radius.full, backgroundColor: m.actionSurface, alignItems: 'center', justifyContent: 'center' },
  busy: { opacity: 0.6 },
  postText: { ...type.headline, color: c.primaryForeground },
}));
