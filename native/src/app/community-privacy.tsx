import { ActivityIndicator, Alert, Switch, Text, View } from 'react-native';

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
  DISCOVER_KINDS,
  type DiscoverKind,
  NOTIFY_KEYS,
  type NotifyKey,
  useBlockedUsers,
  useCommunitySettings,
  useDeleteAllMyPosts,
  useMutedUsers,
  useSetDefaultVisibility,
  useSetDiscoverKinds,
  useSetNotify,
  useSetShowBadges,
  useUnblock,
  useUnmute,
} from '@/hooks/use-community';
import { usePalette } from '@/hooks/use-palette';
import { getLocale } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { fillCopy } from '@/lib/copy-fill';

/**
 * Quyền riêng tư cộng đồng — issue #11.
 *
 * Ba việc, theo thứ tự người ta hay cần:
 *
 *   Mặc định khi đăng   giá trị sẵn ở MỌI màn chia sẻ; lúc đăng vẫn đổi được.
 *                       Lưu ở bảng riêng chỉ chủ nhân đọc — không phải trên hồ
 *                       sơ, thứ cả cộng đồng đọc được.
 *   Khám phá hiển thị   (A 04/10) loại bài muốn thấy ở Khám phá; ít nhất một.
 *   Đã chặn             chặn có ở menu mọi bài (App Store 1.2), nhưng trước
 *                       màn này không có chỗ nào để BỎ chặn: chặn nhầm là
 *                       vĩnh viễn. Bỏ chặn không tự theo dõi lại — trigger
 *                       chặn đã gỡ quan hệ ấy và không ai nên bị theo dõi lại
 *                       mà không tự bấm.
 *   Đã tắt tiếng        (#6) người mình tạm không thấy bài, kèm hạn; chỉ hiện
 *                       khi có ai.
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
  const setBadges = useSetShowBadges();
  const setNotify = useSetNotify();
  const setKinds = useSetDiscoverKinds();
  const blocked = useBlockedUsers();
  const unblock = useUnblock();
  const muted = useMutedUsers();
  const unmute = useUnmute();
  const wipe = useDeleteAllMyPosts();

  const locale = getLocale(lang);
  /* Hiện ngay giá trị vừa bấm trong lúc ghi, thay vì để viên trượt nhảy về
     rồi mới sang khi server trả lời. */
  const vis = setVis.isPending && setVis.variables ? setVis.variables : (settings.data?.defaultVisibility ?? 'public');

  /* Như `vis` ở trên: đang gửi thì hiện lựa chọn vừa bấm, xong mới là server. */
  const badgesOn = setBadges.isPending && setBadges.variables !== undefined ? setBadges.variables : (settings.data?.showBadges ?? false);

  const notifyLabel: Record<NotifyKey, string> = {
    likes: i18n.nPgNotifyLikes,
    comments: i18n.nPgNotifyComments,
    mentions: i18n.nPgNotifyMentions,
    follows: i18n.nPgNotifyFollows,
    saves: i18n.nPgNotifySaves,
    tries: i18n.nPgNotifyTries,
    challenges: i18n.nPgNotifyChallenges,
  };
  /* Như `vis`: đang gửi thì hiện lựa chọn vừa bấm, xong mới là server. */
  const kinds = setKinds.isPending && setKinds.variables ? setKinds.variables : (settings.data?.discoverKinds ?? [...DISCOVER_KINDS]);
  const kindLabel: Record<DiscoverKind, string> = {
    workout: i18n.nPgDiscoverWorkout,
    progress: i18n.nPgDiscoverProgress,
    recipe: i18n.nPgDiscoverRecipe,
  };

  /* Như `badgesOn`: công tắc đang gửi hiện giá trị vừa bật, xong mới là server. */
  const notifyOn = (k: NotifyKey) =>
    setNotify.isPending && setNotify.variables?.key === k ? setNotify.variables.on : (settings.data?.notify[k] ?? true);

  const askUnblock = (b: BlockedUser) => {
    const name = b.profile ? b.profile.display_name : i18n.nPvNoProfile;
    Alert.alert(i18n.nPvUnblockTitle.replace('{name}', name), i18n.nPvUnblockBody, [
      { text: i18n.cancel, style: 'cancel' },
      { text: i18n.nPvUnblock, onPress: () => unblock.mutate(b.user_id, { onError: (e: Error) => toast.fail(e) }) },
    ]);
  };

  const run = () =>
    wipe.mutate(undefined, {
      onSuccess: (n) => (n > 0 ? toast.success(fillCopy(i18n.nPvDeleted, { n: String(n) })) : toast.success(i18n.nPvNothing)),
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

      {/* Huy hiệu thử thách (#42). Tắt sẵn — cột `show_badges` DEFAULT false: huy
          hiệu nói người ta đã tập trong những khoảng nào, và bật là quyết định
          của người ấy. Cùng khuôn với lựa chọn ở trên: một Segmented, một câu. */}
      {settings.isError ? null : (
        <View style={styles.section}>
          <Text style={styles.heading}>{i18n.nBdTitle}</Text>
          <Segmented
            value={badgesOn ? 'on' : 'off'}
            onChange={(v) => {
              const on = v === 'on';
              if (on !== badgesOn) setBadges.mutate(on, { onError: (e: Error) => toast.fail(e) });
            }}
            options={[
              { key: 'off', label: i18n.nBdHide },
              { key: 'on', label: i18n.nBdShow },
            ]}
          />
          <Text style={styles.sub}>{i18n.nBdHint}</Text>
        </View>
      )}

      {/* Loại bài ở Khám phá (A 04/10, concept §17 "Content preferences"). Công
          tắc cuối cùng còn bật thì không tắt được — server cũng từ chối mảng
          rỗng (CHECK), và một Khám phá không loại nào là màn trống không lý do. */}
      {settings.isError ? null : (
        <View style={styles.section}>
          <Text style={styles.heading}>{i18n.nPgDiscoverTitle}</Text>
          <GlassCard style={styles.list} testID="discover-kinds">
            {DISCOVER_KINDS.map((k, i) => {
              const on = kinds.includes(k);
              const last = on && kinds.length === 1;
              return (
                <View key={k} style={[styles.row, i > 0 && styles.rowRule]}>
                  <Text style={[styles.who, styles.label]}>{kindLabel[k]}</Text>
                  <Switch
                    accessibilityLabel={kindLabel[k]}
                    value={on}
                    disabled={settings.isPending || last}
                    onValueChange={(v) =>
                      setKinds.mutate(
                        DISCOVER_KINDS.filter((x) => (x === k ? v : kinds.includes(x))),
                        { onError: (e: Error) => toast.fail(e) },
                      )
                    }
                    trackColor={{ true: c.readinessGreen, false: c.secondary }}
                  />
                </View>
              );
            })}
          </GlassCard>
          <Text style={styles.sub}>{i18n.nPgDiscoverHint}</Text>
        </View>
      )}

      {/* Thông báo (A 03/10). Lọc ở server: tắt là thông báo ấy không được tạo
          nữa; việc của người khác (thích, lưu…) vẫn diễn ra như thường. */}
      {settings.isError ? null : (
        <View style={styles.section}>
          <Text style={styles.heading}>{i18n.nPgNotifyTitle}</Text>
          <GlassCard style={styles.list}>
            {NOTIFY_KEYS.map((k, i) => (
              <View key={k} style={[styles.row, i > 0 && styles.rowRule]}>
                <Text style={[styles.who, styles.label]}>{notifyLabel[k]}</Text>
                <Switch
                  accessibilityLabel={notifyLabel[k]}
                  value={notifyOn(k)}
                  disabled={settings.isPending}
                  onValueChange={(on) => setNotify.mutate({ key: k, on }, { onError: (e: Error) => toast.fail(e) })}
                  trackColor={{ true: c.readinessGreen, false: c.secondary }}
                />
              </View>
            ))}
          </GlassCard>
          <Text style={styles.sub}>{i18n.nPgNotifyHint}</Text>
        </View>
      )}

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

      {/* Tắt tiếng (#6): tạm thời và nhẹ hơn chặn — chỉ hiện khi có người đang
          bị tắt tiếng. Hết hạn là tự hết; một mục rỗng thường trực ở đây chỉ
          là thêm một thứ để đọc qua. Bỏ tắt tiếng không hỏi lại: không mất gì,
          bấm lại từ menu bài là xong. */}
      {muted.isError ? (
        <View style={styles.section}>
          <Text style={styles.heading}>{i18n.nPgMutedTitle}</Text>
          <LoadFailed i18n={i18n} onRetry={() => muted.refetch()} />
        </View>
      ) : muted.data && muted.data.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.heading}>{i18n.nPgMutedTitle}</Text>
          <Text style={styles.sub}>{i18n.nPgMutedHint}</Text>
          <GlassCard style={styles.list} testID="muted-list">
            {muted.data.map((m, i) => (
              <View key={m.user_id} style={[styles.row, i > 0 && styles.rowRule]}>
                <CommunityAvatar mascotId={m.profile?.mascot_id ?? null} size={40} />
                <View style={styles.who}>
                  <Text style={styles.name} numberOfLines={2}>
                    {m.profile ? m.profile.display_name : i18n.nPvNoProfile}
                  </Text>
                  {m.profile ? (
                    <Text style={styles.meta} numberOfLines={1}>
                      @{m.profile.handle}
                    </Text>
                  ) : null}
                  <Text style={styles.meta}>
                    {i18n.nPgMutedUntil.replace('{d}', new Date(m.until).toLocaleDateString(locale, { day: 'numeric', month: 'short' }))}
                  </Text>
                </View>
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={`${i18n.nPgUnmute} ${m.profile?.display_name ?? ''}`.trim()}
                  disabled={unmute.isPending}
                  hitSlop={4}
                  onPress={() =>
                    unmute.mutate(m.user_id, { onSuccess: () => toast.success(i18n.nPgUnmuted), onError: (e: Error) => toast.fail(e) })
                  }
                  style={styles.pill}>
                  <Text style={styles.pillText}>{i18n.nPgUnmute}</Text>
                </PressScale>
              </View>
            ))}
          </GlassCard>
        </View>
      ) : null}

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
  label: { ...type.body, color: c.foreground },
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
