// Re-export from main i18n for backward compatibility
export { CURRENCIES, formatPrice, type CurrencyCode } from '@/lib/i18n';
export type GroceryLang = import('@/lib/i18n').AppLang;

import { t as mainT, type AppLang } from '@/lib/i18n';

type GroceryTranslationKeys = {
  title: string;
  subtitle: string;
  shoppingList: string;
  bought: string;
  addProduct: string;
  clearBought: string;
  productName: string;
  quantity: string;
  price: string;
  add: string;
  noItems: string;
  fromMealPlan: string;
  timesUsed: string;
  cheapProtein: string;
  deleted: string;
  addedToList: string;
  clearedBought: string;
  nameRequired: string;
  categories: Record<string, string>;
};

export function t(lang: AppLang): GroceryTranslationKeys {
  const i18n = mainT(lang);
  return {
    title: i18n.groceryTitle,
    subtitle: i18n.grocerySubtitle,
    shoppingList: i18n.groceryShoppingList,
    bought: i18n.groceryBought,
    addProduct: i18n.groceryAddProduct,
    clearBought: i18n.groceryClearBought,
    productName: i18n.groceryProductName,
    quantity: i18n.groceryQuantity,
    price: i18n.groceryPrice,
    add: i18n.add,
    noItems: i18n.groceryNoItems,
    fromMealPlan: i18n.groceryFromMealPlan,
    timesUsed: i18n.groceryTimesUsed,
    cheapProtein: i18n.groceryCheapProtein,
    deleted: i18n.groceryDeleted,
    addedToList: i18n.groceryAddedToList,
    clearedBought: i18n.groceryClearedBought,
    nameRequired: i18n.groceryNameRequired,
    categories: i18n.groceryCategories,
  };
}
