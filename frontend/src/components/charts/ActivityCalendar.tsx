/** 活跃度月历 —— 这是一个**日期导航控件**，不是热力图。
 *
 * 设计取向（参考 Apple 日历 / Notion Calendar 的月视图）：
 * - **不做逐格填充**。整格涂色只在 GitHub 那种 365 个小方格里才成立；一个月 31 格
 *   涂起来又笨又空，还把"日历"变成了"图表"。这里让**日期本身当主角**。
 * - **不画网格线**。靠留白分区，比田字格干净。
 * - **颜色只表达状态**：今天＝实心强调色圆点，选中＝近黑细环。有操作的日子靠字重
 *   与灰度区分（深色 600 / 浅灰 400），并在数字下方用极小字给出条数。
 * - 因此不再需要色阶图例 —— 一条由浅到深的色带，本来就是这个方案要丢掉的东西。
 */

import type { CSSProperties } from 'react';
import { Button, Tooltip, Typography } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { colors, fontSize, radius, spacing } from '../../theme/tokens';
import { dayjs } from '../../utils/date';
import { formatNumber } from '../../utils/format';
import { useI18n } from '../../i18n';

const { Text } = Typography;

export interface CalendarDayCounts {
  date: string;
  companies: number;
  employees: number;
  emails: number;
  letters: number;
  follow_ups: number;
  imports: number;
}

export function dayTotal(d: CalendarDayCounts): number {
  return d.companies + d.employees + d.emails + d.letters + d.follow_ups + d.imports;
}

const WEEKDAYS_ZH = ['一', '二', '三', '四', '五', '六', '日'];
const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function ActivityCalendar({ days, value, month, onSelect, onMonthChange, loading }: {
  days: CalendarDayCounts[];
  /** 当前选中的日期 YYYY-MM-DD */
  value: string;
  /** 当前面板月份 YYYY-MM */
  month: string;
  onSelect: (date: string) => void;
  onMonthChange: (month: string) => void;
  loading?: boolean;
}) {
  const { t, lang } = useI18n();
  const weekdays = lang === 'zh-CN' ? WEEKDAYS_ZH : WEEKDAYS_EN;
  const dayMap = new Map(days.map(d => [d.date, d]));
  const panel = dayjs(`${month}-01`);
  const monthTotal = days.reduce((sum, d) => sum + dayTotal(d), 0);
  const todayKey = dayjs().format('YYYY-MM-DD');

  // 周一为一周之始：day() 里 0 是周日，换算成 6，其余减 1
  const leadingBlanks = (panel.day() + 6) % 7;
  const daysInMonth = panel.daysInMonth();

  const cells: (string | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => panel.date(i + 1).format('YYYY-MM-DD')),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity .2s ease' }}>
      {/* 月份导航 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: spacing.lg,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
          <Button
            type="text" size="small" icon={<LeftOutlined style={{ fontSize: 10 }} />}
            style={{ color: colors.inkMuted }}
            onClick={() => onMonthChange(panel.subtract(1, 'month').format('YYYY-MM'))}
          />
          <span style={{
            fontSize: fontSize.body, fontWeight: 600, color: colors.ink,
            minWidth: 96, textAlign: 'center',
          }}>
            {lang === 'zh-CN' ? panel.format('YYYY 年 M 月') : panel.format('MMMM YYYY')}
          </span>
          <Button
            type="text" size="small" icon={<RightOutlined style={{ fontSize: 10 }} />}
            style={{ color: colors.inkMuted }}
            onClick={() => onMonthChange(panel.add(1, 'month').format('YYYY-MM'))}
          />
        </div>
        <Text style={{ fontSize: fontSize.caption, color: colors.inkMuted }}>
          {t('本月 {count} 次操作', { count: formatNumber(monthTotal) })}
        </Text>
      </div>

      {/* 星期表头 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: spacing.sm }}>
        {weekdays.map(w => (
          <div key={w} style={{
            textAlign: 'center', fontSize: fontSize.caption, color: colors.inkMuted, fontWeight: 450,
          }}>
            {w}
          </div>
        ))}
      </div>

      {/* 日期网格：没有填充块、没有网格线，只有日期 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 2 }}>
        {cells.map((key, i) => {
          if (!key) return <div key={`blank-${i}`} />;

          const counts = dayMap.get(key);
          const total = counts ? dayTotal(counts) : 0;
          const isSelected = key === value;
          const isToday = key === todayKey;
          const hasActivity = total > 0;

          // 今天＝实心强调色圆点；选中＝近黑细环（两者不抢同一个信号）
          const circleStyle: CSSProperties = {
            width: 30, height: 30, borderRadius: radius.pill,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: fontSize.body,
            fontWeight: hasActivity || isToday ? 600 : 400,
            color: isToday ? '#fff' : hasActivity ? colors.ink : colors.inkMuted,
            background: isToday ? colors.primary : undefined,
            boxShadow: isSelected && !isToday ? `inset 0 0 0 1.5px ${colors.ink}` : undefined,
            transition: 'background .15s ease',
          };

          const cell = (
            <div
              className="cal-day"
              onClick={() => onSelect(key)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 1, padding: '3px 0', cursor: 'pointer', borderRadius: radius.control,
              }}
            >
              <div className="cal-circle" style={circleStyle}>{Number(key.slice(-2))}</div>
              {/* 有操作的日子给一行极小字，量级一眼可见；拆分构成在悬停里 */}
              <span style={{
                fontSize: 9, lineHeight: '10px', height: 10,
                color: isToday ? colors.primary : colors.inkMuted,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {hasActivity ? (total > 99 ? '99+' : total) : ''}
              </span>
            </div>
          );

          if (!hasActivity) {
            return <Tooltip key={key} title={t('{date} 无操作', { date: key })}>{cell}</Tooltip>;
          }
          return (
            <Tooltip key={key} title={
              <div style={{ fontSize: fontSize.small }}>
                {key}
                {counts!.companies > 0 && <div>{t('新增企业数')} {counts!.companies}</div>}
                {counts!.employees > 0 && <div>{t('新增员工')} {counts!.employees}</div>}
                {counts!.emails > 0 && <div>{t('新增邮箱')} {counts!.emails}</div>}
                {counts!.letters > 0 && <div>{t('开发信')} {counts!.letters}</div>}
                {counts!.follow_ups > 0 && <div>{t('跟进')} {counts!.follow_ups}</div>}
                {counts!.imports > 0 && <div>{t('导入')} {counts!.imports}</div>}
              </div>
            }>
              {cell}
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
