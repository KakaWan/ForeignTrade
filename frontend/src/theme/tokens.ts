/** 设计 token —— 全站色值/间距/圆角/字号的唯一来源。
 *
 * 设计取向（参考 Linear / Vercel / Stripe 这类现代面板）：
 * - **一个强调色，其余全中性**：靛蓝只用于主操作、选中态、当前导航；其余一律走
 *   锌灰阶梯，靠灰阶而不是彩色块建立层次。
 * - **发丝描边优先，几乎不用投影**：1px 半透明黑比彩色边框和投影更"贵"；投影只留给
 *   浮层（下拉、气泡）。
 * - **克制的字阶**：大字不用 700，用 600 + 负字距；标签小而稳，不抢戏。
 * - **留白优于分隔**：能靠间距分开的就不画线，画线也用最淡的一档。
 */

// ── 色板 ──────────────────────────────────────────────
export const colors = {
  /** 唯一强调色（同时是 antd colorPrimary，保证按钮/选中态一致） */
  primary: '#4f46e5',
  primaryHover: '#4338ca',
  primarySoft: '#eef2ff',

  // 面
  canvas: '#fafafa',
  surface: '#ffffff',
  surfaceSunken: '#f4f4f5',
  surfaceHover: '#fafafa',

  // 线（半透明黑，比实色灰更贴合任何底色）
  hairline: 'rgba(0, 0, 0, 0.07)',
  hairlineStrong: 'rgba(0, 0, 0, 0.12)',

  // 墨（锌灰阶梯）
  ink: '#18181b',
  inkSecondary: '#52525b',
  inkMuted: '#a1a1aa',
  inkFaint: '#d4d4d8',

  // 语义（只在真正表示状态时用，且必须配文字）
  positive: '#16a34a',
  caution: '#d97706',
  negative: '#dc2626',
} as const;

/** 图表用色 —— 已用 dataviz 规范的校验脚本验证过（白卡片表面全项 PASS）。
 *  改动前请重跑：node scripts/validate_palette.js "<hex,...>" --mode light --surface "#ffffff" */
export const chartColors = {
  /** 分类色：固定顺序，不按名次重排（否则筛掉一个系列后其他系列会换色） */
  categorical: ['#2a78d6', '#eb6834', '#1baf7a'] as const,
  /** 顺序色：日历热力，单一色相由浅到深 */
  sequential: ['#a5b4fc', '#6366f1', '#4338ca', '#312e81'] as const,
  /** 日历上「当天没有任何操作」的格子 */
  empty: '#f4f4f5',
  /** 状态色：必须配图标+文字，不能只靠颜色表意 */
  status: {
    good: '#0ca30c',
    warning: '#fab219',
    serious: '#ec835a',
    critical: '#d03b3b',
  },
  grid: '#f0f0f1',
  axisText: '#a1a1aa',
} as const;

// ── 间距 / 圆角 / 字号 ────────────────────────────────
export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28,
} as const;

export const radius = {
  card: 12,
  control: 8,
  cell: 7,
  pill: 999,
} as const;

/** 投影只给浮层用。卡片一律靠发丝描边区分，不加投影 —— 满地投影是廉价感的头号来源。 */
export const shadow = {
  overlay: '0 8px 24px rgba(0, 0, 0, 0.10)',
  pop: '0 4px 16px rgba(0, 0, 0, 0.08)',
} as const;

export const fontSize = {
  caption: 11,
  small: 12,
  body: 13,
  label: 13,
  title: 14,
  subtitle: 15,
  metric: 26,
} as const;

/** 数字统一用等宽数位 + 轻微负字距，读数才整齐、才有"精密"感 */
export const metricStyle = {
  fontVariantNumeric: 'tabular-nums' as const,
  letterSpacing: '-0.02em',
} as const;

export const BREAKPOINT_MD = 768;
export const CHART_HEIGHT = 220;
