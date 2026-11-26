import { describe, expect, it } from 'vitest';
import {
  appendMissingPlaceholderDescriptors,
  isPlaceholderTabDescriptor,
  normalizeOrderedTabState,
  type TabDescriptorLike,
  type TabStateLike,
} from './tab-routes';

interface MockDescriptor extends TabDescriptorLike {
  route: { key: string | undefined; name: string };
  rendered: string | null;
}

describe('tab-routes 双页 Tab 路由规范化纯逻辑', () => {
  it('首屏仅挂载 index 时补齐 assets 占位描述符并按 routeNames 顺序输出双页', () => {
    const rawState: TabStateLike = {
      index: 0,
      routeNames: ['index', 'assets'],
      routes: [{ key: 'index-1', name: 'index' }],
    };
    const rawDescriptors: Record<string, MockDescriptor> = {
      'index-1': { route: { key: 'index-1', name: 'index' }, rendered: 'ledger' },
    };

    const nextDescriptors = appendMissingPlaceholderDescriptors(
      rawDescriptors,
      rawState,
      (route) => ({ route, rendered: null })
    );

    expect(Object.keys(nextDescriptors)).toEqual(['index-1', 'assets']);
    expect(isPlaceholderTabDescriptor(nextDescriptors['index-1'])).toBe(false);
    expect(isPlaceholderTabDescriptor(nextDescriptors.assets)).toBe(true);

    const normalized = normalizeOrderedTabState(rawState, nextDescriptors);
    expect(normalized.index).toBe(0);
    expect(normalized.routes.map((r) => ({ key: r.key, name: r.name }))).toEqual([
      { key: 'index-1', name: 'index' },
      { key: 'assets', name: 'assets' },
    ]);
  });

  it('assets 预加载完成后以真实 key 替换占位路由且保持引用稳定', () => {
    const preloadedState: TabStateLike = {
      index: 0,
      routeNames: ['index', 'assets'],
      routes: [
        { key: 'index-1', name: 'index' },
        { key: 'assets-2', name: 'assets' },
      ],
    };
    const descriptors: Record<string, MockDescriptor> = {
      'index-1': { route: { key: 'index-1', name: 'index' }, rendered: 'ledger' },
      'assets-2': { route: { key: 'assets-2', name: 'assets' }, rendered: 'assets' },
    };

    const nextDescriptors = appendMissingPlaceholderDescriptors(
      descriptors,
      preloadedState,
      (route) => ({ route, rendered: null })
    );
    expect(nextDescriptors).toBe(descriptors);
    expect(isPlaceholderTabDescriptor(nextDescriptors['assets-2'])).toBe(false);

    const normalized = normalizeOrderedTabState(preloadedState, nextDescriptors);
    expect(normalized).toBe(preloadedState);
  });

  it('先打开 assets 再预加载 index 时仍固定「明细(0) / 资产(1)」顺序并将 index 指向 1', () => {
    const reversedState: TabStateLike = {
      index: 0,
      routeNames: ['index', 'assets'],
      routes: [
        { key: 'assets-9', name: 'assets' },
        { key: 'index-3', name: 'index' },
      ],
    };
    const descriptors: Record<string, MockDescriptor> = {
      'assets-9': { route: { key: 'assets-9', name: 'assets' }, rendered: 'assets' },
      'index-3': { route: { key: 'index-3', name: 'index' }, rendered: 'ledger' },
    };

    const normalized = normalizeOrderedTabState(reversedState, descriptors);
    expect(normalized.routes.map((r) => r.name)).toEqual(['index', 'assets']);
    expect(normalized.index).toBe(1);
    expect(normalized.routes[normalized.index]?.key).toBe('assets-9');
  });
});
