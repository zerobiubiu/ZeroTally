import type { ThemePreference } from '../../theme/theme-context';
import type { AccountCategory, AccountKind } from '../accounts/types';
import type { CategoryType } from '../categories/types';
import type { QuickRecordType } from '../quick-record/types';
import type { TransactionType } from '../transactions/types';

export interface ExportedAccount {
  id: string;
  name: string;
  kind: AccountKind;
  kindLabel: string;
  category: AccountCategory;
  categoryLabel: string;
  balanceCents: number;
  balanceYuan: string;
  includeInNetWorth: boolean;
  includeInTotalAssets: boolean;
  isSelectable: boolean;
  icon: string;
  color: string;
  sortOrder: number;
  isArchived: boolean;
  note: string;
  cardNumber: string;
  bankName: string;
  bankBranch: string;
  openedOn: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExportedCategory {
  id: string;
  name: string;
  type: CategoryType;
  typeLabel: string;
  icon: string;
  color: string;
  /** 上级一级分类；一级分类为 null */
  parentId: string | null;
  parentName: string | null;
  sortOrder: number;
  isSystem: boolean;
  isArchived: boolean;
  createdAt: string;
}

export interface ExportedQuickTemplate {
  id: string;
  name: string;
  type: QuickRecordType;
  amountCents: number;
  amountYuan: string;
  categoryId: string;
  accountId: string;
  note: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExportedTransaction {
  id: string;
  occurredOn: string;
  type: TransactionType;
  typeLabel: string;
  amountCents: number;
  amountYuan: string;
  categoryId: string | null;
  categoryName: string | null;
  /** 所选分类为二级时的一级分类名称 */
  parentCategoryName: string | null;
  accountId: string;
  accountName: string;
  toAccountId: string | null;
  toAccountName: string | null;
  /** 关联的原支出 ID（仅退款记录非空） */
  refundOfId: string | null;
  /** 累计已退款金额（分） */
  refundedCents: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerExportPayload {
  schemaVersion: number;
  app: 'ZeroTally';
  kind: 'full-backup';
  currency: 'CNY';
  exportedAt: string;
  integrity: {
    algorithm: 'fnv1a-64-v1';
    checksum: string;
  };
  settings: {
    themePreference: ThemePreference;
  };
  summary: {
    netWorthCents: number;
    netWorthYuan: string;
    totalAssetsCents: number;
    totalAssetsYuan: string;
    totalLiabilitiesCents: number;
    totalLiabilitiesYuan: string;
    accountCount: number;
    categoryCount: number;
    quickTemplateCount: number;
    transactionCount: number;
  };
  accounts: ExportedAccount[];
  categories: ExportedCategory[];
  quickTemplates: ExportedQuickTemplate[];
  transactions: ExportedTransaction[];
}

export interface GeneratedExportArtifact {
  filename: string;
  mimeType: 'application/json';
  content: string;
  transactionCount: number;
  accountCount: number;
  categoryCount: number;
  quickTemplateCount: number;
}

export interface ValidatedLedgerImport {
  payload: LedgerExportPayload;
  checksumMatched: boolean;
  warnings: string[];
}
