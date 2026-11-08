/** 仪表盘 —— 用通用件（PageContainer / SectionCard / StatCard / ChartCard）重搭。
 *
 * 相比旧版：
 * - 数字不再靠并发 5 个列表接口拼，改用 /api/dashboard/summary 一次拿全
 * - 「已发送开发信」不再硬编码 0
 * - 新增活跃度月历 + 当天操作明细（点日期下钻）
 * - 分布类图表只在真的有分布时才画（单取值的图是噪音，见 StatusBreakdown）
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Col, Progress, Row, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BankOutlined, MailOutlined, ClockCircleOutlined, ReloadOutlined,
  ThunderboltOutlined, UserOutlined, SendOutlined, UploadOutlined, CalendarOutlined,
  LineChartOutlined, GlobalOutlined, TagsOutlined, SafetyCertificateOutlined,
  ContactsOutlined, GiftOutlined, HistoryOutlined,
} from '@ant-design/icons';
import { useCachedData } from '../hooks/useCachedData';
import { dashboardApi } from '../api/dashboard';
import { employeeApi } from '../api/employees';
import PageContainer, { PageHeader } from '../components/layout/PageContainer';
import SectionCard, { EmptyState } from '../components/layout/SectionCard';
import KpiStrip, { type KpiItem } from '../components/data/KpiStrip';
import ChartCard from '../components/data/ChartCard';
import TrendLineChart, { type TrendPoint } from '../components/charts/TrendLineChart';
import RankBarChart from '../components/charts/RankBarChart';
import StatusBreakdown from '../components/charts/StatusBreakdown';
import ActivityCalendar from '../components/charts/ActivityCalendar';
import { chartColors, colors, fontSize, spacing } from '../theme/tokens';
import { dayjs, formatDate, formatTime } from '../utils/date';
import { formatNumber, formatPercent } from '../utils/format';
import { useI18n } from '../i18n';
import { CONTACT_STATUS_CONFIG, LETTER_STEPS } from '../types';
import type {
  ActivityItem, CalendarMonth, DashboardSummary, DayActivity, UpcomingBirthday,
} from '../types';

const { Text } = Typography;

/** 操作类型 → 图标/颜色/中文名。日历下钻的明细按这个渲染。 */
const ACTIVITY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  company: { label: '企业', icon: <BankOutlined />, color: chartColors.categorical[0] },
  employee: { label: '员工', icon: <UserOutlined />, color: chartColors.categorical[1] },
  email: { label: '邮箱', icon: <MailOutlined />, color: chartColors.categorical[2] },
  letter: { label: '开发信', icon: <SendOutlined />, color: chartColors.categorical[0] },
  follow_up: { label: '跟进', icon: <ClockCircleOutlined />, color: chartColors.categorical[1] },
  import: { label: '导入', icon: <UploadOutlined />, color: chartColors.axisText },
};

/** 明细列表最多渲染多少条（批量导入那天后端最多给 300 条） */
const ACTIVITY_RENDER_LIMIT = 60;

export default function DashboardPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [selectedDate, setSelectedDate] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [panelMonth, setPanelMonth] = useState(() => dayjs().format('YYYY-MM'));

  const { data: summary, loading, refresh } = useCachedData<DashboardSummary>(
    'dashboard:summary:30', 'dashboard', () => dashboardApi.summary(30), 60_000,
  );

  const { data: calendar, loading: calendarLoading } = useCachedData<CalendarMonth>(
    `dashboard:calendar:${panelMonth}`, 'dashboard',
    () => {
      const [y, m] = panelMonth.split('-').map(Number);
      return dashboardApi.calendar(y, m);
    },
    60_000, [panelMonth],
  );

  const { data: day, loading: dayLoading } = useCachedData<DayActivity>(
    `dashboard:day:${selectedDate}`, 'dashboard',
    () => dashboardApi.day(selectedDate),
    60_000, [selectedDate],
  );

  const { data: birthdays } = useCachedData<UpcomingBirthday[]>(
    'dashboard:birthdays', 'dashboard',
    () => employeeApi.upcomingBirthdays(30).catch(() => []),
    300_000,
  );

  const kpi = summary?.kpi;
  const todayTotal = kpi
    ? kpi.today.companies + kpi.today.employees + kpi.today.emails
      + kpi.today.letters + kpi.today.follow_ups + kpi.today.imports
    : 0;

  const kpiItems = useMemo<KpiItem[]>(() => [
    {
      key: 'companies', label: t('企业总数'), value: kpi?.companies ?? 0,
      hint: kpi?.today.companies ? t('今日 +{count}', { count: kpi.today.companies }) : t('今日无新增'),
      onClick: () => navigate('/companies'),
    },
    {
      key: 'employees', label: t('员工总数'), value: kpi?.employees ?? 0,
      hint: kpi?.today.employees ? t('今日 +{count}', { count: kpi.today.employees }) : t('今日无新增'),
      onClick: () => navigate('/people'),
    },
    {
      key: 'emails', label: t('邮箱总数'), value: kpi?.emails ?? 0,
      hint: kpi ? t('推导 {deduced} · 手工/导入 {manual}', {
        deduced: formatNumber(kpi.emails_deduced),
        manual: formatNumber(kpi.emails_manual),
      }) : ' ',
    },
    {
      key: 'followUps', label: t('待跟进'), value: kpi?.follow_ups_pending ?? 0,
      hint: kpi?.follow_ups_pending ? t('点开跟进提醒处理') : t('暂无待办'),
      onClick: () => navigate('/follow-ups'),
    },
    {
      key: 'today', label: t('今日新增'), value: todayTotal,
      hint: kpi?.today
        ? t('企业 {companies} · 员工 {people} · 邮箱 {emails}', {
          companies: kpi.today.companies,
          people: kpi.today.employees,
          emails: kpi.today.emails,
        })
        : ' ',
    },
  ], [kpi, todayTotal, navigate, t]);

  const trendTable = useMemo<ColumnsType<TrendPoint>>(() => [
    { title: t('日期'), dataIndex: 'date', render: (v: string) => formatDate(v) },
    { title: t('新增企业数'), dataIndex: 'companies', align: 'right' },
    { title: t('新增员工'), dataIndex: 'employees', align: 'right' },
    { title: t('新增邮箱'), dataIndex: 'emails', align: 'right' },
  ], [t]);

  const rankColumns = useMemo<ColumnsType<{ name: string; count: number }>>(() => [
    { title: t('名称'), dataIndex: 'name' },
    { title: t('企业数'), dataIndex: 'count', align: 'right', width: 84 },
  ], [t]);

  const birthdayColumns = useMemo<ColumnsType<UpcomingBirthday>>(() => [
    {
      title: t('姓名'), dataIndex: 'full_name',
      render: (v: string, r) => (
        <Space size={6}>
          <Text strong style={{ fontSize: fontSize.body }}>{v}</Text>
          {r.position && <Text type="secondary" style={{ fontSize: fontSize.caption }}>{r.position}</Text>}
        </Space>
      ),
    },
    { title: t('企业名称'), dataIndex: 'company_name', ellipsis: true,
      render: (v?: string) => v || <Text type="secondary">-</Text> },
    { title: t('生日'), dataIndex: 'birthday', width: 66, render: (v: string) => v?.slice(5) },
    {
      title: t('倒计时'), dataIndex: 'days_away', width: 78, align: 'right',
      render: (d: number) => (
        <Tag color={d === 0 ? 'red' : d <= 7 ? 'orange' : 'default'} style={{ fontSize: fontSize.caption }}>
          {d === 0 ? t('今天') : t('{days} 天后', { days: d })}
        </Tag>
      ),
    },
  ], [t]);

  const items = day?.items ?? [];
  const shown = items.slice(0, ACTIVITY_RENDER_LIMIT);

  /** The dashboard API returns short Chinese prefixes for email activity. */
  const translateActivitySubtitle = (subtitle?: string) => {
    if (!subtitle) return subtitle;
    const parts = subtitle.split(' · ');
    if (parts[0] === '推导') parts[0] = t('推导');
    else if (parts[0] === '手工/导入') parts[0] = t('手工/导入');
    return parts.join(' · ');
  };

  return (
    <PageContainer maxWidth={1400}>
      <PageHeader
        title={t('数据概览')}
        icon={<ThunderboltOutlined style={{ color: colors.primary }} />}
        subtitle={kpi ? t('统计截至 {time}', { time: formatTime(new Date().toISOString()) }) : undefined}
        actions={
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
            {t('刷新')}
          </Button>
        }
      />

      {/* ── KPI ── */}
      <KpiStrip items={kpiItems} />

      {/* ── 日历 + 趋势 ── */}
      <Row gutter={[spacing.lg, spacing.lg]} style={{ marginBottom: spacing.lg }}>
        <Col xs={24} lg={10}>
          <SectionCard
            title={t('活跃日历')}
            subtitle={t('点某天查看当天操作')}
            icon={<CalendarOutlined />}
          >
            <ActivityCalendar
              days={calendar?.days ?? []}
              value={selectedDate}
              month={panelMonth}
              loading={calendarLoading}
              onSelect={setSelectedDate}
              onMonthChange={setPanelMonth}
            />
          </SectionCard>
        </Col>

        <Col xs={24} lg={14}>
          <ChartCard
            title={t('近 30 天新增趋势')}
            subtitle={t('企业 / 员工 / 邮箱 逐日新增')}
            icon={<LineChartOutlined />}
            height={300}
            rows={summary?.trend}
            columns={trendTable}
            emptyText={t('暂无数据')}
            chart={<TrendLineChart data={summary?.trend ?? []} height={300} />}
          />
        </Col>
      </Row>

      {/* ── 当天操作明细 ── */}
      <div style={{ marginBottom: spacing.lg }}>
        <SectionCard
          title={t('{date} 的操作', { date: formatDate(selectedDate) })}
          icon={<HistoryOutlined />}
          subtitle={day ? t('共 {count} 条', {
            count: formatNumber(
              day.counts.companies + day.counts.employees + day.counts.emails
              + day.counts.letters + day.counts.follow_ups + day.counts.imports,
            ),
          }) : undefined}
          extra={day && day.truncated
            ? <Text type="secondary" style={{ fontSize: fontSize.caption }}>
                {t('数据较多，仅显示每种类型前 {count} 条', { count: ACTIVITY_RENDER_LIMIT })}
              </Text>
            : undefined}
        >
          {shown.length === 0 ? (
            <EmptyState compact description={dayLoading ? t('加载中…') : t('这一天没有操作记录')} />
          ) : (
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {shown.map((item: ActivityItem, i: number) => {
                const meta = ACTIVITY_META[item.type] ?? ACTIVITY_META.company;
                return (
                  <div
                    key={`${item.type}-${item.entity_id}-${i}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: spacing.sm,
                      padding: '6px 0', borderBottom: i === shown.length - 1 ? undefined : `1px solid ${colors.hairline}`,
                    }}
                  >
                    <span style={{ color: meta.color, fontSize: 14, width: 16, textAlign: 'center' }}>{meta.icon}</span>
                    <Text type="secondary" style={{ fontSize: fontSize.caption, width: 42, flexShrink: 0 }}>
                      {formatTime(item.at)}
                    </Text>
                    <Tag style={{ fontSize: fontSize.caption, marginInlineEnd: 0, flexShrink: 0 }}>{t(meta.label)}</Tag>
                    <Tooltip title={item.title}>
                      <Text style={{ fontSize: fontSize.body, flexShrink: 0, maxWidth: 260 }} ellipsis>
                        {item.title}
                      </Text>
                    </Tooltip>
                    {item.subtitle && (
                      <Text type="secondary" ellipsis style={{ fontSize: fontSize.caption, minWidth: 0 }}>
                        {translateActivitySubtitle(item.subtitle)}
                      </Text>
                    )}
                  </div>
                );
              })}
              {items.length > shown.length && (
                <div style={{ paddingTop: spacing.sm }}>
                  <Text type="secondary" style={{ fontSize: fontSize.caption }}>
                    {t('还有 {count} 条未显示', { count: formatNumber(items.length - shown.length) })}
                  </Text>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── 分布 ── */}
      <Row gutter={[spacing.lg, spacing.lg]} style={{ marginBottom: spacing.lg }}>
        <Col xs={24} md={12} xl={8}>
          <ChartCard
            title={t('客户国家 Top 8')}
            icon={<GlobalOutlined />}
            rows={summary?.countries}
            columns={rankColumns}
            emptyText={t('还没有登记国家的企业')}
            chart={<RankBarChart data={summary?.countries ?? []} />}
          />
        </Col>
        <Col xs={24} md={12} xl={8}>
          <ChartCard
            title={t('客户主营产品/业务 Top 8')}
            subtitle={t('按已登记的企业数排序')}
            icon={<TagsOutlined />}
            rows={summary?.products}
            columns={rankColumns}
            emptyText={t('还没有企业登记主营产品/业务，可在企业信息里逐家填写')}
            chart={<RankBarChart data={summary?.products ?? []} />}
          />
        </Col>
        <Col xs={24} md={12} xl={8}>
          <SectionCard title={t('邮箱验证')} subtitle={t('有效邮箱占比')} icon={<SafetyCertificateOutlined />}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xl }}>
              <Progress
                type="circle"
                size={78}
                strokeWidth={8}
                percent={kpi && kpi.emails ? Math.round((kpi.emails_valid / kpi.emails) * 100) : 0}
                strokeColor={chartColors.sequential[2]}
                trailColor={colors.hairline}
                format={(p) => <span style={{ fontSize: fontSize.subtitle, color: colors.ink, fontWeight: 600 }}>{p}%</span>}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{
                    fontSize: fontSize.metric, fontWeight: 700, color: colors.ink,
                    lineHeight: 1.1, fontVariantNumeric: 'tabular-nums',
                  }}>
                    {formatNumber(kpi?.emails_valid ?? 0)}
                  </span>
                  <Text style={{ fontSize: fontSize.small, color: colors.inkSecondary }}>
                    {t('{valid} / {total} 个邮箱有效', {
                      valid: formatNumber(kpi?.emails_valid ?? 0),
                      total: formatNumber(kpi?.emails ?? 0),
                    })}
                  </Text>
                </div>
                <Text style={{ fontSize: fontSize.caption, color: colors.inkMuted, display: 'block', marginTop: spacing.sm }}>
                  {kpi?.emails_valid
                    ? t('{percent} 可用', { percent: formatPercent(kpi.emails_valid, kpi.emails) })
                    : t('还没有验证结果，可在员工页发起邮箱验证')}
                </Text>
              </div>
            </div>
          </SectionCard>
        </Col>
      </Row>

      {/* ── 状态分布（只有真的分流了才会成图）── */}
      <Row gutter={[spacing.lg, spacing.lg]}>
        <Col xs={24} md={12}>
          <SectionCard title={t('员工联系状态')} subtitle={t('联系推进的分布')} icon={<ContactsOutlined />}>
            <StatusBreakdown
              data={summary?.contact_status ?? []}
              unit={t('名员工')}
              labels={Object.fromEntries(
                Object.entries(CONTACT_STATUS_CONFIG).map(([k, v]) => [k, t(v.label)]),
              )}
              emptyText={t('暂无员工数据')}
            />
          </SectionCard>
        </Col>
        <Col xs={24} md={12}>
          <SectionCard title={t('开发进度')} subtitle={t('按开发信步骤分布')} icon={<SendOutlined />}>
            <StatusBreakdown
              data={(summary?.letter_steps ?? []).map(d => ({
                name: d.name === '0' ? t('未开始') : t('第 {step} 封', { step: d.name }),
                count: d.count,
              }))}
              unit={t('名员工')}
              labels={Object.fromEntries([
                [t('未开始'), t('未开始')],
                ...LETTER_STEPS.map(s => [
                  t('第 {step} 封', { step: s.step }),
                  t('第 {step} 封 · {purpose}', { step: s.step, purpose: t(s.purpose) }),
                ]),
              ])}
              colors={{ [t('未开始')]: chartColors.axisText }}
              emptyText={t('暂无员工数据')}
            />
          </SectionCard>
        </Col>
      </Row>

      {/* ── 近期生日 ── */}
      <div style={{ marginTop: spacing.md }}>
        <SectionCard title={t('近 30 天生日')} subtitle={t('维护客户关系的好时机')} icon={<GiftOutlined />}>
          {!birthdays || birthdays.length === 0 ? (
            <EmptyState compact description={t('近 30 天没有员工生日')} />
          ) : (
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={birthdays}
              columns={birthdayColumns}
              scroll={{ y: 260 }}
            />
          )}
        </SectionCard>
      </div>
    </PageContainer>
  );
}
