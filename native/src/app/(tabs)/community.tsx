import { Bell, Compass, UserRound, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { CommunityAvatar } from '@/components/ascnd/community-avatar';
import { EmptyState } from '@/components/ascnd/empty-state';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { Screen } from '@/components/ascnd/screen';
import { Segmented, SegmentPanel } from '@/components/ascnd/segmented';
import { ChallengeHero } from '@/components/ascnd/challenge-hero';
import { SkeletonBlock } from '@/components/ascnd/skeleton';
import { PostCard } from '@/components/ascnd/post-card';
import { PAGE_TINT, radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { type CommunityTab, useChallenges, useCommunityFeed, useInbox, useMyCommunityProfile } from '@/hooks/use-community';
import { usePalette } from '@/hooks/use-palette';
import { nav } from '@/lib/nav';

/**
 * Cộng đồng — giai đoạn 1: nền móng + bài Workout.
 *
 * ── từ vỏ thành trang ──
 *
 * Bản trước là một VỎ nói "Sắp ra mắt", vì chưa có bảng nào cho phép đọc chéo
 * người dùng. Chủ dự án (24/09) đưa concept đầy đủ và chọn làm nền móng + bài
 * Workout trước; schema, quyền và bộ test chạy thật nằm ở
 * `supabase/migrations/20260927120000_community_foundation.sql` và
 * `supabase/tests/community/`.
 *
 * ── thứ tự trên trang ──
 *
 *   Đang theo dõi | Khám phá   hai feed, như concept mục 2. Mặc định Khám
 *                              phá: một tài khoản mới chưa theo dõi ai, và mở
 *                              tab ra thấy một trang trống là lời chào tệ nhất.
 *   tạo hồ sơ / chia sẻ        một hàng. Chưa có hồ sơ thì nó mời tạo; có rồi
 *                              thì nó là lối chia sẻ buổi tập — vòng lặp Train →
 *                              Share của concept bắt đầu ngay đầu feed.
 *   các bài                    thẻ Workout, mới nhất trước.
 *
 * Chưa có (và cố ý chưa vẽ): tìm kiếm, thông báo, thử thách cộng đồng, bài
 * Progress và Recipe. Một nút kính lúp không làm gì là một lời hứa sai — chúng
 * xuất hiện khi giai đoạn của chúng có dữ liệu thật đằng sau.
 */
export default function CommunityScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const [tab, setTab] = useState<CommunityTab>('discover');
  const me = useMyCommunityProfile();
  const feed = useCommunityFeed(tab);
  const challenges = useChallenges();
  const inbox = useInbox();
  const hasNew = !!inbox.data?.some((x) => x.unread);

  const tabs = [
    { key: 'following' as const, label: i18n.nCmFollowing, icon: Users },
    { key: 'discover' as const, label: i18n.nCmDiscover, icon: Compass },
  ];

  return (
    <Screen
      refreshable
      title={i18n.nCommunityTitle}
      aura={PAGE_TINT.community}
      headerRight={
        me.data ? (
          /* Chuông trước avatar: thông báo chỉ đến với người đã có hồ sơ (bài
             và lượt theo dõi đều trỏ vào hồ sơ), nên hai nút đi cùng nhau. */
          <View style={styles.headerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={hasNew ? i18n.nNtOpenNew : i18n.nNtTitle}
              hitSlop={6}
              onPress={() => nav.push('/community-inbox')}
              style={styles.bell}>
              <Icon icon={Bell} size={22} color={c.foreground} />
              {hasNew ? <View style={styles.bellDot} /> : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={me.data.display_name}
              hitSlop={6}
              onPress={() => nav.push({ pathname: '/community-user', params: { id: me.data!.user_id } })}>
              <CommunityAvatar mascotId={me.data.mascot_id} size={34} />
            </Pressable>
          </View>
        ) : undefined
      }>
      <Segmented variant="capsule" value={tab} onChange={setTab} options={tabs} />

      {/* Thử thách nổi bật (#9) ngay dưới dải segment, như mockup màn 1 — chỉ
          ở Khám phá: "Đang theo dõi" là bài của những người mình chọn, không
          phải chỗ cho một lời mời chung. Đọc hỏng thì im lặng; feed có thẻ
          thử lại của nó. */}
      {tab === 'discover' && challenges.data ? <ChallengeHero items={challenges.data} /> : null}

      {/* Đang tải hay đọc HỎNG thì không nói gì — mời "Tạo hồ sơ" khi truy vấn
          hồ sơ chỉ đơn giản là chưa về là nói sai về một người đã có hồ sơ,
          rồi mời họ tạo lại (và tên người dùng của chính họ sẽ báo "đã có
          người dùng"). Lỗi của feed bên dưới đã có thẻ thử lại của nó. */}
      {me.isPending || me.isError ? null : !me.data ? (
        <GlassCard style={styles.setup}>
          <Text style={styles.setupTitle}>{i18n.nCmSetupTitle}</Text>
          <Text style={styles.setupHint}>{i18n.nCmSetupHint}</Text>
          <PressScale accessibilityRole="button" onPress={() => nav.push('/community-profile')} style={styles.setupBtn}>
            <Text style={styles.setupBtnText}>{i18n.nCmSetupCta}</Text>
          </PressScale>
        </GlassCard>
      ) : (
        /* Chia sẻ GÌ: mỗi loại bài một màn riêng. Hộp thoại hệ thống vì đây là
           một lựa chọn ngắn giữa vài thứ: Buổi tập (A) · Tiến trình (#8) ·
           Công thức (#7). */
        <PressScale
          accessibilityRole="button"
          onPress={() =>
            Alert.alert(i18n.nPgAsk, undefined, [
              { text: i18n.nPgAskWorkout, onPress: () => nav.push('/community-share') },
              { text: i18n.nPgAskProgress, onPress: () => nav.push('/community-share-progress') },
              { text: i18n.nRcAsk, onPress: () => nav.push('/community-share-recipe') },
              { text: i18n.cancel, style: 'cancel' },
            ])
          }>
          <GlassCard style={styles.composer}>
            <CommunityAvatar mascotId={me.data.mascot_id} size={36} />
            <Text style={styles.composerText}>{i18n.nCmComposer}</Text>
          </GlassCard>
        </PressScale>
      )}

      <SegmentPanel segment={tab}>
        {feed.isError ? (
          <LoadFailed i18n={i18n} onRetry={() => feed.refetch()} />
        ) : feed.isPending ? (
          <>
            <SkeletonBlock height={320} />
            <SkeletonBlock height={320} />
          </>
        ) : (feed.data ?? []).length === 0 ? (
          <GlassCard>
            {tab === 'following' ? (
              <EmptyState
                icon={Users}
                title={i18n.nCmEmptyFollowing}
                hint={i18n.nCmEmptyFollowingHint}
                action={{ label: i18n.nCmOpenDiscover, onPress: () => setTab('discover') }}
              />
            ) : (
              <EmptyState icon={UserRound} title={i18n.nCmEmptyDiscover} hint={i18n.nCmEmptyDiscoverHint} />
            )}
          </GlassCard>
        ) : (
          <View style={styles.list}>
            {(feed.data ?? []).map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </View>
        )}
      </SegmentPanel>
    </Screen>
  );
}

const stylesFor = makeStyles((c, m) => ({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  /* 34 + hitSlop 6 = 46, cùng cỡ vùng chạm với avatar bên cạnh. */
  bell: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  bellDot: {
    position: 'absolute',
    top: 5,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.metricBlue,
  },
  setup: { gap: spacing.sm },
  setupTitle: { ...type.title2, color: c.foreground },
  setupHint: { ...type.body, color: c.mutedForeground, lineHeight: 21 },
  setupBtn: {
    marginTop: spacing.xs,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: m.actionSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupBtnText: { ...type.headline, color: c.primaryForeground },
  composer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm + 4 },
  composerText: { ...type.body, color: c.mutedForeground, flex: 1 },
  list: { gap: spacing.stack },
}));
