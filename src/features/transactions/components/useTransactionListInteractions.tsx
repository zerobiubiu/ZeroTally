/**
 * 明细列表交互编排 Hook：
 * 统一管理左滑单行展开、下半屏详情浮窗、退款弹窗、修改/复制跳转与删除确认，
 * 供「明细」首页与「账户详情」页复用，消除跨页面重复状态与逻辑。
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { useDatabase } from '../../../db/database-context';
import { deleteTransaction } from '../service';
import type { TransactionListItem } from '../types';
import { DeleteTransactionDialog } from './DeleteTransactionDialog';
import { RefundSheet, type RefundSheetTarget } from './RefundSheet';
import { TransactionDetailSheet } from './TransactionDetailSheet';

export interface TransactionListInteractions {
  openSwipeId: string | null;
  closeAllSwipes: () => void;
  handleSwipeOpen: (id: string) => void;
  handleSwipeClose: (id: string) => void;
  handleInspect: (item: TransactionListItem) => void;
  handleEdit: (item: TransactionListItem) => void;
  handleRefund: (item: TransactionListItem) => void;
  handleDelete: (item: TransactionListItem) => void;
  overlays: React.JSX.Element;
}

export function useTransactionListInteractions(): TransactionListInteractions {
  const router = useRouter();
  const { db, notifyChange } = useDatabase();

  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<TransactionListItem | null>(null);
  const [refundTarget, setRefundTarget] = useState<RefundSheetTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TransactionListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const closeAllSwipes = useCallback(() => {
    setOpenSwipeId(null);
  }, []);

  const handleSwipeOpen = useCallback((id: string) => {
    setOpenSwipeId(id);
  }, []);

  const handleSwipeClose = useCallback((id: string) => {
    setOpenSwipeId((current) => (current === id ? null : current));
  }, []);

  const handleInspect = useCallback((item: TransactionListItem) => {
    setOpenSwipeId(null);
    setDetailItem(item);
  }, []);

  const handleEdit = useCallback(
    (item: TransactionListItem) => {
      setOpenSwipeId(null);
      if (item.type === 'refund') {
        setRefundTarget({ mode: 'edit', refund: item });
        return;
      }
      if (item.type === 'repayment') {
        router.push({ pathname: '/repayment', params: { id: item.id } });
        return;
      }
      router.push({ pathname: '/record', params: { id: item.id } });
    },
    [router]
  );

  const handleCopy = useCallback(
    (item: TransactionListItem) => {
      setOpenSwipeId(null);
      if (item.type === 'refund' || item.type === 'repayment') {
        return;
      }
      router.push({ pathname: '/record', params: { copyFromId: item.id } });
    },
    [router]
  );

  const handleRefund = useCallback((item: TransactionListItem) => {
    setOpenSwipeId(null);
    if (item.type !== 'expense') {
      return;
    }
    setRefundTarget({ mode: 'create', expense: item });
  }, []);

  const handleDelete = useCallback((item: TransactionListItem) => {
    setOpenSwipeId(null);
    setDeleteError(null);
    setDeleteTarget(item);
  }, []);

  const handleCancelDelete = useCallback(() => {
    if (deleting) {
      return;
    }
    setDeleteTarget(null);
    setDeleteError(null);
  }, [deleting]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget || deleting) {
      return;
    }
    const targetId = deleteTarget.id;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteTransaction(db, targetId);
      setDetailItem((current) => (current?.id === targetId ? null : current));
      setDeleteTarget(null);
      notifyChange();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '无法删除该记录');
    } finally {
      setDeleting(false);
    }
  }, [db, deleteTarget, deleting, notifyChange]);

  const overlays = (
    <>
      <TransactionDetailSheet
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onSelectItem={(next) => setDetailItem(next)}
        onEdit={handleEdit}
        onRefund={handleRefund}
        onCopy={handleCopy}
        onDelete={handleDelete}
      />
      <RefundSheet
        target={refundTarget}
        onClose={() => setRefundTarget(null)}
        onSaved={() => setDetailItem(null)}
      />
      <DeleteTransactionDialog
        item={deleteTarget}
        loading={deleting}
        error={deleteError}
        onCancel={handleCancelDelete}
        onConfirm={() => void handleConfirmDelete()}
      />
    </>
  );

  return {
    openSwipeId,
    closeAllSwipes,
    handleSwipeOpen,
    handleSwipeClose,
    handleInspect,
    handleEdit,
    handleRefund,
    handleDelete,
    overlays,
  };
}
