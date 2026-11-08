/** 区块卡片与空状态。
 *
 * 极简取向：**发丝描边 + 不加投影**，标题与内容之间用一条最淡的分隔线断开，
 * 标题左侧最多放一个灰色小图标（不做彩色底块 —— 那是最容易显廉价的装饰）。
 */

import type { CSSProperties, ReactNode } from 'react';
import { Empty, Typography } from 'antd';
import { colors, fontSize, radius, spacing } from '../../theme/tokens';

const { Text } = Typography;

export default function SectionCard({
  title, subtitle, icon, extra, children, bodyStyle, style, loading, divided = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** 标题左侧的小图标（灰色，不加底色） */
  icon?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  bodyStyle?: CSSProperties;
  style?: CSSProperties;
  loading?: boolean;
  /** 标题与内容之间是否画分隔线 */
  divided?: boolean;
}) {
  const hasHeader = title || extra;

  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.hairline}`,
        borderRadius: radius.card,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {hasHeader && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: spacing.md, padding: `${spacing.lg}px ${spacing.xl}px`,
          borderBottom: divided ? `1px solid ${colors.hairline}` : undefined,
          minHeight: 54, boxSizing: 'border-box',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, minWidth: 0 }}>
            {icon && (
              <span style={{ color: colors.inkMuted, fontSize: 14, display: 'inline-flex' }}>{icon}</span>
            )}
            <div style={{ minWidth: 0 }}>
              {title && (
                <div style={{
                  fontSize: fontSize.title, fontWeight: 600, color: colors.ink,
                  lineHeight: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {title}
                </div>
              )}
              {subtitle && (
                <div style={{
                  fontSize: fontSize.caption, color: colors.inkMuted, lineHeight: '16px',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>
          {extra && <div style={{ flexShrink: 0 }}>{extra}</div>}
        </div>
      )}

      <div style={{
        padding: `${spacing.xl}px`,
        flex: 1,
        minHeight: 0,
        ...bodyStyle,
      }}>
        {loading ? <div style={{ height: 80 }} /> : children}
      </div>
    </div>
  );
}

export function EmptyState({ description, action, compact }: {
  description: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: spacing.sm, padding: compact ? `${spacing.lg}px 0` : '32px 0', textAlign: 'center',
    }}>
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        imageStyle={{ height: compact ? 36 : 48, opacity: 0.4 }}
        description={<Text style={{ fontSize: fontSize.small, color: colors.inkMuted }}>{description}</Text>}
        style={{ margin: 0 }}
      />
      {action}
    </div>
  );
}
