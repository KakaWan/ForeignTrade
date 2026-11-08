/** 状态分布（部分-整体）。
 *
 * **只有一个取值时不画图**：一根柱子的柱状图是规范里点名的反模式，读者从中得不到
 * 任何信息。这种情况退化成一行文字汇总，等数据真的分流了再自动变成图 —— 布局高度
 * 固定，所以不会突然跳动。
 */

import { Space, Typography } from 'antd';
// 组件的 colors prop 与主题 colors 同名，导入起别名避免遮蔽
import { chartColors, colors as themeColors, fontSize, radius, spacing } from '../../theme/tokens';
import { formatNumber, formatPercent } from '../../utils/format';
import { useI18n } from '../../i18n';

const { Text } = Typography;

export interface StatusItem { name: string; count: number }

export default function StatusBreakdown({ data, labels, colors, unit, emptyText }: {
  data: StatusItem[];
  /** 原始值 → 中文标签（如 new → 新建） */
  labels: Record<string, string>;
  /** 每个状态的色值；默认走状态色板（必须同时有文字标签，不能只靠颜色） */
  colors?: Record<string, string>;
  unit?: string;
  emptyText?: string;
}) {
  const { t } = useI18n();
  const items = data.filter(d => d.count > 0);
  const total = items.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <Text type="secondary" style={{ fontSize: fontSize.small }}>
        {emptyText ?? t('暂无数据')}
      </Text>
    );
  }

  const colorOf = (name: string, i: number) =>
    colors?.[name] ?? [chartColors.categorical[0], chartColors.categorical[1], chartColors.categorical[2]][i % 3];

  // 只有一个取值 → 不画图，改成「大数字 + 说明」把小卡填满，
  // 既守住「一根柱子的柱状图」这条反模式，又不会让卡片显得空。
  if (items.length === 1) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{
            fontSize: fontSize.metric, fontWeight: 700, color: themeColors.ink,
            lineHeight: 1.1, fontVariantNumeric: 'tabular-nums',
          }}>
            {formatNumber(items[0].count)}
          </span>
          <Text style={{ fontSize: fontSize.small, color: themeColors.inkSecondary }}>{unit ?? t('条')}</Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: spacing.sm }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorOf(items[0].name, 0), flexShrink: 0 }} />
          <Text style={{ fontSize: fontSize.body, color: themeColors.inkSecondary }}>
            {t('全部为「{label}」', { label: labels[items[0].name] ?? items[0].name })}
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* 堆叠条：段与段之间留 2px 白色缝隙，边界才看得清 */}
      <div style={{ display: 'flex', height: 14, gap: 2, marginBottom: spacing.md }}>
        {items.map((d, i) => (
          <div
            key={d.name}
            title={`${labels[d.name] ?? d.name} ${d.count}`}
            style={{
              width: `${(d.count / total) * 100}%`,
              background: colorOf(d.name, i),
              borderRadius: radius.control,
              minWidth: 4,
            }}
          />
        ))}
      </div>

      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        {items.map((d, i) => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorOf(d.name, i), flexShrink: 0 }} />
            <Text style={{ fontSize: fontSize.small, flex: 1 }}>{labels[d.name] ?? d.name}</Text>
            <Text strong style={{ fontSize: fontSize.small, fontVariantNumeric: 'tabular-nums' }}>{formatNumber(d.count)}</Text>
            <Text type="secondary" style={{ fontSize: fontSize.caption, width: 40, textAlign: 'right' }}>
              {formatPercent(d.count, total)}
            </Text>
          </div>
        ))}
      </Space>
    </div>
  );
}
