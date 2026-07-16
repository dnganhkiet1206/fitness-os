import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useAppSettings } from '@/hooks/use-app-settings';
import { setPendingScan } from '@/lib/scan-bridge';

/** Open Food Facts lookup — same source and per-serving math as the web app */
async function lookupBarcode(code: string, lang: string) {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
  if (!res.ok) return null;
  const json = await res.json();
  if (json.status !== 1 || !json.product) return null;
  const p = json.product;
  const n = p.nutriments || {};
  const servingG = p.serving_quantity
    ? Number(p.serving_quantity)
    : p.product_quantity
      ? Number(p.product_quantity)
      : 100;
  const factor = servingG / 100;
  return {
    food_name:
      (lang === 'vi' ? p.product_name_vi : null) || p.product_name || p.product_name_en || code,
    kcal: Math.round((n['energy-kcal_100g'] || n['energy-kcal'] || 0) * factor),
    protein_g: Math.round((n.proteins_100g || 0) * factor),
    carbs_g: Math.round((n.carbohydrates_100g || 0) * factor),
    fat_g: Math.round((n.fat_100g || 0) * factor),
    fiber_g: Math.round((n.fiber_100g || 0) * factor),
    serving_g: servingG,
  };
}

export default function ScanBarcodeScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const [status, setStatus] = useState<'scanning' | 'looking-up' | 'not-found'>('scanning');
  const lockedRef = useRef(false);

  const onScanned = async ({ data }: { data: string }) => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStatus('looking-up');
    const food = await lookupBarcode(data, lang).catch(() => null);
    if (food) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPendingScan(food);
      router.back();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setStatus('not-found');
      setTimeout(() => {
        lockedRef.current = false;
        setStatus('scanning');
      }, 1600);
    }
  };

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.permTitle}>{i18n.nCameraNeeded}</Text>
        <Text style={styles.permHint}>{i18n.nCameraHint}</Text>
        <Pressable style={({ pressed }) => [styles.permBtn, pressed && styles.pressed]} onPress={requestPermission}>
          <Text style={styles.permBtnText}>{i18n.nAllowCamera}</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.cancelText}>{i18n.nCancel}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'],
        }}
        onBarcodeScanned={status === 'scanning' ? onScanned : undefined}
      />
      {/* Scan frame overlay */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>
          {status === 'looking-up'
            ? i18n.nLookingUp
            : status === 'not-found'
              ? i18n.nNotFound
              : i18n.nPointBarcode}
        </Text>
        {status === 'looking-up' && <ActivityIndicator color="#fff" style={{ marginTop: spacing.sm }} />}
      </View>
      <Pressable
        style={[styles.closeBtn, { top: insets.top + spacing.sm }]}
        hitSlop={8}
        onPress={() => router.back()}>
        <Icon icon={X} size={16} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  permTitle: { ...type.title, color: colors.foreground },
  permHint: { ...type.body, color: colors.mutedForeground, textAlign: 'center' },
  permBtn: {
    height: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permBtnText: { ...type.headline, color: colors.primaryForeground },
  cancelText: { ...type.body, color: colors.mutedForeground },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 260,
    height: 160,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  hint: {
    ...type.body,
    color: '#fff',
    marginTop: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    right: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 16 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
