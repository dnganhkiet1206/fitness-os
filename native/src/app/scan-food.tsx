import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { AI_FAILURE_KEY, callEdge, EDGE_FUNCTIONS } from '@/lib/edge';
import { setPendingScan, type ScannedFood } from '@/lib/scan-bridge';

type ScanMode = 'food' | 'label';
type Phase = 'camera' | 'analyzing' | 'review';

interface RawItem {
  food_name: string;
  serving_g?: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
}

function normalize(items: RawItem[]): ScannedFood[] {
  return items.map((it) => ({
    food_name: it.food_name,
    kcal: Math.round(it.kcal || 0),
    protein_g: Math.round(it.protein_g || 0),
    carbs_g: Math.round(it.carbs_g || 0),
    fat_g: Math.round(it.fat_g || 0),
    fiber_g: Math.round(it.fiber_g || 0),
    serving_g: Math.round(it.serving_g || 0),
  }));
}

export default function ScanFoodScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const cameraRef = useRef<CameraView>(null);
  const [mode, setMode] = useState<ScanMode>('food');
  const [phase, setPhase] = useState<Phase>('camera');
  const [preview, setPreview] = useState<string | null>(null);
  const [items, setItems] = useState<ScannedFood[]>([]);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const capture = async () => {
    if (busyRef.current || !cameraRef.current) return;
    busyRef.current = true;
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.5,
        skipProcessing: true,
      });
      setPreview(photo?.uri ?? null);
      setPhase('analyzing');

      const res = await callEdge<{ items?: RawItem[] }>(EDGE_FUNCTIONS.scanFood, {
        image_base64: photo?.base64,
        lang,
        mode,
      });
      if (!res.ok) {
        // Named, not generic: a scan that fails because the function was never
        // deployed and one that fails because the photo was dark used to read
        // the same, and only one of them is worth retrying with a better photo.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(i18n[AI_FAILURE_KEY[res.failure]]);
        setPhase('review');
        return;
      }

      const found = normalize((res.data?.items ?? []) as RawItem[]).filter((i) => i.kcal > 0);
      if (found.length === 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setError(i18n.nScanNoFood);
        setPhase('review');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setItems(found);
        setPhase('review');
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(i18n.nScanError);
      setPhase('review');
    } finally {
      busyRef.current = false;
    }
  };

  const retake = () => {
    Haptics.selectionAsync();
    setItems([]);
    setPreview(null);
    setError(null);
    setPhase('camera');
  };

  const confirm = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPendingScan(items);
    // Opened from the tab-bar AI panel there's no meal sheet behind us —
    // route into it so the scanned items don't sit parked in the bridge
    if (from === 'ai') {
      router.replace('/log-meal');
    } else {
      router.back();
    }
  };

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.permTitle}>{i18n.nCameraNeeded}</Text>
        <Text style={styles.permHint}>{i18n.nScanFoodHint}</Text>
        <Pressable
          style={({ pressed }) => [styles.permBtn, pressed && styles.pressed]}
          onPress={requestPermission}>
          <Text style={styles.permBtnText}>{i18n.nAllowCamera}</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.cancelText}>{i18n.nCancel}</Text>
        </Pressable>
      </View>
    );
  }

  // Review / analyzing screen (frozen preview + results)
  if (phase !== 'camera') {
    return (
      <View style={styles.root}>
        {preview && <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} blurRadius={phase === 'analyzing' ? 0 : 12} />}
        <View style={styles.scrim} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yClose}
          style={[styles.closeBtn, { top: insets.top + spacing.sm }]}
          hitSlop={8}
          onPress={() => router.back()}>
          <Icon icon={X} size={18} color="#fff" />
        </Pressable>

        {phase === 'analyzing' ? (
          <View style={styles.center}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.analyzingText}>{i18n.nAnalyzing}</Text>
          </View>
        ) : (
          <View style={[styles.reviewSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            {error && items.length === 0 ? (
              <>
                <Text style={styles.reviewError}>{error}</Text>
                <Pressable
                  style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                  onPress={retake}>
                  <Text style={styles.primaryBtnText}>{i18n.nRetake}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.reviewTitle}>{i18n.nAiScanTitle}</Text>
                <ScrollView style={styles.reviewList} contentContainerStyle={styles.reviewListContent}>
                  {items.map((it, idx) => (
                    <View key={idx} style={styles.itemRow}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName} numberOfLines={1}>{it.food_name}</Text>
                        <Text style={styles.itemMacros}>
                          {it.kcal} kcal · P{it.protein_g} · C{it.carbs_g} · F{it.fat_g}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={i18n.a11yClose}
                        hitSlop={8}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setItems((prev) => prev.filter((_, i) => i !== idx));
                        }}>
                        <Icon icon={X} size={15} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
                <View style={styles.reviewActions}>
                  <Pressable
                    style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                    onPress={retake}>
                    <Text style={styles.secondaryBtnText}>{i18n.nRetake}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      styles.primaryFlex,
                      items.length === 0 && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    disabled={items.length === 0}
                    onPress={confirm}>
                    <Text style={styles.primaryBtnText}>
                      {items.length === 1
                        ? i18n.nScanAddOne
                        : i18n.nScanAdd.replace('{n}', String(items.length))}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={i18n.a11yClose}
        style={[styles.closeBtn, { top: insets.top + spacing.sm }]}
        hitSlop={8}
        onPress={() => router.back()}>
        <Icon icon={X} size={18} color="#fff" />
      </Pressable>

      {/* Mode toggle */}
      <View style={[styles.modeRow, { top: insets.top + spacing.sm }]}>
        {(['food', 'label'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => {
              Haptics.selectionAsync();
              setMode(m);
            }}
            style={[styles.modeChip, mode === m && styles.modeChipActive]}>
            <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
              {m === 'food' ? i18n.nScanModeFood : i18n.nScanModeLabel}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>
          {mode === 'food' ? i18n.nScanFoodHint : i18n.nScanLabelHint}
        </Text>
      </View>

      {/* Shutter */}
      <View style={[styles.shutterRow, { bottom: insets.bottom + spacing.xl }]}>
        <Pressable onPress={capture} style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed]}>
          <View style={styles.shutterInner} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
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
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: 280,
    height: 280,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  hint: {
    ...type.body,
    color: '#fff',
    marginTop: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
    textAlign: 'center',
  },
  modeRow: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 4,
    borderRadius: radius.full,
  },
  modeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  modeChipActive: { backgroundColor: '#fff' },
  modeText: { ...type.footnote, color: '#fff', fontWeight: '600' },
  modeTextActive: { color: '#000' },
  shutterRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterPressed: { opacity: 0.7 },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
  },
  analyzingText: { ...type.headline, color: '#fff' },
  closeBtn: {
    position: 'absolute',
    right: spacing.md,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 16 },
  reviewSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
    maxHeight: '70%',
  },
  reviewTitle: { ...type.title, color: colors.foreground, textAlign: 'center' },
  reviewError: { ...type.body, color: colors.mutedForeground, textAlign: 'center', marginBottom: spacing.sm },
  reviewList: { maxHeight: 280 },
  reviewListContent: { gap: spacing.sm },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { ...type.body, color: colors.foreground, fontWeight: '600' },
  itemMacros: { ...type.caption, color: colors.mutedForeground, fontVariant: ['tabular-nums'], marginTop: 2 },
  removeIcon: { color: colors.mutedForeground, fontSize: 15, padding: 4 },
  reviewActions: { flexDirection: 'row', gap: spacing.sm },
  primaryBtn: {
    height: 50,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryFlex: { flex: 1 },
  primaryBtnText: { ...type.headline, color: colors.primaryForeground },
  secondaryBtn: {
    height: 50,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  secondaryBtnText: { ...type.headline, color: colors.foreground },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
