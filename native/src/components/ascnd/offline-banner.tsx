import { CloudOff } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { colors, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useOnlineStatus } from '@/hooks/use-online-status';

/**
 * Slim banner pinned under the status bar while offline. Signals that the
 * user is looking at cached data; hidden the moment connectivity returns.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const insets = useSafeAreaInsets();
  const i18n = useI18n();

  if (online) return null;

  return (
    <View style={[styles.banner, { paddingTop: insets.top + 4 }]} pointerEvents="none">
      <Icon icon={CloudOff} size={13} color={colors.readinessYellow} />
      <Text style={styles.text}>{i18n.nOffline}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 6,
    backgroundColor: 'rgba(255,217,61,0.14)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,217,61,0.35)',
  },
  text: { ...type.caption, color: colors.readinessYellow, fontWeight: '600' },
});
