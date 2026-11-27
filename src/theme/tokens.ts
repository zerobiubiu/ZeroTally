import type { ViewStyle } from 'react-native';
import { PALETTE } from './palette';

export type ThemeMode = 'light' | 'dark';

export interface SemanticColors {
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  surfaceOverlay: string;
  /** 分组表单画布浅灰底色（无边框卡片依赖此底色差建立层级） */
  surfaceGrouped: string;

  text: string;
  textSecondary: string;
  textMuted: string;
  /** 输入框占位符弱化文字色（与已输入 text 显著拉开对比度） */
  placeholder: string;

  border: string;
  borderStrong: string;
  /** 卡片内部缩进极浅分割线 */
  divider: string;

  action: string;
  onAction: string;
  actionSubtle: string;
  /** 无描边选中态与图标徽章的柔和品牌主色浅底 */
  actionSurface: string;
  actionTextOnSubtle: string;
  /** 无描边未选中胶囊/选项块的柔和浅灰底 */
  chipInactive: string;

  heroBg: string;
  heroText: string;
  heroSubtext: string;
  heroDivider: string;

  expense: string;
  expenseSubtle: string;
  expenseTextOnSubtle: string;

  income: string;
  incomeSubtle: string;
  incomeTextOnSubtle: string;

  transfer: string;
  transferSubtle: string;
  transferTextOnSubtle: string;

  warning: string;
  warningSubtle: string;
  warningTextOnSubtle: string;

  scrim: string;
}

export const LIGHT_COLORS: SemanticColors = {
  surface: PALETTE.neutral[100],
  surfaceRaised: PALETTE.white,
  surfaceSunken: PALETTE.neutral[50],
  surfaceOverlay: PALETTE.white,
  surfaceGrouped: '#f4f5f7',

  text: PALETTE.neutral[900],
  textSecondary: PALETTE.neutral[700],
  textMuted: PALETTE.neutral[600],
  placeholder: PALETTE.neutral[400],

  border: PALETTE.neutral[200],
  borderStrong: PALETTE.neutral[300],
  divider: '#f0f1f3',

  action: PALETTE.primary[700],
  onAction: PALETTE.white,
  actionSubtle: PALETTE.primary[100],
  actionSurface: 'rgba(1, 120, 83, 0.10)',
  actionTextOnSubtle: PALETTE.primary[900],
  chipInactive: '#eaedf1',

  heroBg: PALETTE.primary[900],
  heroText: PALETTE.neutral[50],
  heroSubtext: PALETTE.primary[200],
  heroDivider: PALETTE.primary[700],

  expense: PALETTE.expense[600],
  expenseSubtle: PALETTE.expense[100],
  expenseTextOnSubtle: PALETTE.expense[900],

  income: PALETTE.income[700],
  incomeSubtle: PALETTE.income[100],
  incomeTextOnSubtle: PALETTE.income[900],

  transfer: PALETTE.transfer[600],
  transferSubtle: PALETTE.transfer[100],
  transferTextOnSubtle: PALETTE.transfer[900],

  warning: PALETTE.warning[700],
  warningSubtle: PALETTE.warning[100],
  warningTextOnSubtle: PALETTE.warning[900],

  scrim: 'rgba(17, 18, 31, 0.5)',
};

export const DARK_COLORS: SemanticColors = {
  surface: PALETTE.neutral[950],
  surfaceRaised: PALETTE.neutral[900],
  surfaceSunken: PALETTE.neutral[800],
  surfaceOverlay: PALETTE.neutral[800],
  surfaceGrouped: PALETTE.neutral[950],

  text: PALETTE.neutral[50],
  textSecondary: PALETTE.neutral[200],
  textMuted: PALETTE.neutral[300],
  placeholder: PALETTE.neutral[500],

  border: PALETTE.neutral[800],
  borderStrong: PALETTE.neutral[700],
  divider: 'rgba(250, 253, 255, 0.08)',

  action: PALETTE.primary[400],
  onAction: PALETTE.neutral[950],
  actionSubtle: PALETTE.primary[900],
  actionSurface: 'rgba(40, 203, 192, 0.16)',
  actionTextOnSubtle: PALETTE.primary[200],
  chipInactive: PALETTE.neutral[800],

  heroBg: PALETTE.primary[900],
  heroText: PALETTE.neutral[50],
  heroSubtext: PALETTE.primary[200],
  heroDivider: PALETTE.primary[700],

  expense: PALETTE.expense[300],
  expenseSubtle: PALETTE.expense[900],
  expenseTextOnSubtle: PALETTE.expense[100],

  income: PALETTE.income[300],
  incomeSubtle: PALETTE.income[900],
  incomeTextOnSubtle: PALETTE.income[100],

  transfer: PALETTE.transfer[300],
  transferSubtle: PALETTE.transfer[900],
  transferTextOnSubtle: PALETTE.transfer[100],

  warning: PALETTE.warning[300],
  warningSubtle: PALETTE.warning[900],
  warningTextOnSubtle: PALETTE.warning[100],

  scrim: 'rgba(0, 0, 0, 0.65)',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const FONT_SIZE = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  hero: 30,
  display: 36,
} as const;

/** 严格限制两档字重：常规 400、强调 600 */
export const FONT_WEIGHT = {
  regular: '400',
  semibold: '600',
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;

export const BORDER_WIDTH = {
  hairline: 1,
  focus: 2,
} as const;

export const OPACITY = {
  disabled: 0.45,
  pressed: 0.78,
} as const;

export interface ElevationScale {
  card: ViewStyle;
  floating: ViewStyle;
}

export function getElevation(mode: ThemeMode): ElevationScale {
  if (mode === 'dark') {
    // 深色模式下以更浅的表面层级表达高度，仅保留轻量投影轮廓
    return {
      card: {
        elevation: 0,
      },
      floating: {
        elevation: 6,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
    };
  }

  return {
    card: {
      elevation: 1,
      shadowColor: '#11121f',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
    },
    floating: {
      elevation: 5,
      shadowColor: '#00522f',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
    },
  };
}

export interface AppTheme {
  mode: ThemeMode;
  colors: SemanticColors;
  spacing: typeof SPACING;
  fontSize: typeof FONT_SIZE;
  fontWeight: typeof FONT_WEIGHT;
  radius: typeof RADIUS;
  borderWidth: typeof BORDER_WIDTH;
  opacity: typeof OPACITY;
  elevation: ElevationScale;
}

export function buildTheme(mode: ThemeMode): AppTheme {
  return {
    mode,
    colors: mode === 'dark' ? DARK_COLORS : LIGHT_COLORS,
    spacing: SPACING,
    fontSize: FONT_SIZE,
    fontWeight: FONT_WEIGHT,
    radius: RADIUS,
    borderWidth: BORDER_WIDTH,
    opacity: OPACITY,
    elevation: getElevation(mode),
  };
}
