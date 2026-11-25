import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';

export type IoniconName = keyof typeof Ionicons.glyphMap;

interface AppIconProps {
  name: string;
  size?: number;
  color: string;
}

function resolveIconName(name: string): IoniconName {
  if (name in Ionicons.glyphMap) {
    return name as IoniconName;
  }
  return 'ellipse-outline';
}

export function AppIcon({ name, size = 20, color }: AppIconProps): React.JSX.Element {
  return <Ionicons name={resolveIconName(name)} size={size} color={color} />;
}
