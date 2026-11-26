import type { CategoryType } from './types';

export interface PresetCategorySeed {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  /** 上级预设分类 ID；一级为 null */
  parentId: string | null;
  sortOrder: number;
}

interface PresetChildDef {
  /** 拼接到上级 ID 后形成稳定 ID（如 cat_exp_food_breakfast） */
  key: string;
  name: string;
  icon: string;
}

interface PresetRootDef {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  children: readonly PresetChildDef[];
}

/**
 * 预设分类树。一级 ID 与 v0.1.0 保持一致（历史账目引用不变），二级 ID 由一级 ID + key 组成。
 * 二级分类继承一级的颜色。
 */
const PRESET_TREE: readonly PresetRootDef[] = [
  // 支出分类
  {
    id: 'cat_exp_food',
    name: '餐饮美食',
    type: 'expense',
    icon: 'restaurant-outline',
    color: '#D97706',
    children: [
      { key: 'breakfast', name: '早餐', icon: 'sunny-outline' },
      { key: 'lunch', name: '午餐', icon: 'fast-food-outline' },
      { key: 'dinner', name: '晚餐', icon: 'moon-outline' },
      { key: 'takeout', name: '外卖', icon: 'bicycle-outline' },
      { key: 'drinks', name: '饮品咖啡', icon: 'cafe-outline' },
      { key: 'snacks', name: '零食水果', icon: 'ice-cream-outline' },
      { key: 'groceries', name: '买菜', icon: 'basket-outline' },
    ],
  },
  {
    id: 'cat_exp_shopping',
    name: '日用购物',
    type: 'expense',
    icon: 'bag-handle-outline',
    color: '#E11D48',
    children: [
      { key: 'daily', name: '日用百货', icon: 'cart-outline' },
      { key: 'digital', name: '数码电器', icon: 'phone-portrait-outline' },
      { key: 'furniture', name: '家居家纺', icon: 'bed-outline' },
      { key: 'baby', name: '母婴用品', icon: 'happy-outline' },
    ],
  },
  {
    id: 'cat_exp_transport',
    name: '交通出行',
    type: 'expense',
    icon: 'bus-outline',
    color: '#0284C7',
    children: [
      { key: 'metro', name: '公交地铁', icon: 'subway-outline' },
      { key: 'taxi', name: '打车', icon: 'car-outline' },
      { key: 'fuel', name: '加油充电', icon: 'flash-outline' },
      { key: 'parking', name: '停车过路', icon: 'speedometer-outline' },
      { key: 'trip', name: '火车飞机', icon: 'airplane-outline' },
      { key: 'bike', name: '共享单车', icon: 'bicycle-outline' },
    ],
  },
  {
    id: 'cat_exp_housing',
    name: '居住物业',
    type: 'expense',
    icon: 'home-outline',
    color: '#0F766E',
    children: [
      { key: 'rent', name: '房租房贷', icon: 'key-outline' },
      { key: 'utilities', name: '水电燃气', icon: 'water-outline' },
      { key: 'property', name: '物业费', icon: 'business-outline' },
      { key: 'repair', name: '维修保养', icon: 'construct-outline' },
    ],
  },
  {
    id: 'cat_exp_entertainment',
    name: '休闲娱乐',
    type: 'expense',
    icon: 'game-controller-outline',
    color: '#7C3AED',
    children: [
      { key: 'movie', name: '电影演出', icon: 'film-outline' },
      { key: 'game', name: '游戏', icon: 'game-controller-outline' },
      { key: 'sport', name: '运动健身', icon: 'barbell-outline' },
      { key: 'travel', name: '旅游度假', icon: 'map-outline' },
      { key: 'subscription', name: '会员订阅', icon: 'ribbon-outline' },
    ],
  },
  {
    id: 'cat_exp_medical',
    name: '医疗健康',
    type: 'expense',
    icon: 'medkit-outline',
    color: '#C81134',
    children: [
      { key: 'clinic', name: '门诊挂号', icon: 'medical-outline' },
      { key: 'medicine', name: '药品', icon: 'bandage-outline' },
      { key: 'checkup', name: '体检', icon: 'pulse-outline' },
      { key: 'insurance', name: '保险', icon: 'shield-checkmark-outline' },
    ],
  },
  {
    id: 'cat_exp_telecom',
    name: '通讯网络',
    type: 'expense',
    icon: 'wifi-outline',
    color: '#0067B2',
    children: [
      { key: 'phone', name: '话费', icon: 'call-outline' },
      { key: 'broadband', name: '宽带', icon: 'globe-outline' },
      { key: 'cloud', name: '云服务', icon: 'cloud-outline' },
    ],
  },
  {
    id: 'cat_exp_education',
    name: '学习教育',
    type: 'expense',
    icon: 'book-outline',
    color: '#0B6D5D',
    children: [
      { key: 'books', name: '书籍', icon: 'book-outline' },
      { key: 'course', name: '课程培训', icon: 'school-outline' },
      { key: 'exam', name: '考试报名', icon: 'create-outline' },
    ],
  },
  {
    id: 'cat_exp_clothing',
    name: '服饰美容',
    type: 'expense',
    icon: 'shirt-outline',
    color: '#DB2777',
    children: [
      { key: 'clothes', name: '衣服鞋包', icon: 'shirt-outline' },
      { key: 'beauty', name: '美妆护肤', icon: 'color-palette-outline' },
      { key: 'haircut', name: '美发', icon: 'cut-outline' },
    ],
  },
  {
    id: 'cat_exp_social',
    name: '人情往来',
    type: 'expense',
    icon: 'gift-outline',
    color: '#C25A00',
    children: [
      { key: 'redpacket', name: '红包礼金', icon: 'mail-outline' },
      { key: 'gift', name: '送礼', icon: 'gift-outline' },
      { key: 'treat', name: '请客聚餐', icon: 'beer-outline' },
      { key: 'family', name: '孝敬长辈', icon: 'heart-outline' },
    ],
  },
  {
    id: 'cat_exp_other',
    name: '其他支出',
    type: 'expense',
    icon: 'ellipsis-horizontal-circle-outline',
    color: '#5C6479',
    children: [
      { key: 'pet', name: '宠物', icon: 'paw-outline' },
      { key: 'donation', name: '捐赠', icon: 'hand-left-outline' },
      { key: 'loss', name: '意外损失', icon: 'alert-circle-outline' },
    ],
  },

  // 收入分类
  {
    id: 'cat_inc_salary',
    name: '工资薪金',
    type: 'income',
    icon: 'briefcase-outline',
    color: '#059669',
    children: [
      { key: 'base', name: '基本工资', icon: 'cash-outline' },
      { key: 'overtime', name: '加班费', icon: 'time-outline' },
      { key: 'fund', name: '公积金', icon: 'business-outline' },
    ],
  },
  {
    id: 'cat_inc_bonus',
    name: '奖金津贴',
    type: 'income',
    icon: 'trophy-outline',
    color: '#D97706',
    children: [
      { key: 'annual', name: '年终奖', icon: 'trophy-outline' },
      { key: 'performance', name: '绩效奖金', icon: 'stats-chart-outline' },
      { key: 'allowance', name: '补贴津贴', icon: 'wallet-outline' },
    ],
  },
  {
    id: 'cat_inc_parttime',
    name: '兼职副业',
    type: 'income',
    icon: 'laptop-outline',
    color: '#0284C7',
    children: [
      { key: 'gig', name: '兼职', icon: 'laptop-outline' },
      { key: 'writing', name: '稿费', icon: 'pencil-outline' },
      { key: 'business', name: '经营所得', icon: 'storefront-outline' },
    ],
  },
  {
    id: 'cat_inc_invest',
    name: '理财收益',
    type: 'income',
    icon: 'trending-up-outline',
    color: '#0F766E',
    children: [
      { key: 'interest', name: '利息', icon: 'cash-outline' },
      { key: 'fund', name: '基金股票', icon: 'trending-up-outline' },
      { key: 'dividend', name: '分红', icon: 'pie-chart-outline' },
    ],
  },
  {
    id: 'cat_inc_redpacket',
    name: '红包礼金',
    type: 'income',
    icon: 'mail-open-outline',
    color: '#E11D48',
    children: [
      { key: 'redpacket', name: '红包', icon: 'mail-open-outline' },
      { key: 'gift', name: '礼金', icon: 'gift-outline' },
    ],
  },
  {
    id: 'cat_inc_refund',
    name: '退款报销',
    type: 'income',
    icon: 'return-down-back-outline',
    color: '#0067B2',
    children: [
      { key: 'refund', name: '退款', icon: 'return-down-back-outline' },
      { key: 'reimburse', name: '报销', icon: 'receipt-outline' },
    ],
  },
  {
    id: 'cat_inc_other',
    name: '其他收入',
    type: 'income',
    icon: 'add-circle-outline',
    color: '#5C6479',
    children: [
      { key: 'resale', name: '二手转卖', icon: 'repeat-outline' },
      { key: 'lottery', name: '中奖', icon: 'sparkles-outline' },
    ],
  },
];

function flattenPresetTree(tree: readonly PresetRootDef[]): PresetCategorySeed[] {
  const roots: PresetCategorySeed[] = [];
  const children: PresetCategorySeed[] = [];
  const rootOrder: Record<CategoryType, number> = { expense: 0, income: 0 };

  for (const root of tree) {
    rootOrder[root.type] += 10;
    roots.push({
      id: root.id,
      name: root.name,
      type: root.type,
      icon: root.icon,
      color: root.color,
      parentId: null,
      sortOrder: rootOrder[root.type],
    });
    root.children.forEach((child, index) => {
      children.push({
        id: `${root.id}_${child.key}`,
        name: child.name,
        type: root.type,
        icon: child.icon,
        color: root.color,
        parentId: root.id,
        sortOrder: (index + 1) * 10,
      });
    });
  }

  // 一级在前，保证插入二级时外键引用的上级已存在
  return [...roots, ...children];
}

export const PRESET_CATEGORIES: readonly PresetCategorySeed[] = flattenPresetTree(PRESET_TREE);

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
