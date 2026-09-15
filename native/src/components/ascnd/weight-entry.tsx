import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useLogWeight, useTodayWeight } from '@/hooks/use-fitness-data';
import { usePalette } from '@/hooks/use-palette';
import { useProfile } from '@/hooks/useTodayData';
import { useUnits } from '@/hooks/use-units';
import { beginInteraction, endInteraction } from '@/lib/interaction';
import { localDateStr } from '@/lib/local-date';
import { decText } from '@/lib/number-input';
import { offlineNow } from '@/lib/offline';
import { OFFLINE_WRITE_KEY, type OfflineWrite } from '@/lib/offline-write';
import { BOUNDS, plausible } from '@/lib/plausible';
import { toast } from '@/lib/toast';
import { displayWeight, weightLabel, weightToKg } from '@/lib/units';

/**
 * Ô ghi cân nặng — MỘT bản, hai chỗ dùng.
 *
 * ── vì sao nó rời khỏi `today-widgets.tsx` ──
 *
 * Thẻ "Cần làm hôm nay" có một dòng cân nặng, và cân nặng là việc duy nhất
 * trong năm việc KHÔNG có màn riêng để mở: nó vẫn luôn được ghi tại chỗ, trong
 * thẻ Cân nặng. Nên dòng ấy phải ghi tại chỗ luôn.
 *
 * Chép cái ô sang thẻ mới sẽ là bản thứ hai của một logic GHI DỮ LIỆU, và mọi
 * thứ khó đều nằm trong nó: quy đổi kg/lb, ngưỡng hợp lý theo giá trị SẼ ĐƯỢC
 * LƯU chứ không theo số gõ vào, và đường ghi offline có `mutationKey` bền —
 * thứ đã từng nuốt mất một lần cân vì không ai đăng ký `mutationFn` cho nó.
 * Bản thứ hai của đoạn ấy sẽ trôi, và nó trôi ở chỗ mất dữ liệu.
 *
 * Nên tệp này là bản DUY NHẤT, và cả thẻ Cân nặng lẫn thẻ Cần làm đều gọi nó.
 * Mọi chú thích dưới đây đi theo mã từ chỗ cũ chứ không viết lại: chúng là biên
 * bản của những lỗi đã trả giá.
 */
export function WeightEntry({ onLogged }: { onLogged?: () => void }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { weight: wUnit } = useUnits();
  const { data: todayWeight } = useTodayWeight();
  const { data: profile } = useProfile();
  const logWeight = useLogWeight();
  const { user } = useAuth();
  /* The durable twin — no local `mutationFn`, because what comes back from
     storage after a restart is the default registered in `offline-write`. */
  const queue = useMutation<void, Error, OfflineWrite>({ mutationKey: [...OFFLINE_WRITE_KEY] });
  const [value, setValue] = useState('');

  const profileWeight = profile?.weight_kg != null ? Number(profile.weight_kg) : null;
  const todayDisp = todayWeight != null ? displayWeight(todayWeight, wUnit) : null;
  const profileDisp = profileWeight != null ? displayWeight(profileWeight, wUnit) : null;

  useEffect(() => {
    setValue(todayDisp?.toString() ?? profileDisp?.toString() ?? '');
  }, [todayDisp, profileDisp]);

  /*
    ── checked in kg, typed in whatever they use ──

    The box holds the display unit, so 300 is a plausible weight in pounds
    (136 kg) and an impossible one in kilograms. Judging the typed number
    against a kg range would refuse a real reading from anybody on lb, which is
    worse than the bug being fixed. So the conversion happens first and the
    bound is applied to the value that will actually be stored.

    Worth being clear about what this cannot do: 175 for a 75 kg person passes,
    because 175 kg is a weight a person can have. That typo is the one the
    weight card's own delete button exists for. What this stops is the slipped
    decimal and the wrong unit — and weight is the input with the longest tail,
    running through the BMI band, the chart's scale, and `adaptiveTDEE`'s
    least-squares fit, which has no outlier defence and now sets a suggested
    calorie target.
  */
  const typed = parseFloat(value);
  const kg = isNaN(typed) ? null : weightToKg(typed, wUnit);
  const weightError = kg == null || kg <= 0 ? null : plausible('weight_kg', kg) ? null
    : i18n.outOfRange
        .replace('{min}', String(displayWeight(BOUNDS.weight_kg.min, wUnit)))
        .replace('{max}', String(displayWeight(BOUNDS.weight_kg.max, wUnit)))
        .replace('{unit}', weightLabel(wUnit));

  const submit = () => {
    if (kg == null || kg <= 0 || weightError) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    /*
      ── offline, down the durable pipe; and either way it says what happened ──

      Two faults met in this one line. Fired offline the mutation paused, the
      tile sat in its editing state for ever, and the paused write was restored
      on the next launch with no `mutationFn` registered for its key and
      dropped — a weigh-in silently gone. And online, a rejected write had no
      `onError` at all, so the field simply closed as though it had worked.

      Weight is not a cosmetic number here: `adaptiveTDEE` runs a least-squares
      regression over fourteen days of it to suggest a calorie target.

      `kind: 'weight'` and its handler have been in `lib/offline-write.ts` since
      that file was written, with nothing ever producing one.
    */
    if (offlineNow() && user) {
      /* Closed here rather than in a callback: a paused mutation never calls
         one, which is the whole failure being fixed. */
      onLogged?.();
      queue.mutate({ kind: 'weight', userId: user.id, kg, date: localDateStr() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.success(i18n.logMealQueued);
      return;
    }
    logWeight.mutate(kg, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onLogged?.();
      },
      onError: (e: Error) => toast.fail(e),
    });
  };

  return (
    <View>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          value={value}
          onChangeText={(v) => setValue(decText(v))}
          /*
            Ô đang gõ cũng là "tay đang chạm". Bàn phím mở ra làm cả trang
            co giãn, và đó đúng là lúc không nên chia ngân sách khung hình cho
            một hoạt ảnh trang trí — xem `lib/interaction`.

            Cặp focus/blur luôn khớp nhau, kể cả khi ô mất focus vì trang bị
            rời đi, nên bộ đếm không kẹt.
          */
          onFocus={() => beginInteraction()}
          onBlur={() => endInteraction(320)}
          placeholder="70.0"
          placeholderTextColor={c.mutedForeground}
        />
        <Text style={styles.unit}>{weightLabel(wUnit)}</Text>
        <PressScale
          style={[styles.btn, weightError ? styles.btnOff : null]}
          /* Mảng màu 36 điểm, vùng chạm 44+ — xem ghi chú ở `btn`. */
          hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
          onPress={submit}
          /*
            ── the offline branch is a submit too ──

            `logWeight` is the online mutation; offline the tap goes to
            `queue`, whose state nothing here read, so the button stayed live.

            And it stays *visible*: the caller closes the form on `onLogged`,
            but on the first weigh-in of a day `todayWeight` is null and — with
            no signal — is not going to stop being null. So the form sat open
            with the number still typed in it, one tap away from a second
            write, which is exactly the shape that produces one.

            The value is not patched into the cache to close it, deliberately:
            `lib/offline.ts` is the rule that a paused mutation never rolls
            back, so an optimistic weight would sit in the persisted cache as a
            reading nobody took. Disabling is the honest half — the toast has
            already said what happened.
          */
          disabled={
            logWeight.isPending || queue.isPending || queue.isSuccess || !!weightError
          }>
          {logWeight.isPending ? (
            <ActivityIndicator color={c.primaryForeground} size="small" />
          ) : (
            <Text style={styles.btnText}>{i18n.nLogWeight}</Text>
          )}
        </PressScale>
      </View>
      {weightError ? <Text style={styles.error}>{weightError}</Text> : null}
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  input: {
    /*
      Bề rộng CHỐT, không phải `minWidth`.

      Với `minWidth` thì ô nhập giãn chiếm hết chỗ trống tới tận cái nút: gạch
      chân kéo dài lê thê sau một con số ngắn, và "kg" bị đẩy văng sang phải,
      dính vào nút, tách khỏi chính con số nó thuộc về. Đo được trên bản dựng:
      số hết ở ~100px, vạch chạy tới ~285px.

      104 là chỗ cho năm ký tự mono ở 28 điểm — "100.5", giá trị dài nhất hợp
      lý ở cả kg lẫn lb — cộng chỗ cho con trỏ. Phần thừa sau số ngắn là có ý:
      nó nói còn chỗ để gõ, đúng việc của một ô nhập.
    */
    width: 104,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    color: c.foreground,
    ...type.largeTitle,
    ...type.mono,
  },
  unit: { ...type.body, color: c.mutedForeground },
  /*
    Nút thôi là vật sáng nhất trên thẻ.

    `colors.primary` là #a8afbd — bạc sáng — trên thẻ tối, nên ở 44 điểm với
    đệm 24 nó là mảng tương phản mạnh nhất ở đây. Một thẻ nói về MỘT CON SỐ mà
    thứ mắt bắt trước tiên lại là cái nút thì thứ bậc đang ngược.

    Nhỏ lại còn 36 và chữ 13/600 thì nó đọc ra là một control cạnh con số, chứ
    không phải một tấm biển. Vẫn nền đặc, vì đây vẫn là hành động chính duy
    nhất của chỗ nó đứng — hạ xuống viền rỗng là nói dối về vai trò của nó.

    36 dưới sàn chạm 44 điểm, nên `hitSlop` bù lại: vùng chạm không đổi, chỉ
    mảng màu nhỏ đi.
  */
  btn: {
    marginLeft: 'auto',
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOff: { opacity: 0.4 },
  btnText: { ...type.footnote, fontWeight: '700', color: c.primaryForeground },
  error: { ...type.footnote, color: c.readinessRed, marginTop: 6 },
}));
