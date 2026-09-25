import * as Haptics from 'expo-haptics';
import { usePathname } from 'expo-router';
import { BadgeCheck, Bookmark, Heart, MessageCircle, MoreHorizontal, Share2 } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Alert, Pressable, Share, Text, View } from 'react-native';

import { CommunityAvatar } from '@/components/ascnd/community-avatar';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { spacing, type } from '@/constants/ascnd';
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
} from '@/hooks/use-community';
import { usePalette } from '@/hooks/use-palette';
import { nav } from '@/lib/nav';
import { timeAgo } from '@/lib/time-ago';
import { showToast, toast } from '@/lib/toast';

/**
 * Khung CHUNG của mọi loại bài: Workout, Progress, Recipe.
 *
 * ── vì sao tách ra ──
 *
 * Giai đoạn 2 có hai người dựng hai loại thẻ song song (issue #6). Đầu thẻ,
 * menu Báo cáo/Chặn/Xoá và hàng Thích/Bình luận/Lưu/Chia sẻ là thứ PHẢI giống
 * hệt nhau ở mọi loại bài: menu an toàn là thứ App Store 1.2 đòi có mặt trên
 * MỌI nội dung người dùng tạo, và ba bản chép sẽ trôi khỏi nhau ở lần sửa đầu
 * tiên. Một thẻ mới chỉ vẽ phần THÂN của nó và nói nội dung khi chia sẻ ra
 * ngoài; mọi thứ còn lại ở đây.
 *
 * ── vùng chạm cả thẻ ──
 *
 * Chạm khoảng trống của thẻ mở bài, nhưng với VoiceOver đó là vùng nuốt chạm
 * (`accessible={false}`) chứ không phải một nút bọc quanh các nút bên trong
 * (`tools/a11y-swallow.mjs`). Lối mở bài cho trình đọc màn hình là nút Bình
 * luận.
 */
export function PostShell({
  post,
  full = false,
  preview = false,
  shareText,
  children,
}: {
  post: FeedPost;
  full?: boolean;
  /** Màn chia sẻ: đúng cái thẻ sẽ được đăng, chưa có gì để thích/lưu/báo cáo. */
  preview?: boolean;
  /** Nội dung gửi ra Messages/Instagram… khi bấm Chia sẻ. */
  shareText: () => string;
  children: ReactNode;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const openPost = () => nav.push({ pathname: '/community-post', params: { id: post.id } });

  const Body = (
    <GlassCard style={styles.card}>
      <PostHeader post={post} preview={preview} />
      {post.hidden && post.mine ? <Text style={styles.hiddenNote}>{i18n.nCmHiddenNotice}</Text> : null}
      {children}
      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
      {!preview ? <PostActions post={post} onComment={openPost} shareText={shareText} /> : null}
    </GlassCard>
  );

  if (full || preview) return Body;
  return (
    <PressScale accessible={false} onPress={openPost}>
      {Body}
    </PressScale>
  );
}

/** Ai · khi nào · (chỉ người theo dõi) · menu. */
function PostHeader({ post, preview }: { post: FeedPost; preview: boolean }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const menu = usePostMenu(post);
  const openAuthor = () => post.author && nav.push({ pathname: '/community-user', params: { id: post.author.user_id } });

  return (
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
          {/* Hai dòng: giờ đăng · "Chỉ người theo dõi" là HAI câu của app, và ở 320
              chữ ×1.3 một dòng cắt mất đúng câu nói ai xem được bài (#63, lượt
              quét hẹp). */}
          <Text style={styles.meta} numberOfLines={2}>
            {timeAgo(post.created_at, i18n, lang)}
            {post.visibility === 'followers' ? ` · ${i18n.nCmFollowersOnly}` : ''}
          </Text>
        </View>
      </Pressable>
      {!preview ? (
        <Pressable accessibilityRole="button" accessibilityLabel={i18n.nCmMore} onPress={menu} hitSlop={10} style={styles.moreBtn}>
          <Icon icon={MoreHorizontal} size={20} color={c.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Thích · bình luận · (khoảng trống) · lưu · chia sẻ. */
function PostActions({ post, onComment, shareText }: { post: FeedPost; onComment: () => void; shareText: () => string }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const like = useToggleLike();
  const save = useToggleSave();
  const path = usePathname();
  /*
    Lưu xong thì NÓI nó đi đâu (#10, B — chủ dự án cho B sửa đúng điểm này ở
    #23): "Đã lưu" kèm nút "Xem thư viện". Không có đường dẫn ấy thì thư viện
    là một màn người ta không bao giờ biết là có. Chỉ khi LƯU, không khi bỏ
    lưu; và không kèm nút khi đang ở chính thư viện — nút dẫn về chỗ đang
    đứng là một nút thừa.
  */
  const toggleSave = () => {
    const on = !post.saved;
    save.mutate(
      { postId: post.id, on },
      {
        onSuccess: () => {
          if (!on) return;
          if (path === '/community-saved') toast.success(i18n.nSvSaved);
          else showToast('success', i18n.nSvSaved, undefined, { label: i18n.nSvOpen, run: () => nav.push('/community-saved') });
        },
      },
    );
  };
  return (
    <View style={styles.actions}>
      <Action
        icon={Heart}
        label={i18n.nCmLike}
        count={post.like_count}
        on={post.liked}
        onColor={c.readinessRed}
        onPress={() => like.mutate({ postId: post.id, on: !post.liked })}
      />
      <Action icon={MessageCircle} label={i18n.nCmComment} count={post.comment_count} onPress={onComment} />
      <View style={styles.flex} />
      <Action
        icon={Bookmark}
        label={i18n.nCmSave}
        on={post.saved}
        onColor={c.foreground}
        onPress={toggleSave}
      />
      <Action
        icon={Share2}
        label={i18n.nCmShare}
        onPress={() => {
          Haptics.selectionAsync();
          Share.share({ message: shareText() });
        }}
      />
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
 * `Alert` của hệ thống chứ không một tấm tự dựng: việc hiếm, nghiêm túc, cần
 * xác nhận — đúng thứ hộp thoại hệ thống làm, và nó tự đọc được bằng
 * VoiceOver.
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

const stylesFor = makeStyles((c) => ({
  card: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, minHeight: 44 },
  whoText: { flex: 1, minWidth: 0, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { ...type.headline, color: c.foreground, flexShrink: 1 },
  meta: { ...type.footnote, color: c.mutedForeground },
  moreBtn: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  hiddenNote: { ...type.footnote, color: c.readinessRed },
  caption: { ...type.body, color: c.foreground, lineHeight: 21 },
  actions: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -spacing.sm, marginBottom: -spacing.sm },
  action: { minWidth: 44, height: 44, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { ...type.footnote, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  flex: { flex: 1 },
}));
