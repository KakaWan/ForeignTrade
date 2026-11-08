/** Top-N 排名条形图（横向，长名字不会被挤没）。
 *
 * **所有条同色**：国家/业务这类是名义分类，没有内在顺序；按大小上色等于把
 * 长度这条信息重复编码一遍，规范里明确列为反模式。
 *
 * 单系列图统一用分类色第一位 —— 一整屏里只有多系列图才需要出现第二种色相，
 * 否则页面会显得吵。
 */

import {
  Bar, BarChart, LabelList, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ChartTooltip, chartColors, ChartCanvas } from './chartTheme';
import { AXIS_PROPS } from './chartTheme';
import { truncate } from '../../utils/format';
import { useI18n } from '../../i18n';

export interface RankItem { name: string; count: number }

export default function RankBarChart({ data, barColor = chartColors.categorical[0], valueSuffix = '', height = 220 }: {
  data: RankItem[];
  barColor?: string;
  valueSuffix?: string;
  height?: number;
}) {
  const { t } = useI18n();
  // 横向条形图按人眼习惯从大到小自上而下排列
  const rows = [...data].sort((a, b) => b.count - a.count);

  return (
    <ChartCanvas height={height}>
      {({ width, height: h }) => (
      <BarChart
        width={width}
        height={h}
        data={rows}
        layout="vertical"
        margin={{ top: 4, right: 36, bottom: 4, left: 8 }}
        barCategoryGap="22%"
      >
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          {...AXIS_PROPS}
          type="category"
          dataKey="name"
          width={92}
          tickFormatter={(v: string) => truncate(v, 7)}
        />
        <Tooltip content={<ChartTooltip valueSuffix={valueSuffix} />} cursor={{ fill: chartColors.grid }} />
        <Bar dataKey="count" name={t('数量')} fill={barColor} radius={[0, 4, 4, 0]} maxBarSize={22}>
          {/* 直接标注数值，省掉读者对着轴估读 */}
          <LabelList
            dataKey="count"
            position="right"
            style={{ fontSize: 11, fill: chartColors.axisText, fontVariantNumeric: 'tabular-nums' }}
          />
        </Bar>
      </BarChart>
      )}
    </ChartCanvas>
  );
}
