/**
 * 轻量本地唯一 ID 生成器（不依赖浏览器 crypto.randomUUID，兼容 Hermes 与 Node）
 */
let sequence = 0;

export function createId(prefix: string): string {
  sequence = (sequence + 1) % 10000;
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  const seqPart = sequence.toString(36).padStart(3, '0');
  return `${prefix}_${timestamp}_${seqPart}${randomPart}`;
}
