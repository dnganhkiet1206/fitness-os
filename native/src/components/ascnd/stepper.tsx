/**
 * Shared stepper (− value +) — extracted from the four hand-rolled ones
 * (workout-set-sheet, day-plan, today-meals, log-meal), 03/10/2026.
 *
 * The workout-set-sheet version was the most complete (min/max clamp,
 * decimals, direct TextInput entry, disabled states, haptics, a11y), so it
 * is the base. Each screen keeps its own visuals via style props — this
 * component owns only behavior: bump math, clamping, haptics, labels.
 *
 * No visual redesign: call sites pass their existing styles through.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Minus, Plus } from 'lucide-react-native';

import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { usePalette } from '@/hooks/use-palette';
import { haptics as Haptics } from '@/lib/haptics';

export interface StepperProps {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  /** Screen-reader labels for the two buttons. */
  a11yDecrease: string;
  a11yIncrease: string;
  /** Custom value text (e.g. restLabel, servings trim). Default: decimals-aware. */
  formatValue?: (n: number) => string;
  /**
   * Direct TextInput entry (workout-set-sheet) vs plain Text display.
   * The field keeps mid-edit text (including the empty string) while the
   * stored number is the clamped reading of it; leaving the field commits.
   */
  editable?: boolean;
  iconSize?: number;
  /** Show the buttons disabled at min/max (workout-set-sheet). Default: clamp silently. */
  disableAtBounds?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  buttonStyle?: StyleProp<ViewStyle>;
  disabledButtonStyle?: StyleProp<ViewStyle>;
  valueStyle?: StyleProp<TextStyle>;
}

const tidy = (n: number) => {
  // Float dust: 0.1 + 0.2 style steps must not accumulate into 0.30000004.
  const r = Math.round(n * 1e10) / 1e10;
  return r === 0 ? 0 : r;
};

export function Stepper({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  decimals = 0,
  a11yDecrease,
  a11yIncrease,
  formatValue,
  editable = false,
  iconSize = 16,
  disableAtBounds = false,
  containerStyle,
  buttonStyle,
  disabledButtonStyle,
  valueStyle,
}: StepperProps) {
  const c = usePalette();
  const fmt = (n: number) =>
    formatValue ? formatValue(n) : decimals ? n.toFixed(decimals) : String(Math.round(n));

  const [str, setStr] = useState(() => fmt(value));
  /* The last value this component committed. The effect below re-syncs the
     field only when the parent changed the value behind our back (re-seed);
     without the guard, typing "1." would snap back to "1" on every keystroke
     because the committed reading ("1") round-trips through the parent. */
  const committedRef = useRef(value);
  useEffect(() => {
    if (value !== committedRef.current) {
      committedRef.current = value;
      setStr(fmt(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (n: number) => {
    const clamped = Math.min(max, Math.max(min, tidy(n)));
    committedRef.current = clamped;
    onChange(clamped);
    return clamped;
  };

  const bump = (dir: 1 | -1) => {
    Haptics.selection();
    const next = commit(value + dir * step);
    if (editable) setStr(fmt(next));
  };

  const atMin = disableAtBounds && value <= min;
  const atMax = disableAtBounds && value >= max;

  return (
    <View style={containerStyle}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={a11yDecrease}
        disabled={atMin}
        hitSlop={{ top: 8, bottom: 8 }}
        onPress={() => bump(-1)}
        style={[buttonStyle, atMin && disabledButtonStyle]}>
        <Icon icon={Minus} size={iconSize} color={c.foreground} strokeWidth={2.5} />
      </PressScale>

      {editable ? (
        <TextInput
          accessibilityLabel={`${a11yDecrease} / ${a11yIncrease}`}
          style={valueStyle}
          keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
          value={str}
          selectTextOnFocus
          onChangeText={(t) => {
            setStr(t);
            commit(Number(t.replace(',', '.')) || 0);
          }}
          onEndEditing={() => setStr(fmt(value))}
        />
      ) : (
        <Text style={valueStyle}>{fmt(value)}</Text>
      )}

      <PressScale
        accessibilityRole="button"
        accessibilityLabel={a11yIncrease}
        disabled={atMax}
        hitSlop={{ top: 8, bottom: 8 }}
        onPress={() => bump(1)}
        style={[buttonStyle, atMax && disabledButtonStyle]}>
        <Icon icon={Plus} size={iconSize} color={c.foreground} strokeWidth={2.5} />
      </PressScale>
    </View>
  );
}
