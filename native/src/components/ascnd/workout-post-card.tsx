import * as Haptics from 'expo-haptics';
import {
  BadgeCheck,
  Bookmark,
  ChevronRight,
  Clock,
  Copy,
  Dumbbell,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Share2,
  Trophy,
} from 'lucide-react-native';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { CommunityAvatar } from '@/components/ascnd/community-avatar';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import {
  type FeedPost,
  type ReportReason,
  useBlock,
  useDeletePost,
  useReport,
  useToggleLike,
  useToggleSave,
  workoutFromPost,
} from '@/hooks/use-community';
import { useAddWorkoutTemplate } from '@/hooks/use-library';
import { usePalette } from '@/hooks/use-palette';
import { useUnits } from '@/hooks/use-units';
import { getLocale } from '@/lib/i18n';
import { nav } from '@/lib/nav';
import { timeAgo } from '@/lib/time-ago';
import { toast } from '@/lib/toast';
import { displayWeight, weightLabel } from '@/lib/units';

/** Thẻ gọn trên feed hiện ba bài tập; trang chi tiết hiện hết. */
const PREVIEW = 3;

/**
 * Một bài Workout — thẻ dựng từ dữ liệu buổi tập thật (server dựng, xem
 * `share_workout`), không có ảnh.
 *
 * ── thứ tự từ trên xuống, và vì sao ──
 *
 *   ai · khi nào      người ta đọc bài của AI trước khi đọc bài gì.
 *   tên buổi + số     "Push Day", ~45 phút, 12.840 kg, PR — ba con số một
 *                     người tập hỏi đầu tiên về một buổi của người khác.
 *   các bài tập       mỗi bài một dòng với set nặng nhất, trong một mặt lõm
 *                     (`m.inset`) để nó đọc ra là DỮ LIỆU của thẻ chứ không
 *                     phải thêm một thẻ lồng.
 *   Thử workout       hành động làm Community khác một feed để lướt (concept
 *                     mục 4). Viên trầm, không đặc: ba mươi bài là ba mươi nút,
 *                     và ba mươi nút đặc là một bức tường.
 *   chú thích         phần người kể — sau dữ liệu, để thẻ nào cũng có cùng
 *                     một khung dù người đăng viết một chữ hay viết một đoạn.
 *   thích · bình luận · lưu · chia sẻ
 *
 * Không có số "Nx PRs": bảng buổi tập chỉ lưu CỜ `pr_detected`, không lưu số
 * kỷ lục. Thẻ nói đúng thứ dữ liệu có.
 */
export function WorkoutPostCard({
  post,
  full = false,
  preview = false,
}: {
  post: FeedPost;
  full?: boolean;
  /** Màn chia sẻ: đúng cái thẻ sẽ được đăng, nhưng chưa có gì để thích,
      lưu, báo cáo hay thử — nên không vẽ hàng hành động, menu, hay nút Thử. */
  preview?: boolean;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { weight: wUnit } = useUnits();
  const wl = weightLabel(wUnit);
  const like = useToggleLike();
  const save = useToggleSave();
  const addTemplate = useAddWorkoutTemplate();
  const menu = usePostMenu(post);

  const p = post.payload;
  const title = p.title ?? i18n.nCmWorkout;
  const lines = full ? p.exercises : p.exercises.slice(0, PREVIEW);
  const more = p.exercises.length - lines.length;
  const locale = getLocale(lang);
  const volume = p.volumeKg > 0 ? Math.round(displayWeight(p.volumeKg, wUnit)).toLocaleString(locale) : null;

  const openPost = () => nav.push({ pathname: '/community-post', params: { id: post.id } });
  const openAuthor = () => post.author && nav.push({ pathname: '/community-user', params: { id: post.author.user_id } });

  const tryIt = async () => {
    const w = workoutFromPost(p, title);
    if (w.exercises.length === 0) {
      toast.fail(new Error(i18n.nCmTryNone));
      return;
    }
    try {
      await addTemplate.mutateAsync({ name: w.name, type: 'community', exercises: w.exercises });
      toast.success(
        w.skipped > 0
          ? `${i18n.nCmTried} · ${i18n.nCmTriedSkipped.replace('{n}', String(w.skipped))}`
          : i18n.nCmTried,
      );
    } catch (e) {
      toast.fail(e as Error);
    }
  };

  const shareOut = () => {
    Haptics.selectionAsync();
    const head = i18n.nCmShareText.replace('{title}', title).replace('{n}', String(p.exerciseCount));
    const body = p.exercises
      .map((e) => `• ${e.exerciseName}${e.weight > 0 ? ` — ${displayWeight(e.weight, wUnit)} ${wl} × ${e.reps}` : ` — ${e.sets} × ${e.reps}`}`)
      .join('\n');
    Share.share({ message: `${head}\n\n${body}` });
  };

  const Body = (
    <GlassCard style={styles.card}>
      {/* ── ai · khi nào ── */}
      <View style={styles.head}>
        <Pressable accessibilityRole="button" onPress={openAuthor} style={styles.who} hitSlop={4}>
          <CommunityAvatar mascotId={post.author?.mascot_id} size={40} />
          <View style={styles.whoText}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {post.author?.display_name ?? '—'}
              </Text>
              {post.author?.is_official ? (
                <View accessible accessibilityLabel={i18n.nCmVerified}>
                  <Icon icon={BadgeCheck} size={15} color={c.metricBlue} />
                </View>
              ) : null}
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {timeAgo(post.created_at, i18n, lang)}
              {post.visibility === 'followers' ? ` · ${i18n.nCmFollowersOnly}` : ''}
            </Text>
          </View>
        </Pressable>
        {!preview ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i18n.nCmMore}
            onPress={menu}
            hitSlop={10}
            style={styles.moreBtn}>
            <Icon icon={MoreHorizontal} size={20} color={c.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {post.hidden && post.mine ? <Text style={styles.hiddenNote}>{i18n.nCmHiddenNotice}</Text> : null}

      {/* ── tên buổi + số ── */}
      <Text style={styles.title}>{title}</Text>
      <View style={styles.stats}>
        {p.minutes ? <Stat icon={Clock} text={i18n.nCmMinutes.replace('{n}', String(p.minutes))} /> : null}
        {volume ? <Stat icon={Dumbbell} text={`${volume} ${wl}`} /> : null}
        {p.pr ? <Stat icon={Trophy} text="PR" tone={c.readinessYellow} /> : null}
      </View>

      {/* ── các bài tập ── */}
      <View style={styles.panel}>
        {lines.map((e, i) => (
          <View key={`${e.exerciseName}-${i}`} style={[styles.line, i > 0 && styles.lineRule]}>
            <Text style={styles.lineName} numberOfLines={1}>
              {e.exerciseName}
            </Text>
            <Text style={styles.lineValue}>
              {e.weight > 0 ? `${displayWeight(e.weight, wUnit)} ${wl} × ${e.reps}` : `${e.sets} × ${e.reps}`}
            </Text>
          </View>
        ))}
        {more > 0 ? (
          <Pressable accessibilityRole="button" onPress={openPost} style={[styles.line, styles.lineRule]}>
            <Text style={styles.moreText}>{i18n.nCmMoreExercises.replace('{n}', String(more))}</Text>
            <Icon icon={ChevronRight} size={16} color={c.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {!post.mine && !preview ? (
        <PressScale
          accessibilityRole="button"
          onPress={tryIt}
          disabled={addTemplate.isPending}
          style={styles.tryBtn}>
          <Icon icon={Copy} size={16} color={c.foreground} />
          <Text style={styles.tryText}>{i18n.nCmTry}</Text>
        </PressScale>
      ) : null}

      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}

      {/* ── thích · bình luận · lưu · chia sẻ ── */}
      {!preview ? (
      <View style={styles.actions}>
        <Action
          icon={Heart}
          label={i18n.nCmLike}
          count={post.like_count}
          on={post.liked}
          onColor={c.readinessRed}
          onPress={() => like.mutate({ postId: post.id, on: !post.liked })}
        />
        <Action icon={MessageCircle} label={i18n.nCmComment} count={post.comment_count} onPress={openPost} />
        <View style={styles.flex} />
        <Action
          icon={Bookmark}
          label={i18n.nCmSave}
          on={post.saved}
          onColor={c.foreground}
          onPress={() => save.mutate({ postId: post.id, on: !post.saved })}
        />
        <Action icon={Share2} label={i18n.nCmShare} onPress={shareOut} />
      </View>
      ) : null}
    </GlassCard>
  );

  if (full || preview) return Body;
  /* Chạm vào khoảng trống của thẻ mở bài — nhưng với VoiceOver đó là vùng
     NUỐT CHẠM chứ không phải một nút thứ hai bọc quanh các nút thích/lưu
     (`accessible={false}`). Lối mở bài cho trình đọc màn hình là nút Bình
     luận và dòng "+ N bài tập khác", cả hai đều là nút thật. */
  return (
    <PressScale accessible={false} onPress={openPost}>
      {Body}
    </PressScale>
  );
}

function Stat({ icon, text, tone }: { icon: typeof Clock; text: string; tone?: string }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <View style={styles.stat}>
      <Icon icon={icon} size={15} color={tone ?? c.mutedForeground} />
      <Text style={styles.statText}>{text}</Text>
    </View>
  );
}

/* Mỗi nút một ô 44 điểm: hàng này là thứ người ta chạm nhiều nhất trên feed. */
function Action({
  icon,
  label,
  count,
  on = false,
  onColor,
  onPress,
}: {
  icon: typeof Heart;
  label: string;
  count?: number;
  on?: boolean;
  onColor?: string;
  onPress: () => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const color = on && onColor ? onColor : c.mutedForeground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count != null ? `${label} · ${count}` : label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={styles.action}>
      <Icon icon={icon} size={20} color={color} fill={on ? color : undefined} />
      {count != null ? <Text style={styles.actionCount}>{count}</Text> : null}
    </Pressable>
  );
}

/**
 * Menu "…": của mình thì Xoá; của người khác thì Báo cáo và Chặn.
 *
 * Dùng `Alert` của hệ thống chứ không dựng một tấm riêng: đây là việc hiếm,
 * nghiêm túc và cần xác nhận — đúng thứ hộp thoại hệ thống sinh ra để làm, và
 * nó tự đọc được bằng VoiceOver. Báo cáo và Chặn là hai thứ App Store 1.2
 * đòi có mặt NGAY trên nội dung, không phải chôn trong Cài đặt.
 */
function usePostMenu(post: FeedPost) {
  const i18n = useI18n();
  const report = useReport();
  const block = useBlock();
  const del = useDeletePost();
  const handle = post.author?.handle ?? '';

  const askReason = () => {
    const send = (reason: ReportReason) =>
      report.mutate(
        { postId: post.id, reason },
        { onSuccess: () => toast.success(i18n.nCmReported), onError: (e: Error) => toast.fail(e) },
      );
    Alert.alert(i18n.nCmReportWhy, undefined, [
      { text: i18n.nCmReasonSpam, onPress: () => send('spam') },
      { text: i18n.nCmReasonHarass, onPress: () => send('harassment') },
      { text: i18n.nCmReasonInappropriate, onPress: () => send('inappropriate') },
      { text: i18n.nCmReasonMisleading, onPress: () => send('misleading') },
      { text: i18n.cancel, style: 'cancel' },
    ]);
  };

  const askBlock = () =>
    Alert.alert(i18n.nCmBlockConfirm.replace('{h}', handle), i18n.nCmBlockBody, [
      { text: i18n.cancel, style: 'cancel' },
      {
        text: i18n.nCmBlock.replace('{h}', handle),
        style: 'destructive',
        onPress: () =>
          post.author &&
          block.mutate(post.author.user_id, {
            onSuccess: () => toast.success(i18n.nCmBlocked),
            onError: (e: Error) => toast.fail(e),
          }),
      },
    ]);

  const askDelete = () =>
    Alert.alert(i18n.nCmDeletePost, i18n.nCmDeletePostBody, [
      { text: i18n.cancel, style: 'cancel' },
      {
        text: i18n.delete,
        style: 'destructive',
        onPress: () =>
          del.mutate(post.id, {
            onSuccess: () => toast.success(i18n.deleted),
            onError: (e: Error) => toast.fail(e),
          }),
      },
    ]);

  return () => {
    Haptics.selectionAsync();
    if (post.mine) {
      askDelete();
      return;
    }
    Alert.alert(post.author?.display_name ?? '', undefined, [
      { text: i18n.nCmReport, onPress: askReason },
      { text: i18n.nCmBlock.replace('{h}', handle), style: 'destructive', onPress: askBlock },
      { text: i18n.cancel, style: 'cancel' },
    ]);
  };
}

const stylesFor = makeStyles((c, m) => ({
  card: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, minHeight: 44 },
  whoText: { flex: 1, minWidth: 0, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { ...type.headline, color: c.foreground, flexShrink: 1 },
  meta: { ...type.footnote, color: c.mutedForeground },
  moreBtn: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  hiddenNote: { ...type.footnote, color: c.readinessRed },
  title: { ...type.title, color: c.foreground },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: -spacing.xs },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { ...type.footnote, color: c.foreground, fontVariant: ['tabular-nums'] },
  /* Mặt lõm cho dữ liệu của thẻ — không phải thẻ lồng thẻ. */
  panel: {
    backgroundColor: m.inset.bg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: m.inset.border,
    paddingHorizontal: spacing.md,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  lineRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: m.inset.border },
  lineName: { ...type.body, color: c.foreground, flex: 1 },
  lineValue: { ...type.body, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  moreText: { ...type.body, color: c.mutedForeground, flex: 1 },
  /* Viền mảnh: ở bản tối `secondary` (#18181b) gần trùng mặt thẻ, và đo trên
     bản dựng viên này trông như chữ trôi giữa thẻ. */
  tryBtn: {
    height: 44,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tryText: { ...type.headline, color: c.foreground },
  caption: { ...type.body, color: c.foreground, lineHeight: 21 },
  actions: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -spacing.sm, marginBottom: -spacing.sm },
  action: { minWidth: 44, height: 44, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { ...type.footnote, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  flex: { flex: 1 },
}));

