/** Follow-ups page — redesigned with better UI, status badges, and filters. */

import { useState } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, DatePicker,
  Space, Tag, message, Typography, Dropdown, Row, Col,
  Badge, Empty, Popconfirm,
} from 'antd';
import {
  PlusOutlined, CheckOutlined, DeleteOutlined,
  ClockCircleOutlined, ExclamationCircleOutlined, CloseCircleOutlined,
  MoreOutlined, SearchOutlined, ReloadOutlined, CalendarOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useAppStore } from '../store/useAppStore';
import { useCachedData } from '../hooks/useCachedData';
import { followUpApi } from '../api/followUps';
import type { FollowUp } from '../types';
import { useI18n } from '../i18n';

const { Text } = Typography;

const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: '#4f46e5', icon: <ClockCircleOutlined />, label: '待跟进' },
  completed: { color: '#16a34a', icon: <CheckOutlined />, label: '已完成' },
  cancelled: { color: '#94a3b8', icon: <CloseCircleOutlined />, label: '已取消' },
  overdue: { color: '#dc2626', icon: <ExclamationCircleOutlined />, label: '已逾期' },
};

export default function FollowUpsPage() {
  const { t } = useI18n();
  const { followUpsPage, setFollowUpsPage, invalidate } = useAppStore();

  // ── Persisted filter state from store ──
  const { searchText, statusFilter } = followUpsPage;
  const setSearchText = (v: string) => setFollowUpsPage({ searchText: v });
  const setStatusFilter = (v: string | undefined) => setFollowUpsPage({ statusFilter: v });

  // ── Cached follow-ups data ──
  const cacheKey = `followUps:${statusFilter || ''}`;
  const { data: followUps, loading, refresh: refreshFollowUps } = useCachedData<FollowUp[]>(
    cacheKey,
    'followUps',
    async () => {
      return followUpApi.list();
    },
    120_000,
    [statusFilter],
  );
  const allFollowUps = followUps ?? [];

  // Create modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      await followUpApi.create({ ...values, reminder_date: values.reminder_date.format('YYYY-MM-DD HH:mm:ss') });
      message.success('提醒已创建');
      setCreateModalOpen(false);
      createForm.resetFields();
      refreshFollowUps();
      invalidate(['dashboard']);
    } catch { /* validation error */ }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await followUpApi.update(id, { status });
      message.success('状态已更新');
      refreshFollowUps();
      invalidate(['dashboard']);
    } catch { message.error('更新失败'); }
  };

  const handleDelete = async (id: number) => {
    await followUpApi.delete(id);
    message.success('已删除');
    refreshFollowUps();
    invalidate(['dashboard']);
  };

  // Stats
  const stats = {
    pending: allFollowUps.filter(f => f.status === 'pending').length,
    overdue: allFollowUps.filter(f => f.status === 'overdue').length,
    completed: allFollowUps.filter(f => f.status === 'completed').length,
    cancelled: allFollowUps.filter(f => f.status === 'cancelled').length,
  };

  const filteredData = searchText
    ? allFollowUps.filter(f =>
        (f.title || '').toLowerCase().includes(searchText.toLowerCase()) ||
        (f.company_name || '').toLowerCase().includes(searchText.toLowerCase()) ||
        (f.employee_name || '').toLowerCase().includes(searchText.toLowerCase())
      )
    : allFollowUps;

  const columns: ColumnsType<FollowUp> = [
    {
      title: t('提醒日期'),
      dataIndex: 'reminder_date',
      key: 'reminder_date',
      width: 110,
      sorter: (a, b) => new Date(a.reminder_date).getTime() - new Date(b.reminder_date).getTime(),
      render: (d: string) => {
        const isOverdue = dayjs(d).isBefore(dayjs(), 'day');
        return (
          <Space size={4}>
            {isOverdue && <ExclamationCircleOutlined style={{ color: '#dc2626', fontSize: 12 }} />}
            <Text style={{ fontSize: 13 }}>{dayjs(d).format('MM-DD')}</Text>
          </Space>
        );
      },
    },
    {
      title: t('标题'),
      dataIndex: 'title',
      key: 'title',
      width: 200,
      ellipsis: true,
      render: (value: string) => <Text strong style={{ fontSize: 13 }}>{value || t('未命名')}</Text>,
    },
    {
      title: t('关联企业'),
      dataIndex: 'company_name',
      key: 'company_name',
      width: 150,
      ellipsis: true,
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: t('关联员工'),
      dataIndex: 'employee_name',
      key: 'employee_name',
      width: 120,
      ellipsis: true,
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: t('状态'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      filters: Object.entries(statusConfig).map(([k, v]) => ({ text: v.label, value: k })),
      onFilter: (value, record) => record.status === value,
      render: (s: string) => {
        const cfg = statusConfig[s] || { color: '#94a3b8', label: s };
        return <Tag color={cfg.color} style={{ borderRadius: 12, fontSize: 12 }}>{t(cfg.label)}</Tag>;
      },
    },
    {
      title: t('备注'),
      dataIndex: 'notes',
      key: 'notes',
      ellipsis: true,
      render: (v: string) => v ? <Text style={{ fontSize: 12, color: '#64748b' }}>{v}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: t('操作'),
      key: 'actions',
      width: 80,
      fixed: 'right',
      align: 'center',
      render: (_: unknown, record: FollowUp) => (
        <Dropdown menu={{
          items: [
            ...(record.status === 'pending' ? [
              { key: 'complete', icon: <CheckOutlined style={{ color: '#16a34a' }} />, label: t('标记完成'), onClick: () => handleStatusChange(record.id, 'completed') },
              { key: 'cancel', icon: <CloseCircleOutlined />, label: t('取消'), onClick: () => handleStatusChange(record.id, 'cancelled') },
            ] : []),
            ...(record.status === 'overdue' ? [
              { key: 'complete', icon: <CheckOutlined style={{ color: '#16a34a' }} />, label: t('标记完成'), onClick: () => handleStatusChange(record.id, 'completed') },
            ] : []),
            { type: 'divider' as const },
            { key: 'del', icon: <DeleteOutlined />, label: t('删除'), danger: true, onClick: () => handleDelete(record.id) },
          ].filter(i => i.type === 'divider' || 'key' in i),
        }} trigger={['click']}>
          <Button size="small" type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Stats row */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {Object.entries(stats).map(([key, count]) => {
          const cfg = statusConfig[key];
          return (
            <Col key={key}>
              <Card
                size="small"
                style={{ borderRadius: 10, cursor: 'pointer', border: statusFilter === key ? `2px solid ${cfg.color}` : '1px solid #e2e8f0', minWidth: 100, textAlign: 'center' }}
                onClick={() => setStatusFilter(statusFilter === key ? undefined : key)}
                styles={{ body: { padding: '8px 16px' } }}
              >
                <Space size={6}>
                  <Badge color={cfg.color} />
                  <Text type="secondary" style={{ fontSize: 12 }}>{t(cfg.label)}</Text>
                  <Text strong style={{ fontSize: 16, color: cfg.color }}>{count}</Text>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Space size={8}>
          <Input
            placeholder={t('搜索标题/企业/员工')}
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            allowClear
            style={{ width: 220 }}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
          {statusFilter && (
            <Tag closable onClose={() => setStatusFilter(undefined)} color={statusConfig[statusFilter]?.color}>
              {t(statusConfig[statusFilter]?.label || '')}
            </Tag>
          )}
        </Space>
        <Space size={8}>
          {selectedRowKeys.length > 0 && (
            <>
              <Text type="secondary" style={{ fontSize: 12 }}>{t('已选 {count} 项', { count: selectedRowKeys.length })}</Text>
              <Dropdown menu={{ items: [
                { key: 'complete', icon: <CheckOutlined style={{ color: '#16a34a' }} />, label: t('批量标记完成'), onClick: async () => {
                  await followUpApi.batchUpdateStatus(selectedRowKeys, 'completed');
                  message.success(t('已完成 {count} 条', { count: selectedRowKeys.length }));
                  setSelectedRowKeys([]); refreshFollowUps(); invalidate(['dashboard']);
                }},
                { key: 'cancel', icon: <CloseCircleOutlined />, label: t('批量取消'), onClick: async () => {
                  await followUpApi.batchUpdateStatus(selectedRowKeys, 'cancelled');
                  message.success(t('已取消 {count} 条', { count: selectedRowKeys.length }));
                  setSelectedRowKeys([]); refreshFollowUps(); invalidate(['dashboard']);
                }},
              ] }} trigger={['click']}>
                <Button icon={<MoreOutlined />} size="small">{t('批量操作')}</Button>
              </Dropdown>
              <Popconfirm title={t('确定删除 {count} 条提醒？', { count: selectedRowKeys.length })} onConfirm={async () => {
                await followUpApi.batchDelete(selectedRowKeys);
                message.success(t('已删除 {count} 条', { count: selectedRowKeys.length }));
                setSelectedRowKeys([]); refreshFollowUps(); invalidate(['dashboard']);
              }}>
                <Button danger icon={<DeleteOutlined />} size="small">{t('批量删除')}</Button>
              </Popconfirm>
            </>
          )}
          <Button icon={<ReloadOutlined />} onClick={refreshFollowUps} loading={loading}>{t('刷新')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            {t('新增提醒')}
          </Button>
        </Space>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          scroll={{ y: 'calc(100vh - 340px)' }}
          rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys as number[]) }}
          pagination={{
            pageSize: 20,
            showTotal: (total) => <Text type="secondary" style={{ fontSize: 12 }}>{t('共 {count} 条', { count: total })}</Text>,
            style: { marginBottom: 0 },
          }}
          size="middle"
          locale={{ emptyText: <Empty description={t('暂无跟进提醒')} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          style={{ background: '#fff', borderRadius: 8, overflow: 'hidden' }}
        />
      </div>

      {/* Create modal */}
      <Modal
        title={<Space><CalendarOutlined /> {t('新增跟进提醒')}</Space>}
        open={createModalOpen}
        onOk={handleCreate}
        onCancel={() => setCreateModalOpen(false)}
        okText={t('创建')}
        width={480}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" size="middle">
          <Form.Item label={t('标题')} name="title" rules={[{ required: true }]}>
            <Input placeholder={t('如: 第二次跟进')} />
          </Form.Item>
          <Form.Item label={t('提醒日期')} name="reminder_date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('备注')} name="notes">
            <Input.TextArea rows={3} placeholder={t('跟进内容...')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
