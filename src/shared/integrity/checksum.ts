/**
 * 确定性 64 位 FNV-1a 内容校验指纹（纯 JS BigInt 实现，React Native 与 Node 测试环境输出 100% 一致，零平台依赖）。
 * 用于为导出 JSON 附加完整性校验指纹，导入时可识别文件是否损坏或经过手动修改。
 */

export const CHECKSUM_ALGORITHM = 'fnv1a-64-v1' as const;

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const sorted: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      sorted[k] = canonicalizeValue(v);
    }
    return sorted;
  }
  return value;
}

export function computeJsonChecksum(data: unknown): string {
  const canonical = JSON.stringify(canonicalizeValue(data));
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= BigInt(canonical.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}
