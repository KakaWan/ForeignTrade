/** 数字/文案格式化 —— 全站共用。 */

/** 千分位数字，用于 KPI 与表格 */
export function formatNumber(value?: number | null): string {
  if (value === null || value === undefined) return '0';
  return value.toLocaleString('en-US');
}

/** 百分比（0-100 的整数），value 为分母为 0 时返回 '—' 而不是 NaN% */
export function formatPercent(part: number, whole: number, digits = 0): string {
  if (!whole) return '—';
  return `${((part / whole) * 100).toFixed(digits)}%`;
}

/** 大数缩写（1.2k / 3.4w），KPI 卡片空间紧张时用 */
export function formatCompact(value: number): string {
  if (value < 1000) return String(value);
  if (value < 10000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 10000).toFixed(1)}w`;
}

/** 截断长文本（表格/图例里避免撑破布局），配合 Tooltip 使用 */
export function truncate(text: string, max = 24): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
