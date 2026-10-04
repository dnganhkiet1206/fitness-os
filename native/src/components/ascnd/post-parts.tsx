import { haptics as Haptics } from '@/lib/haptics';
import { usePathname } from 'expo-router';
import { BadgeCheck, Bookmark, Heart, MessageCircle, MoreHorizontal, Share as ShareIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Alert, Pressable, Share, Text, View } from 'react-native';

import { CommunityAvatar } from '@/components/ascnd/community-avatar';
import { PostArt } from '@/components/ascnd/post-art';
import { PopIcon, RollingCount } from '@/components/ascnd/post-action-motion';
import { GlassCard } from '@/components/ascnd/glass-card';
import { HiddenNotice } from '@/components/ascnd/hidden-notice';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { ZoomLink } from '@/components/ascnd/zoom-link';
import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import {
  type FeedPost,
  type ReportReason,
  useBlock,
  useDeletePost,
  useHidePost,
  useMute,
  useSetCommentsOff,
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
  const openPost = () => nav.push({ pathname: '/community-post', params: { id: post.id } });

  const Body = (
    <GlassCard style={styles.card}>
      <PostHeader post={post} preview={preview} />
      {/* Mọi bài có ảnh của thư viện app (#163) — người dùng không tải ảnh lên. */}
      <PostArt art={post.art} kind={post.kind} />
      {/* Vì sao bị ẩn và yêu cầu xem lại (#26, B) — chỉ trên bài của chính mình. */}
      {post.hidden && post.mine && !preview ? <HiddenNotice postId={post.id} /> : null}
      {children}
      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
      {!preview ? <PostActions post={post} onComment={openPost} shareText={shareText} /> : null}
    </GlassCard>
  );

  if (full || preview) return Body;
  /*
    Mở bài bằng chuyển cảnh zoom gốc của iOS 18 (#216): `ZoomLink` bọc thẻ,
    giữ nguyên hiệu ứng nhấn của `PressScale` và vẫn hỏi chốt bấm dồn (#157)
    như `nav.push`. Cú nhấn của `PressScale` nay đi qua `Slot` của Link —
    không còn `onPress` riêng ở đây. Nút Bình luận (lối của VoiceOver) vẫn
    `nav.push` thường qua `onComment`.
  */
  return (
    <ZoomLink href={{ pathname: '/community-post', params: { id: post.id } }}>
      <PressScale accessible={false}>{Body}</PressScale>
    </ZoomLink>
  );
}

/** Ai · khi nào · (chỉ người theo dõi) · menu. */
function PostHeader({ post, preview }: { post: FeedPost; preview: boolean }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const menu = usePostMenu(post);
  const whoInner = (
    <>
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
    </>
  );
  /* Mở hồ sơ cũng zoom (#216). Không có tác giả thì chỉ là một cụm chữ,
     không phải nút — giữ đúng hành vi cũ (bấm vào không làm gì). */
  const who = post.author ? (
    <ZoomLink href={{ pathname: '/community-user', params: { id: post.author.user_id } }}>
      <Pressable accessibilityRole="button" style={styles.who} hitSlop={4}>
        {whoInner}
      </Pressable>
    </ZoomLink>
  ) : (
    <View style={styles.who}>{whoInner}</View>
  );

  return (
    <View style={styles.head}>
      {who}
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
        toggle
        burst
        /* Rung nhẹ đúng lúc tim nảy — nút này là Pressable trần, không phải
           PressScale, nên không có haptic nào khác để thành rung kép. Chỉ rung
           khi BẬT (thích), bỏ thích thì im như X. */
        onPress={() => {
          if (!post.liked) Haptics.light();
          like.mutate({ postId: post.id, on: !post.liked });
        }}
      />
      <Action icon={MessageCircle} label={i18n.nCmComment} count={post.comment_count} onPress={onComment} />
      <View style={styles.flex} />
      <Action
        icon={Bookmark}
        label={i18n.nCmSave}
        on={post.saved}
        onColor={c.foreground}
        toggle
        onPress={toggleSave}
      />
      <Action
        icon={ShareIcon}
        label={i18n.nCmShare}
        onPress={() => {
          Haptics.selection();
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
  toggle = false,
  burst = false,
}: {
  icon: typeof Heart;
  label: string;
  count?: number;
  on?: boolean;
  onColor?: string;
  onPress: () => void;
  /** Nút bật/tắt (thích, lưu): biểu tượng nảy khi đổi trạng thái (#160). */
  toggle?: boolean;
  /** Vòng sáng khi bật — chỉ trái tim. */
  burst?: boolean;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const color = on && onColor ? onColor : c.mutedForeground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count != null ? `${label} · ${count}` : label}
      accessibilityState={{ selected: on }}
      /* react-native-web không dịch `accessibilityState` ra `aria-selected`
         (cùng lỗi #99 ở week-strip/tab bar): trên web, Thích và Lưu không nói
         mình đang bật hay tắt. Kịch bản #28 bắt ra: bài trong thư viện Đã lưu
         mà nút Lưu đọc ra "chưa chọn". */
      aria-selected={on}
      onPress={onPress}
      style={styles.action}>
      {/* Icon 22 trên ô chạm 44: đủ hiện diện như mockup/X, vẫn chừa viền chạm.
          PopIcon của #160 chỉ scale, không phụ thuộc cỡ gốc. */}
      {toggle ? (
        <PopIcon icon={icon} size={22} color={color} on={on} burst={burst} />
      ) : (
        <Icon icon={icon} size={22} color={color} />
      )}
      {count != null ? (
        /* Số đếm đi theo màu trạng thái như X: tim đã thích thì "86" đỏ cùng
           tim (mockup), chưa thích thì xám. Chỉ nút Thích có cả hai. */
        <RollingCount value={count} style={[styles.actionCount, on && onColor ? { color: onColor } : null]} />
      ) : null}
    </Pressable>
  );
}

/**
 * Menu "…": của mình thì Xoá; của người khác thì Ẩn bài, Tắt tiếng 30 ngày,
 * Báo cáo và Chặn — nhẹ trước, nặng sau.
 *
 * `Alert` của hệ thống chứ không một tấm tự dựng: việc hiếm, nghiêm túc, cần
 * xác nhận — đúng thứ hộp thoại hệ thống làm, và nó tự đọc được bằng
 * VoiceOver.
 */
function usePostMenu(post: FeedPost) {
  const i18n = useI18n();
  const report = useReport();
  const block = useBlock();
  const hide = useHidePost();
  const mute = useMute();
  const del = useDeletePost();
  const commentsOff = useSetCommentsOff();
  const handle = post.author?.handle ?? '';

  const doMute = () =>
    post.author &&
    mute.mutate(post.author.user_id, {
      onSuccess: () => toast.success(i18n.nPgMuted.replace('{h}', handle)),
      onError: (e: Error) => toast.fail(e),
    });

  /* Sau báo cáo bài đã biến khỏi bảng tin của người báo cáo (server ẩn riêng).
     Bước tiếp theo người ta thường cần là không thấy NGƯỜI ấy nữa — mời ngay
     lúc đó, vì báo cáo của một tài khoản chưa đủ điều kiện không tính vào
     ngưỡng tự ẩn (#6), và đây là phần chắc chắn có tác dụng. */
  const afterReport = () =>
    Alert.alert(i18n.nPgReportedNext, i18n.nPgReportedNextBody.replace('{h}', handle), [
      { text: i18n.nPgMute.replace('{h}', handle), onPress: doMute },
      { text: i18n.nCmBlock.replace('{h}', handle), style: 'destructive', onPress: askBlock },
      { text: i18n.nPgReportedOk, style: 'cancel' },
    ]);

  const askReason = () => {
    const send = (reason: ReportReason) =>
      report.mutate({ postId: post.id, reason }, { onSuccess: afterReport, onError: (e: Error) => toast.fail(e) });
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
    Haptics.selection();
    if (post.mine) {
      const off = !post.commentsOff;
      Alert.alert(i18n.nPgMyPost, undefined, [
        {
          text: off ? i18n.nPgCommentsTurnOff : i18n.nPgCommentsTurnOn,
          onPress: () =>
            commentsOff.mutate(
              { postId: post.id, off },
              {
                onSuccess: () => toast.success(off ? i18n.nPgCommentsOffDone : i18n.nPgCommentsOnDone),
                onError: (e: Error) => toast.fail(e),
              },
            ),
        },
        { text: i18n.nCmDeletePost, style: 'destructive', onPress: askDelete },
        { text: i18n.cancel, style: 'cancel' },
      ]);
      return;
    }
    Alert.alert(post.author?.display_name ?? '', undefined, [
      {
        text: i18n.nPgHidePost,
        onPress: () =>
          hide.mutate(post.id, { onSuccess: () => toast.success(i18n.nPgPostHidden), onError: (e: Error) => toast.fail(e) }),
      },
      { text: i18n.nPgMute.replace('{h}', handle), onPress: doMute },
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
  /* Tên 17 + meta 13: 2px đủ thở, 1px dính vào nhau ở cỡ này. */
  whoText: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { ...type.headline, color: c.foreground, flexShrink: 1 },
  meta: { ...type.footnote, color: c.mutedForeground },
  moreBtn: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  caption: { ...type.body, color: c.foreground, lineHeight: 21 },
  actions: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -spacing.sm, marginBottom: -spacing.sm },
  /* Số đếm thuộc về icon: 4px như X, không phải 6px tách rời. */
  action: { minWidth: 44, height: 44, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionCount: { ...type.footnote, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  flex: { flex: 1 },
}));
