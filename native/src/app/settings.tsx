import * as Haptics from 'expo-haptics';
import { nav } from '@/lib/nav';
import type { LucideIcon } from 'lucide-react-native';
import {
  Bell,
  ChevronRight,
  Contrast,
  Download,
  Dumbbell,
  FileText,
  Flame,
  Globe,
  Info,
  KeyRound,
  Lock,
  ShieldCheck,
  Target,
  Trash2,
  User,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PickRow } from '@/components/ascnd/pick-row';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { MascotFigure } from '@/components/ascnd/mascot-figure';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { useMaterial, usePalette } from '@/hooks/use-palette';
import { useRise } from '@/lib/entrance';
import { useAppLock } from '@/hooks/use-app-lock';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { clearCrashLog, readCrashLog, type CrashEntry } from '@/lib/crash-log';
import { toast } from '@/lib/toast';
import { useMascot } from '@/hooks/use-mascot';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { localDateStr } from '@/lib/local-date';
import { callEdge, EDGE_FUNCTIONS } from '@/lib/edge';
import { errorText } from '@/lib/error-copy';

/**
 * Everything the account owns, for the export.
 *
 * It was five tables. The privacy policy promises the user can "tải dữ liệu",
 * and the five left out meals item-by-item, water, biometrics, measurements,
 * supplements, photos, challenges and Koa's wardrobe — most of what a person
 * would actually want back. An export that quietly omits two thirds of the
 * data is worse than no export, because it looks like the whole of it.
 *
 * Ordered so a human reading the JSON meets the day-to-day logs first.
 */
const EXPORT_TABLES = [
  'profiles',
  'daily_logs',
  'meal_entries',
  'workout_sessions',
  'sleep_logs',
  'weight_logs',
  'water_logs',
  'biometric_samples',
  'body_measurements',
  'supplements',
  'supplement_intake_logs',
  'food_items',
  'progress_photos',
  'weekly_challenges',
  'mascot_inventory',
  'mascot_transactions',
] as const;

/**
 * Rows per table per request.
 *
 * There was a flat `.limit(500)` and no paging, so a year of meals stopped at
 * five hundred and the file said nothing about it. Now the loop keeps asking
 * until a page comes back short — the export is the whole of it or it fails
 * loudly, never a silent two thirds.
 */
const EXPORT_PAGE = 1000;

/**
 * The one table that is not user-scoped.
 *
 * `meal_entry_items` carries no `user_id` — it belongs to a `meal_entry`, which
 * belongs to a user. TypeScript caught it: the generic loop filters on
 * `user_id`, and the union of table types has no such column in common once
 * this one is in the list. Without the type it would have thrown at runtime,
 * inside a `try` that reports "Export failed" and says nothing else.
 *
 * Left out of the export it would take the contents of every meal with it —
 * the part a person actually wants back — so it is fetched by its parents' ids
 * instead.
 */
const ITEMS_TABLE = 'meal_entry_items';

export default function SettingsScreen() {
  const c = usePalette();
  const m = useMaterial();
  const styles = stylesFor(c);
  /* Lần vẽ đầu hiện NGAY, cascade chỉ chạy cho thứ mount vào một màn hình
     đã ở đó — xem `useRise`. Bản trước gọi `rise` trần, tức là mười một cái
     lò xo bắt đầu bên trong giây đầu tiên của một màn cũng đang chạy truy
     vấn; khung hình rơi trong quãng đó để lại đúng giá trị đầu, và giá trị
     đầu của `FadeInDown` là chưa nhìn thấy. */
  const rise = useRise();
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const { lang, setLang, theme, setTheme } = useAppSettings();
  const i18n = useI18n();
  const mascot = useMascot();
  const lock = useAppLock();
  const [exporting, setExporting] = useState(false);

  /*
    Nhật ký sự cố — chỉ hiện khi CÓ.

    Người dùng báo "thi thoảng chạm vào vùng này thì app crash", và không ai
    đọc được gì: `src/` không có error boundary, không `ErrorUtils` handler,
    không Sentry. Ở bản dev lỗi hiện một hộp đỏ rồi biến mất cùng lần tải lại;
    ở bản phát hành app đóng lặng lẽ. `lib/crash-log.ts` nay giữ lại năm lần
    gần nhất, và hàng này là chỗ lấy chúng ra.

    Một hàng LUÔN hiện sẽ là một hàng nói "app này hay hỏng" với người chưa gặp
    sự cố nào. Nó chỉ xuất hiện khi thật sự có gì để đọc.
  */
  const [crashes, setCrashes] = useState<CrashEntry[]>([]);
  useEffect(() => {
    readCrashLog().then(setCrashes);
  }, []);

  const shareCrashes = async () => {
    Haptics.selectionAsync();
    const body = crashes
      .map((c, i) => `#${i + 1}  ${c.at}  ${c.fatal ? 'FATAL' : 'non-fatal'}\n${c.message}\n${c.stack}`)
      .join('\n\n———\n\n');
    try {
      const res = await Share.share({ message: `ASCND crash log (${crashes.length})\n\n${body}` });
      /*
        Chỉ xoá khi đã GỬI ĐI THẬT.

        `Share.share` huỷ thì vẫn resolve, với `dismissedAction` — nên xoá vô
        điều kiện là vứt nhật ký của người vừa bấm nhầm rồi đóng bảng chia sẻ,
        và thứ họ vứt là bằng chứng duy nhất về một sự cố không tái hiện được.
        Cùng chỗ mà nút chia sẻ huy chương đã đọc sai API này một lần.
      */
      if (res.action === 'sharedAction') {
        await clearCrashLog();
        setCrashes([]);
      }
    } catch (e) {
      toast.fail(e);
    }
  };

  // Profile enums are stored as English keys — render localized labels
  const GOAL_LABELS: Record<string, string> = {
    bulk: i18n.goalBulk, cut: i18n.goalCut, maintain: i18n.goalMaintain,
    recomp: i18n.goalRecomp, strength: i18n.goalStrength, endurance: i18n.goalEndurance,
  };
  const LEVEL_LABELS: Record<string, string> = {
    beginner: i18n.onboardingBeginner,
    intermediate: i18n.onboardingIntermediate,
    advanced: i18n.onboardingAdvanced,
  };

  const exportData = async () => {
    if (!user || exporting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExporting(true);
    try {
      // The tables are independent, so they are fetched together rather than
      // one after another — seventeen sequential round trips is most of a
      // minute on a phone, with a spinner and no explanation.
      const pairs = await Promise.all(
        EXPORT_TABLES.map(async (table) => {
          const rows: unknown[] = [];
          for (let from = 0; ; from += EXPORT_PAGE) {
            const { data, error } = await supabase
              .from(table)
              .select('*')
              .eq('user_id', user.id)
              .range(from, from + EXPORT_PAGE - 1);
            if (error) throw error;
            rows.push(...(data ?? []));
            if (!data || data.length < EXPORT_PAGE) break;
          }
          return [table, rows] as const;
        }),
      );
      const all: Record<string, unknown[]> = Object.fromEntries(pairs);

      const entryIds = (all.meal_entries as { id: string }[]).map((e) => e.id);
      const items: unknown[] = [];
      // `.in()` on a long list becomes a long URL, so the ids go in batches
      for (let i = 0; i < entryIds.length; i += 200) {
        const { data, error } = await supabase
          .from(ITEMS_TABLE)
          .select('*')
          .in('meal_entry_id', entryIds.slice(i, i + 200));
        if (error) throw error;
        items.push(...(data ?? []));
      }
      all[ITEMS_TABLE] = items;
      const json = JSON.stringify(all, null, 2);
      await Share.share({
        title: `ASCND export ${localDateStr()}`,
        message: json,
      });
    } catch (e) {
      Alert.alert('ASCND', errorText(e, i18n));
    } finally {
      setExporting(false);
    }
  };

  /**
   * Delete the account.
   *
   * ── why this exists ──
   *
   * It did not, and two separate things said it must. The app's own privacy
   * policy (`legal-content.ts`) promises "Xoá tài khoản: Xoá hoàn toàn tài
   * khoản và toàn bộ dữ liệu" — a commitment shipped in the product with no
   * way to honour it. And App Store Review Guideline 5.1.1(v) requires any app
   * offering account creation to offer account deletion *inside the app*; a
   * build without it is rejected, not merely criticised.
   *
   * ── why it goes through an edge function ──
   *
   * Deleting rows is not deleting an account. The auth user has to go too, and
   * `auth.admin.deleteUser` needs the service role key, which must never ship
   * in a client. So the app asks the server, and the server does it.
   *
   * That means it can fail in a way the user must not misread: if the function
   * is not deployed, nothing is deleted, and saying "deleted" would be the
   * worst possible lie on this particular screen. `not-deployed` gets its own
   * message, and every other failure says plainly that nothing was removed.
   *
   * ── two taps, and the export sits above it ──
   *
   * `Alert` confirms with the consequence spelled out rather than "Are you
   * sure?", and the destructive button is the second one. The export row is
   * directly above by design: the moment someone reaches for deletion is the
   * moment to remind them their data can be taken with them.
   */
  const [deleting, setDeleting] = useState(false);
  const confirmDeleteAccount = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(i18n.nDeleteAccountTitle, i18n.nDeleteAccountBody, [
      { text: i18n.nCancel, style: 'cancel' },
      {
        text: i18n.nDeleteAccountConfirm,
        style: 'destructive',
        onPress: async () => {
          if (deleting) return;
          setDeleting(true);
          const res = await callEdge(EDGE_FUNCTIONS.deleteAccount, {});
          setDeleting(false);
          if (!res.ok) {
            /* `nDeleteAccountFailed` says nothing has been deleted, and there
               is one failure where that is untrue: the photos are removed
               before the auth row, so a failure after them leaves the account
               standing with every progress photo already gone. The function
               marks that case `partial`; saying it plainly is the difference
               between a person keeping their account believing their pictures
               are safe and knowing they are not. Retrying is still right. */
            const partial =
              typeof res.body === 'object' &&
              res.body !== null &&
              (res.body as { partial?: unknown }).partial === true;
            Alert.alert(
              'ASCND',
              res.failure === 'not-deployed'
                ? i18n.nDeleteAccountNotSetUp
                : partial
                  ? i18n.nDeleteAccountPartial
                  : i18n.nDeleteAccountFailed,
            );
            return;
          }
          // The account is gone; the session and the cached copy of its data
          // must go with it, or the next launch reads a dead user out of the
          // persisted cache and shows their meals to whoever signs in next.
          /*
            KHÔNG điều hướng sau `signOut`. Cổng ở `_layout.tsx` làm việc ấy:
            `if (!user) return <AuthScreen />` — cả cây điều hướng bị THAY,
            không phải bị pop. Xem chú thích ở `confirmSignOut` cho lỗi đo được.
          */
          await signOut();
          Alert.alert('ASCND', i18n.nDeleteAccountDone);
        },
      },
    ]);
  };

  const confirmSignOut = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(i18n.nSignOut, i18n.nSignOutConfirm, [
      { text: i18n.nCancel, style: 'cancel' },
      {
        text: i18n.nSignOut,
        style: 'destructive',
        onPress: async () => {
          /*
            ── vì sao KHÔNG có `nav.dismissAll()` ở đây nữa ──

            Nó từng có, và nó gây ra một lỗi thật trên máy:

                The action 'POP_TO_TOP' was not handled by any navigator.
                Is there any screen to go back to?

            Cổng ở `_layout.tsx` dòng 262 là `if (!user) return <AuthScreen />`.
            Khi `signOut` xong, `user` thành null và cả cây điều hướng bị THAY —
            `Stack` bị gỡ khỏi cây, không phải bị pop.

            expo-router thì XẾP HÀNG lệnh điều hướng (`routingQueue`) và xả
            chúng ở lần focus kế tiếp. Ngăn xếp lúc ấy đã biến mất, nên
            `POP_TO_TOP` rơi vào chỗ không có navigator nào nhận.

            Tức lệnh này vừa THỪA vừa ĐUA: cổng đã dọn xong trước khi nó chạy.
          */
          await signOut();
        },
      },
    ]);
  };

  return (
    <Screen refreshable back title={i18n.settingsTitle}>
      <Animated.View entering={rise(0)}>
      <PressScale
        onPress={() => {
          Haptics.selectionAsync();
          nav.push('/edit-profile');
        }}>
        <GlassCard>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              {/* Ô tròn thay cho một chỗ trống: thẻ này là DANH TÍNH, và nó là
                  thẻ duy nhất trên màn mở đầu bằng một tên người. Mọi thẻ khác
                  mở đầu bằng một glyph, nên thiếu nó thẻ đầu tiên đọc ra như bị
                  thụt vào so với phần còn lại. */}
              <View style={styles.avatar}>
                <Icon icon={User} size={20} color={c.mutedForeground} />
              </View>
              <View style={styles.cardHeaderInfo}>
                <Text style={styles.cardTitle}>{profile?.name ?? 'Athlete'}</Text>
                <Text style={styles.cardHint}>{user?.email}</Text>
              </View>
            </View>
            <Icon icon={ChevronRight} size={20} color={c.mutedForeground} />
          </View>
          <View style={styles.divider} />
          <Row icon={Flame} label={i18n.nDailyTarget} value={profile?.tdee_target_kcal != null ? `${Math.round(Number(profile.tdee_target_kcal)).toLocaleString()} kcal` : '—'} />
          <Row icon={Target} label={i18n.nGoal} value={(profile?.goal && GOAL_LABELS[profile.goal]) || profile?.goal || '—'} />
          <Row
            icon={Dumbbell}
            label={i18n.nTrainingLevel}
            value={(profile?.training_level && LEVEL_LABELS[profile.training_level]) || profile?.training_level || '—'}
          />
        </GlassCard>
</PressScale>
      </Animated.View>

      <Animated.View entering={rise(1)}>
      <GlassCard>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.cardTitle}>{i18n.nMascotTitle}</Text>
            <Text style={styles.cardHint}>{i18n.nMascotToggleHint}</Text>
          </View>
          <Switch
            value={mascot.enabled}
            onValueChange={(v) => {
              Haptics.selectionAsync();
              mascot.setEnabled(v);
            }}
            trackColor={{ true: c.readinessGreen, false: c.secondary }}
          />
        </View>
        {/*
          Two switches, because they are two different objections. "I don't want
          a mascot" is the one above and it turns everything off. "I like Koa but
          I don't want it moving about while I read" is this one — and somebody
          who feels that should not have to give up the character to say it.

          Hidden when the mascot is off entirely: a switch for how a thing that
          does not exist should behave is a switch that cannot mean anything.
        */}
        {mascot.enabled ? (
          <View style={[styles.toggleRow, styles.toggleRowNext]}>
            <View style={styles.toggleInfo}>
              <Text style={styles.cardTitle}>{i18n.nKoaCompanionTitle}</Text>
              <Text style={styles.cardHint}>{i18n.nKoaCompanionHint}</Text>
            </View>
            <Switch
              value={mascot.companion}
              onValueChange={(v) => {
                Haptics.selectionAsync();
                mascot.setCompanion(v);
              }}
              trackColor={{ true: c.readinessGreen, false: c.secondary }}
            />
          </View>
        ) : null}
        {/*
          ── the only way back into the room, when the figure is switched off ──

          There were exactly two doors to `/mascot-room` in the whole app: the
          figure on Today (hidden when the mascot is off) and the streak chip
          (hidden until a streak is at least one day). `/shop` and `/challenges`
          are reachable *only from inside that room*.

          So somebody who turns the mascot off, or who has not yet logged two
          days running, loses the shop, the weekly challenges and the coin
          balance — while the app keeps paying them coins for quests and keeps
          scoring challenges in the background. A currency you cannot spend and
          a competition you cannot see.

          This row sits with the switch that causes it and is shown whether the
          switch is on or off. That is the point: the person most likely to need
          it is the one who has just turned the figure off.
        */}
        <PressScale
          onPress={() => {
            Haptics.selectionAsync();
            nav.push('/mascot-room');
          }}>
          <View style={styles.roomRow}>
            {/*
              KHÔNG có glyph dẫn đầu ở hàng này, dù mọi hàng dẫn đi khác trên
              màn đều có một cái.

              Glyph ở x=44 trên màn này đánh dấu CHỦ ĐỀ CỦA MỘT THẺ (Nhắc nhở,
              Khoá ứng dụng, Xuất dữ liệu…). Hàng phòng không phải đầu thẻ —
              nó là hàng con thứ ba bên trong thẻ nhân vật, dưới hai hàng công
              tắc mà tiêu đề bắt đầu ở x=44. Cho riêng nó một glyph đẩy chữ
              sang x=70 và làm mép trái trong cùng một thẻ so le.

              Thẻ hồ sơ có glyph ở hàng con, nhưng ở đó CẢ BA hàng đều có nên
              cột glyph đọc ra là một cột. Ở đây chỉ một trong ba có.

              Bỏ nó ra cũng trả 28 điểm bề ngang lại cho nhãn 40 ký tự.
            */}
            <View style={styles.rowLeft}>
              <Text style={styles.roomLabel}>{i18n.nMascotRoomTitle}</Text>
            </View>
            <Icon icon={ChevronRight} size={18} color={c.mutedForeground} />
          </View>
        </PressScale>

        {mascot.enabled && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mascotRow}>
            {mascot.catalog.map((m) => {
              const selected = mascot.mascot.id === m.id;
              return (
                <Pressable
                  key={m.id}
                  disabled={!m.unlocked}
                  onPress={() => {
                    Haptics.selectionAsync();
                    mascot.setSelectedId(m.id);
                  }}
                  style={[
                    styles.mascotChip,
                    selected && styles.mascotChipSelected,
                    !m.unlocked && styles.mascotChipLocked,
                  ]}>
                  <View style={styles.mascotFace}>
                    <View style={!m.unlocked && styles.mascotArtLocked}>
                      {/*
                        The chosen one is alive; the rest are stills.

                        Duolingo's own guidance is not to show a character
                        "static, expressionless", because that is what makes it
                        read as lifeless — and this row is the one screen where
                        the whole point is to like a character enough to pick it.
                        Every figure here was `animated={false}`.

                        Only the selected one moves, for the reason the rest of
                        this app animates carefully: a row of eight characters
                        all idling is eight loops running behind a settings
                        screen. One is enough to say they are alive, and it is
                        the one being looked at.
                      */}
                      <MascotFigure
                        mascot={m}
                        size={44}
                        emotion={selected ? 'happy' : 'idle'}
                        animated={selected}
                      />
                    </View>
                    {!m.unlocked && (
                      <View style={styles.mascotLockBadge}>
                        <Icon icon={Lock} size={9} color={c.mutedForeground} />
                      </View>
                    )}
                  </View>
                  <Text style={styles.mascotName}>{m.name}</Text>
                  <Text style={styles.mascotMeta} numberOfLines={3}>
                    {m.pro
                      ? i18n.nMascotPro
                      : m.unlocked
                        ? m.tagline[lang]
                        : m.unlock?.label[lang] ?? i18n.nMascotLocked}
                  </Text>
                  {!m.unlocked && m.unlock && (
                    <View style={styles.mascotProgress}>
                      <ProgressBar
                        pct={(mascot.unlockStats[m.unlock.kind] / m.unlock.count) * 100}
                        height={4}
                        radius={2}
                        trackColor={c.background}
                        color={m.accent}
                        style={styles.mascotProgressTrack}
                      />
                      <Text style={styles.mascotProgressText}>
                        {Math.min(mascot.unlockStats[m.unlock.kind], m.unlock.count)}/
                        {m.unlock.count}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </GlassCard>
      </Animated.View>

      {/*
        Giao diện, ngay TRÊN ngôn ngữ.

        Hai thứ cùng loại — tuỳ chọn của MÁY, không của tài khoản — nên chúng
        đứng cạnh nhau, và cùng dùng `PickRow` để một cú chạm ở đây đọc ra
        giống một cú chạm ở kia. "Theo máy" là mặc định và đứng đầu, vì đó là
        thứ iOS đã dạy người dùng mong đợi.
      */}
      <Animated.View entering={rise(2)}>
      <GlassCard>
        <CardTitle icon={Contrast}>{i18n.settingsTheme}</CardTitle>
        <PickRow
          value={theme}
          fill={m.actionSurface}
          slotFill={c.secondary}
          radius={radius.md}
          gap={spacing.sm}
          style={styles.langRow}>
          {(['system', 'light', 'dark'] as const).map((t) => (
            <PickRow.Item
              key={t}
              itemKey={t}
              accessibilityLabel={
                t === 'system' ? i18n.settingsThemeSystem : t === 'light' ? i18n.settingsThemeLight : i18n.settingsThemeDark
              }
              onPress={() => {
                Haptics.selectionAsync();
                setTheme(t);
              }}
              style={styles.langChip}>
              <Text style={[styles.langText, theme === t && styles.langTextActive]}>
                {t === 'system' ? i18n.settingsThemeSystem : t === 'light' ? i18n.settingsThemeLight : i18n.settingsThemeDark}
              </Text>
            </PickRow.Item>
          ))}
        </PickRow>
      </GlassCard>
      </Animated.View>

      <Animated.View entering={rise(3)}>
      <GlassCard>
        <CardTitle icon={Globe}>Language / Ngôn ngữ</CardTitle>
        <PickRow
          value={lang}
          fill={m.actionSurface}
          slotFill={c.secondary}
          radius={radius.md}
          gap={spacing.sm}
          style={styles.langRow}>
          {(['vi', 'en'] as const).map((l) => (
            <PickRow.Item
              key={l}
              itemKey={l}
              accessibilityLabel={l === 'vi' ? 'Tiếng Việt' : 'English'}
              onPress={() => {
                Haptics.selectionAsync();
                setLang(l);
              }}
              style={styles.langChip}>
              <Text style={[styles.langText, lang === l && styles.langTextActive]}>
                {l === 'vi' ? 'Tiếng Việt' : 'English'}
              </Text>
            </PickRow.Item>
          ))}
        </PickRow>
      </GlassCard>
      </Animated.View>

      {/* Reminders — local notifications */}
      <Animated.View entering={rise(4)}>
      <PressScale
        onPress={() => {
          Haptics.selectionAsync();
          nav.push('/reminders');
        }}>
        <GlassCard>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Icon icon={Bell} size={18} color={c.mutedForeground} />
              <View style={styles.cardHeaderInfo}>
                <Text style={styles.cardTitle}>{i18n.nRemindersTitle}</Text>
                <Text style={styles.cardHint}>{i18n.nRemindersDesc}</Text>
              </View>
            </View>
            <Icon icon={ChevronRight} size={20} color={c.mutedForeground} />
          </View>
        </GlassCard>
</PressScale>
      </Animated.View>

      {/* App lock — Face ID */}
      <Animated.View entering={rise(5)}>
      <GlassCard>
        <View style={styles.toggleRow}>
          <View style={styles.cardHeaderLeft}>
            <Icon icon={Lock} size={18} color={c.mutedForeground} />
            <View style={styles.toggleInfo}>
              <Text style={styles.cardTitle}>{i18n.nLockTitle}</Text>
              <Text style={styles.cardHint}>
                {lock.available ? i18n.nLockDesc : i18n.nLockUnavailable}
              </Text>
            </View>
          </View>
          <Switch
            value={lock.enabled}
            disabled={!lock.available}
            onValueChange={(v) => {
              Haptics.selectionAsync();
              lock.setEnabled(v);
            }}
            trackColor={{ true: c.readinessGreen, false: c.secondary }}
          />
        </View>
      </GlassCard>
      </Animated.View>

      {/* Change password */}
      <Animated.View entering={rise(6)}>
      <PressScale
        onPress={() => {
          Haptics.selectionAsync();
          nav.push('/change-password');
        }}>
        <GlassCard>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Icon icon={KeyRound} size={18} color={c.mutedForeground} />
              <Text style={styles.cardTitle}>{i18n.settingsChangePassword}</Text>
            </View>
            <Icon icon={ChevronRight} size={20} color={c.mutedForeground} />
          </View>
        </GlassCard>
</PressScale>
      </Animated.View>

      <Animated.View entering={rise(7)}>
      <PressScale onPress={exportData} disabled={exporting}>
        <GlassCard>
          {/*
            Glyph bên TRÁI, mũi tên bên PHẢI — cùng hình dạng với mọi hàng dẫn
            đi nơi khác trên màn này (Nhắc nhở, Đổi mật khẩu, Pháp lý). Bản cũ
            đặt `Upload` ở bên phải, tức đúng chỗ mà mọi hàng khác đặt mũi tên,
            nên nó đọc ra như một hàng dẫn đi mà mũi tên bị vẽ sai.

            `Download` chứ không phải `Upload`: việc này TẢI XUỐNG toàn bộ dữ
            liệu, và câu mô tả ngay dưới nói đúng thế.
          */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Icon icon={Download} size={18} color={c.mutedForeground} />
              <View style={styles.cardHeaderInfo}>
                <Text style={styles.cardTitle}>{i18n.settingsExportData}</Text>
                <Text style={styles.cardHint}>{i18n.settingsExportDesc}</Text>
              </View>
            </View>
            {exporting ? (
              <ActivityIndicator color={c.mutedForeground} size="small" />
            ) : (
              <Icon icon={ChevronRight} size={20} color={c.mutedForeground} />
            )}
          </View>
        </GlassCard>
</PressScale>
      </Animated.View>

      {crashes.length > 0 ? (
        <Animated.View entering={rise(8)}>
          <PressScale onPress={shareCrashes}>
            <GlassCard>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardHeaderLeft}>
                  <Icon icon={FileText} size={18} color={c.mutedForeground} />
                  <View style={styles.cardHeaderInfo}>
                    {/* Hai chuỗi này từng viết THẲNG ở đây bằng
                        `lang === 'vi' ? … : …` — chỗ duy nhất của màn không đi
                        qua bảng dịch, nên `tools/i18n.mjs` không soi được và
                        một bản dịch sai sẽ nằm im. Nay là `nCrashLog*`. */}
                    <Text style={styles.cardTitle}>{i18n.nCrashLogTitle}</Text>
                    <Text style={styles.cardHint}>
                      {i18n.nCrashLogHint.replace('{n}', String(crashes.length))}
                    </Text>
                  </View>
                </View>
                <Icon icon={ChevronRight} size={20} color={c.mutedForeground} />
              </View>
            </GlassCard>
          </PressScale>
        </Animated.View>
      ) : null}

      <Animated.View entering={rise(8)}>
      <GlassCard>
        <CardTitle icon={Info}>{i18n.nAbout}</CardTitle>
        <Row label={i18n.nVersion} value="1.0.0 (native)" />
        <Row label="Backend" value="Supabase" />
      </GlassCard>
      </Animated.View>

      <Animated.View entering={rise(9)}>
      <PressScale
        onPress={() => {
          Haptics.selectionAsync();
          nav.push('/legal');
        }}>
        <GlassCard>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Icon icon={ShieldCheck} size={18} color={c.mutedForeground} />
              <Text style={styles.cardTitle}>{i18n.nLegal}</Text>
            </View>
            <Icon icon={ChevronRight} size={20} color={c.mutedForeground} />
          </View>
        </GlassCard>
</PressScale>
      </Animated.View>

      <Animated.View entering={rise(10)}>
      <PressScale
        style={styles.signOut}
        onPress={confirmSignOut}>
        <Text style={styles.signOutText}>{i18n.nSignOut}</Text>
      </PressScale>
      </Animated.View>

      {/* Last on the screen, and the only row in red — it is the one action
          here that cannot be undone. */}
      <Animated.View entering={rise(11)}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={i18n.nDeleteAccount}
        disabled={deleting}
        style={[styles.deleteAccount, deleting && styles.pressed]}
        onPress={confirmDeleteAccount}>
        {deleting ? (
          <ActivityIndicator color={c.readinessRed} size="small" />
        ) : (
          <Icon icon={Trash2} size={15} color={c.readinessRed} />
        )}
        <View style={styles.deleteAccountText}>
          <Text style={styles.deleteAccountTitle}>{i18n.nDeleteAccount}</Text>
          <Text style={styles.cardHint}>{i18n.nDeleteAccountDesc}</Text>
        </View>
        {/* Mũi tên, vì hàng này MỞ một hộp xác nhận chứ không xoá ngay. Không
            có nó, hàng đỏ duy nhất của màn là hàng duy nhất không nói ra rằng
            còn một bước nữa. */}
        <Icon icon={ChevronRight} size={18} color={c.readinessRed} />
      </PressScale>
      </Animated.View>
    </Screen>
  );
}

/**
 * Một dòng nhãn–giá trị, kèm một glyph dẫn KHÔNG bắt buộc.
 *
 * `icon` là tuỳ chọn vì hai nhóm dòng trên màn này khác nhau về vai: ba dòng
 * của thẻ hồ sơ mô tả CƠ THỂ và kế hoạch, nên mỗi dòng có một hình riêng giúp
 * mắt bắt được nó khi lướt; còn hai dòng của thẻ Thông tin (phiên bản,
 * backend) là siêu dữ liệu — cho chúng glyph là tô đậm thứ không ai đi tìm.
 */
function Row({ icon, label, value }: { icon?: LucideIcon; label: string; value: string }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        {icon ? <Icon icon={icon} size={16} color={c.mutedForeground} /> : null}
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/**
 * Tiêu đề thẻ, kèm một glyph dẫn KHÔNG bắt buộc.
 *
 * Bốn thẻ chỉ-có-tiêu-đề (Giao Diện, Ngôn ngữ, Thông tin, Pháp lý) trước đây là
 * một dòng chữ trần, trong khi mọi thẻ khác trên màn đều mở đầu bằng một glyph.
 * Mắt lướt một màn dài bắt HÌNH trước khi đọc CHỮ, nên bốn thẻ ấy đọc ra như
 * một nhịp bị hụt giữa các thẻ có glyph.
 */
function CardTitle({ icon, children }: { icon?: LucideIcon; children: React.ReactNode }) {
  const c = usePalette();
  const styles = stylesFor(c);
  if (!icon) return <Text style={styles.cardTitle}>{children}</Text>;
  return (
    <View style={styles.titleRow}>
      <Icon icon={icon} size={17} color={c.mutedForeground} />
      <Text style={styles.cardTitle}>{children}</Text>
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  cardTitle: { ...type.headline, color: c.foreground },
  cardHint: { ...type.footnote, color: c.mutedForeground, marginTop: 2 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  cardHeaderLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardHeaderInfo: { flex: 1, minWidth: 0 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.border,
    marginVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  /* Dùng chung cho dòng nhãn–giá trị và cho hàng vào phòng: cả hai là "glyph,
     rồi chữ, rồi phần còn lại của hàng". Một style thay vì hai, nên khoảng hở
     giữa glyph và chữ không thể lệch nhau giữa hai chỗ. */
  rowLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  /*
    Ô tròn của avatar — `secondary`, không phải `card`.

    Thẻ này LÀ `card`, nên một ô tròn cùng màu thẻ thì không có ô tròn nào cả.
    `secondary` là bậc bề mặt kế tiếp và đã được đo: 1,198 so với `card` ở bản
    sáng, 1,088 ở bản tối. Con số thứ hai dưới bậc nhỏ nhất của iOS (1,134),
    nên ô tròn này KHÔNG được một mình mang nghĩa gì — nó chỉ giữ chỗ cho một
    glyph vốn đã đọc được ở `mutedForeground` (5,24:1 tối · 5,27:1 sáng).
  */
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { ...type.body, color: c.mutedForeground },
  rowValue: { ...type.body, color: c.foreground, fontWeight: '600', textTransform: 'capitalize' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  /* Hai công tắc là HAI câu hỏi khác nhau — xem chú thích ở chỗ dựng chúng —
     nên chúng cần một nhịp thở giữa. Không có nó, bốn dòng chữ chạy liền một
     khối và mắt đọc ra là một đoạn văn có hai cái công tắc rơi vào, chứ không
     phải hai lựa chọn tách bạch. */
  toggleRowNext: { marginTop: spacing.md },
  toggleInfo: { flex: 1, minWidth: 0 },
  /* A 44pt row so the whole strip is the target, not just the words — this is
     the only door left to the room for somebody who has switched the figure
     off, and a door you have to aim at is one more way to lose it. */
  roomRow: {
    minHeight: 44,
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roomLabel: { ...type.body, color: c.foreground },
  mascotRow: { marginTop: spacing.md },
  /*
    Viền có mặt ở CẢ HAI trạng thái, chỉ đổi MÀU.

    Bản cũ thêm `borderWidth: 1.5` chỉ khi được chọn, trong khi thẻ nền không
    có viền nào. Bề dày viền nằm trong luồng bố cục, nên chạm vào một thẻ khác
    làm ruột của nó thụt vào 1,5 điểm mỗi cạnh và con vật NHÍCH đúng lúc ngón
    tay vừa rời ra — một cú giật chỉ thấy trên máy thật. `choice-card.tsx` đã
    ghi lại đúng lỗi này một lần và giải theo cùng cách.

    Và màu viền là `foreground`, không phải `primary`: ở bản tối `primary` là
    bạc lam của Koa (#a8afbd) — cùng họ với chính con vật đang đứng trong thẻ,
    nên viền chọn đọc ra như một phần của hình. `foreground` là mức tương phản
    cao nhất bảng màu có ở cả hai diện mạo.
  */
  mascotChip: {
    width: 116,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: c.secondary,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginRight: spacing.sm,
  },
  mascotChipSelected: { borderColor: c.foreground },
  mascotChipLocked: { opacity: 0.7 },
  mascotFace: { width: 44, height: 52, alignItems: 'center', justifyContent: 'center' },
  mascotArtLocked: { opacity: 0.35 },
  // Gacha teaser: the face stays visible but ghosted, so players see
  // exactly which character they are working toward
  mascotLockBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: c.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'stretch',
    marginTop: 2,
  },
  /* ProgressBar owns the height, radius, track colour and clip; this only says
     it takes the space left beside the count. */
  mascotProgressTrack: { flex: 1 },
  mascotProgressText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    color: c.mutedForeground,
  },
  mascotName: { ...type.footnote, fontWeight: '600', color: c.foreground },
  /*
    Ba dòng, và `lineHeight` ghi thẳng ra để `minHeight` = 3 x 13 là một phép
    tính chứ không phải một con số đoán.

    Chuỗi dài nhất trong `mascots.ts` là 40 ký tự ("Your diligent, slightly
    sleepy companion"). Ruột chip đo được 98 điểm, ở cỡ 11 vào khoảng 16 ký
    tự mỗi dòng, nên 40 ký tự CẦN 3 dòng. Bản cũ để
    `numberOfLines={2}` nên Koa hiện ra "Bạn đồng hành chăm chỉ, hơi bu…" và
    Swift thành "Tinh ranh về dưỡng" — cụt giữa cụm từ, mất nghĩa.

    Sửa bằng số dòng chứ không bằng bề ngang: gói 40 ký tự vào 2 dòng cần chip
    rộng ~140, tức chỉ còn thấy 2,5 con thay vì 3,4 trên màn 402. Một hàng để
    CHỌN nhân vật mà thấy ít nhân vật hơn là đổi hỏng lấy sai.

    `minHeight` giữ mọi chip cao bằng nhau: chúng nằm trong ScrollView ngang
    nên mỗi cái tự tính chiều cao, và tagline 20 ký tự bên cạnh tagline 40 ký
    tự sẽ cho hai đáy lệch nhau nếu không chốt sàn này.
  */
  mascotMeta: {
    ...type.caption,
    lineHeight: 13,
    color: c.mutedForeground,
    textAlign: 'center',
    minHeight: 39,
  },
  langRow: { marginTop: spacing.md },
  /* No background and no radius here: the row paints the resting box, so the
     travelling highlight has a layer to sit in between it and this label. */
  langChip: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langText: { ...type.footnote, fontWeight: '600', color: c.secondaryForeground },
  langTextActive: { color: c.primaryForeground },
  signOut: {
    height: 50,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /*
    Not destructive, so not red.

    Signing out was already the app's only red control, which read fine on its
    own. It stops reading fine the moment a genuinely irreversible action sits
    directly beneath it: two red rows in a row, and the eye cannot tell which
    one erases everything. Apple's HIG reserves the destructive role for
    actions that cannot be undone, and signing out is undone by signing in.

    Red now means exactly one thing on this screen.
  */
  signOutText: { ...type.headline, color: c.foreground },
  deleteAccount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    /* Chính `destructive` ở 35%, không phải một bản chép của nó. Chuỗi cũ là
       `rgba(255,59,92,0.35)` — đúng mã màu đỏ của bản TỐI, nên nó không đổi
       theo theme và ở bản sáng nó vẫn là đỏ neon trên giấy. */
    borderColor: alpha(c.destructive, 0.35),
    marginTop: spacing.sm,
  },
  deleteAccountText: { flex: 1 },
  deleteAccountTitle: { fontSize: 15, fontWeight: '600', color: c.readinessRed },
  /* The dim while the delete is in flight. No transform: the press owns it. */
  pressed: { opacity: 0.85 },
}));
