/** Companies page — redesigned with better UI, batch ops, and detail drawer. */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import dayjs from 'dayjs';
import {
  Table, Button, Input, Space, message,
  Modal, Form, Descriptions, Drawer, Tabs, Typography,
  Dropdown, Row, Col, Badge, Card, Switch, Checkbox, AutoComplete,
  Collapse, Tag as AntTag, Spin, Upload, Alert, Tooltip, Select,
  DatePicker,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, StarOutlined, StarFilled,
  DeleteOutlined, CopyOutlined, CheckOutlined,
  MoreOutlined, BankOutlined, TeamOutlined, UserAddOutlined,
  DownloadOutlined, UploadOutlined, ExportOutlined, ReloadOutlined,
  ThunderboltOutlined, InfoCircleOutlined, UpOutlined, TagsOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { companyApi } from '../api/companies';
import { employeeApi } from '../api/employees';
import { emailApi } from '../api/emails';
import { devLetterApi } from '../api/devLetters';
import { dataApi, type ImportResult } from '../api/data';
import { productApi } from '../api/products';
import ProductManagerModal from '../components/ProductManagerModal';
import ProductSelect from '../components/ProductSelect';
import { useAppStore } from '../store/useAppStore';
import { useCachedData } from '../hooks/useCachedData';
import ResizableTitle, { useResizableCols, useContainerWidth, FIT_SAFETY } from '../components/ResizableTitle';
import { COUNTRIES, INDUSTRIES, mergeOptions } from '../constants';
import { ContactStatusTag, LetterStepTag } from '../components/ProgressTag';
import { splitCountries } from '../types';
import type { Company, Employee, EmailBrief, PaginatedResult, DevLetter, Product } from '../types';
import { formatDate, formatDateTime } from '../utils/date';
import { useI18n } from '../i18n';

const { Text, Paragraph } = Typography;

const STATUS_OPTIONS = [
  { value: 'valid', label: '✅ 有效', color: '#16a34a' },
  { value: 'likely_valid', label: '❓ 可能有效', color: '#2563eb' },
  { value: 'unknown', label: '❓ 未知', color: '#94a3b8' },
];

function EmailVerifyIcon({ status, onStatusChange }: { status: string; onStatusChange?: (newStatus: string) => void }) {
  const icon = status === 'valid'
    ? <span style={{ color: '#16a34a' }}>✅</span>
    : status === 'likely_valid'
      ? <span style={{ color: '#2563eb' }}>❓</span>
      : <span style={{ color: '#94a3b8' }}>❓</span>;

  if (!onStatusChange) return <Tooltip title={STATUS_OPTIONS.find(o => o.value === status)?.label || '未知'}>{icon}</Tooltip>;

  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: STATUS_OPTIONS.map(opt => ({
          key: opt.value,
          label: opt.label,
          icon: status === opt.value ? <CheckOutlined style={{ color: opt.color }} /> : <span style={{ width: 14, display: 'inline-block' }} />,
        })),
        onClick: ({ key }) => { if (key !== status) onStatusChange(key); },
        selectedKeys: [status],
      }}
    >
      <Tooltip title="点击修改状态">{icon}</Tooltip>
    </Dropdown>
  );
}

/** Format an email address using the user's copy format template. */
function formatEmailCopy(template: string, data: { company_name?: string; full_name: string; position?: string; email: string }): string {
  let result = template;
  result = result.replace(/\{company_name\}/g, data.company_name || '');
  result = result.replace(/\{full_name\}/g, data.full_name || '');
  result = result.replace(/\{position\}/g, data.position || '');
  result = result.replace(/\{email\}/g, data.email);
  result = result.replace(/-+(?=[\s,>])/g, '');
  result = result.replace(/\s{2,}/g, ' ');
  result = result.replace(/""\s/g, '');
  result = result.replace(/"<\s/g, '<');
  return result.trim();
}

const handleCopy = (text: string) => {
  navigator.clipboard.writeText(text).then(() => message.success('已复制'));
};

/** 企业主表格默认列宽（可拖拽调整，调整结果存在 store 中） */
const COL_WIDTHS: Record<string, number> = {
  name: 200,
  country: 110,
  industry: 130,
  products: 140,
  website: 180,
  open_email: 180,
  linkedin: 150,
  employee_count: 80,
  created_at: 110,
  actions: 80,
};

/** 企业主表格各列最小宽度（小窗口下等比缩小后的下限） */
const COL_MIN_WIDTHS: Record<string, number> = {
  name: 88,
  country: 52,
  industry: 60,
  products: 64,
  website: 76,
  open_email: 96,
  linkedin: 68,
  employee_count: 48,
  created_at: 86,
  actions: 52,
};

/** 「其他主页」可选平台（也允许自己填平台名） */
const SOCIAL_PLATFORMS = [
  'Facebook', 'X (Twitter)', 'Instagram', 'LinkedIn', 'YouTube', 'TikTok', 'Pinterest', 'VK', 'WhatsApp',
];

/** 企业详情抽屉里员工表格的默认列宽（可拖拽调整，调整结果存在 store 中） */
const EMPLOYEE_COL_WIDTHS: Record<string, number> = {
  name: 160,
  position: 130,
  emails: 320,
  birthday: 76,
  letters: 46,
  actions: 72,
};

/** 列表宽下限，避免被拖到看不见内容；也是小窗口等比缩小的下限 */
const EMPLOYEE_COL_MIN_WIDTHS: Record<string, number> = {
  name: 76,
  position: 58,
  emails: 110,
  birthday: 50,
  letters: 36,
  actions: 46,
};

/** 勾选框列宽 / 展开列宽（与 antd 内部保持一致，用于计算 scroll.x） */
const SELECTION_COL_WIDTH = 32;
const EXPAND_COL_WIDTH = 48;

/** 单行省略的文本样式（配合 Tooltip 展示完整内容） */
const ellipsisCell: CSSProperties = {
  display: 'block',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export default function CompaniesPage() {
  const { t, lang } = useI18n();
  const { selectedCountry, setSelectedCountry, companiesPage, setCompaniesPage, invalidate, settings, loadSettings } = useAppStore();

  const emailCopyFormat = (settings as any)?.email_copy_format || '"{company_name} {full_name}-{position}" <{email}>';
  const deduceTemplateGroup = (settings as any)?.email_deduce_template_group || 'standard';
  const deduceMode = (settings as any)?.email_deduce_mode || 'disabled';

  // ── Persisted filter state from store ──
  const { searchText, industryFilter, productFilter, showFavoritesOnly, currentPage, pageSize } = companiesPage;
  const setSearchText = (v: string) => setCompaniesPage({ searchText: v, currentPage: 1 });
  const setIndustryFilter = (v: string | undefined) => setCompaniesPage({ industryFilter: v, currentPage: 1 });
  const setProductFilter = (v: number[]) => setCompaniesPage({ productFilter: v, currentPage: 1 });
  const setShowFavoritesOnly = (v: boolean) => setCompaniesPage({ showFavoritesOnly: v, currentPage: 1 });
  const setCurrentPage = (v: number) => setCompaniesPage({ currentPage: v });
  const setPageSize = (v: number) => setCompaniesPage({ pageSize: v, currentPage: 1 });

  // ── 列宽（可拖拽 + 随容器自适应，结果存 store） ──
  const [tableWrapRef, tableWrapWidth] = useContainerWidth<HTMLDivElement>();
  const { widths, resizeCell, totalWidth } = useResizableCols(
    COL_WIDTHS, companiesPage.colWidths, (w) => setCompaniesPage({ colWidths: w }), COL_MIN_WIDTHS,
    tableWrapWidth > 0 ? tableWrapWidth - SELECTION_COL_WIDTH - FIT_SAFETY : 0,
  );

  // ── Debounced search text (avoid API call on every keystroke) ──
  const [debouncedSearch, setDebouncedSearch] = useState(searchText);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  // ── Cached companies data ──
  const productFilterKey = productFilter.join(',');
  const cacheKey = `companies:${selectedCountry || ''}:${debouncedSearch}:${industryFilter}:${productFilterKey}:${showFavoritesOnly}:${currentPage}:${pageSize}`;
  const { data: companiesResult, loading, refresh: refreshCompanies } = useCachedData<PaginatedResult<Company>>(
    cacheKey,
    'companies',
    () => companyApi.list({
      page: currentPage, page_size: pageSize,
      country: selectedCountry || undefined,
      search: debouncedSearch || undefined,
      industry: industryFilter,
      product_ids: productFilter.length ? productFilter : undefined,
      is_favorite: showFavoritesOnly || undefined,
      sort_by: 'created_at', sort_order: 'desc',
    }),
    120_000,
    [selectedCountry, debouncedSearch, industryFilter, productFilterKey, showFavoritesOnly, currentPage, pageSize],
  );
  const companies = companiesResult ?? { items: [] as Company[], total: 0, page: 1, page_size: pageSize };

  // ── Local UI state ──
  const [countries, setCountries] = useState<string[]>(mergeOptions([], COUNTRIES));
  const [industries, setIndustries] = useState<string[]>(mergeOptions([], INDUSTRIES));
  const [frequentPositions, setFrequentPositions] = useState<string[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);


  // 主营产品字典（企业表单的多选项 + 管理弹窗共用）
  const [products, setProducts] = useState<Product[]>([]);
  const [productManagerOpen, setProductManagerOpen] = useState(false);

  const loadProducts = useCallback(async () => {
    try { setProducts(await productApi.list()); } catch { /* 取不到时下拉为空，不阻塞页面 */ }
  }, []);

  // Create modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();

  // Edit modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  // Detail drawer
  const [detailCompany, setDetailCompany] = useState<Company | null>(null);
  const [detailEmployees, setDetailEmployees] = useState<Employee[]>([]);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  // Add employee form inside drawer
  const [addEmpForm] = Form.useForm();
  const [addEmpLoading, setAddEmpLoading] = useState(false);
  const [deduceEmail, setDeduceEmail] = useState(false);

  // Import modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);

  const resetImportState = () => {
    // Cancel in-flight import request
    importAbortRef.current?.abort();
    importAbortRef.current = null;
    setImportLoading(false);
    setImportFile(null);
    setImportResult(null);
  };

  const handleImport = async () => {
    if (!importFile) { message.warning('请选择文件'); return; }
    setImportLoading(true);
    setImportResult(null);
    const controller = new AbortController();
    importAbortRef.current = controller;
    try {
      const result = await dataApi.importTemplate(importFile, true, controller.signal);
      setImportResult(result);
      if (result.companies_success > 0) {
        message.success(`导入成功：${result.companies_success} 家企业，${result.employees_success} 名员工`);
        refreshCompanies();
        invalidate(['employees', 'dashboard']);
      }
    } catch (err: any) {
      // Ignore cancellation errors
      if (err?.name === 'CanceledError' || err?.name === 'AbortError') return;
      message.error('导入失败: ' + (err?._userMessage || err?.message || '未知错误'));
    } finally {
      importAbortRef.current = null;
      setImportLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      message.loading({ content: '正在导出...', key: 'export', duration: 0 });
      await dataApi.exportTemplate();
      message.success({ content: '导出成功', key: 'export' });
    } catch (err: any) {
      const msg = err?._userMessage || err?.message || '未知错误';
      message.error({ content: '导出失败: ' + msg, key: 'export', duration: 5 });
      console.error('Export error:', err);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await dataApi.downloadTemplate();
      message.success('模板已下载');
    } catch (err: any) {
      const msg = err?._userMessage || err?.message || '未知错误';
      message.error('下载失败: ' + msg);
      console.error('Download template error:', err);
    }
  };

  useEffect(() => {
    if (!settings) loadSettings();
    companyApi.frequentValues().then(data => {
      setCountries(mergeOptions(data.countries, COUNTRIES));
      setIndustries(mergeOptions(data.industries, INDUSTRIES));
    }).catch(() => {
      setCountries(mergeOptions([], COUNTRIES));
      setIndustries(mergeOptions([], INDUSTRIES));
    });
    employeeApi.frequentValues().then(data => setFrequentPositions(data.positions)).catch(() => {});
    loadProducts();
  }, []);

  const openDetail = async (company: Company) => {
    setDetailCompany(company);
    setDetailDrawerOpen(true);
    try {
      const data = await employeeApi.list({ company_id: company.id, page_size: 100 });
      setDetailEmployees(data.items);
    } catch { /* */ }
  };

  // Add employee to this company (from detail drawer)
  const handleAddEmployeeToCompany = async () => {
    if (!detailCompany) return;
    try {
      const values = await addEmpForm.validateFields();
      setAddEmpLoading(true);

      const employee = await employeeApi.create({
        company_id: detailCompany.id,
        full_name: values.employee_name,
        position: values.position,
        phone: values.phone,
        personal_email: values.personal_email,
        whatsapp: values.whatsapp,
        linkedin: values.linkedin,
        notes: values.notes,
        birthday: values.birthday ? values.birthday.format('YYYY-MM-DD') : undefined,
      });
      message.success(`员工 ${employee.full_name} 已添加`);

      // Manual deduction: if user toggled deduce ON in manual mode
      if (deduceMode === 'manual' && deduceEmail) {
        try {
          const domain = detailCompany.domain || (() => {
            try { return new URL(detailCompany.website!.startsWith('http') ? detailCompany.website! : `https://${detailCompany.website}`).hostname.replace('www.', ''); } catch { return ''; }
          })();
          if (domain) {
            message.loading({ content: '正在推导邮箱...', key: 'deduce', duration: 0 });
            await emailApi.deduce({ employee_id: employee.id, full_name: employee.full_name, domain, template_group: deduceTemplateGroup });
            message.success({ content: '邮箱推导完成', key: 'deduce', duration: 3 });
          }
        } catch (err: any) {
          if (err?.response?.status !== 403) { message.warning('邮箱推导失败'); }
        }
      }
      // Auto mode: backend handles deduction automatically

      addEmpForm.resetFields();
      // Refresh employee list in drawer
      const data = await employeeApi.list({ company_id: detailCompany.id, page_size: 100 });
      setDetailEmployees(data.items);
      // Invalidate related caches
      refreshCompanies();
      invalidate(['employees', 'dashboard']);
    } catch { /* */ } finally { setAddEmpLoading(false); }
  };

  /** 表单值 → 接口入参：国家数组拼成 countries 字符串，空行由后端过滤。
   *  国家始终发送（哪怕是空串），这样编辑时清空所有国家能真正生效。 */
  const toCompanyPayload = (values: any) => ({
    ...values,
    countries: (values.countries || []).join(', '),
    product_ids: values.product_ids || [],
  });

  /** 创建成功后统一收尾（关闭弹窗、刷新列表） */
  const onCreateSuccess = () => {
    message.success('企业创建成功');
    setCreateModalOpen(false);
    createForm.resetFields();
    refreshCompanies();
    invalidate(['dashboard']);
  };

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      await companyApi.create(toCompanyPayload(values));
      onCreateSuccess();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 409) {
        // 把命中的企业列出来，用户才好判断到底是不是同一家
        const matches: { existing_name: string; match_type: string }[] = detail?.matches || [];
        const reason = matches.length
          ? `匹配到：${matches.map(m => `${m.existing_name}（${m.match_type === 'domain' ? '网站相同' : '名称相似'}）`).join('、')}`
          : (typeof detail === 'string' ? detail : detail?.message);
        Modal.confirm({
          title: '发现相似企业',
          content: (
            <Space direction="vertical" size={8} style={{ marginTop: 8 }}>
              {reason && <Text>{reason}</Text>}
              <Text type="secondary" style={{ fontSize: 12 }}>
                确认不是同一家的话可以继续创建；是同一家建议改为编辑已有企业。
              </Text>
            </Space>
          ),
          okText: '仍要创建',
          onOk: async () => {
            try {
              await companyApi.create(toCompanyPayload(createForm.getFieldsValue()), false);
              onCreateSuccess();
            } catch (e: any) {
              // 强制创建也可能失败（网络、校验等），把原因带出来而不是笼统一句失败
              const d = e.response?.data?.detail;
              message.error(e?._userMessage || (typeof d === 'string' ? d : d?.message) || '创建失败');
            }
          },
        });
      } else {
        // 非重复冲突（如字段校验不通过）以前是完全静默的，这里补上提示
        message.error(err?._userMessage || (typeof detail === 'string' ? detail : detail?.message) || '创建失败');
      }
    }
  };

  const openEdit = (company: Company) => {
    setEditingCompany(company);
    editForm.setFieldsValue({
      name: company.name,
      countries: splitCountries(company.countries || company.country),
      website: company.website,
      industry: company.industry,
      open_email: company.open_email,
      phone: company.phone,
      whatsapp: company.whatsapp,
      linkedin: company.linkedin,
      // JSON 列可能是 null，Form.List 不接受 null
      social_links: company.social_links || [],
      product_ids: (company.products || []).map(p => p.id),
      notes: company.notes,
    });
    setEditModalOpen(true);
  };

  const handleEdit = async () => {
    if (!editingCompany) return;
    try {
      const values = await editForm.validateFields();
      await companyApi.update(editingCompany.id, toCompanyPayload(values));
      message.success('企业更新成功');
      setEditModalOpen(false);
      setEditingCompany(null);
      editForm.resetFields();
      refreshCompanies();
      invalidate(['dashboard']);
    } catch { message.error('更新失败'); }
  };

  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) return;
    let deleteEmployees = false;
    Modal.confirm({
      title: `确定删除 ${selectedRowKeys.length} 家企业？`,
      content: (
        <Space direction="vertical" size={8} style={{ marginTop: 8 }}>
          <Checkbox
            defaultChecked={false}
            onChange={(e) => { deleteEmployees = e.target.checked; }}
          >
            同时删除这些企业下的所有员工
          </Checkbox>
          <Text type="secondary" style={{ fontSize: 12 }}>
            不勾选则保留员工信息，员工企业列将显示「已删除」标记
          </Text>
        </Space>
      ),
      okText: '删除',
      okType: 'danger',
      onOk: async () => {
        try {
          await companyApi.batchDelete(selectedRowKeys, deleteEmployees);
          message.success(deleteEmployees
            ? `已删除 ${selectedRowKeys.length} 家企业及其员工`
            : `已删除 ${selectedRowKeys.length} 家企业，员工信息已保留`);
          setSelectedRowKeys([]);
          refreshCompanies();
          invalidate(['employees', 'dashboard']);
        } catch { message.error('删除失败'); }
      },
    });
  };

  const columns: ColumnsType<Company> = [
    {
      title: t('企业名称'),
      dataIndex: 'name',
      key: 'name',
      width: widths.name,
      onHeaderCell: resizeCell('name'),
      fixed: 'left',
      sorter: true,
      render: (name: string, record: Company) => (
        <Space size={6}>
          {record.is_favorite && <StarFilled style={{ color: '#f59e0b', fontSize: 13 }} />}
          <Text strong style={{ cursor: 'pointer' }} onClick={() => openDetail(record)}>{name}</Text>
          <CopyOutlined style={{ color: '#94a3b8', fontSize: 11, cursor: 'pointer' }} onClick={(ev) => { ev.stopPropagation(); handleCopy(name); }} />
        </Space>
      ),
    },
    {
      title: t('国家'),
      dataIndex: 'country',
      key: 'country',
      width: widths.country,
      onHeaderCell: resizeCell('country'),
      filters: countries.slice(0, 20).map(c => ({ text: c, value: c })),
      // 企业可以有多个国家，命中任意一个都算
      onFilter: (value, record) => splitCountries(record.countries || record.country).includes(value as string),
      sorter: true,
      render: (_: unknown, record: Company) => {
        const list = splitCountries(record.countries || record.country);
        if (!list.length) return <Text type="secondary">-</Text>;
        const [primary, ...rest] = list;
        return (
          <Space size={4}>
            <Text style={{ fontSize: 12 }}>{primary}</Text>
            {rest.length > 0 && (
              <Tooltip title={list.join('、')}>
                <AntTag style={{ fontSize: 10, lineHeight: '15px', marginInlineEnd: 0, padding: '0 4px' }}>
                  +{rest.length}
                </AntTag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: t('行业'),
      dataIndex: 'industry',
      key: 'industry',
      width: widths.industry,
      onHeaderCell: resizeCell('industry'),
      ellipsis: true,
      filters: industries.slice(0, 20).map(i => ({ text: i, value: i })),
      onFilter: (value, record) => record.industry === value,
      sorter: true,
    },
    {
      title: t('主营产品/业务'),
      key: 'products',
      width: widths.products,
      onHeaderCell: resizeCell('products'),
      // 列头筛选：只看当前页的已加载数据（要全量筛请用工具栏的多选框）
      filters: products.slice(0, 30).map(p => ({ text: p.name, value: p.id })),
      onFilter: (value, record) => (record.products || []).some(p => p.id === value),
      render: (_: unknown, record: Company) => {
        const names = (record.products || []).map(p => (lang === 'en-US' && p.name_en ? p.name_en : p.name));
        if (!names.length) return <Text type="secondary">-</Text>;
        return (
          <Tooltip title={names.join('、')} mouseEnterDelay={0.4}>
            <span style={{ ...ellipsisCell, fontSize: 12 }}>{names.join('、')}</span>
          </Tooltip>
        );
      },
    },
    {
      title: t('网站'),
      dataIndex: 'website',
      key: 'website',
      width: widths.website,
      onHeaderCell: resizeCell('website'),
      ellipsis: true,
      render: (url: string) => url ? (
        <a href={url.startsWith('http') ? url : `https://${url}`} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
          {url.replace(/^https?:\/\//, '').replace(/^www\./, '')}
        </a>
      ) : <Text type="secondary">-</Text>,
    },
    {
      title: t('开放邮箱'),
      dataIndex: 'open_email',
      key: 'open_email',
      width: widths.open_email,
      onHeaderCell: resizeCell('open_email'),
      ellipsis: true,
      render: (email: string) => email ? <Text copyable style={{ fontSize: 12, fontFamily: 'monospace' }}>{email}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: 'LinkedIn',
      dataIndex: 'linkedin',
      key: 'linkedin',
      width: widths.linkedin,
      onHeaderCell: resizeCell('linkedin'),
      ellipsis: true,
      render: (url: string) => url ? (
        <a href={url.startsWith('http') ? url : `https://${url}`} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
          {url.replace(/^https?:\/\//, '').replace(/^www\./, '')}
        </a>
      ) : <Text type="secondary">-</Text>,
    },
    {
      title: t('员工数'),
      key: 'employee_count',
      width: widths.employee_count,
      onHeaderCell: resizeCell('employee_count'),
      align: 'center',
      sorter: true,
      render: (_: unknown, record: Company) => (
        <Badge count={record.employee_count_actual || 0} overflowCount={999} style={{ backgroundColor: '#4f46e5' }} />
      ),
    },
    {
      // 添加时间由后端在创建企业时自动记录（companies.created_at），无需填写
      title: t('添加时间'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: widths.created_at,
      onHeaderCell: resizeCell('created_at'),
      render: (v: string) => v ? (
        <Tooltip title={formatDateTime(v)}>
          <Text style={{ fontSize: 12 }}>{formatDate(v)}</Text>
        </Tooltip>
      ) : <Text type="secondary">-</Text>,
    },
    {
      title: t('操作'),
      key: 'actions',
      width: widths.actions,
      onHeaderCell: resizeCell('actions'),
      fixed: 'right',
      align: 'center',
      render: (_: unknown, record: Company) => (
        <Dropdown menu={{
          items: [
            { key: 'detail', icon: <BankOutlined />, label: t('查看详情'), onClick: () => openDetail(record) },
            { key: 'edit', icon: <MoreOutlined />, label: t('编辑'), onClick: () => openEdit(record) },
            { key: 'fav', icon: record.is_favorite ? <StarFilled style={{ color: '#f59e0b' }} /> : <StarOutlined />,
              label: record.is_favorite ? t('取消收藏') : t('添加收藏'),
              onClick: () => { companyApi.toggleFavorite(record.id).then(() => { refreshCompanies(); invalidate(['dashboard']); }); }
            },
            { type: 'divider' },
            { key: 'del', icon: <DeleteOutlined />, label: t('删除'), danger: true,
              onClick: () => {
                let deleteEmployees = false;
                Modal.confirm({
                  title: t('确定删除企业「{name}」？', { name: record.name }),
                  content: (
                    <Space direction="vertical" size={8} style={{ marginTop: 8 }}>
                      <Checkbox
                        defaultChecked={false}
                        onChange={(e) => { deleteEmployees = e.target.checked; }}
                      >
                        {t('同时删除该企业下的所有员工')}
                      </Checkbox>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {t('不勾选则保留员工信息，员工企业列将显示「已删除」标记')}
                      </Text>
                    </Space>
                  ),
                  okText: t('删除'),
                  okType: 'danger',
                  onOk: () => {
                    companyApi.delete(record.id, deleteEmployees).then(() => {
                      message.success(deleteEmployees ? t('企业及员工已删除') : t('企业已删除，员工信息已保留'));
                      refreshCompanies();
                      invalidate(['employees', 'dashboard']);
                    });
                  },
                });
              }
            },
          ],
        }} trigger={['click']}>
          <Button size="small" type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap size={8}>
          <Input
            placeholder={t('搜索名称/网站/行业/邮箱')}
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            allowClear
            style={{ width: 240 }}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            onPressEnter={() => refreshCompanies()}
          />
          <AutoComplete
            allowClear placeholder={t('国家')}
            value={selectedCountry}
            onChange={v => setSelectedCountry(v ?? undefined)}
            options={countries.map(c => ({ value: c }))}
            style={{ width: 140 }}
            filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
          />
          <AutoComplete
            allowClear placeholder={t('行业')}
            value={industryFilter}
            onChange={v => setIndustryFilter(v ?? undefined)}
            options={industries.map(i => ({ value: i }))}
            style={{ width: 140 }}
            filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
          />
          <ProductSelect
            products={products}
            value={productFilter}
            onChange={setProductFilter}
            placeholder={t('主营产品/业务')}
            style={{ width: 220 }}
          />
          <Button
            type={showFavoritesOnly ? 'primary' : 'default'}
            icon={showFavoritesOnly ? <StarFilled style={{ color: '#f59e0b' }} /> : <StarOutlined />}
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          >
            {showFavoritesOnly ? t('仅收藏') : t('收藏')}
          </Button>
          <Tooltip title={t('刷新数据')}>
            <Button icon={<ReloadOutlined />} onClick={() => { refreshCompanies(); invalidate(['employees', 'dashboard']); }} />
          </Tooltip>
        </Space>
        <Space size={8}>
          {selectedRowKeys.length > 0 && (
            <>
              <Text type="secondary" style={{ fontSize: 12 }}>{t('已选 {count} 项', { count: selectedRowKeys.length })}</Text>
              <Dropdown menu={{ items: [
                { key: 'fav', icon: <StarOutlined />, label: t('批量收藏'), onClick: async () => {
                  await companyApi.batchFavorite(selectedRowKeys, true);
                  message.success(t('已收藏 {count} 家企业', { count: selectedRowKeys.length }));
                  setSelectedRowKeys([]); refreshCompanies(); invalidate(['dashboard']);
                }},
                { key: 'unfav', icon: <StarFilled style={{ color: '#f59e0b' }} />, label: t('批量取消收藏'), onClick: async () => {
                  await companyApi.batchFavorite(selectedRowKeys, false);
                  message.success(t('已取消收藏 {count} 家企业', { count: selectedRowKeys.length }));
                  setSelectedRowKeys([]); refreshCompanies(); invalidate(['dashboard']);
                }},
              ] }} trigger={['click']}>
                <Button icon={<MoreOutlined />} size="small">{t('批量操作')}</Button>
              </Dropdown>
              <Button danger icon={<DeleteOutlined />} size="small" onClick={handleBatchDelete}>{t('批量删除')}</Button>
            </>
          )}
          <Dropdown menu={{ items: [
              { key: 'download', icon: <DownloadOutlined />, label: t('下载模板'), onClick: handleDownloadTemplate },
              { key: 'import', icon: <UploadOutlined />, label: t('导入数据'), onClick: () => { setImportModalOpen(true); setImportFile(null); setImportResult(null); } },
              { key: 'export', icon: <ExportOutlined />, label: t('导出数据'), onClick: handleExport },
          ] }} trigger={['click']}>
            <Button icon={<MoreOutlined />}>{t('数据')}</Button>
          </Dropdown>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            {t('新增企业')}
          </Button>
        </Space>
      </div>

      {/* Table */}
      <div ref={tableWrapRef} style={{ flex: 1, overflow: 'hidden' }}>
        <Table
          columns={columns}
          dataSource={companies.items}
          rowKey="id"
          loading={loading}
          scroll={{ x: totalWidth + SELECTION_COL_WIDTH, y: 'calc(100vh - 260px)' }}
          components={{ header: { cell: ResizableTitle } }}
          rowSelection={{
            selectedRowKeys,
            columnWidth: SELECTION_COL_WIDTH,
            onChange: (keys) => setSelectedRowKeys(keys as number[]),
          }}
          pagination={{
            current: currentPage,
            pageSize: companies.page_size,
            total: companies.total,
            showSizeChanger: true,
            showTotal: (total) => <Text type="secondary" style={{ fontSize: 12 }}>{t('共 {count} 家企业', { count: total })}</Text>,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, size) => {
              if (size !== pageSize) setPageSize(size);
              else setCurrentPage(page);
            },
            style: { marginBottom: 0 },
          }}
          size="middle"
          style={{ background: '#fff', borderRadius: 8, overflow: 'hidden' }}
        />
      </div>

      {/* Create modal */}
      <Modal
        title={<Space><BankOutlined /> {t('新增企业')}</Space>}
        open={createModalOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateModalOpen(false); createForm.resetFields(); }}
        okText={t('创建')}
        width={560}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" size="middle">
          <CompanyFormFields
            countries={countries}
            industries={industries}
            products={products}
            onManageProducts={() => setProductManagerOpen(true)}
          />
        </Form>
      </Modal>

      {/* Edit modal */}
      <Modal
        title={<Space><BankOutlined /> {t('编辑企业')}</Space>}
        open={editModalOpen}
        onOk={handleEdit}
        onCancel={() => { setEditModalOpen(false); setEditingCompany(null); editForm.resetFields(); }}
        okText={t('保存')}
        width={560}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" size="middle">
          <CompanyFormFields
            countries={countries}
            industries={industries}
            products={products}
            onManageProducts={() => setProductManagerOpen(true)}
          />
        </Form>
      </Modal>

      {/* 产品字典管理 */}
      <ProductManagerModal
        open={productManagerOpen}
        onClose={() => setProductManagerOpen(false)}
        onChanged={loadProducts}
      />

      {/* Import Modal */}
      <Modal
        title={<Space><UploadOutlined /> {t('导入数据')}</Space>}
        open={importModalOpen}
        onCancel={() => { resetImportState(); setImportModalOpen(false); }}
        footer={importResult ? [
          <Button key="close" onClick={() => { resetImportState(); setImportModalOpen(false); }}>{t('关闭')}</Button>,
        ] : [
          <Button key="cancel" onClick={() => { resetImportState(); setImportModalOpen(false); }} disabled={importLoading}>{t('取消')}</Button>,
          <Button key="import" type="primary" loading={importLoading} disabled={!importFile} onClick={handleImport}>{t('开始导入')}</Button>,
        ]}
        width={520}
        destroyOnClose
      >
        {!importResult ? (
          <>
            <Paragraph type="secondary" style={{ marginBottom: 12 }}>
              {t('上传按模板格式填写的 Excel 文件（.xlsx），每行一家企业，第3列包含公共邮箱和联系人信息。')}
            </Paragraph>
            <Upload.Dragger
              accept=".xlsx,.xls"
              maxCount={1}
              beforeUpload={(file) => {
                setImportFile(file);
                return false; // prevent auto upload
              }}
              onRemove={() => setImportFile(null)}
              showUploadList={importFile ? true : false}
              fileList={importFile ? [{ uid: '-1', name: importFile.name, status: 'done' as const }] : []}
            >
              <p className="ant-upload-drag-icon"><UploadOutlined style={{ fontSize: 32, color: '#4f46e5' }} /></p>
              <p className="ant-upload-text">{t('点击或拖拽文件到此区域')}</p>
              <p className="ant-upload-hint">{t('仅支持 .xlsx / .xls 格式')}</p>
            </Upload.Dragger>
          </>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Alert
              type={importResult.companies_success > 0 ? 'success' : 'warning'}
              message={importResult.companies_success > 0
                ? t('导入完成：{companies} 家企业，{employees} 名员工', {
                  companies: importResult.companies_success,
                  employees: importResult.employees_success,
                })
                : t('未导入任何数据')
              }
              showIcon
            />
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label={t('总行数')}>{importResult.total}</Descriptions.Item>
              <Descriptions.Item label={t('跳过（重复）')}>{importResult.skipped}</Descriptions.Item>
              <Descriptions.Item label={t('企业成功')}>{importResult.companies_success}</Descriptions.Item>
              <Descriptions.Item label={t('员工成功')}>{importResult.employees_success}</Descriptions.Item>
            </Descriptions>
            {importResult.errors.length > 0 && (
              <Collapse size="small" items={[{
                key: 'errors',
                label: <Text type="danger">{t('错误详情 ({count})', { count: importResult.errors.length })}</Text>,
                children: importResult.errors.map((e, i) => <Text key={i} style={{ fontSize: 12, display: 'block' }}>{e}</Text>),
              }]} />
            )}
          </Space>
        )}
      </Modal>

      {/* Detail drawer */}
      <Drawer
        title={<Space><BankOutlined /> {detailCompany?.name}</Space>}
        open={detailDrawerOpen}
        onClose={() => { setDetailDrawerOpen(false); addEmpForm.resetFields(); }}
        width="min(920px, 92vw)"
      >
        {detailCompany && (
          <Tabs items={[
            {
              key: 'info', label: t('企业信息'),
              children: (
                <Descriptions column={2} size="small" bordered style={{ borderRadius: 8, overflow: 'hidden' }}>
                  <Descriptions.Item label={t('名称')} span={2}>{detailCompany.name}</Descriptions.Item>
                  <Descriptions.Item label={t('国家')}>
                    {(() => {
                      const list = splitCountries(detailCompany.countries || detailCompany.country);
                      if (!list.length) return '-';
                      return list.map((c, i) => (
                        <AntTag key={i} color={i === 0 ? 'blue' : 'default'} style={{ fontSize: 12, marginBottom: 2 }}>
                          {c}
                        </AntTag>
                      ));
                    })()}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('行业')}>{detailCompany.industry || '-'}</Descriptions.Item>
                  <Descriptions.Item label={t('网站')}>
                    {detailCompany.website ? (
                      <a href={detailCompany.website.startsWith('http') ? detailCompany.website : `https://${detailCompany.website}`} target="_blank" rel="noreferrer">{detailCompany.website}</a>
                    ) : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('开放邮箱')} span={2}>
                    {detailCompany.open_email
                      ? detailCompany.open_email.split(',').filter((s: string) => s.trim()).map((e: string, i: number) => (
                          <div key={i}><Text copyable style={{ fontFamily: 'monospace' }}>{e.trim()}</Text></div>
                        ))
                      : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('电话')}>
                    {detailCompany.phone
                      ? detailCompany.phone.split(',').filter((s: string) => s.trim()).map((p: string, i: number) => (
                          <div key={i}><Text copyable style={{ fontSize: 13 }}>{p.trim()}</Text></div>
                        ))
                      : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="WhatsApp">
                    {detailCompany.whatsapp
                      ? detailCompany.whatsapp.split(',').filter((s: string) => s.trim()).map((p: string, i: number) => (
                          <div key={i}><Text copyable style={{ fontSize: 13 }}>{p.trim()}</Text></div>
                        ))
                      : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="LinkedIn">
                    {detailCompany.linkedin ? (
                      <a href={detailCompany.linkedin.startsWith('http') ? detailCompany.linkedin : `https://${detailCompany.linkedin}`} target="_blank" rel="noreferrer">{detailCompany.linkedin}</a>
                    ) : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('员工数')}>{detailCompany.employee_count_actual}</Descriptions.Item>
                  <Descriptions.Item label={t('主营产品/业务')} span={2}>
                    {(detailCompany.products || []).length
                      ? (detailCompany.products || []).map(p => (
                          <Tooltip key={p.id} title={p.name_en ? `${p.name} / ${p.name_en}` : p.name}>
                            <AntTag color="geekblue" style={{ fontSize: 12, marginBottom: 2 }}>
                              {lang === 'en-US' && p.name_en ? p.name_en : p.name}{p.name_en && lang !== 'en-US' ? ` / ${p.name_en}` : ''}
                            </AntTag>
                          </Tooltip>
                        ))
                      : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('其他主页')} span={2}>
                    {(detailCompany.social_links || []).length
                      ? (detailCompany.social_links || []).map((l, i) => (
                          <div key={i} style={{ fontSize: 13 }}>
                            <Text type="secondary">{l.platform}：</Text>
                            <a href={l.url.startsWith('http') ? l.url : `https://${l.url}`} target="_blank" rel="noreferrer">{l.url}</a>
                          </div>
                        ))
                      : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('备注')} span={2}>{detailCompany.notes || '-'}</Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: 'employees', label: <Space><TeamOutlined /> {t('员工')} ({detailEmployees.length})</Space>,
              children: (
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  {/* Inline add employee form */}
                  <Card size="small" type="inner" title={<Space><UserAddOutlined /> {t('添加员工')}</Space>} style={{ borderRadius: 8 }}>
                    <Form form={addEmpForm} layout="vertical" size="small">
                      <Row gutter={8}>
                        <Col span={8}><Form.Item label={t('姓名')} name="employee_name" rules={[{ required: true }]}><Input placeholder="Alex Demo" /></Form.Item></Col>
                        <Col span={8}><Form.Item label={t('职位')} name="position"><AutoComplete options={frequentPositions.map(v => ({ value: v }))} placeholder="CTO" filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())} /></Form.Item></Col>
                        <Col span={8}><Form.Item label={t('电话')} name="phone"><Input placeholder="+49..." /></Form.Item></Col>
                      </Row>
                      <Row gutter={8}>
                        <Col span={8}><Form.Item label="WhatsApp" name="whatsapp"><Input placeholder="+49..." /></Form.Item></Col>
                        <Col span={8}><Form.Item label={t('生日')} name="birthday"><DatePicker style={{ width: '100%' }} placeholder={t('生日')} format="YYYY-MM-DD" /></Form.Item></Col>
                        <Col span={8}></Col>
                      </Row>
                      <Form.Item label={t('个人邮箱')} name="personal_email"><Input placeholder="alex@example.com" /></Form.Item>
                      <Form.Item label="LinkedIn" name="linkedin"><Input placeholder="linkedin.com/in/..." /></Form.Item>
                      <Form.Item label={t('备注')} name="notes"><Input.TextArea rows={1} /></Form.Item>
                      <Row gutter={12} align="middle">
                        {deduceMode === 'manual' && <Col><Form.Item label={t('推导邮箱')} tooltip={t('开启后将根据企业域名推导可能的邮箱地址')}><Switch checked={deduceEmail} onChange={setDeduceEmail} checkedChildren={t('推导')} unCheckedChildren={t('跳过')} /></Form.Item></Col>}
                        <Col><Button type="primary" icon={<PlusOutlined />} onClick={handleAddEmployeeToCompany} loading={addEmpLoading}>{t('添加员工')}</Button></Col>
                      </Row>
                    </Form>
                  </Card>

                  {/* Employee list */}
                  <EmployeeListWithLetters
                    employees={detailEmployees} onCopy={handleCopy}
                    emailCopyFormat={emailCopyFormat} companyName={detailCompany?.name}
                    deduceTemplateGroup={deduceTemplateGroup}
                    onRefresh={async () => {
                      const data = await employeeApi.list({ company_id: detailCompany!.id, page_size: 100 });
                      setDetailEmployees(data.items);
                      invalidate(['dashboard']);
                    }}
                  />
                </Space>
              ),
            },
          ]} />
        )}
      </Drawer>
    </div>
  );
}

/** 新增 / 编辑企业共用的表单字段 —— 两处必须展示同一批字段，避免「详情里有、表单里没有」。 */
function CompanyFormFields({ countries, industries, products, onManageProducts }: {
  countries: string[];
  industries: string[];
  products: Product[];
  onManageProducts: () => void;
}) {
  const { t } = useI18n();
  const filterOption = (input: string, option?: { value?: string }) =>
    (option?.value ?? '').toLowerCase().includes(input.toLowerCase());

  return (
    <>
      <Row gutter={12}>
        <Col span={12}><Form.Item label={t('企业名称')} name="name" rules={[{ required: true }]}><Input placeholder="Durst Group AG" /></Form.Item></Col>
        <Col span={12}>
          {/* 多国家：不限制显示数量，标签自动换行，避免国家被折进「+N」看不见 */}
          <Form.Item
            label={t('国家')}
            name="countries"
            tooltip={t('一家企业可做多个国家的业务；第一个国家作为主国家，用于列表筛选与统计')}
          >
            <Select
              mode="tags"
              placeholder={t('搜索或输入，回车添加')}
              options={countries.map(c => ({ value: c, label: c }))}
              tokenSeparators={[',', '、', '/', ';']}
              filterOption={filterOption}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={12}>
        <Col span={12}><Form.Item label={t('网站')} name="website"><Input placeholder="durst-group.com" /></Form.Item></Col>
        <Col span={12}><Form.Item label={t('行业')} name="industry"><AutoComplete options={industries.map(i => ({ value: i }))} placeholder={t('搜索或输入...')} filterOption={filterOption} /></Form.Item></Col>
      </Row>
      <Form.Item
        label={<Space size={8}>{t('主营产品/业务')}
          <Button type="link" size="small" icon={<TagsOutlined />} style={{ padding: 0, height: 'auto', fontSize: 12 }} onClick={onManageProducts}>
            {t('管理产品')}
          </Button>
        </Space>}
        name="product_ids"
        tooltip={t('这家客户企业主要靠什么业务赚钱（如大幅面喷绘、展会搭建、灯箱制作），用于按客户业务推荐我们的材料')}
      >
        <ProductSelect
          products={products}
          placeholder={t('选择该客户经营的业务/产品（可多选）')}
        />
      </Form.Item>
      <Form.Item label={t('开放邮箱')} name="open_email" normalize={(v: string | string[]) => Array.isArray(v) ? v.join(', ') : v} getValueProps={(v: string) => ({ value: v ? v.split(',').map((s: string) => s.trim()).filter(Boolean) : [] })}><Select mode="tags" placeholder={t('输入邮箱后回车')} tokenSeparators={[',']} style={{ width: '100%' }} /></Form.Item>
      <Row gutter={12}>
        <Col span={12}><Form.Item label={t('电话')} name="phone" normalize={(v: string | string[]) => Array.isArray(v) ? v.join(', ') : v} getValueProps={(v: string) => ({ value: v ? v.split(',').map((s: string) => s.trim()).filter(Boolean) : [] })}><Select mode="tags" placeholder={t('输入号码后回车')} tokenSeparators={[',']} style={{ width: '100%' }} /></Form.Item></Col>
        <Col span={12}><Form.Item label="WhatsApp" name="whatsapp" normalize={(v: string | string[]) => Array.isArray(v) ? v.join(', ') : v} getValueProps={(v: string) => ({ value: v ? v.split(',').map((s: string) => s.trim()).filter(Boolean) : [] })}><Select mode="tags" placeholder={t('输入号码后回车')} tokenSeparators={[',']} style={{ width: '100%' }} /></Form.Item></Col>
      </Row>
      <Form.Item label="LinkedIn" name="linkedin"><Input placeholder="linkedin.com/company/..." /></Form.Item>

      {/* 其他企业主页（X / Facebook 等），可填多行 */}
      <Form.Item label={t('其他企业主页')} tooltip={t('X、Facebook、Instagram 等企业主页地址，可填多个')}>
        <Form.List name="social_links">
          {(fields, { add, remove }) => (
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              {fields.map(({ key, name, ...rest }) => (
                <Row key={key} gutter={8} align="middle" wrap={false}>
                  <Col flex="140px">
                    <Form.Item {...rest} name={[name, 'platform']} noStyle>
                      <AutoComplete
                        options={SOCIAL_PLATFORMS.map(p => ({ value: p }))}
                        placeholder={t('平台')}
                        filterOption={filterOption}
                      />
                    </Form.Item>
                  </Col>
                  <Col flex="auto">
                    <Form.Item {...rest} name={[name, 'url']} noStyle>
                      <Input placeholder="https://facebook.com/your-page" />
                    </Form.Item>
                  </Col>
                  <Col flex="24px">
                    <Tooltip title={t('删除')}>
                      <MinusCircleOutlined style={{ color: '#94a3b8' }} onClick={() => remove(name)} />
                    </Tooltip>
                  </Col>
                </Row>
              ))}
              <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => add({ platform: '', url: '' })} style={{ width: 160 }}>
                {t('添加主页')}
              </Button>
            </Space>
          )}
        </Form.List>
      </Form.Item>

      <Form.Item label={t('备注')} name="notes"><Input.TextArea rows={2} /></Form.Item>
    </>
  );
}

/** Employee list with expandable dev letter history. */
function EmployeeListWithLetters({ employees, onCopy, emailCopyFormat, companyName, onRefresh, deduceTemplateGroup }: {
  employees: Employee[]; onCopy: (t: string) => void; emailCopyFormat: string; companyName?: string;
  onRefresh?: () => void;
  deduceTemplateGroup: string;
}) {
  const { t } = useI18n();
  const [letterMap, setLetterMap] = useState<Record<number, DevLetter[]>>({});
  const [loadingMap, setLoadingMap] = useState<Record<number, boolean>>({});
  const [expandedKeys, setExpandedKeys] = useState<number[]>([]);

  const loadLetters = async (empId: number) => {
    if (letterMap[empId] !== undefined) return; // already loaded
    setLoadingMap(prev => ({ ...prev, [empId]: true }));
    try {
      const letters = await devLetterApi.list(empId);
      setLetterMap(prev => ({ ...prev, [empId]: letters }));
    } catch { /* */ } finally {
      setLoadingMap(prev => ({ ...prev, [empId]: false }));
    }
  };

  /** 展开/收起某个员工的完整信息面板 */
  const toggleExpand = (id: number) => {
    setExpandedKeys(prev => {
      if (prev.includes(id)) return prev.filter(k => k !== id);
      loadLetters(id);
      return [...prev, id];
    });
  };

  /** 按企业域名推导该员工邮箱 */
  const handleDeduce = async (r: Employee) => {
    if (!r.company_id) { message.warning(t('无关联企业')); return; }
    try {
      const company = await companyApi.get(r.company_id);
      const domain = company.domain || (() => {
        try { return new URL(company.website!.startsWith('http') ? company.website! : `https://${company.website}`).hostname.replace('www.', ''); } catch { return ''; }
      })();
      if (!domain) { message.warning(t('企业无域名')); return; }
      message.loading({ content: t('推导中...'), key: 'deduce', duration: 0 });
      await emailApi.deduce({ employee_id: r.id, full_name: r.full_name, domain, template_group: deduceTemplateGroup });
      message.success({ content: t('推导完成'), key: 'deduce', duration: 2 });
      onRefresh?.();
    } catch { message.error({ content: t('推导失败'), key: 'deduce' }); }
  };

  // ── 列宽：默认值 + store 中用户拖拽后的结果（用 selector 订阅，避免缓存刷新时整表重渲染） ──
  const savedColWidths = useAppStore(s => s.companiesPage.employeeColWidths);
  const setCompaniesPage = useAppStore(s => s.setCompaniesPage);
  // 抽屉宽度会随窗口（含系统缩放）变化，列宽跟着收缩，避免表格横向溢出把展开的信息挤出可视区
  const [tableWrapRef, tableWrapWidth] = useContainerWidth<HTMLDivElement>();
  const { widths: colWidths, resizeCell, totalWidth } = useResizableCols(
    EMPLOYEE_COL_WIDTHS, savedColWidths, (w) => setCompaniesPage({ employeeColWidths: w }), EMPLOYEE_COL_MIN_WIDTHS,
    tableWrapWidth > 0 ? tableWrapWidth - EXPAND_COL_WIDTH - FIT_SAFETY : 0,
  );

  return (
    <div ref={tableWrapRef}>
    <Table
      dataSource={employees}
      rowKey="id"
      size="small"
      pagination={false}
      scroll={{ x: totalWidth + EXPAND_COL_WIDTH }}
      components={{ header: { cell: ResizableTitle } }}
      style={{ borderRadius: 8, overflow: 'hidden' }}
      expandable={{
        expandedRowKeys: expandedKeys,
        onExpandedRowsChange: (keys) => setExpandedKeys(keys as number[]),
        onExpand: (expanded, record) => { if (expanded) loadLetters(record.id); },
        expandRowByClick: true,
        rowExpandable: () => true,
        expandedRowRender: (record) => (
          <EmployeeDetailPanel
            employee={record}
            letters={letterMap[record.id]}
            lettersLoading={!!loadingMap[record.id]}
            onCopy={onCopy}
            emailCopyFormat={emailCopyFormat}
            companyName={companyName}
            onRefresh={onRefresh}
            onDeduce={handleDeduce}
          />
        ),
      }}
      columns={[
        {
          title: t('姓名'), dataIndex: 'full_name', key: 'name',
          width: colWidths.name, ellipsis: true, onHeaderCell: resizeCell('name'),
          render: (name: string) => (
            <Tooltip title={name} mouseEnterDelay={0.4}>
              <Text strong style={{ fontSize: 13 }}>{name}</Text>
            </Tooltip>
          ),
        },
        {
          title: t('职位'), dataIndex: 'position', key: 'position',
          width: colWidths.position, ellipsis: true, onHeaderCell: resizeCell('position'),
          render: (v: string) => v ? <Tooltip title={v}><Text style={{ fontSize: 12 }}>{v}</Text></Tooltip> : <Text type="secondary">-</Text>,
        },
        {
          title: t('邮箱'), key: 'emails',
          width: colWidths.emails, onHeaderCell: resizeCell('emails'),
          render: (_: unknown, r: Employee) => {
            const visible = r.emails?.filter(e => e.verification_status === 'valid' || e.source === 'manual') || [];
            if (!visible.length) {
              const hasAny = (r.emails?.length || 0) > 0;
              // 没有推导/已验证邮箱时，至少把手填的个人邮箱显示出来，别让它看起来"什么都没填"
              if (r.personal_email) {
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, lineHeight: '20px' }}>
                    <AntTag color="blue" style={{ fontSize: 11, marginInlineEnd: 0, flexShrink: 0 }}>{t('个人')}</AntTag>
                    <Tooltip title={r.personal_email} mouseEnterDelay={0.4}>
                      <span style={{ ...ellipsisCell, flex: 1, fontSize: 12, fontFamily: 'monospace' }}>{r.personal_email}</span>
                    </Tooltip>
                    <Tooltip title={t('复制邮箱')}>
                      <CopyOutlined style={{ color: '#94a3b8', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                        onClick={(ev) => { ev.stopPropagation(); onCopy(r.personal_email!); }} />
                    </Tooltip>
                    {hasAny && (
                      <Tooltip title={t('复制所有推导邮箱（收件人格式）')}>
                        <CopyOutlined style={{ color: '#6366f1', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            const formatted = (r.emails || []).map(e =>
                              formatEmailCopy(emailCopyFormat, { company_name: companyName, full_name: r.full_name, position: r.position, email: e.email })
                            ).join('; ');
                            handleCopy(formatted);
                          }} />
                      </Tooltip>
                    )}
                  </div>
                );
              }
              return (
                <Space size={4}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{hasAny ? t('未发现') : '-'}</Text>
                  {hasAny && (
                    <Tooltip title={t('复制所有推导邮箱（收件人格式）')}>
                      <CopyOutlined style={{ color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          const formatted = (r.emails || []).map(e =>
                            formatEmailCopy(emailCopyFormat, { company_name: companyName, full_name: r.full_name, position: r.position, email: e.email })
                          ).join('; ');
                          handleCopy(formatted);
                        }} />
                    </Tooltip>
                  )}
                </Space>
              );
            }
            // 每个邮箱占一行，过长的地址省略显示，悬停查看完整地址
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                {visible.slice(0, 2).map((e) => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, lineHeight: '20px' }}>
                    <EmailVerifyIcon status={e.verification_status} onStatusChange={async (newStatus) => {
                      try {
                        await emailApi.update(e.id, { verification_status: newStatus });
                        onRefresh?.();
                      } catch { message.error('状态更新失败'); }
                    }} />
                    <Tooltip title={e.email} mouseEnterDelay={0.4}>
                      <span style={{ ...ellipsisCell, flex: 1, fontSize: 12, fontFamily: 'monospace' }}>{e.email}</span>
                    </Tooltip>
                    <Tooltip title={t('复制邮箱')}>
                      <CopyOutlined style={{ color: '#94a3b8', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                        onClick={(ev) => { ev.stopPropagation(); onCopy(e.email); }} />
                    </Tooltip>
                    <Tooltip title={t('复制收件人格式')}>
                      <CopyOutlined style={{ color: '#6366f1', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onCopy(formatEmailCopy(emailCopyFormat, { company_name: companyName, full_name: r.full_name, position: r.position, email: e.email }));
                        }} />
                    </Tooltip>
                  </div>
                ))}
                {visible.length > 2 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>+{visible.length - 2} {t('更多')}</Text>
                )}
              </div>
            );
          },
        },
        {
          title: t('生日'), dataIndex: 'birthday', key: 'birthday',
          width: colWidths.birthday, onHeaderCell: resizeCell('birthday'),
          render: (v: string) => v ? <Text style={{ fontSize: 12 }}>{dayjs(v).format('MM-DD')}</Text> : <Text type="secondary" style={{ fontSize: 11 }}>-</Text>,
        },
        {
          title: t('信'), key: 'letters', align: 'center',
          width: colWidths.letters, onHeaderCell: resizeCell('letters'),
          render: (_: unknown, r: Employee) => {
            const letters = letterMap[r.id];
            if (letters === undefined) return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
            return <Badge count={letters.length} overflowCount={99} style={{ backgroundColor: '#4f46e5' }} />;
          },
        },
        {
          title: '', key: 'actions', align: 'center',
          width: colWidths.actions, onHeaderCell: resizeCell('actions'),
          render: (_: unknown, r: Employee) => (
            <Space size={0}>
              <Tooltip title={expandedKeys.includes(r.id) ? t('收起') : t('查看该员工全部信息')}>
                <Button
                  size="small" type="text"
                  icon={expandedKeys.includes(r.id) ? <UpOutlined /> : <InfoCircleOutlined />}
                  onClick={(ev) => { ev.stopPropagation(); toggleExpand(r.id); }}
                />
              </Tooltip>
              {(r.emails?.length || 0) === 0 && (
                <Tooltip title={t('推导邮箱')}>
                  <Button size="small" type="text" icon={<ThunderboltOutlined />}
                    onClick={(ev) => { ev.stopPropagation(); handleDeduce(r); }} />
                </Tooltip>
              )}
            </Space>
          ),
        },
      ]}
    />
    </div>
  );
}

/** 员工完整信息面板 —— 展开行时显示，避免为查看信息而在列表里增加列。 */
function EmployeeDetailPanel({ employee: e, letters, lettersLoading, onCopy, emailCopyFormat, companyName, onRefresh, onDeduce }: {
  employee: Employee;
  letters?: DevLetter[];
  lettersLoading: boolean;
  onCopy: (t: string) => void;
  emailCopyFormat: string;
  companyName?: string;
  onRefresh?: () => void;
  onDeduce: (employee: Employee) => void;
}) {
  const { t, lang } = useI18n();
  const STEP_COLORS_LOCAL = ['#3b82f6', '#06b6d4', '#6366f1', '#8b5cf6', '#f59e0b', '#6b7280'];
  const emails = e.emails || [];
  const primary = emails.filter(em => em.source === 'manual' || em.verification_status === 'valid');
  const others = emails.filter(em => em.source !== 'manual' && em.verification_status !== 'valid');

  const copyText = (value?: string) => value
    ? <Text copyable={{ tooltips: [t('复制'), t('已复制')] }} style={{ fontSize: 13 }}>{value}</Text>
    : <Text type="secondary">-</Text>;

  const renderEmailRow = (em: EmailBrief) => (
    <div key={em.id} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, lineHeight: '22px' }}>
      <EmailVerifyIcon status={em.verification_status} onStatusChange={async (newStatus) => {
        try {
          await emailApi.update(em.id, { verification_status: newStatus });
          message.success(t('状态已更新'));
          onRefresh?.();
        } catch { message.error(t('状态更新失败')); }
      }} />
      <Tooltip title={em.email} mouseEnterDelay={0.4}>
        <span style={{ ...ellipsisCell, fontSize: 13, fontFamily: 'monospace' }}>{em.email}</span>
      </Tooltip>
      {em.source === 'manual' && <AntTag color="blue" style={{ fontSize: 11, marginInlineEnd: 0, flexShrink: 0 }}>{t('手动')}</AntTag>}
      {em.pattern_type && <AntTag style={{ fontSize: 11, marginInlineEnd: 0, flexShrink: 0 }}>{em.pattern_type}</AntTag>}
      <Tooltip title={t('复制邮箱')}>
        <CopyOutlined style={{ color: '#94a3b8', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
          onClick={() => onCopy(em.email)} />
      </Tooltip>
      <Tooltip title={t('复制收件人格式')}>
        <CopyOutlined style={{ color: '#6366f1', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
          onClick={() => onCopy(formatEmailCopy(emailCopyFormat, { company_name: companyName, full_name: e.full_name, position: e.position, email: em.email }))} />
      </Tooltip>
    </div>
  );

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Descriptions
        size="small"
        bordered
        column={3}
        /* width + break-word：长邮箱/长链接换行，不把表格撑宽导致内容被裁掉 */
        style={{ borderRadius: 8, overflow: 'hidden', width: '100%', wordBreak: 'break-word' }}
        /* 标签不换行，否则窄屏下「个人邮箱」会被拆成两行 */
        labelStyle={{ whiteSpace: 'nowrap' }}
        items={[
          { key: 'position', label: t('职位'), children: e.position || '-' },
          { key: 'department', label: t('部门'), children: e.department || '-' },
          { key: 'seniority', label: t('资历'), children: e.seniority || '-' },
          { key: 'phone', label: t('电话'), children: copyText(e.phone) },
          { key: 'whatsapp', label: 'WhatsApp', children: copyText(e.whatsapp) },
          { key: 'personal_email', label: t('个人邮箱'), children: copyText(e.personal_email) },
          { key: 'birthday', label: t('生日'), children: e.birthday ? dayjs(e.birthday).format('YYYY-MM-DD') : '-' },
          { key: 'contact_status', label: t('联系状态'), children: <ContactStatusTag status={e.contact_status || 'new'} /> },
          { key: 'progress', label: t('开发进度'), children: <LetterStepTag step={e.letter_step || 0} /> },
          {
            key: 'linkedin', label: 'LinkedIn',
            children: e.linkedin
              ? <a href={e.linkedin.startsWith('http') ? e.linkedin : `https://${e.linkedin}`} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>{e.linkedin}</a>
              : '-',
          },
          { key: 'created', label: t('添加时间'), span: 2, children: formatDate(e.created_at) },
          { key: 'notes', label: t('备注'), span: 'filled', children: e.notes || '-' },
        ]}
      />

      {/* 邮箱：已验证/手动添加的直接列出，未验证的推导结果收进折叠区（与员工页一致） */}
      <div>
        <Space size={8} style={{ marginBottom: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('邮箱')} ({emails.length})</Text>
          <Tooltip title={t('按企业域名推导可能的邮箱地址')}>
            <Button size="small" type="link" style={{ fontSize: 12, padding: 0, height: 'auto' }}
              icon={<ThunderboltOutlined />} onClick={() => onDeduce(e)}>
              {t('推导邮箱')}
            </Button>
          </Tooltip>
          {emails.length > 0 && <Text type="secondary" style={{ fontSize: 12 }}>{t('点击状态图标可切换邮箱有效性')}</Text>}
        </Space>
        {emails.length === 0 ? (
          <div><Text type="secondary" style={{ fontSize: 12 }}>{t('暂无邮箱，可点击「推导邮箱」')}</Text></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {primary.length > 0
              ? primary.map(renderEmailRow)
              : <Text type="secondary" style={{ fontSize: 12 }}>{t('暂无已验证邮箱，展开下方推导结果查看')}</Text>}
            {others.length > 0 && (
              <Collapse
                size="small"
                defaultActiveKey={['others']}
                items={[{
                  key: 'others',
                  label: <Text type="secondary" style={{ fontSize: 12 }}>{t('其他推导结果 ({count})', { count: others.length })}</Text>,
                  children: others.map(renderEmailRow),
                }]}
              />
            )}
          </div>
        )}
      </div>

      {/* 开发信历史 */}
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>{t('开发信历史')} ({letters?.length ?? '…'})</Text>
        <div style={{ marginTop: 4 }}>
          {lettersLoading ? (
            <Spin size="small" />
          ) : !letters || letters.length === 0 ? (
            <Text type="secondary" style={{ fontSize: 12 }}>{t('暂无开发信记录')}</Text>
          ) : (
            <Collapse
              size="small"
              items={letters.map(letter => ({
                key: letter.id,
                label: (
                  <Space size={6}>
                    {letter.step ? (
                      <AntTag color={STEP_COLORS_LOCAL[letter.step - 1]} style={{ fontSize: 11, marginRight: 0 }}>
                        {t('第 {step} 封', { step: letter.step })}
                      </AntTag>
                    ) : (
                      <AntTag style={{ fontSize: 11 }}>{t('通用')}</AntTag>
                    )}
                    <AntTag color={letter.is_sent ? 'green' : 'default'} style={{ fontSize: 11 }}>
                      {letter.is_sent ? t('已发送') : t('草稿')}
                    </AntTag>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {new Date(letter.created_at).toLocaleDateString(lang === 'zh-CN' ? 'zh-CN' : 'en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {letter.template_name && <Text type="secondary" style={{ fontSize: 11 }}>{letter.template_name}</Text>}
                  </Space>
                ),
                children: (
                  <div style={{ position: 'relative' }}>
                    <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8, margin: 0, maxHeight: 300, overflow: 'auto' }}>
                      {letter.content}
                    </Paragraph>
                    <Button
                      size="small" icon={<CopyOutlined />}
                      style={{ position: 'absolute', top: 0, right: 0 }}
                      onClick={() => onCopy(letter.content)}
                    >
                      {t('复制')}
                    </Button>
                  </div>
                ),
              }))}
            />
          )}
        </div>
      </div>
    </Space>
  );
}
