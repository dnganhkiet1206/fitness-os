import { Bell, Heart, MessageCircle, UserPlus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { CommunityAvatar } from '@/components/ascnd/community-avatar';
import { EmptyState } from '@/components/ascnd/empty-state';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { Screen } from '@/components/ascnd/screen';
import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { type InboxItem, useInbox, useMarkInboxRead } from '@/hooks/use-community';
import { usePalette } from '@/hooks/use-palette';
import { nav } from '@/lib/nav';
import { timeAgo } from '@/lib/time-ago';

const KIND_ICON = { like: Heart, comment: MessageCircle, follow: UserPlus } as const;

/**
 * Hộp thông báo cộng đồng — issue #13.
 *
 * ── đã đọc: đánh dấu khi MỞ, nhưng chấm vẫn ở lại cho lượt xem này ──
 *
 * Mở màn là đã thấy, nên cả hộp được đánh dấu đã đọc ngay (một RPC, không một
 * lần chạm cho từng dòng). Nhưng nếu chấm "mới" biến mất đúng lúc màn hiện ra
 * thì người ta không kịp biết dòng nào là mới. Nên những dòng chưa đọc LÚC MỞ
 * được giữ trong một ảnh chụp và vẫn mang chấm cho tới khi rời màn.
 *
 * ── chạm vào đâu ──
 *
 * Thích và bình luận mở bài; theo dõi mở hồ sơ người ấy. Dòng gộp lượt thích
 * nói tên người mới nhất và "N người khác", vì một danh sách bốn mươi tên
 * không ai đọc.
 */
export default function CommunityInboxScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const inbox = useInbox();
  const markRead = useMarkInboxRead();

  const [fresh, setFresh] = useState<string[] | null>(null);
  const items = inbox.data;
  useEffect(() => {
    if (!items || fresh !== null) return;
    const unread = items.filter((x) => x.unread).map((x) => x.key);
    setFresh(unread);
    if (unread.length > 0) markRead.mutate();
  }, [items, fresh, markRead]);

  const open = (x: InboxItem) => {
    if (x.kind === 'follow') nav.push({ pathname: '/community-user', params: { id: x.actors[0].user_id } });
    else if (x.postId) nav.push({ pathname: '/community-post', params: { id: x.postId } });
  };

  const sentence = (x: InboxItem) =>
    x.kind === 'follow'
      ? i18n.nNtFollow
      : x.kind === 'comment'
        ? i18n.nNtComment
        : x.count > 1
          ? i18n.nNtLikeMany.replace('{n}', String(x.count - 1))
          : i18n.nNtLike;

  return (
    <Screen back refreshable title={i18n.nNtTitle}>
      {inbox.isError ? (
        <LoadFailed i18n={i18n} onRetry={() => inbox.refetch()} />
      ) : inbox.isPending ? (
        <ActivityIndicator color={c.mutedForeground} style={styles.loading} />
      ) : inbox.data.length === 0 ? (
        <GlassCard>
          <EmptyState icon={Bell} title={i18n.nNtEmpty} hint={i18n.nNtEmptyHint} />
        </GlassCard>
      ) : (
        <GlassCard style={styles.list}>
          {inbox.data.map((x, i) => {
            const name = x.actors[0].display_name;
            const [before, after] = sentence(x).split('{name}');
            const isNew = fresh?.includes(x.key) ?? x.unread;
            const when = timeAgo(x.at, i18n, lang);
            return (
              <PressScale
                key={x.key}
                accessibilityRole="button"
                accessibilityLabel={`${before}${name}${after}, ${when}${isNew ? `, ${i18n.nNtUnread}` : ''}`}
                onPress={() => open(x)}
                style={[styles.row, i > 0 && styles.rowRule]}>
                <View>
                  <CommunityAvatar mascotId={x.actors[0].mascot_id} size={44} />
                  <View style={styles.badge}>
                    <Icon icon={KIND_ICON[x.kind]} size={11} color={c.foreground} />
                  </View>
                </View>
                <View style={styles.body}>
                  <Text style={styles.text} numberOfLines={2}>
                    {before}
                    <Text style={styles.name}>{name}</Text>
                    {after}
                  </Text>
                  <Text style={styles.when}>{when}</Text>
                </View>
                {isNew ? <View style={styles.dot} /> : null}
              </PressScale>
            );
          })}
        </GlassCard>
      )}
    </Screen>
  );
}

const stylesFor = makeStyles((c) => ({
  loading: { marginTop: spacing.xl },
  list: { paddingVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, minHeight: 60 },
  rowRule: { borderTopWidth: 1, borderTopColor: c.border },
  /* Loại việc ở góc avatar: người đứng trước, việc đứng sau. */
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.secondary,
    borderWidth: 2,
    borderColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  text: { ...type.body, color: c.foreground, lineHeight: 21 },
  name: { fontWeight: '600' },
  when: { ...type.footnote, color: c.mutedForeground },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.metricBlue },
}));
