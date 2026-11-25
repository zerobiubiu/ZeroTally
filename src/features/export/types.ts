import type { AccountCategory, AccountKind } from '../accounts/types';
import type { CategoryType } from '../categories/types';
import type { TransactionType } from '../transactions/types';

export type ExportFormat = 'json' | 'csv';

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
  isArchived: boolean;
  note: string;
}

export interface ExportedCategory {
  id: string;
  name: string;
  type: CategoryType;
  typeLabel: string;
  isSystem: boolean;
  isArchived: boolean;
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
  accountId: string;
  accountName: string;
  toAccountId: string | null;
  toAccountName: string | null;
  note: string;
  createdAt: string;
}

export interface LedgerExportPayload {
  schemaVersion: number;
  app: 'keep-accounts';
  currency: 'CNY';
  exportedAt: string;
  summary: {
    netWorthCents: number;
    netWorthYuan: string;
    totalAssetsCents: number;
    totalAssetsYuan: string;
    totalLiabilitiesCents: number;
    totalLiabilitiesYuan: string;
    accountCount: number;
    categoryCount: number;
    transactionCount: number;
  };
  accounts: ExportedAccount[];
  categories: ExportedCategory[];
  transactions: ExportedTransaction[];
}

export interface GeneratedExportArtifact {
  format: ExportFormat;
  filename: string;
  mimeType: string;
  content: string;
  transactionCount: number;
  accountCount: number;
}
