import ioniconsGlyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json';
import mciGlyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json';
import { describe, expect, it } from 'vitest';
import { ALL_CATALOG_ICONS, CATEGORY_ICON_GROUPS } from './icon-catalog';

describe('icon-catalog 双图库图标名有效性校验', () => {
  it('全部精选分类图标均真实存在于对应 Ionicons / MaterialCommunityIcons glyphMap 且无同组重复', () => {
    expect(CATEGORY_ICON_GROUPS.length).toBeGreaterThanOrEqual(8);
    expect(ALL_CATALOG_ICONS.length).toBeGreaterThanOrEqual(120);

    const missing: string[] = [];
    for (const group of CATEGORY_ICON_GROUPS) {
      const seen = new Set<string>();
      for (const icon of group.icons) {
        expect(seen.has(icon)).toBe(false);
        seen.add(icon);
        if (icon.startsWith('mci:')) {
          const raw = icon.slice(4);
          if (!(raw in mciGlyphMap)) {
            missing.push(icon);
          }
        } else if (!(icon in ioniconsGlyphMap)) {
          missing.push(icon);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
