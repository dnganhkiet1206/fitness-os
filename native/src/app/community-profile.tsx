import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { CommunityAvatar } from '@/components/ascnd/community-avatar';
import { GlassCard } from '@/components/ascnd/glass-card';
import { PressScale } from '@/components/ascnd/press-scale';
import { Screen } from '@/components/ascnd/screen';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { HandleTakenError, useMyCommunityProfile, useSaveCommunityProfile } from '@/hooks/use-community';
import { useMascot } from '@/hooks/use-mascot';
import { usePalette } from '@/hooks/use-palette';
import { nav } from '@/lib/nav';
import { toast } from '@/lib/toast';

/* Cùng luật với CHECK trong migration — kiểm ở đây để nói lý do NGAY dưới ô,
   thay vì để server từ chối rồi hiện một lỗi chung. */
const HANDLE = /^[a-z0-9_.]{3,24}$/;

/**
 * Tạo hoặc sửa hồ sơ cộng đồng: tên người dùng, tên hiển thị, giới thiệu, và
 * linh vật làm avatar.
 *
 * ── Quy tắc cộng đồng ở ngay trên nút Lưu ──
 *
 * App Store 1.2 đòi người dùng ĐỒNG Ý với điều khoản không dung thứ nội dung
 * phản cảm trước khi được đăng nội dung. Câu ấy đứng ngay trên nút, kèm lối
 * đọc Điều khoản đầy đủ, nên bấm Lưu là đồng ý có hiểu biết — không phải một
 * ô tích bị chôn.
 *
 * Chỉ linh vật ĐÃ MỞ KHOÁ chọn được: cái mặt đại diện trước cộng đồng là thứ
 * người ta kiếm được bằng việc tập.
 */
export default function CommunityProfileScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const me = useMyCommunityProfile();
  const save = useSaveCommunityProfile();
  const mascot = useMascot();

  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);

  /* Điền một lần khi hồ sơ về — không ghi đè thứ người ta đang gõ dở. */
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    if (filled || me.isPending) return;
    if (me.data) {
      setHandle(me.data.handle);
      setName(me.data.display_name);
      setBio(me.data.bio ?? '');
      setPick(me.data.mascot_id);
    } else {
      setPick(mascot.mascot.id);
    }
    setFilled(true);
  }, [filled, me.isPending, me.data, mascot.mascot.id]);

  const h = handle.trim().toLowerCase();
  const handleBad = h.length > 0 && !HANDLE.test(h);
  const canSave = HANDLE.test(h) && name.trim().length > 0 && !save.isPending;

  const submit = () => {
    if (!canSave) return;
    setTaken(false);
    save.mutate(
      { handle: h, display_name: name, bio, mascot_id: pick },
      {
        onSuccess: () => nav.back(),
        onError: (e: Error) => (e instanceof HandleTakenError ? setTaken(true) : toast.fail(e)),
      },
    );
  };

  const unlocked = mascot.catalog.filter((m) => m.unlocked);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen back title={me.data ? i18n.nCmEditProfile : i18n.nCmProfileTitle}>
        <View style={styles.hero}>
          <CommunityAvatar mascotId={pick} size={88} />
        </View>

        <GlassCard style={styles.card}>
          <Field label={i18n.nCmHandle} hint={taken ? i18n.nCmHandleTaken : handleBad ? i18n.nCmHandleHint : undefined} bad={taken || handleBad}>
            <View style={styles.handleRow}>
              <Text style={styles.at}>@</Text>
              <TextInput
                value={handle}
                onChangeText={(t) => {
                  setTaken(false);
                  setHandle(t.toLowerCase());
                }}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={24}
                style={[styles.input, styles.flex]}
                placeholder="ten.cua.ban"
                placeholderTextColor={c.mutedForeground}
              />
            </View>
          </Field>
          <Field label={i18n.nCmDisplayName}>
            <TextInput value={name} onChangeText={setName} maxLength={40} style={styles.input} placeholderTextColor={c.mutedForeground} />
          </Field>
          <Field label={i18n.nCmBio}>
            <TextInput
              value={bio}
              onChangeText={setBio}
              maxLength={160}
              multiline
              style={[styles.input, styles.bio]}
              placeholderTextColor={c.mutedForeground}
            />
          </Field>
        </GlassCard>

        <GlassCard style={styles.card}>
          <Text style={styles.label}>{i18n.nCmAvatar}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mascots}>
            {unlocked.map((m) => (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                accessibilityLabel={m.name}
                accessibilityState={{ selected: pick === m.id }}
                onPress={() => setPick(m.id)}
                style={[styles.mascotChip, pick === m.id && styles.mascotChipOn]}>
                <CommunityAvatar mascotId={m.id} size={52} />
                <Text style={styles.mascotName}>{m.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </GlassCard>

        <Text style={styles.rules}>
          {i18n.nCmRulesAgree}{' '}
          <Text style={styles.link} onPress={() => nav.push('/legal')}>
            {i18n.nCmRulesLink}
          </Text>
        </Text>

        <PressScale
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          onPress={submit}
          disabled={!canSave}
          style={[styles.saveBtn, !canSave && styles.saveOff]}>
          <Text style={styles.saveText}>{i18n.nCmSaveProfile}</Text>
        </PressScale>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Field({ label, hint, bad, children }: { label: string; hint?: string; bad?: boolean; children: React.ReactNode }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Text style={[styles.hint, bad && styles.hintBad]}>{hint}</Text> : null}
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  root: { flex: 1, backgroundColor: c.background },
  hero: { alignItems: 'center', paddingVertical: spacing.sm },
  card: { gap: spacing.md },
  field: { gap: 6 },
  label: { ...type.footnote, color: c.mutedForeground },
  hint: { ...type.footnote, color: c.mutedForeground },
  hintBad: { color: c.readinessRed },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  at: { ...type.headline, color: c.mutedForeground },
  input: {
    ...type.body,
    color: c.foreground,
    backgroundColor: c.secondary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 4,
    minHeight: 44,
  },
  bio: { minHeight: 76, paddingTop: 12, textAlignVertical: 'top' },
  flex: { flex: 1 },
  mascots: { gap: spacing.sm },
  mascotChip: {
    alignItems: 'center',
    gap: 6,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  mascotChipOn: { borderColor: c.foreground },
  mascotName: { ...type.caption, color: c.foreground },
  rules: { ...type.footnote, color: c.mutedForeground, lineHeight: 18 },
  link: { color: c.foreground, fontWeight: '600', textDecorationLine: 'underline' },
  saveBtn: {
    height: 50,
    borderRadius: radius.full,
    backgroundColor: m.actionSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveOff: { opacity: 0.4 },
  saveText: { ...type.headline, color: c.primaryForeground },
}));
