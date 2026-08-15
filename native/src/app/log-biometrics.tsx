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
import { outOfRangeMessage } from '@/lib/plausible';
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

  /*
    ── a reading nobody could have produced ──

    This screen used to check `isNaN` and nothing else, so 600 bpm and an SpO₂
    of 970 saved without complaint. Neither of those is a visible mistake
    afterwards: `hr_bpm` becomes a 28-day resting-heart-rate baseline and
    `hrv_rmssd_ms` a 28-day MAD baseline, together 0.50 of the readiness score,
    and a single bad reading skews both for a month with nothing on screen
    saying why.

    The bounds live in `plausible.ts` with the extreme each one has to keep
    accepting written beside it. They refuse the impossible, not the unusual.
  */
  const errors = {
    hr: outOfRangeMessage('hr_bpm', hr, i18n.outOfRange),
    hrv: outOfRangeMessage('hrv_ms', hrv, i18n.outOfRange),
    spo2: outOfRangeMessage('spo2_pct', spo2, i18n.outOfRange),
    vo2: outOfRangeMessage('vo2max_mlkgmin', vo2, i18n.outOfRange),
    resp: outOfRangeMessage('resp_rpm', resp, i18n.outOfRange),
  };
  const anyBad = Object.values(errors).some(Boolean);

  const canSave =
    (hr || hrv || spo2 || vo2 || resp).length > 0 && !anyBad && !log.isPending && !log.isSuccess;

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
  const values = () => ({
    hr_bpm: num(hr),
    hrv_rmssd_ms: num(hrv),
    spo2_pct: num(spo2),
    vo2max_mlkgmin: num(vo2),
    resp_rate_rpm: num(resp),
  });

  const save = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    /*
      ── offline closes now; online waits for an answer ──

      A paused mutation never calls `onSuccess`, so offline there is nothing to
      wait for and a screen that never dismisses says less than one that says
      "queued". The write is in the persisted queue, so that is a statement of
      fact rather than optimism.

      Online it still waits, because online there is a real answer to hear —
      and an insert can fail for reasons worth showing. A first draft of this
      closed and said "saved" in both cases, which meant a rejected write was
      reported as a success. That is the same lie this project has spent the
      week removing from other screens; it does not get to reappear here.
    */
    if (offlineNow()) {
      log.mutate(values());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
      toast.success(i18n.logMealQueued);
      return;
    }
    log.mutate(values(), {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
        toast.success(i18n.logBioSaved);
      },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{i18n.logBioTitle}</Text>

        <Field label={i18n.logBioHR} placeholder="60" unit="bpm" value={hr} onChange={setHr} error={errors.hr} />
        <Field label={i18n.logBioHRV} placeholder="62" unit="ms" value={hrv} onChange={setHrv} error={errors.hrv} />
        <View style={styles.row}>
          <Field label={i18n.logBioSpO2} placeholder="97" unit="%" value={spo2} onChange={setSpo2} style={styles.half} error={errors.spo2} />
          {/* ml/kg is a mass fraction; VO₂max is a rate — ml/kg/min. The i18n
              label always said so, this suffix did not. */}
          <Field label={i18n.logBioVO2} placeholder="44" unit="ml/kg/min" value={vo2} onChange={setVo2} style={styles.half} error={errors.vo2} />
        </View>
        <Field label={i18n.logBioResp} placeholder="14" unit="rpm" value={resp} onChange={setResp} error={errors.resp} />

        <PressScale
                    /* The name has to be a constant, because the *text* is not.

             This button renders a Check on success and a spinner while
             pending, and in both of those branches there is no `<Text>` in the
             tree at all — so the control announced itself as an unnamed
             element at exactly the two moments a person most needs to know
             what it is doing. `tools/tap-targets.mjs` documents this as the
             blind spot it cannot see, and these five buttons were sitting in
             it. */
          accessibilityRole="button"
          accessibilityLabel={i18n.save}
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

/**
 * `error` is the sentence under the box, and it is also what disables Save —
 * the two are driven from one `outOfRangeMessage` call per field in the parent
 * so that a refused value can never be saved by a button that did not hear
 * about it.
 */
function Field({
  label, placeholder, unit, value, onChange, style, error,
}: {
  label: string; placeholder: string; unit: string; value: string; onChange: (v: string) => void; style?: object; error?: string | null;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputWrap, error ? styles.inputWrapBad : null]}>
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
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
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
  inputWrapBad: { borderColor: colors.readinessRed },
  fieldError: { ...type.footnote, color: colors.readinessRed },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  saveButton: { height: 50, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  saveDisabled: { opacity: 0.4 },
  saveText: { ...type.headline, color: colors.primaryForeground },
});
