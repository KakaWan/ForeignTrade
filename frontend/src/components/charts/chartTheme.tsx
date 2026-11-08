/** 图表共用配置：配色、坐标轴/网格样式、统一 tooltip。
 *
 * 配色来自 `theme/tokens`，已用可视化规范的校验脚本在本项目的白色卡片表面上验证过。
 * 规范要点（改样式时别破坏）：
 * - **单轴**：绝不出现两个 Y 轴
 * - **名义分类不按数值上色**（国家/业务这类条形图所有条同色）
 * - ≥2 系列必须有图例；低对比色阶必须能切到表格视图（由 ChartCard 提供）
 * - 细笔画：线 2px、圆角数据端 4px、相邻填充之间留 2px 缝隙
 */

import type { ReactNode } from 'react';
import { Typography } from 'antd';
import { chartColors, fontSize, radius, spacing } from '../../theme/tokens';
import { useContainerWidth } from '../ResizableTitle';

const { Text } = Typography;

export const AXIS_PROPS = {
  stroke: chartColors.axisText,
  tick: { fill: chartColors.axisText, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const GRID_PROPS = {
  stroke: chartColors.grid,
  strokeDasharray: '3 3',
  vertical: false,
} as const;

export const LINE_PROPS = {
  strokeWidth: 2,
  dot: { r: 3, strokeWidth: 0 },
  activeDot: { r: 5 },
  type: 'monotone' as const,
} as const;

export const BAR_PROPS = {
  // 数据端圆角（贴基线的一侧保持直角）
  radius: [4, 4, 0, 0] as [number, number, number, number],
  maxBarSize: 28,
} as const;

export const LEGEND_PROPS = {
  iconType: 'circle' as const,
  iconSize: 8,
  wrapperStyle: { fontSize: fontSize.small, paddingTop: spacing.sm },
} as const;

/** 统一 tooltip：白底、细边框、数值用等宽数字对齐 */
export function ChartTooltip({ active, payload, label, labelFormatter, valueSuffix = '' }: any) {
  if (!active || !payload?.length) return null;
  const heading = labelFormatter ? labelFormatter(label) : label;

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${chartColors.grid}`,
      borderRadius: radius.control,
      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
      padding: `${spacing.sm}px ${spacing.md}px`,
      fontSize: fontSize.small,
      minWidth: 132,
    }}>
      {heading !== undefined && heading !== '' && (
        <div style={{ color: chartColors.axisText, fontSize: fontSize.caption, marginBottom: 4 }}>{heading}</div>
      )}
      {payload.map((entry: any) => (
        <div key={entry.dataKey ?? entry.name} style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: '20px' }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: entry.color ?? entry.payload?.fill ?? chartColors.categorical[0],
          }} />
          <Text style={{ fontSize: fontSize.small, flex: 1 }}>{entry.name}</Text>
          <Text strong style={{ fontSize: fontSize.small, fontVariantNumeric: 'tabular-nums' }}>
            {entry.value}{valueSuffix}
          </Text>
        </div>
      ))}
    </div>
  );
}

/** 图表画布：自己测量宽度、用固定高度，再把**明确的像素尺寸**交给 recharts。
 *
 * 不用 recharts 的 ResponsiveContainer —— 实测它在首帧量到 0 宽高时会渲染出一个
 * 8×8 的 SVG 且不再恢复（趋势图就中过招）。这里复用项目已有的 useContainerWidth
 * （表格列宽自适应也是它），尺寸确定、可预测。
 */
export function ChartCanvas({ height, children }: {
  height: number;
  children: (size: { width: number; height: number }) => ReactNode;
}) {
  const [ref, width] = useContainerWidth<HTMLDivElement>();
  return (
    <div ref={ref} style={{ width: '100%', height }}>
      {width > 0 && children({ width, height })}
    </div>
  );
}

export { chartColors };
