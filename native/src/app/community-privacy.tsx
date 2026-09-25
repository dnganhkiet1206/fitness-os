import { ActivityIndicator, Alert, Text, View } from 'react-native';

import { CommunityAvatar } from '@/components/ascnd/community-avatar';
import { GlassCard } from '@/components/ascnd/glass-card';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { Screen } from '@/components/ascnd/screen';
import { Segmented } from '@/components/ascnd/segmented';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import {
  type BlockedUser,
  useBlockedUsers,
  useCommunitySettings,
  useDeleteAllMyPosts,
  useSetDefaultVisibility,
  useUnblock,
} from '@/hooks/use-community';
import { usePalette } from '@/hooks/use-palette';
import { getLocale } from '@/lib/i18n';
import { toast } from '@/lib/toast';

/**
 * Quyền riêng tư cộng đồng — issue #11.
 *
 * Ba việc, theo thứ tự người ta hay cần:
 *
 *   Mặc định khi đăng   giá trị sẵn ở MỌI màn chia sẻ; lúc đăng vẫn đổi được.
 *                       Lưu ở bảng riêng chỉ chủ nhân đọc — không phải trên hồ
 *                       sơ, thứ cả cộng đồng đọc được.
 *   Đã chặn             chặn có ở menu mọi bài (App Store 1.2), nhưng trước
 *                       màn này không có chỗ nào để BỎ chặn: chặn nhầm là
 *                       vĩnh viễn. Bỏ chặn không tự theo dõi lại — trigger
 *                       chặn đã gỡ quan hệ ấy và không ai nên bị theo dõi lại
 *                       mà không tự bấm.
 *   Xoá mọi bài         hai lần hỏi, vì không hoàn tác được. Hồ sơ giữ nguyên:
 *                       xoá hồ sơ là việc của xoá tài khoản.
 *
 * Không có danh sách "ai đã chặn tôi": RLS không cho đọc, và đúng thế.
 */
export default function CommunityPrivacyScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const settings = useCommunitySettings();
  const setVis = useSetDefaultVisibility();
  const blocked = useBlockedUsers();
  const unblock = useUnblock();
  const wipe = useDeleteAllMyPosts();

  const locale = getLocale(lang);
  /* Hiện ngay giá trị vừa bấm trong lúc ghi, thay vì để viên trượt nhảy về
     rồi mới sang khi server trả lời. */
  const vis = setVis.isPending && setVis.variables ? setVis.variables : (settings.data?.defaultVisibility ?? 'public');

  const askUnblock = (b: BlockedUser) => {
    const name = b.profile ? b.profile.display_name : i18n.nPvNoProfile;
    Alert.alert(i18n.nPvUnblockTitle.replace('{name}', name), i18n.nPvUnblockBody, [
      { text: i18n.cancel, style: 'cancel' },
      { text: i18n.nPvUnblock, onPress: () => unblock.mutate(b.user_id, { onError: (e: Error) => toast.fail(e) }) },
    ]);
  };

  const run = () =>
    wipe.mutate(undefined, {
      onSuccess: (n) => (n > 0 ? toast.success(i18n.nPvDeleted.replace('{n}', String(n))) : toast.success(i18n.nPvNothing)),
      onError: (e: Error) => toast.fail(e),
    });
  const askWipe = () =>
    Alert.alert(i18n.nPvDeleteAllTitle, i18n.nPvDeleteAllBody, [
      { text: i18n.cancel, style: 'cancel' },
      {
        text: i18n.nPvContinue,
        style: 'destructive',
        onPress: () =>
          Alert.alert(i18n.nPvDeleteAllSure, i18n.nPvDeleteAllSureBody, [
            { text: i18n.cancel, style: 'cancel' },
            { text: i18n.nPvDeleteForGood, style: 'destructive', onPress: run },
          ]),
      },
    ]);

  return (
    <Screen back refreshable title={i18n.nPvTitle}>
      <View style={styles.section}>
        <Text style={styles.heading}>{i18n.nPvDefault}</Text>
        {settings.isError ? (
          <LoadFailed i18n={i18n} onRetry={() => settings.refetch()} />
        ) : (
          /* Không bọc thẻ: ray của Segmented đã là một mặt, và một ray trong một
             thẻ là hai lớp nền cho một lựa chọn (ảnh dựng đầu tiên). */
          <>
            <Segmented
              value={vis}
              onChange={(v) => {
                if (v !== vis) setVis.mutate(v, { onError: (e: Error) => toast.fail(e) });
              }}
              options={[
                { key: 'public', label: i18n.nCmPublic },
                { key: 'followers', label: i18n.nCmFollowersOnly },
              ]}
            />
            <Text style={styles.sub}>{i18n.nPvDefaultHint}</Text>
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>{i18n.nPvBlocked}</Text>
        <Text style={styles.sub}>{i18n.nPvBlockedHint}</Text>
        {blocked.isError ? (
          <LoadFailed i18n={i18n} onRetry={() => blocked.refetch()} />
        ) : blocked.isPending ? (
          <ActivityIndicator color={c.mutedForeground} style={styles.loading} />
        ) : blocked.data.length === 0 ? (
          <GlassCard>
            <Text style={styles.none}>{i18n.nPvBlockedNone}</Text>
          </GlassCard>
        ) : (
          <GlassCard style={styles.list}>
            {blocked.data.map((b, i) => (
              <View key={b.user_id} style={[styles.row, i > 0 && styles.rowRule]}>
                <CommunityAvatar mascotId={b.profile?.mascot_id ?? null} size={40} />
                {/* Chữ lớn ở 320 (#56, lượt quét hẹp của live.mjs): nút Bỏ chặn
                    lấy gần nửa dòng, và "@handle · Chặn từ 13 thg 9" MỘT dòng
                    thành "Chặn từ …" — ngày chặn, thứ người ta cần để nhận ra
                    lần chặn nào, luôn là phần bị cắt vì nó đứng cuối. Handle là
                    nội dung, cắt được, nên nó một dòng riêng; ngày chặn là câu
                    của app và xuống dòng tự do; tên được hai dòng. */}
                <View style={styles.who}>
                  <Text style={styles.name} numberOfLines={2}>
                    {b.profile ? b.profile.display_name : i18n.nPvNoProfile}
                  </Text>
                  {b.profile ? (
                    <Text style={styles.meta} numberOfLines={1}>
                      @{b.profile.handle}
                    </Text>
                  ) : null}
                  <Text style={styles.meta}>
                    {i18n.nPvSince.replace('{date}', new Date(b.since).toLocaleDateString(locale, { day: 'numeric', month: 'short' }))}
                  </Text>
                </View>
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={`${i18n.nPvUnblock} ${b.profile?.display_name ?? ''}`.trim()}
                  disabled={unblock.isPending}
                  hitSlop={4}
                  onPress={() => askUnblock(b)}
                  style={styles.pill}>
                  <Text style={styles.pillText}>{i18n.nPvUnblock}</Text>
                </PressScale>
              </View>
            ))}
          </GlassCard>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>{i18n.nPvPosts}</Text>
        <PressScale accessibilityRole="button" disabled={wipe.isPending} onPress={askWipe} style={styles.danger}>
          {wipe.isPending ? (
            <ActivityIndicator color={c.readinessRed} />
          ) : (
            <Text style={styles.dangerText}>{i18n.nPvDeleteAll}</Text>
          )}
        </PressScale>
        <Text style={styles.sub}>{i18n.nPvDeleteAllHint}</Text>
      </View>
    </Screen>
  );
}

const stylesFor = makeStyles((c) => ({
  section: { gap: spacing.sm },
  heading: { ...type.headline, color: c.foreground },
  sub: { ...type.footnote, color: c.mutedForeground, lineHeight: 18 },
  loading: { marginVertical: spacing.md },
  none: { ...type.body, color: c.mutedForeground },
  list: { paddingVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  rowRule: { borderTopWidth: 1, borderTopColor: c.border },
  who: { flex: 1, minWidth: 0 },
  name: { ...type.body, color: c.foreground, fontWeight: '600' },
  meta: { ...type.footnote, color: c.mutedForeground },
  /* 36 + hitSlop 4 = 44: viên nhỏ để tên người đứng trước, vùng chạm vẫn đủ. */
  pill: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { ...type.footnote, color: c.foreground, fontWeight: '600' },
  danger: {
    height: 50,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: { ...type.headline, color: c.readinessRed },
}));
