import { Image } from 'expo-image';
import { createElement, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Text, TextInput, View } from 'react-native';

import { AdminShell, Empty, adminStyles, confirmThen, decisionError } from '@/components/ascnd/admin-shell';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { Segmented } from '@/components/ascnd/segmented';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { type ArtRow, useAdminArt, useSetArtActive, useUploadArt } from '@/hooks/use-admin';
import { usePalette } from '@/hooks/use-palette';
import { supabase } from '@/integrations/supabase/client';
import { fillCopy } from '@/lib/copy-fill';
import { toast } from '@/lib/toast';

/**
 * Thư viện ảnh của bài chia sẻ (chỉ admin). Thêm qua Edge Function `admin-art`
 * (kiểm vai trò rồi mới chạm Storage); tắt / bật lại qua `admin_set_art_active`.
 * Không có nút xoá: bài đã đăng với một ảnh vẫn phải vẽ được ảnh ấy.
 */
export default function AdminImages() {
  const i18n = useI18n();
  return (
    <AdminShell title={i18n.nPgAdNavImages} adminOnly>
      {() => <Body />}
    </AdminShell>
  );
}

type Kind = ArtRow['kind'];
const STYLE = /^[a-z][a-z0-9_]{0,23}$/;

function Body() {
  const c = usePalette();
  const a = adminStyles(c);
  const i18n = useI18n();
  const art = useAdminArt();

  return (
    <>
      <Upload />
      {art.isError ? (
        <LoadFailed i18n={i18n} onRetry={() => art.refetch()} />
      ) : art.isPending ? (
        <ActivityIndicator color={c.mutedForeground} style={a.loading} />
      ) : art.data.length === 0 ? (
        <Empty text={i18n.nPgAdNoImages} />
      ) : (
        <View style={a.panel}>
          {art.data.map((r, i) => (
            <ArtLine key={r.id} r={r} first={i === 0} />
          ))}
        </View>
      )}
    </>
  );
}

function Upload() {
  const c = usePalette();
  const a = adminStyles(c);
  const styles = stylesFor(c);
  const i18n = useI18n();
  const upload = useUploadArt();
  const input = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<Kind>('workout');
  const [style, setStyle] = useState('');
  const [tags, setTags] = useState('');
  const [altEn, setAltEn] = useState('');
  const [altVi, setAltVi] = useState('');
  const ready = !!file && STYLE.test(style.trim()) && !!altEn.trim() && !!altVi.trim();

  const send = () => {
    if (!file || !ready) {
      toast.error(i18n.nPgAdUploadInvalid);
      return;
    }
    upload.mutate(
      { file, name: file.name, kind, style: style.trim(), tags, altEn: altEn.trim(), altVi: altVi.trim() },
      {
        onSuccess: () => {
          setFile(null);
          setStyle('');
          setTags('');
          setAltEn('');
          setAltVi('');
          if (input.current) input.current.value = '';
          toast.success(i18n.nPgAdDone);
        },
        onError: (e) => toast.error(fillCopy(i18n.nPgAdUploadFailed, { code: decisionError(e, i18n) })),
      },
    );
  };

  return (
    <View style={a.section}>
      <Text style={a.heading} accessibilityRole="header">
        {i18n.nPgAdAddImage}
      </Text>
      {/* Ô chọn tệp của trình duyệt, ẩn sau một nút của app: bảng này chỉ chạy
          trên web (AdminShell), nên một <input type=file> là đúng công cụ. */}
      {Platform.OS === 'web'
        ? createElement('input', {
            ref: input,
            type: 'file',
            accept: 'image/png,image/jpeg,image/webp',
            style: { display: 'none' },
            'aria-hidden': true,
            tabIndex: -1,
            onChange: (e: { target: { files?: FileList | null } }) => setFile(e.target.files?.[0] ?? null),
          })
        : null}
      <View style={styles.fileRow}>
        <PressScale style={a.btn} onPress={() => input.current?.click()}>
          <Text style={a.btnText}>{i18n.nPgAdPickFile}</Text>
        </PressScale>
        <Text style={a.meta} numberOfLines={1}>
          {file ? `${file.name} · ${Math.round(file.size / 1024)} KB` : i18n.nPgAdFileHint}
        </Text>
      </View>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { key: 'workout', label: i18n.nPgAdKindWorkout },
          { key: 'progress', label: i18n.nPgAdKindProgress },
          { key: 'recipe', label: i18n.nPgAdKindRecipe },
        ]}
      />
      <Field value={style} onChange={setStyle} label={i18n.nPgAdStyle} />
      <Field value={tags} onChange={setTags} label={i18n.nPgAdTags} />
      <Field value={altEn} onChange={setAltEn} label={i18n.nPgAdAltEn} />
      <Field value={altVi} onChange={setAltVi} label={i18n.nPgAdAltVi} />
      <PressScale
        style={[a.btn, a.btnPrimary, styles.submit, (!ready || upload.isPending) && a.btnOff]}
        disabled={!ready || upload.isPending}
        accessibilityState={{ disabled: !ready || upload.isPending, busy: upload.isPending }}
        onPress={send}
      >
        <Text style={a.btnPrimaryText}>{i18n.nPgAdUpload}</Text>
      </PressScale>
    </View>
  );
}

function Field({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const c = usePalette();
  const a = adminStyles(c);
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={label}
      placeholderTextColor={c.mutedForeground}
      accessibilityLabel={label}
      autoCapitalize="none"
      maxLength={200}
      style={a.input}
    />
  );
}

function ArtLine({ r, first }: { r: ArtRow; first: boolean }) {
  const c = usePalette();
  const a = adminStyles(c);
  const styles = stylesFor(c);
  const i18n = useI18n();
  const set = useSetArtActive();
  const kindLabel = r.kind === 'workout' ? i18n.nPgAdKindWorkout : r.kind === 'progress' ? i18n.nPgAdKindProgress : i18n.nPgAdKindRecipe;
  const uri = supabase.storage.from('community-art').getPublicUrl(r.path).data.publicUrl;
  const toggle = (active: boolean) =>
    set.mutate(
      { id: r.id, active, reason: '' },
      { onSuccess: () => toast.success(i18n.nPgAdDone), onError: (e) => toast.error(decisionError(e, i18n)) },
    );
  const off = () => confirmThen(i18n.nPgAdArtOffTitle, i18n.nPgAdArtOffBody, i18n.nPgAdTurnOff, i18n.cancel, () => toggle(false));

  return (
    <View style={[styles.artRow, !first && a.rule]}>
      <Image source={{ uri }} style={[styles.thumb, !r.active && styles.thumbOff]} contentFit="cover" accessibilityLabel={r.alt_en} />
      <View style={styles.artText}>
        <View style={a.rowHead}>
          <Text style={a.strong}>
            {kindLabel} · {r.style}
          </Text>
          {r.active ? null : <Text style={styles.offTag}>{i18n.nPgAdOff}</Text>}
        </View>
        <Text style={a.meta} numberOfLines={1}>
          {r.path}
          {r.tags.length ? ` · ${r.tags.join(', ')}` : ''}
        </Text>
        <Text style={a.meta}>{fillCopy(i18n.nPgAdUsedBy, { n: r.used_by })}</Text>
      </View>
      <PressScale
        style={[a.btn, set.isPending && a.btnOff]}
        disabled={set.isPending}
        accessibilityState={{ disabled: set.isPending }}
        accessibilityLabel={`${r.active ? i18n.nPgAdTurnOff : i18n.nPgAdTurnOn}: ${r.alt_en}`}
        onPress={r.active ? off : () => toggle(true)}
      >
        <Text style={r.active ? a.btnDangerText : a.btnText}>{r.active ? i18n.nPgAdTurnOff : i18n.nPgAdTurnOn}</Text>
      </PressScale>
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  submit: { alignSelf: 'flex-start' },
  artRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm + 4 },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: c.secondary },
  thumbOff: { opacity: 0.4 },
  artText: { flex: 1, minWidth: 0, gap: 2 },
  offTag: { ...type.caption, color: c.readinessRed, fontWeight: '700' },
}));
