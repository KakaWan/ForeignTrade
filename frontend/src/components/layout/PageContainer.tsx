/** 页面外框与页头 —— 统一各页面的留白、最大宽与滚动行为。
 *
 * 之前 6 个页面各写各的根 div（Dashboard 1400px/20-24px，其余 960 或全宽/16-20px），
 * 新页面一律用 PageContainer；旧页面按需逐步迁移。
 */

import type { CSSProperties, ReactNode } from 'react';
import { Space, Typography } from 'antd';
import { colors, fontSize, spacing } from '../../theme/tokens';

const { Title, Text } = Typography;

export default function PageContainer({ children, maxWidth, padded = true, scroll = true, style }: {
  children: ReactNode;
  /** 内容最大宽度；表格类页面传 undefined 让它铺满 */
  maxWidth?: number;
  /** 是否要内边距（整屏表格类页面可关掉自己管） */
  padded?: boolean;
  /** 是否由本容器负责纵向滚动 */
  scroll?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        height: '100%',
        overflowY: scroll ? 'auto' : 'hidden',
        background: colors.canvas,
        padding: padded ? `${spacing.lg}px ${spacing.xl}px` : undefined,
        ...style,
      }}
    >
      <div style={{ maxWidth, margin: maxWidth ? '0 auto' : undefined }}>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, icon, actions, extra }: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  /** 右侧操作区（按钮、时间范围选择等） */
  actions?: ReactNode;
  /** 标题下方的一行补充内容 */
  extra?: ReactNode;
}) {
  return (
    <div style={{ marginBottom: spacing.lg }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: spacing.md, flexWrap: 'wrap',
      }}>
        <Space size={spacing.sm} align="center">
          {icon}
          <Title level={4} style={{ margin: 0, color: colors.ink }}>{title}</Title>
          {subtitle && (
            <Text type="secondary" style={{ fontSize: fontSize.small }}>{subtitle}</Text>
          )}
        </Space>
        {actions && <Space size={spacing.sm} wrap>{actions}</Space>}
      </div>
      {extra && <div style={{ marginTop: spacing.sm }}>{extra}</div>}
    </div>
  );
}
