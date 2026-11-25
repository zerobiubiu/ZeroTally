import type { CategoryType } from './types';

export interface PresetCategorySeed {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  sortOrder: number;
}

export const PRESET_CATEGORIES: readonly PresetCategorySeed[] = [
  // 支出分类
  {
    id: 'cat_exp_food',
    name: '餐饮美食',
    type: 'expense',
    icon: 'restaurant-outline',
    color: '#D97706',
    sortOrder: 10,
  },
  {
    id: 'cat_exp_shopping',
    name: '日用购物',
    type: 'expense',
    icon: 'bag-handle-outline',
    color: '#E11D48',
    sortOrder: 20,
  },
  {
    id: 'cat_exp_transport',
    name: '交通出行',
    type: 'expense',
    icon: 'bus-outline',
    color: '#0284C7',
    sortOrder: 30,
  },
  {
    id: 'cat_exp_housing',
    name: '居住物业',
    type: 'expense',
    icon: 'home-outline',
    color: '#0F766E',
    sortOrder: 40,
  },
  {
    id: 'cat_exp_entertainment',
    name: '休闲娱乐',
    type: 'expense',
    icon: 'game-controller-outline',
    color: '#7C3AED',
    sortOrder: 50,
  },
  {
    id: 'cat_exp_medical',
    name: '医疗健康',
    type: 'expense',
    icon: 'medkit-outline',
    color: '#C81134',
    sortOrder: 60,
  },
  {
    id: 'cat_exp_telecom',
    name: '通讯网络',
    type: 'expense',
    icon: 'wifi-outline',
    color: '#0067B2',
    sortOrder: 70,
  },
  {
    id: 'cat_exp_education',
    name: '学习教育',
    type: 'expense',
    icon: 'book-outline',
    color: '#0B6D5D',
    sortOrder: 80,
  },
  {
    id: 'cat_exp_clothing',
    name: '服饰美容',
    type: 'expense',
    icon: 'shirt-outline',
    color: '#DB2777',
    sortOrder: 90,
  },
  {
    id: 'cat_exp_social',
    name: '人情往来',
    type: 'expense',
    icon: 'gift-outline',
    color: '#C25A00',
    sortOrder: 100,
  },
  {
    id: 'cat_exp_other',
    name: '其他支出',
    type: 'expense',
    icon: 'ellipsis-horizontal-circle-outline',
    color: '#5C6479',
    sortOrder: 110,
  },

  // 收入分类
  {
    id: 'cat_inc_salary',
    name: '工资薪金',
    type: 'income',
    icon: 'briefcase-outline',
    color: '#059669',
    sortOrder: 10,
  },
  {
    id: 'cat_inc_bonus',
    name: '奖金津贴',
    type: 'income',
    icon: 'trophy-outline',
    color: '#D97706',
    sortOrder: 20,
  },
  {
    id: 'cat_inc_parttime',
    name: '兼职副业',
    type: 'income',
    icon: 'laptop-outline',
    color: '#0284C7',
    sortOrder: 30,
  },
  {
    id: 'cat_inc_invest',
    name: '理财收益',
    type: 'income',
    icon: 'trending-up-outline',
    color: '#0F766E',
    sortOrder: 40,
  },
  {
    id: 'cat_inc_redpacket',
    name: '红包礼金',
    type: 'income',
    icon: 'mail-open-outline',
    color: '#E11D48',
    sortOrder: 50,
  },
  {
    id: 'cat_inc_refund',
    name: '退款报销',
    type: 'income',
    icon: 'return-down-back-outline',
    color: '#0067B2',
    sortOrder: 60,
  },
  {
    id: 'cat_inc_other',
    name: '其他收入',
    type: 'income',
    icon: 'add-circle-outline',
    color: '#5C6479',
    sortOrder: 70,
  },
] as const;

export const CUSTOM_CATEGORY_ICONS: readonly string[] = [
  'restaurant-outline',
  'cafe-outline',
  'bag-handle-outline',
  'cart-outline',
  'bus-outline',
  'car-outline',
  'home-outline',
  'game-controller-outline',
  'film-outline',
  'medkit-outline',
  'fitness-outline',
  'book-outline',
  'shirt-outline',
  'gift-outline',
  'paw-outline',
  'briefcase-outline',
  'trending-up-outline',
  'cash-outline',
  'star-outline',
  'pricetag-outline',
] as const;

export const CUSTOM_CATEGORY_COLORS: readonly string[] = [
  '#0F766E',
  '#059669',
  '#0284C7',
  '#D97706',
  '#E11D48',
  '#7C3AED',
  '#DB2777',
  '#5C6479',
] as const;
