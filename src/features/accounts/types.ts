/**
 * 资产与负债账户领域类型定义
 */

export type AccountKind = 'asset' | 'liability';

export type AccountCategory =
  | 'cash'
  | 'bank'
  | 'digital'
  | 'investment'
  | 'credit'
  | 'loan'
  | 'other';

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  category: AccountCategory;
  /**
   * 账户净余额（单位：分）
   * 资产账户通常 >= 0；负债账户欠款以负数表示（如欠 500 元为 -50000）
   */
  balanceCents: number;
  includeInNetWorth: boolean;
  includeInTotalAssets: boolean;
  /** 是否可作为记账 / 转账 / 退款的可选账户 */
  isSelectable: boolean;
  icon: string;
  color: string;
  note: string;
  /** 银行卡类账户基础信息（其他类型为 ''） */
  cardNumber: string;
  bankName: string;
  bankBranch: string;
  /** 开户日期（YYYY-MM-DD），未填为 '' */
  openedOn: string;
  isArchived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountInput {
  name: string;
  category: AccountCategory;
  /** 账户初始净余额（单位：分；负债欠款应传入负数） */
  initialBalanceCents: number;
  includeInNetWorth?: boolean;
  includeInTotalAssets?: boolean;
  isSelectable?: boolean;
  icon: string;
  color: string;
  note?: string;
  cardNumber?: string;
  bankName?: string;
  bankBranch?: string;
  openedOn?: string;
}

export interface UpdateAccountInput {
  name: string;
  category: AccountCategory;
  includeInNetWorth: boolean;
  includeInTotalAssets: boolean;
  isSelectable: boolean;
  icon: string;
  color: string;
  note: string;
  cardNumber: string;
  bankName: string;
  bankBranch: string;
  openedOn: string;
}

export interface NetWorthSummary {
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  netWorthCents: number;
  includedCount: number;
  excludedCount: number;
}

export interface AccountCategoryMeta {
  value: AccountCategory;
  label: string;
  defaultKind: AccountKind;
  defaultIcon: string;
  defaultColor: string;
}

export const ACCOUNT_CATEGORY_METAS: readonly AccountCategoryMeta[] = [
  {
    value: 'cash',
    label: '现金',
    defaultKind: 'asset',
    defaultIcon: 'cash-outline',
    defaultColor: '#059669',
  },
  {
    value: 'bank',
    label: '储蓄卡',
    defaultKind: 'asset',
    defaultIcon: 'card-outline',
    defaultColor: '#0284C7',
  },
  {
    value: 'digital',
    label: '网络支付',
    defaultKind: 'asset',
    defaultIcon: 'wallet-outline',
    defaultColor: '#0F766E',
  },
  {
    value: 'investment',
    label: '理财投资',
    defaultKind: 'asset',
    defaultIcon: 'trending-up-outline',
    defaultColor: '#D97706',
  },
  {
    value: 'credit',
    label: '信用卡 / 信用付',
    defaultKind: 'liability',
    defaultIcon: 'card-outline',
    defaultColor: '#E11D48',
  },
  {
    value: 'loan',
    label: '借款 / 负债',
    defaultKind: 'liability',
    defaultIcon: 'receipt-outline',
    defaultColor: '#C25A00',
  },
  {
    value: 'other',
    label: '其他账户',
    defaultKind: 'asset',
    defaultIcon: 'layers-outline',
    defaultColor: '#5C6479',
  },
] as const;

export const ACCOUNT_COLOR_OPTIONS: readonly string[] = [
  '#0F766E',
  '#059669',
  '#0284C7',
  '#D97706',
  '#E11D48',
  '#7C3AED',
  '#494E62',
] as const;

export const ACCOUNT_ICON_OPTIONS: readonly string[] = [
  'wallet-outline',
  'cash-outline',
  'card-outline',
  'phone-portrait-outline',
  'trending-up-outline',
  'business-outline',
  'receipt-outline',
  'layers-outline',
] as const;
