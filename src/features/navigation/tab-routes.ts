/**
 * 双页 Tab 导航路由规范化纯逻辑：
 * 对齐 Expo Router SDK 58 TabRouter 懒加载机制，补齐未挂载 Tab 的占位描述符，
 * 并按 routeNames 固定顺序输出路由数组，确保首屏即完整呈现「明细(0) / 资产(1)」。
 */

export interface TabRouteLike {
  key: string;
  name: string;
  params?: object;
}

export interface TabStateLike<TRoute extends TabRouteLike = TabRouteLike> {
  index: number;
  routes: TRoute[];
  routeNames: string[];
}

export interface TabDescriptorLike {
  route?: {
    key?: string;
    name: string;
    params?: object;
  };
}

export function isPlaceholderTabDescriptor(descriptor: unknown): boolean {
  if (!descriptor || typeof descriptor !== 'object' || !('route' in descriptor)) {
    return false;
  }
  const route = (descriptor as TabDescriptorLike).route;
  return route !== undefined && route.key === undefined;
}

export function appendMissingPlaceholderDescriptors<
  TDescriptor extends TabDescriptorLike,
  TState extends TabStateLike,
>(
  descriptors: Record<string, TDescriptor>,
  state: TState,
  describe: (route: { key: undefined; name: string }) => TDescriptor
): Record<string, TDescriptor> {
  const missingNames = state.routeNames.filter(
    (name) => !state.routes.some((route) => route.name === name)
  );
  if (missingNames.length === 0) {
    return descriptors;
  }
  const extra: Record<string, TDescriptor> = {};
  for (const name of missingNames) {
    extra[name] = describe({ key: undefined, name });
  }
  return { ...descriptors, ...extra };
}

export function normalizeOrderedTabState<
  TState extends TabStateLike,
  TDescriptor extends TabDescriptorLike,
>(state: TState, descriptors: Record<string, TDescriptor>): TState {
  const focusedKey = state.routes[state.index]?.key;
  const orderedRoutes = state.routeNames.map((name) => {
    const existing = state.routes.find((route) => route.name === name);
    if (existing) {
      return existing;
    }
    const placeholder = descriptors[name];
    return {
      ...(placeholder?.route ?? {}),
      key: name,
      name,
    };
  });

  const nextIndex = Math.max(
    0,
    orderedRoutes.findIndex((route) => route.key === focusedKey)
  );

  const unchanged =
    orderedRoutes.length === state.routes.length &&
    nextIndex === state.index &&
    orderedRoutes.every((route, idx) => route === state.routes[idx]);

  if (unchanged) {
    return state;
  }

  return {
    ...state,
    index: nextIndex,
    routes: orderedRoutes,
  };
}
