import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Bell, ChevronRight, KeyRound, Lock, Trash2, Upload } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { MascotFigure } from '@/components/ascnd/mascot-figure';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { rise } from '@/lib/entrance';
import { useAppLock } from '@/hooks/use-app-lock';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useMascot } from '@/hooks/use-mascot';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { localDateStr } from '@/lib/local-date';
import { callEdge, EDGE_FUNCTIONS } from '@/lib/edge';

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
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const { lang, setLang } = useAppSettings();
  const i18n = useI18n();
  const mascot = useMascot();
  const lock = useAppLock();
  const [exporting, setExporting] = useState(false);

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
      Alert.alert('ASCND', e instanceof Error ? e.message : 'Export failed');
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
            Alert.alert(
              'ASCND',
              res.failure === 'not-deployed'
                ? i18n.nDeleteAccountNotSetUp
                : i18n.nDeleteAccountFailed,
            );
            return;
          }
          // The account is gone; the session and the cached copy of its data
          // must go with it, or the next launch reads a dead user out of the
          // persisted cache and shows their meals to whoever signs in next.
          await signOut();
          router.dismissAll();
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
          await signOut();
          router.dismissAll();
        },
      },
    ]);
  };

  return (
    <Screen back title={i18n.settingsTitle}>
      <Animated.View entering={rise(0)}>
      <PressScale
        onPress={() => {
          Haptics.selectionAsync();
          router.push('/edit-profile');
        }}>
        <GlassCard>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderInfo}>
              <Text style={styles.cardTitle}>{profile?.name ?? 'Athlete'}</Text>
              <Text style={styles.cardHint}>{user?.email}</Text>
            </View>
            <Icon icon={ChevronRight} size={20} color={colors.mutedForeground} />
          </View>
          <View style={styles.divider} />
          <Row label={i18n.nDailyTarget} value={profile?.tdee_target_kcal != null ? `${Math.round(Number(profile.tdee_target_kcal)).toLocaleString()} kcal` : '—'} />
          <Row label={i18n.nGoal} value={(profile?.goal && GOAL_LABELS[profile.goal]) || profile?.goal || '—'} />
          <Row
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
            trackColor={{ true: colors.readinessGreen, false: colors.secondary }}
          />
        </View>
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
                      <MascotFigure mascot={m} size={44} emotion="idle" animated={false} />
                    </View>
                    {!m.unlocked && (
                      <View style={styles.mascotLockBadge}>
                        <Icon icon={Lock} size={9} color={colors.mutedForeground} />
                      </View>
                    )}
                  </View>
                  <Text style={styles.mascotName}>{m.name}</Text>
                  <Text style={styles.mascotMeta} numberOfLines={2}>
                    {m.pro
                      ? i18n.nMascotPro
                      : m.unlocked
                        ? m.tagline[lang]
                        : m.unlock?.label[lang] ?? i18n.nMascotLocked}
                  </Text>
                  {!m.unlocked && m.unlock && (
                    <View style={styles.mascotProgress}>
                      <View style={styles.mascotProgressTrack}>
                        <View
                          style={[
                            styles.mascotProgressFill,
                            {
                              backgroundColor: m.accent,
                              width: `${Math.min(
                                (mascot.unlockStats[m.unlock.kind] / m.unlock.count) * 100,
                                100,
                              )}%`,
                            },
                          ]}
                        />
                      </View>
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

      <Animated.View entering={rise(2)}>
      <GlassCard>
        <Text style={styles.cardTitle}>Language / Ngôn ngữ</Text>
        <View style={styles.langRow}>
          {(['vi', 'en'] as const).map((l) => (
            <Pressable
              key={l}
              onPress={() => {
                Haptics.selectionAsync();
                setLang(l);
              }}
              style={[styles.langChip, lang === l && styles.langChipActive]}>
              <Text style={[styles.langText, lang === l && styles.langTextActive]}>
                {l === 'vi' ? 'Tiếng Việt' : 'English'}
              </Text>
            </Pressable>
          ))}
        </View>
      </GlassCard>
      </Animated.View>

      {/* Reminders — local notifications */}
      <Animated.View entering={rise(3)}>
      <PressScale
        onPress={() => {
          Haptics.selectionAsync();
          router.push('/reminders');
        }}>
        <GlassCard>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Icon icon={Bell} size={18} color={colors.mutedForeground} />
              <View style={styles.cardHeaderInfo}>
                <Text style={styles.cardTitle}>{i18n.nRemindersTitle}</Text>
                <Text style={styles.cardHint}>{i18n.nRemindersDesc}</Text>
              </View>
            </View>
            <Icon icon={ChevronRight} size={20} color={colors.mutedForeground} />
          </View>
        </GlassCard>
</PressScale>
      </Animated.View>

      {/* App lock — Face ID */}
      <Animated.View entering={rise(4)}>
      <GlassCard>
        <View style={styles.toggleRow}>
          <View style={styles.cardHeaderLeft}>
            <Icon icon={Lock} size={18} color={colors.mutedForeground} />
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
            trackColor={{ true: colors.readinessGreen, false: colors.secondary }}
          />
        </View>
      </GlassCard>
      </Animated.View>

      {/* Change password */}
      <Animated.View entering={rise(5)}>
      <PressScale
        onPress={() => {
          Haptics.selectionAsync();
          router.push('/change-password');
        }}>
        <GlassCard>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Icon icon={KeyRound} size={18} color={colors.mutedForeground} />
              <Text style={styles.cardTitle}>{i18n.settingsChangePassword}</Text>
            </View>
            <Icon icon={ChevronRight} size={20} color={colors.mutedForeground} />
          </View>
        </GlassCard>
</PressScale>
      </Animated.View>

      <Animated.View entering={rise(6)}>
      <PressScale onPress={exportData} disabled={exporting}>
        <GlassCard>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderInfo}>
              <Text style={styles.cardTitle}>{i18n.settingsExportData}</Text>
              <Text style={styles.cardHint}>{i18n.settingsExportDesc}</Text>
            </View>
            {exporting ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Icon icon={Upload} size={18} color={colors.mutedForeground} />
            )}
          </View>
        </GlassCard>
</PressScale>
      </Animated.View>

      <Animated.View entering={rise(7)}>
      <GlassCard>
        <Text style={styles.cardTitle}>{i18n.nAbout}</Text>
        <Row label={i18n.nVersion} value="1.0.0 (native)" />
        <Row label="Backend" value="Supabase" />
      </GlassCard>
      </Animated.View>

      <Animated.View entering={rise(8)}>
      <PressScale
        onPress={() => {
          Haptics.selectionAsync();
          router.push('/legal');
        }}>
        <GlassCard>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>{i18n.nLegal}</Text>
            <Icon icon={ChevronRight} size={20} color={colors.mutedForeground} />
          </View>
        </GlassCard>
</PressScale>
      </Animated.View>

      <Animated.View entering={rise(9)}>
      <PressScale
        style={styles.signOut}
        onPress={confirmSignOut}>
        <Text style={styles.signOutText}>{i18n.nSignOut}</Text>
      </PressScale>
      </Animated.View>

      {/* Last on the screen, and the only row in red — it is the one action
          here that cannot be undone. */}
      <Animated.View entering={rise(10)}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={i18n.nDeleteAccount}
        disabled={deleting}
        style={[styles.deleteAccount, deleting && styles.pressed]}
        onPress={confirmDeleteAccount}>
        {deleting ? (
          <ActivityIndicator color={colors.readinessRed} size="small" />
        ) : (
          <Icon icon={Trash2} size={15} color={colors.readinessRed} />
        )}
        <View style={styles.deleteAccountText}>
          <Text style={styles.deleteAccountTitle}>{i18n.nDeleteAccount}</Text>
          <Text style={styles.cardHint}>{i18n.nDeleteAccountDesc}</Text>
        </View>
      </PressScale>
      </Animated.View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...type.headline, color: colors.foreground },
  cardHint: { ...type.footnote, color: colors.mutedForeground, marginTop: 2 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  cardHeaderLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardHeaderInfo: { flex: 1, minWidth: 0 },
  chevron: { fontSize: 22, color: colors.mutedForeground },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowLabel: { ...type.body, color: colors.mutedForeground },
  rowValue: { ...type.body, color: colors.foreground, fontWeight: '600', textTransform: 'capitalize' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toggleInfo: { flex: 1, minWidth: 0 },
  mascotRow: { marginTop: spacing.md },
  mascotChip: {
    width: 116,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    marginRight: spacing.sm,
  },
  mascotChipSelected: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
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
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotLockIcon: { fontSize: 11 },
  mascotProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'stretch',
    marginTop: 2,
  },
  mascotProgressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  mascotProgressFill: { height: '100%', borderRadius: 2 },
  mascotProgressText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    color: colors.mutedForeground,
  },
  mascotName: { ...type.footnote, fontWeight: '600', color: colors.foreground },
  mascotMeta: {
    ...type.caption,
    color: colors.mutedForeground,
    textAlign: 'center',
    minHeight: 26,
  },
  langRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  langChip: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langChipActive: { backgroundColor: colors.primary },
  langText: { ...type.footnote, fontWeight: '600', color: colors.secondaryForeground },
  langTextActive: { color: colors.primaryForeground },
  signOut: {
    height: 50,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
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
  signOutText: { ...type.headline, color: colors.foreground },
  deleteAccount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,59,92,0.35)',
    marginTop: spacing.sm,
  },
  deleteAccountText: { flex: 1 },
  deleteAccountTitle: { fontSize: 15, fontWeight: '600', color: colors.readinessRed },
  /* The dim while the delete is in flight. No transform: the press owns it. */
  pressed: { opacity: 0.85 },
});
