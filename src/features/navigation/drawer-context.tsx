import { createContext, useContext } from 'react';
import type { LedgerPeriodMode } from '../transactions/types';

export interface MainDrawerContextValue {
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  /** 明细页当前周期模式（由全局固定顶栏与明细页共享） */
  ledgerPeriodMode: LedgerPeriodMode;
  setLedgerPeriodMode: (mode: LedgerPeriodMode) => void;
}

const DEFAULT_VALUE: MainDrawerContextValue = {
  isDrawerOpen: false,
  openDrawer: () => {},
  closeDrawer: () => {},
  ledgerPeriodMode: 'month',
  setLedgerPeriodMode: () => {},
};

export const MainDrawerContext = createContext<MainDrawerContextValue>(DEFAULT_VALUE);

export function useMainDrawer(): MainDrawerContextValue {
  return useContext(MainDrawerContext);
}
