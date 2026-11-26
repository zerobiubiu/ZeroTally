import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';

export type IoniconName = keyof typeof Ionicons.glyphMap;
export type MciIconName = keyof typeof MaterialCommunityIcons.glyphMap;

export const MCI_ICON_PREFIX = 'mci:';

interface AppIconProps {
  name: string;
  size?: number;
  color: string;
}

/**
 * 校验图标标识是否在 Ionicons 或 MaterialCommunityIcons（`mci:` 前缀）图库中有效
 */
export function isValidAppIconName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith(MCI_ICON_PREFIX)) {
    const raw = trimmed.slice(MCI_ICON_PREFIX.length);
    return raw in MaterialCommunityIcons.glyphMap;
  }
  return trimmed in Ionicons.glyphMap;
}

export function AppIcon({ name, size = 20, color }: AppIconProps): React.JSX.Element {
  if (name.startsWith(MCI_ICON_PREFIX)) {
    const raw = name.slice(MCI_ICON_PREFIX.length);
    if (raw in MaterialCommunityIcons.glyphMap) {
      return <MaterialCommunityIcons name={raw as MciIconName} size={size} color={color} />;
    }
  }

  const ionName: IoniconName =
    name in Ionicons.glyphMap ? (name as IoniconName) : 'ellipse-outline';
  return <Ionicons name={ionName} size={size} color={color} />;
}
