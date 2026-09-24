import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { BadgeCheck, MoreHorizontal, UserRound } from 'lucide-react-native';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { CommunityAvatar } from '@/components/ascnd/community-avatar';
import { EmptyState } from '@/components/ascnd/empty-state';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { Screen } from '@/components/ascnd/screen';
import { PostCard } from '@/components/ascnd/post-card';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { useBlock, useCommunityUser, useCommunityUserPosts, useFollow, useReport } from '@/hooks/use-community';
import { usePalette } from '@/hooks/use-palette';
import { nav } from '@/lib/nav';
import { toast } from '@/lib/toast';

/**
 * Hồ sơ cộng đồng của một người: ai, bao nhiêu người theo dõi, và những bài
 * họ đã chia sẻ.
 *
 * Chỉ có những gì người ấy CHỦ ĐỘNG đưa lên — tên, giới thiệu, linh vật, các
 * bài. Không một con số nào đọc từ dữ liệu sức khoẻ riêng của họ (concept mục
 * 11: "không nên mặc định công khai mọi dữ liệu").
 *
 * Nút chính là Theo dõi với người khác, Sửa hồ sơ với chính mình. "Đang theo
 * dõi" là trạng thái đã bật nên nó chuyển sang viên trầm: một nút đặc mời làm
 * lại việc đã làm là một lời nói sai.
 */
export default function CommunityUserScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const user = useCommunityUser(id);
  const posts = useCommunityUserPosts(id);
  const follow = useFollow();
  const report = useReport();
  const block = useBlock();

  const u = user.data;
  const p = u?.profile;

  const menu = () => {
    if (!p) return;
    Haptics.selectionAsync();
    Alert.alert(p.display_name, undefined, [
      {
        text: i18n.nCmReport,
        onPress: () =>
          report.mutate(
            { userId: p.user_id, reason: 'inappropriate' },
            { onSuccess: () => toast.success(i18n.nCmReported), onError: (e: Error) => toast.fail(e) },
          ),
      },
      {
        text: i18n.nCmBlock.replace('{h}', p.handle),
        style: 'destructive',
        onPress: () =>
          Alert.alert(i18n.nCmBlockConfirm.replace('{h}', p.handle), i18n.nCmBlockBody, [
            { text: i18n.cancel, style: 'cancel' },
            {
              text: i18n.nCmBlock.replace('{h}', p.handle),
              style: 'destructive',
              onPress: () =>
                block.mutate(p.user_id, {
                  onSuccess: () => {
                    toast.success(i18n.nCmBlocked);
                    nav.back();
                  },
                  onError: (e: Error) => toast.fail(e),
                }),
            },
          ]),
      },
      { text: i18n.cancel, style: 'cancel' },
    ]);
  };

  return (
    <Screen
      back
      refreshable
      title={p ? `@${p.handle}` : i18n.nCmProfileTitle}
      headerRight={
        p && !u?.isMe ? (
          <Pressable accessibilityRole="button" accessibilityLabel={i18n.nCmMore} onPress={menu} hitSlop={10} style={styles.headerBtn}>
            <Icon icon={MoreHorizontal} size={22} color={c.foreground} />
          </Pressable>
        ) : undefined
      }>
      {user.isError ? (
        <LoadFailed i18n={i18n} onRetry={() => user.refetch()} />
      ) : user.isPending ? (
        <ActivityIndicator color={c.mutedForeground} style={styles.loading} />
      ) : !p ? (
        <GlassCard>
          <EmptyState icon={UserRound} title={i18n.nCmUserGone} />
        </GlassCard>
      ) : (
        <>
          <View style={styles.hero}>
            <CommunityAvatar mascotId={p.mascot_id} size={88} />
            <View style={styles.nameRow}>
              <Text style={styles.name}>{p.display_name}</Text>
              {p.is_official ? (
                <View accessible accessibilityLabel={i18n.nCmVerified}>
                  <Icon icon={BadgeCheck} size={20} color={c.metricBlue} />
                </View>
              ) : null}
            </View>
            {p.bio ? <Text style={styles.bio}>{p.bio}</Text> : null}
            <View style={styles.counts}>
              <Count n={u!.followers} label={i18n.nCmFollowers} />
              <Count n={u!.following} label={i18n.nCmFollowing} />
            </View>
          </View>

          {u!.isMe ? (
            <PressScale accessibilityRole="button" onPress={() => nav.push('/community-profile')} style={styles.quietBtn}>
              <Text style={styles.quietText}>{i18n.nCmEditProfile}</Text>
            </PressScale>
          ) : (
            <PressScale
              accessibilityRole="button"
              accessibilityState={{ selected: u!.iFollow }}
              disabled={follow.isPending}
              onPress={() => follow.mutate({ userId: p.user_id, on: !u!.iFollow }, { onError: (e: Error) => toast.fail(e) })}
              style={u!.iFollow ? styles.quietBtn : styles.solidBtn}>
              <Text style={u!.iFollow ? styles.quietText : styles.solidText}>
                {u!.iFollow ? i18n.nCmFollowing : i18n.nCmFollow}
              </Text>
            </PressScale>
          )}

          {posts.isError ? (
            <LoadFailed i18n={i18n} onRetry={() => posts.refetch()} />
          ) : posts.isPending ? (
            <ActivityIndicator color={c.mutedForeground} />
          ) : (posts.data ?? []).length === 0 ? (
            <Text style={styles.none}>{i18n.nCmEmptyDiscover}</Text>
          ) : (
            (posts.data ?? []).map((post) => <PostCard key={post.id} post={post} />)
          )}
        </>
      )}
    </Screen>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <View style={styles.count}>
      <Text style={styles.countN}>{n}</Text>
      <Text style={styles.countL}>{label}</Text>
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  loading: { marginTop: spacing.xl },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...type.title, color: c.foreground },
  bio: { ...type.body, color: c.mutedForeground, textAlign: 'center', paddingHorizontal: spacing.lg },
  counts: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.xs },
  count: { alignItems: 'center' },
  countN: { ...type.headline, color: c.foreground, fontVariant: ['tabular-nums'] },
  countL: { ...type.footnote, color: c.mutedForeground },
  solidBtn: { height: 44, borderRadius: radius.full, backgroundColor: m.actionSurface, alignItems: 'center', justifyContent: 'center' },
  solidText: { ...type.headline, color: c.primaryForeground },
  quietBtn: { height: 44, borderRadius: radius.full, backgroundColor: c.secondary, alignItems: 'center', justifyContent: 'center' },
  quietText: { ...type.headline, color: c.foreground },
  none: { ...type.footnote, color: c.mutedForeground, textAlign: 'center', paddingVertical: spacing.md },
}));
