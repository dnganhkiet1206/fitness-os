import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { Check } from 'lucide-react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import { useLogBiometrics } from '@/hooks/use-biometrics';
import { toast } from '@/lib/toast';
import { offlineNow } from '@/lib/offline';

export default function LogBiometricsSheet() {
  const i18n = useI18n();
  const log = useLogBiometrics();
  const [hr, setHr] = useState('');
  const [hrv, setHrv] = useState('');
  const [spo2, setSpo2] = useState('');
  const [vo2, setVo2] = useState('');
  const [resp, setResp] = useState('');

  const num = (v: string) => (v.trim() ? Number(v) : null);
  const canSave =
    (hr || hrv || spo2 || vo2 || resp).length > 0 && !log.isPending && !log.isSuccess;

  /*
    ── the rebuild moved, and had to ──

    This used to pass `onSuccess` per call, and that callback did two things:
    rebuilt the day so readiness saw the new HRV, and closed the screen.

    A paused mutation never calls `onSuccess`. Now that the write goes through
    the durable queue, both of those would simply not happen offline — the
    reading would send itself an hour later and the score would still be built
    without it, which is the failure this whole path exists to prevent.

    So the rebuild lives in `applyOfflineWrite` beside the insert, where it runs
    on the same terms whether the write went now or from storage. What is left
    here is the part that belongs to the screen.
  */
  const save = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    log.mutate({
      hr_bpm: num(hr),
      hrv_rmssd_ms: num(hrv),
      spo2_pct: num(spo2),
      vo2max_mlkgmin: num(vo2),
      resp_rate_rpm: num(resp),
    });
    /*
      Closed here rather than on success, for the same reason: offline there is
      no success to wait for, and a screen that never dismisses is a worse
      answer than one that says what happened. The write is in the persisted
      queue either way, so saying so is not optimism.
    */
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
    toast.success(offlineNow() ? i18n.logMealQueued : i18n.logBioSaved);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{i18n.logBioTitle}</Text>

        <Field label={i18n.logBioHR} placeholder="60" unit="bpm" value={hr} onChange={setHr} />
        <Field label={i18n.logBioHRV} placeholder="62" unit="ms" value={hrv} onChange={setHrv} />
        <View style={styles.row}>
          <Field label={i18n.logBioSpO2} placeholder="97" unit="%" value={spo2} onChange={setSpo2} style={styles.half} />
          <Field label={i18n.logBioVO2} placeholder="44" unit="ml/kg" value={vo2} onChange={setVo2} style={styles.half} />
        </View>
        <Field label={i18n.logBioResp} placeholder="14" unit="rpm" value={resp} onChange={setResp} />

        <PressScale
          style={[styles.saveButton, !canSave && !log.isSuccess && styles.saveDisabled]}
          disabled={!canSave}
          onPress={save}>
          {log.isSuccess ? (
            <Icon icon={Check} size={22} color={colors.primaryForeground} strokeWidth={3} />
          ) : log.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.saveText}>{i18n.save}</Text>
          )}
        </PressScale>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label, placeholder, unit, value, onChange, style,
}: {
  label: string; placeholder: string; unit: string; value: string; onChange: (v: string) => void; style?: object;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          value={value}
          onChangeText={onChange}
        />
        <Text style={styles.unit}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.card },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { ...type.title, color: colors.foreground, textAlign: 'center', marginBottom: spacing.sm },
  field: { gap: 6 },
  fieldLabel: { ...type.caption, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.background, paddingRight: spacing.md },
  input: { flex: 1, height: 48, paddingHorizontal: spacing.md, color: colors.foreground, fontSize: 16 },
  unit: { ...type.footnote, color: colors.mutedForeground },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  saveButton: { height: 50, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  saveDisabled: { opacity: 0.4 },
  saveText: { ...type.headline, color: colors.primaryForeground },
});
