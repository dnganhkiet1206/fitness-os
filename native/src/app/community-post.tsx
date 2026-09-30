import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { MessageCircle, SendHorizontal, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HiddenNotice } from '@/components/ascnd/hidden-notice';
import { CommunityAvatar } from '@/components/ascnd/community-avatar';
import { EmptyState } from '@/components/ascnd/empty-state';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { Screen } from '@/components/ascnd/screen';
import { PostCard } from '@/components/ascnd/post-card';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import {
  type CommunityComment,
  useAddComment,
  useComments,
  useCommunityPost,
  useDeleteComment,
  useMyCommunityProfile,
  useReport,
} from '@/hooks/use-community';
import { usePalette } from '@/hooks/use-palette';
import { mentionParts, replyPrefix, threadComments } from '@/lib/comment-thread';
import { fillCopy } from '@/lib/copy-fill';
import { nav } from '@/lib/nav';
import { timeAgo } from '@/lib/time-ago';
import { toast } from '@/lib/toast';

/**
 * Một bài, đầy đủ, và bình luận của nó.
 *
 * Thẻ ở đây là CÙNG thẻ của feed với `full` — mọi bài tập hiện hết thay vì ba.
 * Bình luận xếp cũ trước mới sau, như một cuộc trò chuyện đọc từ trên xuống.
 *
 * Thanh viết ở ĐÁY, ngoài vùng cuộn, nên trang tự bọc `KeyboardAvoidingView`
 * (`tools/keyboard.mjs`): `Screen` cố ý không né bàn phím với lý do "mọi ô
 * nhập nằm gần đầu trang", và ô này thì không.
 *
 * Chưa có hồ sơ cộng đồng thì không viết được (bình luận cần một cái tên để
 * gắn vào): thanh viết thành một lời mời tạo hồ sơ.
 */
export default function CommunityPostScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const post = useCommunityPost(id);
  const comments = useComments(id);
  const me = useMyCommunityProfile();
  const add = useAddComment(id ?? '');
  const [draft, setDraft] = useState('');
  /* Đang trả lời ai (#30). Gửi `parentId` của CHÍNH bình luận được bấm — server
     gắn nó vào gốc nếu đó là một câu trả lời. */
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);
  const input = useRef<TextInput>(null);

  const startReply = (cm: CommunityComment) => {
    Haptics.selectionAsync();
    setReplyTo(cm);
    /* Như X: người được trả lời đọc thấy tên mình ở đầu câu. Không chèn lại
       nếu người ta đã tự gõ. */
    const prefix = replyPrefix(cm.author?.handle);
    setDraft((d) => (d.trim() ? d : prefix));
    input.current?.focus();
  };

  const send = () => {
    const body = draft.trim();
    if (!body || add.isPending) return;
    add.mutate(
      { body, parentId: replyTo?.id ?? null },
      {
        onSuccess: () => {
          setDraft('');
          setReplyTo(null);
        },
        onError: (e: Error) => toast.fail(e),
      },
    );
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen back title={i18n.nCmPostTitle} refreshable>
        {post.isError ? (
          <LoadFailed i18n={i18n} onRetry={() => post.refetch()} />
        ) : post.isPending ? (
          <ActivityIndicator color={c.mutedForeground} style={styles.loading} />
        ) : !post.data ? (
          <GlassCard>
            <EmptyState icon={MessageCircle} title={i18n.nCmPostGone} />
          </GlassCard>
        ) : (
          <>
            <PostCard post={post.data} full />
            <View style={styles.comments}>
              {comments.isError ? (
                <LoadFailed i18n={i18n} onRetry={() => comments.refetch()} />
              ) : comments.isPending ? (
                <ActivityIndicator color={c.mutedForeground} />
              ) : (comments.data ?? []).length === 0 ? (
                <Text style={styles.none}>{i18n.nCmCommentsEmpty}</Text>
              ) : (
                /* Một tầng (#30): gốc theo thứ tự đến, câu trả lời lùi vào dưới gốc. */
                threadComments(comments.data ?? []).map(({ root, replies }) => (
                  <View key={root.id} style={styles.thread}>
                    <CommentRow comment={root} postMine={post.data!.mine} postId={post.data!.id} onReply={me.data ? startReply : undefined} />
                    {replies.length ? (
                      <View style={styles.replies}>
                        {replies.map((r) => (
                          <CommentRow key={r.id} comment={r} postMine={post.data!.mine} postId={post.data!.id} onReply={me.data ? startReply : undefined} reply />
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </Screen>

      {post.data ? (
        <View style={[styles.barWrap, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          {me.data && replyTo ? (
            <View style={styles.replying}>
              <Text style={styles.replyingText} numberOfLines={1}>
                {fillCopy(i18n.nCmReplyingTo, { name: replyTo.author?.display_name ?? '—' })}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={i18n.nCmReplyCancel}
                hitSlop={10}
                onPress={() => {
                  /* Bỏ trả lời thì bỏ luôn tên điền sẵn — nếu người ta chưa gõ thêm gì. */
                  setDraft((d) => (d === replyPrefix(replyTo.author?.handle) ? '' : d));
                  setReplyTo(null);
                }}>
                <Icon icon={X} size={16} color={c.mutedForeground} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.bar}>
          {me.data ? (
            <>
              <CommunityAvatar mascotId={me.data.mascot_id} size={32} />
              <TextInput
                ref={input}
                value={draft}
                onChangeText={setDraft}
                placeholder={i18n.nCmCommentPlaceholder}
                placeholderTextColor={c.mutedForeground}
                style={styles.input}
                maxLength={500}
                multiline
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={i18n.nCmSend}
                onPress={send}
                disabled={!draft.trim() || add.isPending}
                style={styles.sendBtn}>
                <Icon
                  icon={SendHorizontal}
                  size={20}
                  color={draft.trim() ? c.foreground : c.mutedForeground}
                />
              </Pressable>
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => nav.push('/community-profile')}
              style={styles.setup}>
              <Text style={styles.setupText}>{i18n.nCmSetupTitle}</Text>
            </Pressable>
          )}
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function CommentRow({
  comment,
  postMine,
  postId,
  onReply,
  reply = false,
}: {
  comment: CommunityComment;
  postMine: boolean;
  postId: string;
  /** Không có khi chưa có hồ sơ cộng đồng — trả lời cần một cái tên. */
  onReply?: (c: CommunityComment) => void;
  /** Câu trả lời: avatar nhỏ hơn, lùi vào dưới gốc. */
  reply?: boolean;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const del = useDeleteComment(postId);
  const report = useReport();

  /* Người viết và chủ bài xoá được (đúng như policy DELETE); người khác chỉ
     báo cáo được. Nhấn giữ, vì một bình luận không đáng một nút "…" riêng. */
  const menu = () => {
    Haptics.selectionAsync();
    const canDelete = comment.mine || postMine;
    Alert.alert(comment.author?.display_name ?? '', undefined, [
      canDelete
        ? {
            text: i18n.nCmDeleteComment,
            style: 'destructive',
            onPress: () => del.mutate(comment.id, { onError: (e: Error) => toast.fail(e) }),
          }
        : {
            text: i18n.nCmReport,
            onPress: () =>
              report.mutate(
                { commentId: comment.id, reason: 'inappropriate' },
                { onSuccess: () => toast.success(i18n.nCmReported), onError: (e: Error) => toast.fail(e) },
              ),
          },
      { text: i18n.cancel, style: 'cancel' },
    ]);
  };

  return (
    /* Hai vùng chạm CẠNH nhau, không lồng: avatar mở hồ sơ, thân bình luận
       nhấn giữ ra menu. Một nút trong một nút thì VoiceOver chỉ thấy một. */
    <View style={styles.comment}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={comment.author?.display_name}
        onPress={() => comment.author && nav.push({ pathname: '/community-user', params: { id: comment.author.user_id } })}>
        <CommunityAvatar mascotId={comment.author?.mascot_id} size={reply ? 24 : 32} />
      </Pressable>
      {/* Menu nhấn giữ cũng là một hành động TRỢ NĂNG (#135): gợi ý chỉ NÓI
          có menu, còn rotor "Hành động" mới là chỗ VoiceOver mở được nó. */}
      {/* Thân và nút "Trả lời" là ANH EM trong một cột, không lồng: nút trong
          vùng nhấn giữ thì VoiceOver chỉ thấy một (#120). */}
      <View style={styles.commentBody}>
      <Pressable
        onLongPress={menu}
        accessibilityHint={i18n.nCmMore}
        accessibilityActions={[{ name: 'menu', label: i18n.nCmMore }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'menu') menu();
        }}
        style={styles.commentMain}>
        <Text style={styles.commentHead}>
          <Text style={styles.commentName}>{comment.author?.display_name ?? '—'}</Text>
          {'  '}
          <Text style={styles.commentTime}>{timeAgo(comment.created_at, i18n, lang)}</Text>
        </Text>
        {/* `@handle` là liên kết CHỈ khi server đã xác nhận đó là một người
            (bảng mentions, #30) — chuỗi trông giống handle mà không phải thì
            vẫn là chữ. */}
        <Text style={styles.commentText}>
          {mentionParts(comment.body, new Map(comment.mentions)).map((part, i) =>
            part.userId ? (
              <Text
                key={i}
                accessibilityRole="link"
                style={styles.mention}
                onPress={() => nav.push({ pathname: '/community-user', params: { id: part.userId! } })}>
                {part.text}
              </Text>
            ) : (
              <Text key={i}>{part.text}</Text>
            ),
          )}
        </Text>
      </Pressable>
      {/* Bình luận của chính mình đang bị ẩn (#26): vì sao, và xem lại. Anh em
          với vùng nhấn giữ, không nằm trong nó — một nút trong một nút (#120). */}
      {comment.hidden && comment.mine ? <HiddenNotice commentId={comment.id} compact /> : null}
      {onReply ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fillCopy(i18n.nCmReplyTo, { name: comment.author?.display_name ?? '—' })}
          hitSlop={8}
          onPress={() => onReply(comment)}
          style={styles.replyBtn}>
          <Text style={styles.replyBtnText}>{i18n.nCmReply}</Text>
        </Pressable>
      ) : null}
      </View>
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.background },
  loading: { marginTop: spacing.xl },
  comments: { gap: spacing.md, paddingBottom: spacing.lg },
  thread: { gap: spacing.sm + 4 },
  /* Lùi đúng bằng avatar gốc + khoảng cách — câu trả lời thẳng cột với THÂN
     của gốc, như Instagram. */
  replies: { gap: spacing.sm + 4, paddingLeft: 32 + spacing.sm + 4 },
  none: { ...type.footnote, color: c.mutedForeground, textAlign: 'center', paddingVertical: spacing.md },
  comment: { flexDirection: 'row', gap: spacing.sm + 4, alignItems: 'flex-start' },
  commentBody: { flex: 1, minWidth: 0, gap: 4 },
  commentMain: { gap: 2 },
  replyBtn: { alignSelf: 'flex-start', paddingVertical: 2 },
  replyBtnText: { ...type.footnote, fontWeight: '600', color: c.mutedForeground },
  mention: { color: c.metricBlue, fontWeight: '600' },
  commentHead: { ...type.footnote },
  commentName: { ...type.footnote, fontWeight: '600', color: c.foreground },
  commentTime: { ...type.footnote, color: c.mutedForeground },
  commentText: { ...type.body, color: c.foreground, lineHeight: 21 },
  barWrap: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.xs + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    backgroundColor: c.background,
  },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  replying: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: 32 + spacing.sm },
  replyingText: { ...type.footnote, color: c.mutedForeground, flex: 1 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    ...type.body,
    color: c.foreground,
    backgroundColor: c.secondary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 10,
  },
  sendBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  setup: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  setupText: { ...type.headline, color: c.foreground },
}));
