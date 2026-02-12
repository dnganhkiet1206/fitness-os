export type GroceryLang = 'vi' | 'en' | 'zh' | 'ja' | 'es';
export type CurrencyCode = 'VND' | 'USD' | 'EUR' | 'CNY' | 'JPY' | 'GBP' | 'KRW';

export const CURRENCIES: { code: CurrencyCode; symbol: string; label: string }[] = [
  { code: 'VND', symbol: '₫', label: 'VND (₫)' },
  { code: 'USD', symbol: '$', label: 'USD ($)' },
  { code: 'EUR', symbol: '€', label: 'EUR (€)' },
  { code: 'GBP', symbol: '£', label: 'GBP (£)' },
  { code: 'CNY', symbol: '¥', label: 'CNY (¥)' },
  { code: 'JPY', symbol: '¥', label: 'JPY (¥)' },
  { code: 'KRW', symbol: '₩', label: 'KRW (₩)' },
];

export const LANGUAGES: { code: GroceryLang; label: string; flag: string }[] = [
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
];

type TranslationKeys = {
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

const translations: Record<GroceryLang, TranslationKeys> = {
  vi: {
    title: 'Grocery & Budget',
    subtitle: 'Danh sách mua sắm từ meal plan & danh sách tùy chỉnh',
    shoppingList: 'Danh Sách Mua Sắm',
    bought: 'đã mua',
    addProduct: 'Thêm sản phẩm',
    clearBought: 'Xóa đã mua',
    productName: 'Tên sản phẩm',
    quantity: 'SL (vd: 2kg)',
    price: 'Giá',
    add: 'Thêm',
    noItems: 'Chưa có sản phẩm. Nhấn "Thêm sản phẩm" để bắt đầu.',
    fromMealPlan: 'Từ Meal Plan',
    timesUsed: 'lần dùng',
    cheapProtein: 'Cheap Protein List',
    deleted: 'Đã xóa',
    addedToList: 'Đã thêm vào danh sách',
    clearedBought: 'Đã xóa các mục đã mua',
    nameRequired: 'Tên không được trống',
    categories: {
      'Thịt & Cá': 'Thịt & Cá', 'Rau củ': 'Rau củ', 'Trái cây': 'Trái cây',
      'Sữa & Trứng': 'Sữa & Trứng', 'Gia vị': 'Gia vị', 'Đồ khô': 'Đồ khô',
      'Đồ uống': 'Đồ uống', 'Supplements': 'Supplements', 'Khác': 'Khác',
    },
  },
  en: {
    title: 'Grocery & Budget',
    subtitle: 'Shopping list from meal plan & custom list',
    shoppingList: 'Shopping List',
    bought: 'bought',
    addProduct: 'Add product',
    clearBought: 'Clear bought',
    productName: 'Product name',
    quantity: 'Qty (e.g. 2kg)',
    price: 'Price',
    add: 'Add',
    noItems: 'No items yet. Tap "Add product" to start.',
    fromMealPlan: 'From Meal Plan',
    timesUsed: 'times used',
    cheapProtein: 'Cheap Protein List',
    deleted: 'Deleted',
    addedToList: 'Added to list',
    clearedBought: 'Cleared bought items',
    nameRequired: 'Name is required',
    categories: {
      'Thịt & Cá': 'Meat & Fish', 'Rau củ': 'Vegetables', 'Trái cây': 'Fruits',
      'Sữa & Trứng': 'Dairy & Eggs', 'Gia vị': 'Spices', 'Đồ khô': 'Dry Goods',
      'Đồ uống': 'Beverages', 'Supplements': 'Supplements', 'Khác': 'Other',
    },
  },
  zh: {
    title: '购物 & 预算',
    subtitle: '来自饮食计划和自定义清单的购物清单',
    shoppingList: '购物清单',
    bought: '已购买',
    addProduct: '添加商品',
    clearBought: '清除已购',
    productName: '商品名称',
    quantity: '数量（如：2kg）',
    price: '价格',
    add: '添加',
    noItems: '暂无商品。点击"添加商品"开始。',
    fromMealPlan: '来自饮食计划',
    timesUsed: '次使用',
    cheapProtein: '廉价蛋白质列表',
    deleted: '已删除',
    addedToList: '已添加到列表',
    clearedBought: '已清除购买项目',
    nameRequired: '名称不能为空',
    categories: {
      'Thịt & Cá': '肉 & 鱼', 'Rau củ': '蔬菜', 'Trái cây': '水果',
      'Sữa & Trứng': '乳制品 & 蛋', 'Gia vị': '调料', 'Đồ khô': '干货',
      'Đồ uống': '饮料', 'Supplements': '补充剂', 'Khác': '其他',
    },
  },
  ja: {
    title: '買い物 & 予算',
    subtitle: '食事プランとカスタムリストからの買い物リスト',
    shoppingList: '買い物リスト',
    bought: '購入済み',
    addProduct: '商品を追加',
    clearBought: '購入済みを削除',
    productName: '商品名',
    quantity: '数量（例：2kg）',
    price: '価格',
    add: '追加',
    noItems: 'まだ商品がありません。「商品を追加」をタップして始めましょう。',
    fromMealPlan: '食事プランから',
    timesUsed: '回使用',
    cheapProtein: '安いプロテインリスト',
    deleted: '削除しました',
    addedToList: 'リストに追加しました',
    clearedBought: '購入済みを削除しました',
    nameRequired: '名前は必須です',
    categories: {
      'Thịt & Cá': '肉 & 魚', 'Rau củ': '野菜', 'Trái cây': '果物',
      'Sữa & Trứng': '乳製品 & 卵', 'Gia vị': '調味料', 'Đồ khô': '乾物',
      'Đồ uống': '飲料', 'Supplements': 'サプリメント', 'Khác': 'その他',
    },
  },
  es: {
    title: 'Compras & Presupuesto',
    subtitle: 'Lista de compras del plan de comidas y lista personalizada',
    shoppingList: 'Lista de Compras',
    bought: 'comprados',
    addProduct: 'Agregar producto',
    clearBought: 'Limpiar comprados',
    productName: 'Nombre del producto',
    quantity: 'Cant. (ej: 2kg)',
    price: 'Precio',
    add: 'Agregar',
    noItems: 'Sin productos aún. Toca "Agregar producto" para empezar.',
    fromMealPlan: 'Del Plan de Comidas',
    timesUsed: 'veces usado',
    cheapProtein: 'Lista de Proteínas Baratas',
    deleted: 'Eliminado',
    addedToList: 'Agregado a la lista',
    clearedBought: 'Elementos comprados eliminados',
    nameRequired: 'El nombre es obligatorio',
    categories: {
      'Thịt & Cá': 'Carne & Pescado', 'Rau củ': 'Verduras', 'Trái cây': 'Frutas',
      'Sữa & Trứng': 'Lácteos & Huevos', 'Gia vị': 'Especias', 'Đồ khô': 'Secos',
      'Đồ uống': 'Bebidas', 'Supplements': 'Suplementos', 'Khác': 'Otros',
    },
  },
};

export function t(lang: GroceryLang): TranslationKeys {
  return translations[lang];
}

export function formatPrice(value: number, currency: CurrencyCode): string {
  const cur = CURRENCIES.find(c => c.code === currency);
  if (!cur) return `${value}`;
  if (currency === 'VND') return `${Math.round(value).toLocaleString()}${cur.symbol}`;
  if (currency === 'JPY' || currency === 'KRW') return `${cur.symbol}${Math.round(value).toLocaleString()}`;
  return `${cur.symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
