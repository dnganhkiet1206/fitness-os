import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { Check, ChevronRight, Moon, Plus, X } from 'lucide-react-native';

import { radius, spacing, type } from '@/constants/ascnd';
import { usePalette } from '@/hooks/use-palette';
import { haptics as Haptics } from '@/lib/haptics';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { useI18n } from '@/hooks/use-app-settings';

interface WorkoutTemplate {
  id: string;
  name: string;
  exerciseCount: number;
  setCount: number;
  minutes: number;
}

interface WorkoutPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  dateLabel: string;
  templates: WorkoutTemplate[];
  selectedTemplateId: string | null;
  isRestSelected: boolean;
  onSelectRest: () => void;
  onSelectTemplate: (id: string) => void;
  onCreateNew: () => void;
}

/**
 * Sheet "Chọn buổi tập" (khung 3, issue 221).
 *
 * Chọn buổi cho đúng ngày đang xem. Gồm:
 * - Hàng "Nghỉ ngơi" (moon icon, selected = nền tím nhạt + ✓ tím)
 * - Mục "BUỔI TẬP CỦA BẠN": các template với ảnh, tên, metadata
 * - Nút "+ Tạo buổi tập mới"
 *
 * Radio group: role="radio", aria-selected.
 */
export function WorkoutPickerSheet({
  visible,
  onClose,
  dateLabel,
  templates,
  selectedTemplateId,
  isRestSelected,
  onSelectRest,
  onSelectTemplate,
  onCreateNew,
}: WorkoutPickerSheetProps) {
  const c = usePalette();
  const i18n = useI18n();
  const insets = useSafeAreaInsets();
  const styles = StyleSheet.create({
    scrim: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingBottom: Math.max(insets.bottom, spacing.md),
      maxHeight: '85%',
    },
    handle: {
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.mutedForeground,
      opacity: 0.4,
      alignSelf: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    headerText: { flex: 1 },
    title: { ...type.title, fontWeight: '700', color: c.foreground },
    subtitle: { ...type.footnote, color: c.mutedForeground, marginTop: 2 },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: c.secondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    list: { paddingHorizontal: spacing.md },
    restRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.lg,
      minHeight: 64,
    },
    restRowSelected: { backgroundColor: '#f3f0ff' },
    restIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: '#ede9fe',
      alignItems: 'center',
      justifyContent: 'center',
    },
    restText: { flex: 1 },
    restTitle: { ...type.headline, fontWeight: '600', color: c.foreground },
    restSub: { ...type.footnote, color: c.mutedForeground },
    checkCircle: {
      width: 28,
      height: 28,
      borderRadius: radius.full,
      backgroundColor: '#8b7cf0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionTitle: {
      ...type.caption,
      fontWeight: '700',
      color: c.mutedForeground,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    tplRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      minHeight: 64,
    },
    tplThumb: {
      width: 52,
      height: 52,
      borderRadius: radius.md,
      backgroundColor: c.secondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tplInfo: { flex: 1 },
    tplName: { ...type.headline, fontWeight: '600', color: c.foreground },
    tplMeta: { ...type.footnote, color: c.mutedForeground, marginTop: 2 },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginLeft: 64,
    },
    createBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      marginTop: spacing.lg,
      marginHorizontal: spacing.md,
      height: 52,
      borderRadius: radius.full,
      backgroundColor: c.secondary,
    },
    createText: { ...type.headline, fontWeight: '600', color: c.foreground },
  });

  const handleSelectRest = () => {
    Haptics.selection();
    onSelectRest();
    onClose();
  };

  const handleSelectTemplate = (id: string) => {
    Haptics.selection();
    onSelectTemplate(id);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(180)} style={styles.scrim}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={i18n.nCancel}
        />
        <Animated.View
          entering={SlideInDown.duration(320)}
          exiting={SlideOutDown.duration(200)}
          style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title} accessibilityRole="header">{i18n.nChooseWorkout}</Text>
              <Text style={styles.subtitle}>{dateLabel}</Text>
            </View>
            <PressScale
              style={styles.closeBtn}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={i18n.nCancel}
              onPress={onClose}>
              <Icon icon={X} size={18} color={c.foreground} />
            </PressScale>
          </View>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {/* Hàng Nghỉ ngơi */}
            <Pressable
              style={[styles.restRow, isRestSelected && styles.restRowSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isRestSelected }}
              onPress={handleSelectRest}>
              <View style={styles.restIcon}>
                <Icon icon={Moon} size={22} color="#8b7cf0" />
              </View>
              <View style={styles.restText}>
                <Text style={styles.restTitle}>{i18n.nTodayRest}</Text>
                <Text style={styles.restSub}>{i18n.nTodayRestHint}</Text>
              </View>
              {isRestSelected ? (
                <View style={styles.checkCircle}>
                  <Icon icon={Check} size={16} color="#fff" strokeWidth={3} />
                </View>
              ) : null}
            </Pressable>

            {/* Buổi tập của bạn */}
            <Text style={styles.sectionTitle}>
              {i18n.nYourWorkouts}
            </Text>
            {templates.map((tpl, idx) => {
              const selected = tpl.id === selectedTemplateId;
              return (
                <View key={tpl.id}>
                  {idx > 0 ? <View style={styles.divider} /> : null}
                  <Pressable
                    style={styles.tplRow}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => handleSelectTemplate(tpl.id)}>
                    <View style={styles.tplThumb}>
                      <Text style={{ fontSize: 24 }}>💪</Text>
                    </View>
                    <View style={styles.tplInfo}>
                      <Text style={styles.tplName}>{tpl.name}</Text>
                      <Text style={styles.tplMeta}>
                        {tpl.exerciseCount} bài · {tpl.setCount} sets · ~{tpl.minutes} phút
                      </Text>
                    </View>
                    <Icon icon={ChevronRight} size={20} color={c.mutedForeground} />
                  </Pressable>
                </View>
              );
            })}

            <Pressable
              style={styles.createBtn}
              accessibilityRole="button"
              onPress={() => {
                Haptics.selection();
                onCreateNew();
              }}>
              <Icon icon={Plus} size={18} color={c.foreground} />
              <Text style={styles.createText}>
                {i18n.nPlanNewWorkout}
              </Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
