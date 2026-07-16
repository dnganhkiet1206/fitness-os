import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/useTodayData';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const { lang, setLang } = useAppSettings();
  const i18n = useI18n();

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
    <Screen title={i18n.settingsTitle}>
      <GlassCard>
        <Text style={styles.cardTitle}>{profile?.name ?? 'Athlete'}</Text>
        <Text style={styles.cardHint}>{user?.email}</Text>
        <View style={styles.divider} />
        <Row label={i18n.nDailyTarget} value={profile?.tdee_target_kcal != null ? `${Math.round(Number(profile.tdee_target_kcal)).toLocaleString()} kcal` : '—'} />
        <Row label={i18n.nGoal} value={profile?.goal ?? '—'} />
        <Row label={i18n.nTrainingLevel} value={profile?.training_level ?? '—'} />
      </GlassCard>

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

      <GlassCard>
        <Text style={styles.cardTitle}>{i18n.nAbout}</Text>
        <Row label={i18n.nVersion} value="1.0.0 (native)" />
        <Row label="Backend" value="Supabase" />
      </GlassCard>

      <Pressable
        style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
        onPress={confirmSignOut}>
        <Text style={styles.signOutText}>{i18n.nSignOut}</Text>
      </Pressable>
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
  signOutText: { ...type.headline, color: colors.destructive },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
