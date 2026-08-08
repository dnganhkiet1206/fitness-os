import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Camera, Plus, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { parseLocalDate } from '@/lib/local-date';
import {
  useDeleteProgressPhoto,
  useProgressPhotos,
  useUploadProgressPhoto,
} from '@/hooks/use-progress-photos';

type Pose = 'front' | 'side' | 'back';

export default function ProgressPhotosScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { data: photos } = useProgressPhotos();
  const upload = useUploadProgressPhoto();
  const del = useDeleteProgressPhoto();
  const [capturing, setCapturing] = useState(false);

  const poseLabel = (p: string) =>
    p === 'front' ? i18n.nPhotoFront : p === 'side' ? i18n.nPhotoSide : i18n.nPhotoBack;

  const confirmDelete = (id: string, photo_url: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(i18n.nPhotoDelete, '', [
      { text: i18n.nCancel, style: 'cancel' },
      { text: i18n.nPhotoDelete, style: 'destructive', onPress: () => del.mutate({ id, photo_url }) },
    ]);
  };

  return (
    <Screen back
      title={i18n.progressPhotos}
      headerRight={
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yAdd}
          hitSlop={8}
          style={styles.addBtn}
          onPress={() => {
            Haptics.selectionAsync();
            setCapturing(true);
          }}>
          <Icon icon={Plus} size={22} color={colors.primary} />
        </PressScale>
      }>
      {upload.isPending && (
        <GlassCard>
          <View style={styles.uploadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.uploadingText}>{i18n.nPhotoUploading}</Text>
          </View>
        </GlassCard>
      )}

      {!photos || photos.length === 0 ? (
        <GlassCard>
          <View style={styles.empty}>
            <Icon icon={Camera} size={40} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>{i18n.progressNoPhotos}</Text>
            <PressScale
              style={styles.emptyBtn}
              onPress={() => setCapturing(true)}>
              <Text style={styles.emptyBtnText}>{i18n.nPhotoAdd}</Text>
            </PressScale>
          </View>
        </GlassCard>
      ) : (
        <View style={styles.grid}>
          {photos.map((p) => (
            <Pressable
              key={p.id}
              style={styles.photoCell}
              onLongPress={() => confirmDelete(p.id, p.photo_url)}>
              <Image source={{ uri: p.signedUrl }} style={styles.photo} />
              <View style={styles.photoMeta}>
                <Text style={styles.photoPose}>{poseLabel(p.pose)}</Text>
                <Text style={styles.photoDate}>
                  {parseLocalDate(p.date).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <Modal visible={capturing} animationType="slide" onRequestClose={() => setCapturing(false)}>
        <CaptureView
          onClose={() => setCapturing(false)}
          onCaptured={(base64, pose) => {
            setCapturing(false);
            upload.mutate(
              { base64, pose },
              { onError: (e: Error) => Alert.alert('ASCND', e.message) },
            );
          }}
        />
      </Modal>
    </Screen>
  );
}

function CaptureView({
  onClose,
  onCaptured,
}: {
  onClose: () => void;
  onCaptured: (base64: string, pose: Pose) => void;
}) {
  const insets = useSafeAreaInsets();
  const i18n = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [pose, setPose] = useState<Pose>('front');
  const busyRef = useRef(false);

  const poses: { key: Pose; label: string }[] = [
    { key: 'front', label: i18n.nPhotoFront },
    { key: 'side', label: i18n.nPhotoSide },
    { key: 'back', label: i18n.nPhotoBack },
  ];

  const shoot = async () => {
    if (busyRef.current || !cameraRef.current) return;
    busyRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.6 });
      if (photo?.base64) onCaptured(photo.base64, pose);
    } finally {
      busyRef.current = false;
    }
  };

  if (!permission) return <View style={styles.captureRoot} />;
  if (!permission.granted) {
    return (
      <View style={[styles.captureRoot, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.permTitle}>{i18n.nCameraNeeded}</Text>
        <PressScale style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>{i18n.nAllowCamera}</Text>
        </PressScale>
        <Pressable onPress={onClose}>
          <Text style={styles.cancelText}>{i18n.nCancel}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.captureRoot}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
      <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yClose} style={[styles.closeBtn, { top: insets.top + spacing.sm }]} hitSlop={8} onPress={onClose}>
        <Icon icon={X} size={16} color="#fff" />
      </Pressable>

      <View style={[styles.poseRow, { top: insets.top + spacing.sm }]}>
        {poses.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => {
              Haptics.selectionAsync();
              setPose(p.key);
            }}
            style={[styles.poseChip, pose === p.key && styles.poseChipActive]}>
            <Text style={[styles.poseText, pose === p.key && styles.poseTextActive]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.shutterRow, { bottom: insets.bottom + spacing.xl }]}>
        <PressScale onPress={shoot} style={styles.shutter}>
          <View style={styles.shutterInner} />
        </PressScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { fontSize: 22, color: colors.primary, lineHeight: 26 },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  uploadingText: { ...type.footnote, color: colors.mutedForeground },
  empty: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  emptyIcon: { fontSize: 40 },
  emptyText: { ...type.body, color: colors.mutedForeground },
  emptyBtn: { marginTop: spacing.sm, height: 44, paddingHorizontal: spacing.xl, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { ...type.headline, color: colors.primaryForeground },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoCell: { width: '47.8%', borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.card },
  photo: { width: '100%', aspectRatio: 0.8, backgroundColor: colors.secondary },
  photoMeta: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.sm, paddingVertical: 6 },
  photoPose: { ...type.caption, color: colors.foreground, fontWeight: '600', textTransform: 'capitalize' },
  photoDate: { ...type.caption, color: colors.mutedForeground },
  // Capture
  captureRoot: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  permTitle: { ...type.title, color: colors.foreground },
  permBtn: { height: 48, paddingHorizontal: spacing.xl, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  permBtnText: { ...type.headline, color: colors.primaryForeground },
  cancelText: { ...type.body, color: colors.mutedForeground },
  closeBtn: { position: 'absolute', right: spacing.md, zIndex: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 16 },
  poseRow: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', gap: spacing.sm, backgroundColor: 'rgba(0,0,0,0.4)', padding: 4, borderRadius: radius.full },
  poseChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full },
  poseChipActive: { backgroundColor: '#fff' },
  poseText: { ...type.footnote, color: '#fff', fontWeight: '600' },
  poseTextActive: { color: '#000' },
  shutterRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  shutter: { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
});
