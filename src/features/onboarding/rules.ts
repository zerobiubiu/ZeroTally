export const ONBOARDING_TIPS_SETTING_KEY = 'onboarding_tips_seen_v1';

export type GestureTipGroup = 'navigation' | 'quick-record' | 'ledger';

export interface GestureTipItem {
  id: string;
  group: GestureTipGroup;
  icon: string;
  title: string;
  gesture: string;
  summary: string;
  highlightInFirstLaunch?: boolean;
}

export const GESTURE_TIP_GROUP_LABELS: Record<GestureTipGroup, string> = {
  navigation: '导航与视图',
  'quick-record': '极速与批量记账',
  ledger: '明细与高效录入',
};

export const GESTURE_TIPS_CATALOG: readonly GestureTipItem[] = [
  {
    id: 'open-drawer',
    group: 'navigation',
    icon: 'menu-outline',
    title: '打开设置侧栏',
    gesture: '点顶部标题 / 右滑',
    summary: '在明细或资产页点击顶部大标题，或在明细页向右轻滑即可拉出设置抽屉。',
    highlightInFirstLaunch: true,
  },
  {
    id: 'swipe-tabs',
    group: 'navigation',
    icon: 'swap-horizontal-outline',
    title: '切换明细与资产',
    gesture: '页面左右滑动',
    summary: '主界面支持直接左右滑动，在「明细」与「资产」两页间跟手切换。',
  },
  {
    id: 'pull-quick-sheet',
    group: 'quick-record',
    icon: 'flash-outline',
    title: '唤出快捷记账面板',
    gesture: '底部栏向上滑动',
    summary: '在底栏任意位置上滑即可拉出常用模板面板，顶栏图标还可进入批量补录。',
    highlightInFirstLaunch: true,
  },
  {
    id: 'radial-fab',
    group: 'quick-record',
    icon: 'radio-button-on-outline',
    title: '扇形极速一键记账',
    gesture: '长按「+」并滑选',
    summary: '长按底部居中「+」号绽放常用扇形菜单，手指滑到对应项松手即刻入账。',
    highlightInFirstLaunch: true,
  },
  {
    id: 'scrub-quick-tile',
    group: 'quick-record',
    icon: 'options-outline',
    title: '快捷卡免打字微调',
    gesture: '长按卡片上下/左右滑',
    summary: '长按快捷卡片上下滑快速调金额、左右滑切换账户；轻点入账 3 秒内可原地撤销。',
    highlightInFirstLaunch: true,
  },
  {
    id: 'swipe-period',
    group: 'ledger',
    icon: 'calendar-outline',
    title: '切期与进入财务分析',
    gesture: '汇总卡左右滑 / 点按',
    summary: '左右滑动明细顶部总览卡可切换月/年周期，点击卡片直达多维账务分析。',
  },
  {
    id: 'swipe-tx-row',
    group: 'ledger',
    icon: 'return-up-back-outline',
    title: '单笔左滑与关联退款',
    gesture: '流水行左滑 / 点按',
    summary: '流水向左滑动可快速编辑、退款或删除；点击条目弹出可上拉展开的详情浮窗。',
  },
  {
    id: 'calculator-keypad',
    group: 'ledger',
    icon: 'calculator-outline',
    title: '键盘实时加减计算',
    gesture: '输入「+ / -」表达式',
    summary: '记账与还款键盘内置整数「分」精度加减运算，多笔合并无需切换系统计算器。',
  },
];

/** 判断是否需要展示首次启动轻量引导（仅当未记录已读标记时返回 true） */
export function shouldShowFirstLaunchGuide(savedRaw: string | null): boolean {
  return savedRaw !== '1';
}

/** 提取首次启动引导卡展示的核心高频手势（固定 4 条，克制不打扰） */
export function getFirstLaunchHighlightTips(): GestureTipItem[] {
  return GESTURE_TIPS_CATALOG.filter((item) => item.highlightInFirstLaunch);
}

/** 按功能分组输出全部手势与快捷技巧 */
export function getGroupedGestureTips(): {
  group: GestureTipGroup;
  title: string;
  items: GestureTipItem[];
}[] {
  const order: GestureTipGroup[] = ['quick-record', 'navigation', 'ledger'];
  return order.map((group) => ({
    group,
    title: GESTURE_TIP_GROUP_LABELS[group],
    items: GESTURE_TIPS_CATALOG.filter((item) => item.group === group),
  }));
}
