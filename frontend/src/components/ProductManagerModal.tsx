/** 主营产品/业务字典管理弹窗 —— 客户经营业务选项的增删改查。
 *  这里维护的是**客户**经营的业务（如大幅面喷绘、展会搭建），不是我们自己的产品线。 */

import { useCallback, useEffect, useState } from 'react';
import {
  Modal, Table, Button, Space, Input, Form, Popconfirm, message,
  Typography, AutoComplete, Tooltip,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, TagsOutlined, SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { productApi } from '../api/products';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../i18n';
import type { Product, ProductCreate } from '../types';

const { Text } = Typography;

/** 常用分类建议（与内置字典一致，也可自由填写新分类） */
const CATEGORY_PRESETS = [
  '广告制品', '展览活动', '户外装备', '广告材料', '印刷与喷绘', '服务与其他',
];

/** 表格滚动区高度（行多时滚动，行少时留白，保证弹窗尺寸固定） */
const TABLE_BODY_HEIGHT = 380;
/** 表格区整体高度 = 表头 + 滚动区 + 一点余量，作为容器的最小高度 */
const TABLE_AREA_HEIGHT = TABLE_BODY_HEIGHT + 60;

export default function ProductManagerModal({ open, onClose, onChanged }: {
  open: boolean;
  onClose: () => void;
  /** 产品增删改后通知父组件刷新选项（企业表单里的主营产品下拉） */
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const setCompaniesPage = useAppStore((s) => s.setCompaniesPage);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');

  // 新增/编辑子弹窗
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form] = Form.useForm<ProductCreate>();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProducts(await productApi.list());
    } catch {
      message.error(t('加载产品列表失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) { load(); setKeyword(''); } }, [open, load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ category: categoryFilter || CATEGORY_PRESETS[0], sort_order: 0 });
    setFormOpen(true);
  };

  const openEdit = (record: Product) => {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      name_en: record.name_en,
      category: record.category,
      description: record.description,
      sort_order: record.sort_order,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await productApi.update(editing.id, values);
        message.success(t('已更新'));
      } else {
        // 新增项排到末尾，避免插入到已有排序中间
        const maxOrder = products.reduce((m, p) => Math.max(m, p.sort_order), -1);
        await productApi.create({ ...values, sort_order: maxOrder + 1 });
        message.success(t('已添加'));
      }
      setFormOpen(false);
      setEditing(null);
      await load();
      onChanged();
    } catch (err: any) {
      if (err?.response?.status === 409) message.error(err.response.data?.detail || t('该名称已存在'));
      else if (err?.errorFields) { /* 表单校验失败，antd 已提示 */ }
      else message.error(t('保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: Product) => {
    try {
      await productApi.delete(record.id);
      message.success(t('已删除「{name}」', { name: record.name }));
      await load();
      onChanged();
    } catch {
      message.error(t('删除失败'));
    }
  };

  /** 跳到企业列表并筛出做该业务的客户（只关本弹窗，不关背后的企业表单） */
  const handleJumpToCompanies = (record: Product) => {
    setCompaniesPage({ productFilter: [record.id], currentPage: 1 });
    message.success(t('已在企业列表筛出主营「{name}」的客户，关闭本窗口即可查看', { name: record.name }));
    onClose();
  };

  const handleReset = () => {
    Modal.confirm({
      title: t('恢复默认列表？'),
      content: (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('会清空当前所有业务项（含自定义项），并解绑所有企业已登记的主营产品/业务，然后重建内置列表。')}
        </Text>
      ),
      okText: t('恢复默认值'),
      okType: 'danger',
      onOk: async () => {
        try {
          setProducts(await productApi.reset());
          message.success(t('已恢复默认列表'));
          onChanged();
        } catch {
          message.error(t('恢复失败'));
        }
      },
    });
  };

  const categories = Array.from(new Set(products.map((p) => p.category)));
  const categoryCounts = categories.map((c) => ({
    name: c,
    count: products.filter((p) => p.category === c).length,
  }));

  // 分类 + 中英文关键字一起过滤
  const kw = keyword.trim().toLowerCase();
  const rows = products.filter((p) => {
    if (categoryFilter && p.category !== categoryFilter) return false;
    if (!kw) return true;
    return p.name.toLowerCase().includes(kw) || (p.name_en || '').toLowerCase().includes(kw);
  });

  const columns: ColumnsType<Product> = [
    {
      title: t('分类'), dataIndex: 'category', key: 'category', width: 100,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: t('中文名'), dataIndex: 'name', key: 'name', width: 150,
      render: (v: string) => <Text strong style={{ fontSize: 13 }}>{v}</Text>,
    },
    {
      title: t('英文名'), dataIndex: 'name_en', key: 'name_en', ellipsis: true,
      render: (v: string) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: t('使用企业'), key: 'company_count', width: 92, align: 'center',
      render: (_: unknown, r: Product) => (
        r.company_count
          ? <Tooltip title={t('点击在企业列表中筛出这 {count} 家企业', { count: r.company_count })}>
              <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 12 }}
                onClick={() => handleJumpToCompanies(r)}>
                {r.company_count}
              </Button>
            </Tooltip>
          : <Text type="secondary" style={{ fontSize: 12 }}>0</Text>
      ),
    },
    {
      title: t('操作'), key: 'actions', width: 88, align: 'center',
      render: (_: unknown, r: Product) => (
        <Space size={0}>
          <Tooltip title={t('编辑')}>
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Popconfirm
            title={r.company_count
              ? t('「{name}」已被 {count} 家企业使用，删除后会同时解绑。确定删除？', { name: r.name, count: r.company_count })
              : t('确定删除「{name}」？', { name: r.name })}
            okText={t('删除')} okType="danger" cancelText={t('取消')}
            onConfirm={() => handleDelete(r)}
          >
            <Tooltip title={t('删除')}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        title={<Space><TagsOutlined /> {t('管理主营产品/业务')}</Space>}
        open={open}
        onCancel={onClose}
        width={880}
        footer={[
          <Button key="reset" icon={<ReloadOutlined />} onClick={handleReset}>{t('恢复默认列表')}</Button>,
          <Button key="close" type="primary" onClick={onClose}>{t('完成')}</Button>,
        ]}
        destroyOnClose
      >
        <Space style={{ marginBottom: 12 }} wrap size={8}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('新增业务/产品')}</Button>
          <Input
            allowClear
            placeholder={t('搜索中文名 / 英文名')}
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            style={{ width: 220 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('共 {items} 项 / {categories} 个分类', { items: products.length, categories: categories.length })}
          </Text>
        </Space>

        {/* 固定高度的表格区：行数少（或筛不到）时留白，弹窗尺寸不跟着内容变 */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minHeight: TABLE_AREA_HEIGHT }}>
          {/* 左侧分类导航：点一下即筛，数量一眼可见 */}
          <div style={{ width: 132, flexShrink: 0, borderRight: '1px solid #f0f0f0', paddingRight: 8 }}>
            {[{ name: undefined as string | undefined, count: products.length }, ...categoryCounts].map((c) => {
              const active = categoryFilter === c.name;
              return (
                <div
                  key={c.name ?? '__all__'}
                  onClick={() => setCategoryFilter(c.name)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '5px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 2,
                    background: active ? '#eef2ff' : undefined,
                    color: active ? '#4f46e5' : undefined,
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <span style={{ fontSize: 12 }}>{c.name ?? t('全部')}</span>
                  <Text type="secondary" style={{ fontSize: 11 }}>{c.count}</Text>
                </div>
              );
            })}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <Table
              rowKey="id"
              size="small"
              loading={loading}
              dataSource={rows}
              columns={columns}
              pagination={false}
              scroll={{ y: TABLE_BODY_HEIGHT }}
              locale={{ emptyText: keyword || categoryFilter ? t('没有匹配的业务项') : t('暂无业务项，点「新增业务/产品」添加') }}
            />
          </div>
        </div>
      </Modal>

      {/* 新增 / 编辑产品 */}
      <Modal
        title={editing ? t('编辑「{name}」', { name: editing.name }) : t('新增业务/产品')}
        open={formOpen}
        onOk={handleSave}
        onCancel={() => { setFormOpen(false); setEditing(null); }}
        confirmLoading={saving}
        okText={t('保存')}
        width={460}
        destroyOnClose
      >
        {/* name 前缀让字段 id 变成 product_xxx，避免和企业表单里的同名字段（name / name_en 等）撞 id */}
        <Form form={form} name="product" layout="vertical" size="middle">
          <Form.Item label={t('中文名')} name="name" rules={[{ required: true, message: t('请填写中文名') }]}>
            <Input placeholder={t('如：大幅面喷绘')} maxLength={100} />
          </Form.Item>
          <Form.Item label={t('英文名')} name="name_en" tooltip={t('开发信里会以「中文名 (English Name)」的形式使用')}>
            <Input placeholder={t('如：Large Format Printing')} maxLength={150} />
          </Form.Item>
          <Form.Item label={t('分类')} name="category" rules={[{ required: true, message: t('请填写分类') }]}>
            <AutoComplete
              options={categories.concat(CATEGORY_PRESETS.filter(c => !categories.includes(c))).map((c) => ({ value: c }))}
              placeholder={t('如：广告制作（用于选择器分组）')}
              filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          <Form.Item label={t('说明')} name="description">
            <Input.TextArea rows={2} placeholder={t('选填')} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
