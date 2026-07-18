import { Lock } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useAppLock } from '@/hooks/use-app-lock';

/**
 * Full-screen lock shown while the app is locked. Must be an RN Modal —
 * a plain overlay View sits below natively-presented sheets (log-meal,
 * edit-profile, …), so locking with a sheet open would leave its content
 * visible and usable. RN Modal renders above every native presentation
 * (same reason the celebration modals use it).
 */
export function AppLockGate() {
  const i18n = useI18n();
  const { locked, unlock } = useAppLock();

  if (!locked) return null;

  return (
    <Modal visible transparent={false} animationType="none" onRequestClose={() => {}}>
      <View style={[StyleSheet.absoluteFill, styles.scrim]}>
        <View style={styles.center}>
          <View style={styles.badge}>
            <Icon icon={Lock} size={34} color={colors.primary} />
          </View>
          <Text style={styles.title}>{i18n.nLockLocked}</Text>
          <Pressable style={({ pressed }) => [styles.button, pressed && styles.pressed]} onPress={unlock}>
            <Text style={styles.buttonText}>{i18n.nLockUnlock}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  badge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(120,170,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...type.title, color: colors.foreground },
  button: {
    height: 50,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { ...type.headline, color: colors.primaryForeground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
