/** 趋势折线图 —— 多个系列随时间变化（新增企业/员工/邮箱）。
 *
 * 3 条线用分类色板的前三位（已校验：全配对 CVD ΔE 9.2、常视觉 24.0）。
 * 规范要求：≥2 系列必须有图例；线宽 2px；只在悬停时显示点，避免满图圆点。
 */

import {
  CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis,
} from 'recharts';
import { chartColors, LEGEND_PROPS, LINE_PROPS, ChartTooltip, ChartCanvas } from './chartTheme';
import { AXIS_PROPS, GRID_PROPS } from './chartTheme';
import { formatDate } from '../../utils/date';
import { useI18n } from '../../i18n';

export interface TrendPoint {
  date: string;
  companies: number;
  employees: number;
  emails: number;
}

const SERIES = [
  { key: 'companies', name: '新增企业数' },
  { key: 'employees', name: '新增员工' },
  { key: 'emails', name: '新增邮箱' },
] as const;

export default function TrendLineChart({ data, height = 220 }: { data: TrendPoint[]; height?: number }) {
  const { t } = useI18n();
  return (
    <ChartCanvas height={height}>
      {({ width, height: h }) => (
      <LineChart width={width} height={h} data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis
          {...AXIS_PROPS}
          dataKey="date"
          minTickGap={24}
          tickFormatter={(v: string) => v.slice(5)}  // MM-DD，省掉年份
        />
        <YAxis {...AXIS_PROPS} allowDecimals={false} width={44} />
        <Tooltip
          content={<ChartTooltip labelFormatter={(v: string) => formatDate(v)} />}
          cursor={{ stroke: chartColors.axisText, strokeDasharray: '3 3' }}
        />
        <Legend {...LEGEND_PROPS} />
        {SERIES.map((s, i) => (
          <Line
            key={s.key}
            {...LINE_PROPS}
            dataKey={s.key}
            name={t(s.name)}
            stroke={chartColors.categorical[i]}
          />
        ))}
      </LineChart>
      )}
    </ChartCanvas>
  );
}
