import { ClipboardList, Star, Utensils } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { FoodCard, RecentFoodCard } from '@/components/ascnd/food-cards';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, spacing } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useFavoriteFoods, useMyFoods, useRecentFoods } from '@/hooks/use-nutrition';

/** Full food list — every My Food / Favorite / Recent, reached from the
 *  "See all" links on the Nutrition tab. */
export default function FoodListScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { data: myFoods } = useMyFoods();
  const { data: favorites } = useFavoriteFoods();
  const { data: recents } = useRecentFoods();

  const myFoodNames = new Set((myFoods ?? []).map((f) => f.name.toLowerCase()));

  return (
    <Screen back title={lang === 'vi' ? 'Danh sách thực phẩm' : 'Food list'} stagger>
      {/* My foods */}
      <View style={styles.head}>
        <Icon icon={Utensils} size={13} color={colors.primary} />
        <Text style={styles.title}>{lang === 'vi' ? 'Danh sách thực phẩm' : 'My Foods'}</Text>
      </View>
      {myFoods && myFoods.length > 0 ? (
        <View style={styles.list}>{myFoods.map((f) => <FoodCard key={f.id} f={f} />)}</View>
      ) : (
        <Text style={styles.empty}>{lang === 'vi' ? 'Chưa có thực phẩm' : 'No foods yet'}</Text>
      )}

      {/* Favorites */}
      {favorites && favorites.length > 0 && (
        <>
          <View style={styles.head}>
            <Icon icon={Star} size={13} color={colors.readinessYellow} />
            <Text style={styles.title}>{i18n.nutritionFavorites}</Text>
          </View>
          <View style={styles.list}>{favorites.map((f) => <FoodCard key={f.id} f={f} />)}</View>
        </>
      )}

      {/* Recent */}
      {recents && recents.length > 0 && (
        <>
          <View style={styles.head}>
            <Icon icon={ClipboardList} size={13} color={colors.mutedForeground} />
            <Text style={styles.title}>{i18n.nutritionRecent}</Text>
          </View>
          <View style={styles.list}>
            {recents.map((r, i) => (
              <RecentFoodCard key={i} r={r} saved={myFoodNames.has(r.food_name.toLowerCase())} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  title: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 2.4, color: colors.mutedForeground },
  list: { gap: spacing.sm },
  empty: { fontSize: 12, color: colors.mutedForeground, textAlign: 'center', paddingVertical: spacing.sm },
});
