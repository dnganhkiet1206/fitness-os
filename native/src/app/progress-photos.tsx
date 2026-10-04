import { getLocale } from '@/lib/i18n';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { haptics as Haptics } from '@/lib/haptics';
import { Camera, Check, ChevronLeft, Columns2, Plus, Trash2, X } from 'lucide-react-native';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { AmbientLight } from '@/components/ascnd/ambient-light';
import { PickRow } from '@/components/ascnd/pick-row';
import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { nav } from '@/lib/nav';
import { toast } from '@/lib/toast';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeMaterialStyles, makeStyles } from '@/constants/theme';
import { useMaterial, usePalette } from '@/hooks/use-palette';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { PHOTO_QUALITY, pickPictureSize } from '@/lib/photo-size';
import { parseLocalDate } from '@/lib/local-date';
import { errorText } from '@/lib/error-copy';
import {
  useDeleteProgressPhoto,
  useProgressPhotos,
  useUploadProgressPhoto,
  type ProgressPhoto,
} from '@/hooks/use-progress-photos';
import { useBodyMeasurements, useWeightHistory } from '@/hooks/use-fitness-data';

/*
  ── vì sao màn này không dùng `<Screen>` ──

  Lưới ảnh là một danh sách dài (đọc hết theo trang, #179 — vài trăm ảnh là
  chuyện thường), và nó cần virtualization thật: chỉ dựng những ô đang ở trên
  màn hình. `Screen` luôn bọc children trong ScrollView của nó, mà một FlatList
  nằm trong ScrollView thì được đo với chiều cao vô hạn và dựng HẾT mọi item —
  virtualization chết ngay ở đó. Nên màn này tự làm vỏ (theo tiền lệ của
  `workout-builder.tsx` và `(tabs)/index.tsx`): thanh đầu trang 44pt chép đúng
  số đo của nhánh `back` trong `screen.tsx`, FlatList 2 cột làm scroller chính,
  `RefreshControl` tự gọi `invalidateQueries()` đúng nghĩa với `refreshable`.

  `tools/refreshable.mjs` chỉ quét các tệp dùng `<Screen>` nên không đỏ; cổng
  `ambient.mjs` đòi ánh sáng nền nên `<AmbientLight />` được gắn tay ở đây.
*/

type Pose = 'front' | 'side' | 'back';

const NUM_COLS = 2;
/*
  Chiều cao hàng cho `getItemLayout`, tính từ đúng những con số dựng nên ô —
  không phải số đo sau:

    cellW  = 47.8% của (rộng màn − 2 × padding ngang), y hệt `photoCell` cũ
    photoH = cellW / 0.8, y hệt `aspectRatio: 0.8` của `photo`
    META_H = 26: hàng meta có padding dọc 6 × 2 và nội dung cao nhất là glyph
             thùng rác 14pt (dòng caption 11pt thấp hơn) → 12 + 14 = 26 đúng
             bằng chiều cao tự nhiên, nên `height: 26` KHÔNG đổi một pixel nào
    ROW_GAP = spacing.sm, khoảng cách dọc giữa các hàng như `gap` của lưới cũ

  Đánh đổi đã biết: chiều cao là hằng số nên chữ caption ở cỡ Dynamic Type rất
  lớn có thể chật trong 26pt — đó là cái giá của `getItemLayout`, và là lý do
  Queue #3 từng SKIP đúng việc này ở workout-builder (hàng ở đó cao động thật).
  Ở đây nội dung ô là cố định (nhãn pose ngắn, ngày ngắn, icon cố định) nên cái
  giá ấy trả được để đổi lấy virtualization cho thư viện vài trăm ảnh.
*/
const META_H = 26;

export default function ProgressPhotosScreen() {
  const c = usePalette();
  const m = useMaterial();
  const styles = stylesFor(c);
  const headerStyles = headerStylesFor(m);
  const insets = useSafeAreaInsets();
  const i18n = useI18n();
  const { width: winW } = useWindowDimensions();
  const { data: photos, isPending, isError, refetch, isRefetching } = useProgressPhotos();
  const upload = useUploadProgressPhoto();
  const del = useDeleteProgressPhoto();
  const queryClient = useQueryClient();
  const [capturing, setCapturing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /*
    P1-7 (DE-XUAT-2): compare mode — pick two photos to see them side by side
    with the weight/measurement delta between the two dates. Tapping a cell in
    compare mode toggles selection instead of opening the viewer.
  */
  const [comparing, setComparing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { data: weightHistory } = useWeightHistory(365);
  const { data: measurements } = useBodyMeasurements();

  const toggleCompare = useCallback(() => {
    Haptics.selection();
    setComparing((v) => {
      if (v) setSelectedIds([]);
      return !v;
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    Haptics.selection();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 2 ? prev : [...prev, id],
    );
  }, []);

  const selectedPhotos = useMemo((): [ProgressPhoto, ProgressPhoto] | null => {
    if (selectedIds.length !== 2 || !photos) return null;
    const byId = new Map(photos.map((p) => [p.id, p]));
    const a = byId.get(selectedIds[0]);
    const b = byId.get(selectedIds[1]);
    if (!a || !b) return null;
    /* Older first — the "before" is on the left. */
    return (a.date <= b.date ? [a, b] : [b, a]) as [ProgressPhoto, ProgressPhoto];
  }, [selectedIds, photos]);

  /* `del` (kết quả useMutation) ổn định khi mutation idle — chỉ đổi tham chiếu
     khi trạng thái chuyển (đang xoá/xong), lúc ấy refetch cũng vẽ lại lưới.
     Gọi đúng dạng `del.mutate(` chứ không qua alias: `tools/silent-rollback.mjs`
     đọc chỗ gọi theo dạng ấy để kiểm `onError` — một `delMutate(...)` đặt tên
     khác là vô hình với nó và làm cổng đỏ oan. */
  const confirmDelete = useCallback(
    (id: string, photo_url: string) => {
      Haptics.medium();
      Alert.alert(i18n.nPhotoDelete, '', [
        { text: i18n.nCancel, style: 'cancel' },
        {
          text: i18n.nPhotoDelete,
          style: 'destructive',
          onPress: () =>
            del.mutate({ id, photo_url }, { onError: (e: Error) => toast.fail(e) }),
        },
      ]);
    },
    [del, i18n],
  );

  /* Kéo-để-tải-lại: cùng ngữ nghĩa với `refreshable` của `Screen` — rung khi
     cú kéo ăn, `invalidateQueries()` thật, hạ cờ trong `finally`. */
  const onRefresh = useCallback(async () => {
    Haptics.light();
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  const openCapture = useCallback(() => {
    Haptics.selection();
    setCapturing(true);
  }, []);

  const rowH = useMemo(() => {
    const cellW = (winW - spacing.md * 2) * 0.478;
    return cellW / 0.8 + META_H + spacing.sm;
  }, [winW]);
  const getItemLayout = useCallback(
    (_data: ArrayLike<ProgressPhoto> | null | undefined, index: number) => {
      const row = Math.floor(index / NUM_COLS);
      return { length: rowH, offset: row * rowH, index };
    },
    [rowH],
  );

  const renderItem = useCallback(
    ({ item }: { item: ProgressPhoto }) => (
      <PhotoCell
        photo={item}
        onDelete={confirmDelete}
        compareMode={comparing}
        selected={selectedIds.includes(item.id)}
        onToggleSelect={toggleSelect}
      />
    ),
    [confirmDelete, comparing, selectedIds, toggleSelect],
  );

  return (
    <View style={styles.root}>
      <AmbientLight />
      {/* Thanh đầu trang: chép đúng số đo nhánh `back` của `screen.tsx`. */}
      <View style={[styles.pageHeader, headerStyles.surface, { paddingTop: insets.top }]}>
        <View style={styles.pageHeaderRow}>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.a11yBack}
            hitSlop={8}
            style={styles.backBtn}
            onPress={() => {
              Haptics.selection();
              nav.back();
            }}>
            <Icon icon={ChevronLeft} size={22} color={c.primary} />
          </PressScale>
          <Text style={styles.pageTitle} numberOfLines={1}>
            {i18n.progressPhotos}
          </Text>
          <View style={styles.pageHeaderRight}>
            {/* P1-7: compare mode toggle. */}
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={i18n.nCxPhotoCompare ?? 'Compare'}
              accessibilityState={{ selected: comparing }}
              /* Song song cho web: accessibilityState chỉ có tác dụng native. */
              aria-selected={comparing}
              hitSlop={8}
              style={[styles.addBtn, comparing && styles.compareActive]}
              onPress={toggleCompare}>
              <Icon icon={Columns2} size={22} color={comparing ? c.primary : c.mutedForeground} />
            </PressScale>
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={i18n.a11yAdd}
              hitSlop={8}
              style={styles.addBtn}
              onPress={openCapture}>
              <Icon icon={Plus} size={22} color={c.primary} />
            </PressScale>
          </View>
        </View>
      </View>

      <FlatList
        data={photos ?? []}
        keyExtractor={(p) => p.id}
        numColumns={NUM_COLS}
        columnWrapperStyle={styles.row}
        getItemLayout={getItemLayout}
        renderItem={renderItem}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.mutedForeground}
            progressViewOffset={12}
          />
        }
        ListHeaderComponent={
          upload.isPending ? (
            <View style={styles.uploadHead}>
              <GlassCard>
                <View style={styles.uploadingRow}>
                  <ActivityIndicator color={c.primary} />
                  <Text style={styles.uploadingText}>{i18n.nPhotoUploading}</Text>
                </View>
              </GlassCard>
            </View>
          ) : null
        }
        ListEmptyComponent={
          isPending ? (
            /* Đang tải KHÁC với không có gì: trước đây nhánh này dựng luôn thẻ
               "chưa có ảnh" trong lúc dữ liệu còn trên đường về — đúng lỗi mà
               `tools/skeleton.mjs` mô tả ("một màn hình không được lẫn hai thứ
               ấy"). Nay đang tải thì hiện vòng xoay. */
            <View style={styles.emptyLoading}>
              <ActivityIndicator color={c.mutedForeground} />
            </View>
          ) : isError ? (
            /* Đọc hỏng không phải thư viện rỗng — trả lời lỗi trước, như cũ. */
            <LoadFailed i18n={i18n} onRetry={() => void refetch()} busy={isRefetching} />
          ) : (
            <GlassCard>
              <View style={styles.empty}>
                <Icon icon={Camera} size={40} color={c.mutedForeground} />
                <Text style={styles.emptyText}>{i18n.progressNoPhotos}</Text>
                <PressScale style={styles.emptyBtn} onPress={openCapture}>
                  <Text style={styles.emptyBtnText}>{i18n.nPhotoAdd}</Text>
                </PressScale>
              </View>
            </GlassCard>
          )
        }
      />

      <Modal visible={capturing} animationType="slide" onRequestClose={() => setCapturing(false)}>
        <CaptureView
          onClose={() => setCapturing(false)}
          onCaptured={(base64, pose) => {
            setCapturing(false);
            upload.mutate(
              { base64, pose },
              { onError: (e: Error) => Alert.alert('ASCND', errorText(e, i18n)) },
            );
          }}
        />
      </Modal>

      {/* P1-7: compare sheet — two photos side by side with deltas. */}
      <CompareSheet
        photos={selectedPhotos}
        weightHistory={weightHistory ?? []}
        measurements={measurements ?? []}
        onClose={() => {
          setSelectedIds([]);
          setComparing(false);
        }}
      />
    </View>
  );
}

/*
  P1-7 (DE-XUAT-2): compare sheet.

  Two photos side by side (older on the left), with the weight and waist delta
  between the two dates. "Nearest reading on or before the photo date" — a
  photo taken on a day with no weigh-in reads the last known value rather than
  nothing, which is the honest answer for a body that changes slowly. No reading
  within 30 days either side of a photo means "no data", not a zero.
*/
function nearestOnOrBefore<T extends { date: string }>(rows: T[], date: string): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (r.date <= date && (best === null || r.date > best.date)) best = r;
  }
  return best;
}

function CompareSheet({
  photos,
  weightHistory,
  measurements,
  onClose,
}: {
  photos: [ProgressPhoto, ProgressPhoto] | null;
  weightHistory: { date: string; value: number }[];
  measurements: { date: string; waist_cm: number | null }[];
  onClose: () => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();

  if (!photos) return null;
  const [before, after] = photos;

  const wBefore = nearestOnOrBefore(weightHistory, before.date);
  const wAfter = nearestOnOrBefore(weightHistory, after.date);
  const mBefore = nearestOnOrBefore(
    measurements.filter((m) => m.waist_cm != null),
    before.date,
  );
  const mAfter = nearestOnOrBefore(
    measurements.filter((m) => m.waist_cm != null),
    after.date,
  );

  const weightDelta =
    wBefore && wAfter ? Math.round((wAfter.value - wBefore.value) * 10) / 10 : null;
  const waistDelta =
    mBefore?.waist_cm != null && mAfter?.waist_cm != null
      ? Math.round((mAfter.waist_cm - mBefore.waist_cm) * 10) / 10
      : null;

  const fmtDate = (d: string) =>
    parseLocalDate(d).toLocaleDateString(getLocale(lang), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const deltaText = (v: number | null, unit: string) => {
    if (v === null) return '—';
    const sign = v > 0 ? '+' : '';
    return `${sign}${v}${unit}`;
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.compareRoot}>
        <View style={styles.compareHeader}>
          <Text style={styles.compareTitle}>{i18n.nCxPhotoCompare ?? 'Compare'}</Text>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.a11yClose}
            hitSlop={8}
            onPress={onClose}>
            <Icon icon={X} size={22} color={c.primary} />
          </PressScale>
        </View>
        <View style={styles.compareRow}>
          {photos.map((p) => (
            <View key={p.id} style={styles.compareCol}>
              <Image source={{ uri: p.signedUrl, cacheKey: p.id }} style={styles.comparePhoto} contentFit="cover" accessibilityLabel={fmtDate(p.date)} />
              <Text style={styles.compareDate}>{fmtDate(p.date)}</Text>
            </View>
          ))}
        </View>
        <GlassCard style={styles.compareDeltas}>
          <View style={styles.compareDeltaRow}>
            <Text style={styles.compareDeltaLabel}>{i18n.nWeight ?? 'Weight'}</Text>
            <Text style={styles.compareDeltaValue}>
              {wBefore ? `${wBefore.value}kg` : '—'} → {wAfter ? `${wAfter.value}kg` : '—'}
              <Text style={styles.compareDeltaDiff}> ({deltaText(weightDelta, 'kg')})</Text>
            </Text>
          </View>
          <View style={styles.compareDeltaRow}>
            <Text style={styles.compareDeltaLabel}>{i18n.nCxWaist ?? 'Waist'}</Text>
            <Text style={styles.compareDeltaValue}>
              {mBefore?.waist_cm != null ? `${mBefore.waist_cm}cm` : '—'} →{' '}
              {mAfter?.waist_cm != null ? `${mAfter.waist_cm}cm` : '—'}
              <Text style={styles.compareDeltaDiff}> ({deltaText(waistDelta, 'cm')})</Text>
            </Text>
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}

/*
  Một ô ảnh, memo theo đúng ảnh của nó.

  `photo` đến từ react-query nên tham chiếu ổn định giữa các lần render; cùng
  với `onDelete` ổn định, ô chỉ vẽ lại khi chính ảnh ấy đổi (xoá, thêm) — một
  chunk SSE hay một lần rung ở chỗ khác không lôi cả lưới vẽ lại.
*/
const PhotoCell = memo(function PhotoCell({
  photo,
  onDelete,
  compareMode,
  selected,
  onToggleSelect,
}: {
  photo: ProgressPhoto;
  onDelete: (id: string, photoUrl: string) => void;
  compareMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const pose =
    photo.pose === 'front' ? i18n.nPhotoFront : photo.pose === 'side' ? i18n.nPhotoSide : i18n.nPhotoBack;
  const when = useMemo(
    () =>
      parseLocalDate(photo.date).toLocaleDateString(getLocale(lang), {
        day: 'numeric',
        month: 'short',
      }),
    [photo.date, lang],
  );
  const onLongPress = useCallback(
    () => onDelete(photo.id, photo.photo_url),
    [onDelete, photo.id, photo.photo_url],
  );
  const onTrash = useCallback(() => {
    Haptics.selection();
    onDelete(photo.id, photo.photo_url);
  }, [onDelete, photo.id, photo.photo_url]);

  /* P1-7: in compare mode the whole cell is a select toggle. */
  const onCellPress = useCallback(() => {
    if (compareMode) onToggleSelect(photo.id);
  }, [compareMode, onToggleSelect, photo.id]);

  return (
    <View style={styles.photoCell}>
      {/*
        Nhấn giữ ảnh vẫn xoá — nhưng nó thôi là lối DUY NHẤT (#135).

        Trước đây cả ô là một `Pressable` chỉ có `onLongPress`: không
        gợi ý, không vai, không nút nào nhìn thấy được. Người không
        đoán ra thì không xoá được ảnh, và VoiceOver thì không có cách
        nào — `swipe.mjs` đã ghi đúng điều ấy cho cú vuốt: "vô hình cho
        tới khi đoán ra". Nay nút thùng rác ở hàng dưới là lối chính;
        nhấn giữ còn lại là lối tắt, và vì nó là BẢN SAO của nút ấy
        nên ẩn khỏi cây trợ năng.
      */}
      <Pressable
        accessible={compareMode}
        accessibilityRole={compareMode ? 'checkbox' : undefined}
        accessibilityState={compareMode ? { selected } : undefined}
        accessibilityLabel={compareMode ? `${pose} ${when}` : undefined}
        tabIndex={-1}
        onLongPress={compareMode ? undefined : onLongPress}
        onPress={compareMode ? onCellPress : undefined}>
        {/*
          `expo-image` thay cho RN `Image`:

          - `cacheKey: photo.id` — signed URL xoay mỗi lần refetch, và cache
            mặc định của ảnh bám theo URI nên cả thư viện bị tải lại dù ảnh
            không đổi. Khóa cache theo id ảnh thì lần refetch sau đọc từ đĩa.
          - `contentFit="cover"` giữ đúng cách lấp đầy ô như `aspectRatio`
            trước đây, nhưng do native module vẽ với bộ nhớ tốt hơn RN Image.
        */}
        <Image
          source={{ uri: photo.signedUrl, cacheKey: photo.id }}
          style={styles.photo}
          contentFit="cover"
          accessibilityLabel={photo.date}
        />
        {/* P1-7: selection badge in compare mode. */}
        {compareMode && (
          <View style={[styles.selectBadge, selected && styles.selectBadgeOn]} pointerEvents="none">
            {selected && <Icon icon={Check} size={16} color="#fff" />}
          </View>
        )}
      </Pressable>
      <View style={styles.photoMeta}>
        <Text style={styles.photoPose} numberOfLines={1}>
          {pose}
        </Text>
        <View style={styles.photoMetaEnd}>
          <Text style={styles.photoDate} numberOfLines={1}>
            {when}
          </Text>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={`${i18n.a11yDelete} ${pose} ${when}`}
            // 14pt glyph on a caption row; slop carries it to 44
            hitSlop={15}
            onPress={onTrash}>
            <Icon icon={Trash2} size={14} color={c.mutedForeground} />
          </PressScale>
        </View>
      </View>
    </View>
  );
});

function CaptureView({
  onClose,
  onCaptured,
}: {
  onClose: () => void;
  onCaptured: (base64: string, pose: Pose) => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const insets = useSafeAreaInsets();
  const i18n = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [pose, setPose] = useState<Pose>('front');
  const busyRef = useRef(false);

  /*
    Ask the camera what it can do, then ask it for less.

    `pictureSize` has to come from `getAvailablePictureSizesAsync` — it is
    passed straight to the native layer, and a string that platform does not
    recognise is a crash or a silently ignored prop, not a smaller photo.

    Undefined until the camera is ready, and undefined is a valid answer: it
    means "leave the default alone", which is a large photo rather than a broken
    one. `pickPictureSize` explains why the two platforms need separate handling
    — Android returns `1920x1080`, iOS returns preset names.
  */
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const onCameraReady = async () => {
    try {
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
      setPictureSize(pickPictureSize(sizes));
    } catch {
      // leave it at the device default; a failed query is not worth a message
    }
  };

  const poses: { key: Pose; label: string }[] = [
    { key: 'front', label: i18n.nPhotoFront },
    { key: 'side', label: i18n.nPhotoSide },
    { key: 'back', label: i18n.nPhotoBack },
  ];

  const shoot = async () => {
    if (busyRef.current || !cameraRef.current) return;
    busyRef.current = true;
    Haptics.medium();
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: PHOTO_QUALITY,
      });
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
        <Pressable accessibilityRole="button" onPress={onClose}>
          <Text style={styles.cancelText}>{i18n.nCancel}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.captureRoot}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
        pictureSize={pictureSize}
        onCameraReady={onCameraReady}
      />
      <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yClose} style={[styles.closeBtn, { top: insets.top + spacing.sm }]} hitSlop={8} onPress={onClose}>
        <Icon icon={X} size={16} color="#fff" />
      </Pressable>

      <PickRow
        value={pose}
        fill="#fff"
        radius={radius.full}
        gap={spacing.sm}
        style={[styles.poseRow, { top: insets.top + spacing.sm }]}>
        {poses.map((p) => (
          <PickRow.Item
            key={p.key}
            itemKey={p.key}
            accessibilityLabel={p.label}
            onPress={() => {
              Haptics.selection();
              setPose(p.key);
            }}
            style={styles.poseChip}>
            <Text style={[styles.poseText, pose === p.key && styles.poseTextActive]}>{p.label}</Text>
          </PickRow.Item>
        ))}
      </PickRow>

      <View style={[styles.shutterRow, { bottom: insets.bottom + spacing.xl }]}>
        {/* Tên cho VoiceOver — nút chỉ là một vòng tròn (#120). */}
        <PressScale accessibilityRole="button" accessibilityLabel={i18n.a11yTakePhoto} onPress={shoot} style={styles.shutter}>
          <View style={styles.shutterInner} />
        </PressScale>
      </View>
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  root: { flex: 1, backgroundColor: c.background },
  /* Đầu trang chép đúng nhánh `back` của `screen.tsx`. */
  pageHeader: {},
  pageHeaderRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pageTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: c.foreground,
    textAlign: 'center',
  },
  pageHeaderRight: {
    minWidth: 44,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingRight: spacing.sm,
  },
  list: { flex: 1, backgroundColor: 'transparent' },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.stack,
  },
  /* Hàng 2 ô của FlatList: trải đều như lưới `flexWrap` cũ. */
  row: { justifyContent: 'space-between' },
  uploadHead: { marginBottom: spacing.stack },
  emptyLoading: { paddingVertical: spacing.xl, alignItems: 'center' },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.secondary, alignItems: 'center', justifyContent: 'center' },
  /* P1-7: compare mode active state. */
  compareActive: { backgroundColor: c.primary },
  selectBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBadgeOn: { backgroundColor: c.primary, borderColor: c.primary },
  addBtnText: { fontSize: 22, color: c.primary, lineHeight: 26 },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  uploadingText: { ...type.footnote, color: c.mutedForeground },
  empty: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  emptyIcon: { fontSize: 40 },
  emptyText: { ...type.body, color: c.mutedForeground },
  emptyBtn: { marginTop: spacing.sm, height: 44, paddingHorizontal: spacing.xl, borderRadius: radius.full, backgroundColor: m.actionSurface, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { ...type.headline, color: c.primaryForeground },
  photoCell: { width: '47.8%', marginBottom: spacing.sm, borderRadius: radius.md, overflow: 'hidden', backgroundColor: c.card },
  photo: { width: '100%', aspectRatio: 0.8, backgroundColor: c.secondary },
  /* Chiều cao cố định đúng bằng chiều cao tự nhiên (12 padding + glyph 14pt),
     để `getItemLayout` tính đúng tới pixel. Xem chú thích ở META_H. */
  photoMeta: { height: META_H, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.sm },
  photoPose: { ...type.caption, color: c.foreground, fontWeight: '600', textTransform: 'capitalize' },
  photoDate: { ...type.caption, color: c.mutedForeground },
  photoMetaEnd: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Capture
  captureRoot: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  permTitle: { ...type.title, color: c.foreground },
  permBtn: { height: 48, paddingHorizontal: spacing.xl, borderRadius: radius.full, backgroundColor: m.actionSurface, alignItems: 'center', justifyContent: 'center' },
  permBtnText: { ...type.headline, color: c.primaryForeground },
  cancelText: { ...type.body, color: c.mutedForeground },
  closeBtn: { position: 'absolute', right: spacing.md, zIndex: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 16 },
  poseRow: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: 4, borderRadius: radius.full },
  /* No background: the only fill is the travelling highlight the row draws. */
  poseChip: { paddingHorizontal: spacing.md, paddingVertical: 6 },
  poseText: { ...type.footnote, color: '#fff', fontWeight: '600' },
  poseTextActive: { color: '#000' },
  shutterRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  shutter: { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  /*
    P1-7: compare sheet styles.
  */
  compareRoot: { flex: 1, backgroundColor: c.background, paddingTop: 60, paddingHorizontal: spacing.md, gap: spacing.md },
  compareHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  compareTitle: { ...type.title, color: c.foreground },
  compareRow: { flexDirection: 'row', gap: spacing.sm },
  compareCol: { flex: 1, gap: spacing.xs },
  comparePhoto: { width: '100%', aspectRatio: 0.8, borderRadius: radius.md, backgroundColor: c.secondary },
  compareDate: { ...type.footnote, color: c.mutedForeground, textAlign: 'center' },
  compareDeltas: { gap: spacing.sm },
  compareDeltaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  compareDeltaLabel: { ...type.headline, color: c.foreground },
  compareDeltaValue: { ...type.body, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  compareDeltaDiff: { ...type.body, color: c.primary, fontWeight: '600' },
}));

const headerStylesFor = makeMaterialStyles((m) => ({
  surface: {
    backgroundColor: m.bg,
    borderBottomWidth: m.borderWidth,
    borderBottomColor: m.border,
  },
}));
