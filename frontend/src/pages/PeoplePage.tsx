/** People page — clean separation: select company → fill employee info only. */

import { useCallback, useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import {
  Button, Select, Input, Form, Table, Space, Tag, Popconfirm,
  message, Tooltip, Typography, Card, Drawer, Descriptions, Tabs,
  Dropdown, Row, Col, Modal, Switch, AutoComplete, Collapse, Badge, Divider,
  DatePicker,
} from 'antd';
import {
  SearchOutlined, StarOutlined, StarFilled, MailOutlined,
  DeleteOutlined, CopyOutlined, PlusOutlined,
  ThunderboltOutlined,
  CheckOutlined, QuestionOutlined, MoreOutlined,
  UserAddOutlined, EditOutlined, SyncOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { employeeApi } from '../api/employees';
import { emailApi } from '../api/emails';
import { companyApi } from '../api/companies';
import { devLetterApi } from '../api/devLetters';
import ProductSelect from '../components/ProductSelect';
import { productApi } from '../api/products';
import { ContactStatusTag, LetterStepTag } from '../components/ProgressTag';
import ResizableTitle, { useResizableCols, useContainerWidth, FIT_SAFETY } from '../components/ResizableTitle';
import { useAppStore } from '../store/useAppStore';
import { useCachedData } from '../hooks/useCachedData';
import { COUNTRIES, mergeOptions } from '../constants';
import type { Employee, EmailBrief, PaginatedResult, DevLetter, ContactStatus, Product } from '../types';
import { CONTACT_STATUS_CONFIG, LETTER_STEPS } from '../types';
import { formatDateTime } from '../utils/date';
import { useI18n } from '../i18n';

const { Text, Paragraph } = Typography;

const STATUS_OPTIONS = [
  { value: 'valid', label: '✅ 有效', color: '#16a34a' },
  { value: 'likely_valid', label: '❓ 可能有效', color: '#2563eb' },
  { value: 'unknown', label: '❓ 未知', color: '#94a3b8' },
];

/** 员工表格默认列宽（可拖拽调整，结果存 store） */
const COL_WIDTHS: Record<string, number> = {
  full_name: 150,
  position: 150,
  birthday: 90,
  company_name: 170,
  emails: 280,
  progress: 130,
  created_at: 120,
  actions: 120,
};

/** 各列最小宽度（小窗口下等比缩小后的下限） */
const COL_MIN_WIDTHS: Record<string, number> = {
  full_name: 76,
  position: 58,
  birthday: 50,
  company_name: 70,
  emails: 110,
  progress: 68,
  created_at: 60,
  actions: 68,
};

/** 勾选框列宽（与 rowSelection.columnWidth 保持一致） */
const SELECTION_COL_WIDTH = 32;

function EmailVerifyIcon({ status, onStatusChange }: { status: string; onStatusChange?: (newStatus: string) => void }) {
  const { t } = useI18n();
  const icon = status === 'valid'
    ? <CheckOutlined style={{ color: '#16a34a', fontSize: 14 }} />
    : status === 'likely_valid'
      ? <QuestionOutlined style={{ color: '#2563eb', fontSize: 14 }} />
      : <QuestionOutlined style={{ color: '#94a3b8', fontSize: 14 }} />;

  if (!onStatusChange) {
    return <Tooltip title={t(STATUS_OPTIONS.find(o => o.value === status)?.label || '未知')}>{icon}</Tooltip>;
  }

  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: STATUS_OPTIONS.map(opt => ({
          key: opt.value,
          label: t(opt.label),
          icon: status === opt.value ? <CheckOutlined style={{ color: opt.color }} /> : <span style={{ width: 14, display: 'inline-block' }} />,
        })),
        onClick: ({ key }) => { if (key !== status) onStatusChange(key); },
        selectedKeys: [status],
      }}
    >
      <Tooltip title={t('点击修改状态')}>{icon}</Tooltip>
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
  // Clean up empty parts: "-" with empty position, extra spaces
  result = result.replace(/-+(?=[\s,>])/g, '');     // dangling dash before space/comma/>
  result = result.replace(/\s{2,}/g, ' ');           // double spaces
  result = result.replace(/""\s/g, '');               // empty quoted name
  result = result.replace(/"<\s/g, '<');              // empty name before <
  return result.trim();
}

export default function PeoplePage() {
  const { t, lang } = useI18n();
  const {
    selectedCountry, setSelectedCountry,
    peoplePage, setPeoplePage, invalidate, settings, loadSettings,
  } = useAppStore();

  const emailCopyFormat = (settings as any)?.email_copy_format || '"{company_name} {full_name}-{position}" <{email}>';
  const deduceTemplateGroup = (settings as any)?.email_deduce_template_group || 'standard';
  const deduceMode = (settings as any)?.email_deduce_mode || 'disabled';

  // ── Persisted filter state from store ──
  const { searchText, positionFilter, countryFilter, productFilter, showFavoritesOnly, contactStatusFilter, currentPage, pageSize } = peoplePage;
  const setSearchText = (v: string) => setPeoplePage({ searchText: v, currentPage: 1 });
  const setPositionFilter = (v: string | undefined) => setPeoplePage({ positionFilter: v, currentPage: 1 });
  const setCountryFilter = (v: string | undefined) => setPeoplePage({ countryFilter: v, currentPage: 1 });
  const setProductFilter = (v: number[]) => setPeoplePage({ productFilter: v, currentPage: 1 });
  const setShowFavoritesOnly = (v: boolean) => setPeoplePage({ showFavoritesOnly: v, currentPage: 1 });
  const setContactStatusFilter = (v: string | undefined) => setPeoplePage({ contactStatusFilter: v, currentPage: 1 });
  const setCurrentPage = (v: number) => setPeoplePage({ currentPage: v });
  const setPageSize = (v: number) => setPeoplePage({ pageSize: v, currentPage: 1 });

  // ── 列宽（可拖拽 + 随容器自适应，结果存 store） ──
  const [tableWrapRef, tableWrapWidth] = useContainerWidth<HTMLDivElement>();
  const { widths, resizeCell, totalWidth } = useResizableCols(
    COL_WIDTHS, peoplePage.colWidths, (w) => setPeoplePage({ colWidths: w }), COL_MIN_WIDTHS,
    tableWrapWidth > 0 ? tableWrapWidth - SELECTION_COL_WIDTH - FIT_SAFETY : 0,
  );

  // ── Debounced search text (avoid API call on every keystroke) ──
  const [debouncedSearch, setDebouncedSearch] = useState(searchText);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  // ── Cached employees data ──
  const productFilterKey = productFilter.join(',');
  const cacheKey = `employees:${countryFilter || selectedCountry || ''}:${positionFilter || ''}:${productFilterKey}:${debouncedSearch}:${showFavoritesOnly}:${contactStatusFilter}:${currentPage}:${pageSize}`;
  const { data: employeesResult, loading, refresh: refreshEmployees } = useCachedData<PaginatedResult<Employee>>(
    cacheKey,
    'employees',
    () => employeeApi.list({
      page: currentPage, page_size: pageSize,
      country: countryFilter || selectedCountry || undefined,
      product_ids: productFilter.length ? productFilter : undefined,
      position: positionFilter || undefined,
      search: debouncedSearch || undefined,
      is_favorite: showFavoritesOnly || undefined,
      contact_status: contactStatusFilter || undefined,
      sort_by: 'created_at', sort_order: 'desc',
    }),
    120_000,
    [countryFilter, selectedCountry, positionFilter, productFilterKey, debouncedSearch, showFavoritesOnly, contactStatusFilter, currentPage, pageSize],
  );
  const employees = employeesResult ?? { items: [] as Employee[], total: 0, page: 1, page_size: pageSize };

  // ── Local UI state ──
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [countries, setCountries] = useState<string[]>(mergeOptions([], COUNTRIES));
  const [products, setProducts] = useState<Product[]>([]);
  const [frequentPositions, setFrequentPositions] = useState<string[]>([]);
  const [deduceLoadingId, setDeduceLoadingId] = useState<number | null>(null);

  // Add employee form
  const [addForm] = Form.useForm();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deduceEmail, setDeduceEmail] = useState(false);

  // Company search (shared between add & edit modals)
  const [companyOptions, setCompanyOptions] = useState<{ label: string; value: number }[]>([]);
  const [companySearchLoading, setCompanySearchLoading] = useState(false);
  const companySearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Debounced company search — hits API so results are always fresh. */
  const handleCompanySearch = useCallback((query: string) => {
    if (companySearchTimer.current) clearTimeout(companySearchTimer.current);
    if (!query.trim()) {
      companySearchTimer.current = setTimeout(async () => {
        setCompanySearchLoading(true);
        try {
          const data = await companyApi.list({ page: 1, page_size: 20, sort_by: 'name', sort_order: 'asc' });
          setCompanyOptions(data.items.map(c => ({
            label: `${c.name}${c.country ? ` (${c.country})` : ''}${c.industry ? ` - ${c.industry}` : ''}`,
            value: c.id,
          })));
        } catch { /* */ } finally { setCompanySearchLoading(false); }
      }, 100);
      return;
    }
    companySearchTimer.current = setTimeout(async () => {
      setCompanySearchLoading(true);
      try {
        const data = await companyApi.list({ page: 1, page_size: 20, search: query, sort_by: 'name', sort_order: 'asc' });
        setCompanyOptions(data.items.map(c => ({
          label: `${c.name}${c.country ? ` (${c.country})` : ''}${c.industry ? ` - ${c.industry}` : ''}`,
          value: c.id,
        })));
      } catch { /* */ } finally { setCompanySearchLoading(false); }
    }, 300);
  }, []);

  // Edit employee form
  const [editForm] = Form.useForm();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Detail drawer
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  // Dev letter
  const [devLetterContent, setDevLetterContent] = useState('');
  const [devLetterLang, setDevLetterLang] = useState('en');
  const [aiLoading, setAiLoading] = useState(false);

  // Dev letter

  useEffect(() => {
    if (!settings) loadSettings();
    companyApi.frequentValues().then(data => setCountries(mergeOptions(data.countries, COUNTRIES))).catch(() => setCountries(mergeOptions([], COUNTRIES)));
    employeeApi.frequentValues().then(data => { setFrequentPositions(data.positions); }).catch(() => {});
    productApi.list().then(setProducts).catch(() => {});
  }, []);

  // Open add modal → trigger initial company load
  const openAddModal = () => {
    handleCompanySearch('');
    setAddModalOpen(true);
  };

  // Submit — add employee only (company must be selected)
  const handleAddEmployee = async () => {
    try {
      const values = await addForm.validateFields();
      const companyId = values.company_id;
      if (!companyId) { message.error(t('请选择所属企业')); return; }

      setDeduceLoadingId(-1); // -1 = adding employee
      const employee = await employeeApi.create({
        company_id: companyId,
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
          const company = await companyApi.get(companyId);
          const domain = company.domain || (() => {
            try { return new URL(company.website!.startsWith('http') ? company.website! : `https://${company.website}`).hostname.replace('www.', ''); } catch { return ''; }
          })();
          if (domain) {
            message.loading({ content: '正在推导邮箱...', key: 'deduce', duration: 0 });
            await emailApi.deduce({ employee_id: employee.id, full_name: employee.full_name, domain, template_group: deduceTemplateGroup });
            message.success({ content: '邮箱推导完成', key: 'deduce', duration: 3 });
          } else {
            message.warning('关联企业无域名，无法推导邮箱');
          }
        } catch (err: any) {
          if (err?.response?.status !== 403) { message.warning('邮箱推导失败'); }
        }
      }
      // Auto mode: backend handles deduction automatically, just refresh

      addForm.resetFields();
      setAddModalOpen(false);
      refreshEmployees();
      invalidate(['dashboard']);
    } catch (err) { console.error(err); } finally { setDeduceLoadingId(null); }
  };

  // Open edit modal
  const openEditModal = async (emp: Employee) => {
    handleCompanySearch('');
    // Fetch full employee data to ensure all fields are available
    try {
      const full = await employeeApi.get(emp.id);
      setEditingEmployee(full);
      editForm.setFieldsValue({
        company_id: full.company_id,
        full_name: full.full_name,
        position: full.position,
        phone: full.phone,
        personal_email: full.personal_email,
        whatsapp: full.whatsapp,
        linkedin: full.linkedin,
        notes: full.notes,
        birthday: full.birthday ? dayjs(full.birthday) : undefined,
      });
    } catch {
      // Fallback to list record
      setEditingEmployee(emp);
      editForm.setFieldsValue({
        company_id: emp.company_id,
        full_name: emp.full_name,
        position: emp.position,
        phone: emp.phone,
        personal_email: emp.personal_email,
        whatsapp: emp.whatsapp,
        linkedin: emp.linkedin,
        notes: emp.notes,
        birthday: emp.birthday ? dayjs(emp.birthday) : undefined,
      });
    }
    setEditModalOpen(true);
  };

  const handleEditEmployee = async () => {
    if (!editingEmployee) return;
    try {
      const values = await editForm.validateFields();
      await employeeApi.update(editingEmployee.id, {
        company_id: values.company_id || null,
        full_name: values.full_name,
        position: values.position || null,
        phone: values.phone || null,
        personal_email: values.personal_email || null,
        whatsapp: values.whatsapp || null,
        linkedin: values.linkedin || null,
        notes: values.notes || null,
        birthday: values.birthday ? values.birthday.format('YYYY-MM-DD') : null,
      });
      message.success('员工信息已更新');
      setEditModalOpen(false);
      setEditingEmployee(null);
      editForm.resetFields();
      refreshEmployees();
      invalidate(['dashboard']);
      // Refresh detail drawer if open for this employee
      if (detailEmployee?.id === editingEmployee.id) {
        try {
          const updated = await employeeApi.get(editingEmployee.id);
          setDetailEmployee(updated);
        } catch { /* best-effort */ }
      }
    } catch { message.error('更新失败'); }
  };

  // Batch delete
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      await employeeApi.batchDelete(selectedRowKeys);
      message.success(t('已删除 {count} 个员工', { count: selectedRowKeys.length }));
      setSelectedRowKeys([]);
      refreshEmployees();
      invalidate(['companies', 'dashboard']);
    } catch { message.error('删除失败'); }
  };

  // Generate dev letter
  const handleGenerateLetter = async (emp: Employee) => {
    setAiLoading(true); setDevLetterContent('');
    try {
      const content = await devLetterApi.generate({
        employee_id: emp.id, company_id: emp.company_id,
        employee_name: emp.full_name, employee_position: emp.position, language: devLetterLang,
      });
      setDevLetterContent(content);
    } catch { message.error('AI生成失败，请检查API设置'); } finally { setAiLoading(false); }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => message.success('已复制'));
  };

  // ── Table columns ──────────────────────────────────
  const columns: ColumnsType<Employee> = [
    {
      title: t('姓名'),
      dataIndex: 'full_name',
      key: 'full_name',
      width: widths.full_name,
      onHeaderCell: resizeCell('full_name'),
      fixed: 'left',
      render: (name: string, record: Employee) => (
        <Space size={6}>
          {record.is_favorite && <StarFilled style={{ color: '#f59e0b', fontSize: 13 }} />}
          <Text strong style={{ cursor: 'pointer' }} onClick={async () => {
            setDetailDrawerOpen(true);
            setDetailEmployee(record);
            try { const full = await employeeApi.get(record.id); setDetailEmployee(full); } catch { /* keep list record */ }
          }}>{name}</Text>
          <CopyOutlined style={{ color: '#94a3b8', fontSize: 11, cursor: 'pointer' }} onClick={(ev) => { ev.stopPropagation(); handleCopy(name); }} />
        </Space>
      ),
      sorter: true,
    },
    {
      title: t('职位'),
      dataIndex: 'position',
      key: 'position',
      width: widths.position,
      onHeaderCell: resizeCell('position'),
      ellipsis: true,
      sorter: true,
      filters: [
        { text: 'CEO / Owner', value: 'CEO' },
        { text: 'CTO / Tech', value: 'CTO' },
        { text: 'Manager', value: 'Manager' },
        { text: 'Director', value: 'Director' },
      ],
      onFilter: (value, record) => (record.position || '').toLowerCase().includes(String(value).toLowerCase()),
    },
    {
      title: t('生日'),
      dataIndex: 'birthday',
      key: 'birthday',
      width: widths.birthday,
      onHeaderCell: resizeCell('birthday'),
      render: (v: string) => v ? dayjs(v).format('MM-DD') : <Text type="secondary">-</Text>,
    },
    {
      title: t('所属企业'),
      dataIndex: 'company_name',
      key: 'company_name',
      width: widths.company_name,
      onHeaderCell: resizeCell('company_name'),
      ellipsis: true,
      sorter: true,
      render: (name: string, record: Employee) => {
        if (!record.company_id && record.former_company_name) {
          return (
            <Space size={4}>
              <Text style={{ fontSize: 13 }}>{record.former_company_name}</Text>
              <Tag color="red" style={{ fontSize: 11, lineHeight: '18px', marginRight: 0 }}>{t('已删除')}</Tag>
            </Space>
          );
        }
        return name ? (
          <Space size={4}>
            <Text style={{ fontSize: 13 }}>{name}</Text>
            <CopyOutlined style={{ color: '#94a3b8', fontSize: 11, cursor: 'pointer' }} onClick={(ev) => { ev.stopPropagation(); handleCopy(name); }} />
          </Space>
        ) : <Text type="secondary">-</Text>;
      },
    },
    {
      title: t('邮箱'),
      key: 'emails',
      width: widths.emails,
      onHeaderCell: resizeCell('emails'),
      render: (_: unknown, record: Employee) => {
        // Only show valid or manual emails in the table; likely_valid/unknown are hidden
        const visibleEmails = record.emails?.filter(
          e => e.verification_status === 'valid' || e.source === 'manual',
        ) || [];
        if (!visibleEmails.length) {
          const hasAny = record.emails?.length > 0;
          const copyAllDeduced = hasAny ? () => {
            const formatted = (record.emails || []).map(e =>
              formatEmailCopy(emailCopyFormat, {
                company_name: record.company_name,
                full_name: record.full_name,
                position: record.position,
                email: e.email,
              })
            ).join('; ');
            handleCopy(formatted);
          } : undefined;
          // 没有推导/已验证邮箱时，把手填的个人邮箱显示出来
          if (record.personal_email) {
            return (
              <Space size={4}>
                <Tag color="blue" style={{ fontSize: 11, lineHeight: '18px', marginRight: 0 }}>个人</Tag>
                <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{record.personal_email}</Text>
                <Tooltip title="复制邮箱">
                  <CopyOutlined style={{ color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}
                    onClick={(ev) => { ev.stopPropagation(); handleCopy(record.personal_email!); }} />
                </Tooltip>
              </Space>
            );
          }
          return (
            <Space size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>{hasAny ? '未发现' : '未推导'}</Text>
              {copyAllDeduced && (
                <Tooltip title="复制所有推导邮箱（收件人格式）">
                  <CopyOutlined style={{ color: '#94a3b8', fontSize: 11, cursor: 'pointer' }} onClick={(ev) => { ev.stopPropagation(); copyAllDeduced(); }} />
                </Tooltip>
              )}
            </Space>
          );
        }
        return (
          <Space direction="vertical" size={2}>
            {visibleEmails.slice(0, 2).map((e: EmailBrief) => (
              <Space key={e.id} size={4} style={{ lineHeight: '22px' }}>
                <EmailVerifyIcon status={e.verification_status} onStatusChange={async (newStatus) => {
                  try {
                    await emailApi.update(e.id, { verification_status: newStatus });
                    refreshEmployees();
                    invalidate(['dashboard']);
                  } catch { message.error('状态更新失败'); }
                }} />
                <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{e.email}</Text>
                <Tooltip title="复制邮箱">
                  <CopyOutlined style={{ color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}
                    onClick={(ev) => { ev.stopPropagation(); handleCopy(e.email); }} />
                </Tooltip>
                <Tooltip title="复制收件人格式">
                  <CopyOutlined style={{ color: '#6366f1', fontSize: 11, cursor: 'pointer' }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      handleCopy(formatEmailCopy(emailCopyFormat, {
                        company_name: record.company_name,
                        full_name: record.full_name,
                        position: record.position,
                        email: e.email,
                      }));
                    }} />
                </Tooltip>
              </Space>
            ))}
            {visibleEmails.length > 2 && (
              <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 11 }}
                onClick={async () => {
                  setDetailDrawerOpen(true); setDetailEmployee(record);
                  try { const full = await employeeApi.get(record.id); setDetailEmployee(full); } catch { /* */ }
                }}>
                +{visibleEmails.length - 2} 更多
              </Button>
            )}
          </Space>
        );
      },
    },
    {
      title: t('开发进度'),
      key: 'progress',
      width: widths.progress,
      onHeaderCell: resizeCell('progress'),
      align: 'center',
      render: (_: unknown, record: Employee) => (
        <Space size={4}>
          <ContactStatusTag status={record.contact_status || 'new'} />
          {record.letter_step > 0 && <LetterStepTag step={record.letter_step} compact />}
        </Space>
      ),
    },
    {
      title: t('添加时间'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: widths.created_at,
      onHeaderCell: resizeCell('created_at'),
      sorter: true,
      render: (v: string) => v ? new Date(v).toLocaleDateString(lang === 'zh-CN' ? 'zh-CN' : 'en-US', { month: '2-digit', day: '2-digit' }) : '-',
    },
    {
      title: t('操作'),
      key: 'actions',
      width: widths.actions,
      onHeaderCell: resizeCell('actions'),
      fixed: 'right',
      align: 'center',
      render: (_: unknown, record: Employee) => (
        <Space size={2}>
          {(record.emails?.length || 0) === 0 && (
            <Tooltip title={t('推导邮箱')}>
              <Button size="small" type="text" icon={<ThunderboltOutlined />}
                onClick={async () => {
                  if (!record.company_id) { message.warning('无关联企业，无法推导'); return; }
                  setDeduceLoadingId(record.id);
                  try {
                    const company = await companyApi.get(record.company_id);
                    const domain = company.domain || (() => { try { return new URL(company.website!.startsWith('http') ? company.website! : `https://${company.website}`).hostname.replace('www.', ''); } catch { return ''; } })();
                    if (!domain) { message.warning('企业无域名，无法推导'); return; }
                    message.loading({ content: '正在推导...', key: 'deduce', duration: 0 });
                    await emailApi.deduce({ employee_id: record.id, full_name: record.full_name, domain, template_group: deduceTemplateGroup });
                    message.success({ content: '推导完成', key: 'deduce', duration: 2 });
                    refreshEmployees();
                    invalidate(['dashboard']);
                  } catch { message.error({ content: '推导失败', key: 'deduce' }); }
                  finally { setDeduceLoadingId(null); }
                }} loading={deduceLoadingId === record.id} />
            </Tooltip>
          )}
          <Tooltip title={t('生成开发信')}>
            <Button size="small" type="text" icon={<MailOutlined />}
              onClick={() => handleGenerateLetter(record)} loading={aiLoading} />
          </Tooltip>
          <Dropdown menu={{
            items: [
              { key: 'edit', icon: <MoreOutlined />, label: t('编辑'), onClick: () => openEditModal(record) },
              { key: 'fav', icon: record.is_favorite ? <StarFilled style={{ color: '#f59e0b' }} /> : <StarOutlined />,
                label: record.is_favorite ? t('取消收藏') : t('添加收藏'),
                onClick: () => { employeeApi.toggleFavorite(record.id).then(() => { refreshEmployees(); invalidate(['dashboard']); }).catch(() => {}); }
              },
              { key: 'copy', icon: <CopyOutlined />, label: t('复制邮箱'),
                onClick: () => { const e = record.emails?.[0]; if (e) handleCopy(e.email); }
              },
              { type: 'divider' },
              { key: 'del', icon: <DeleteOutlined />, label: t('删除'), danger: true,
                onClick: () => { Modal.confirm({ title: t('确定删除？'), content: t('删除员工 {name}', { name: record.full_name }), onOk: () => { employeeApi.delete(record.id).then(() => { message.success(t('已删除')); refreshEmployees(); invalidate(['companies', 'dashboard']); }).catch(() => message.error(t('删除失败'))); } }); }
              },
            ],
          }} trigger={['click']}>
            <Button size="small" type="text" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap size={8}>
          <Input
            placeholder={t('搜索姓名/职位/企业/邮箱')}
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            allowClear style={{ width: 220 }}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            onPressEnter={() => refreshEmployees()}
          />
          <AutoComplete
            allowClear placeholder={t('国家')}
            value={countryFilter || selectedCountry}
            onChange={v => { setCountryFilter(v ?? undefined); setSelectedCountry(v ?? undefined); }}
            options={countries.map(c => ({ value: c }))}
            style={{ width: 130 }}
            filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
          />
          <ProductSelect
            products={products}
            value={productFilter}
            onChange={setProductFilter}
            placeholder={t('主营产品/业务')}
            style={{ width: 210 }}
          />
          <Input
            placeholder={t('筛选职位')} allowClear style={{ width: 140 }}
            value={positionFilter || ''}
            onChange={e => setPositionFilter(e.target.value || undefined)}
          />
          <Button
            type={showFavoritesOnly ? 'primary' : 'default'}
            icon={showFavoritesOnly ? <StarFilled style={{ color: '#f59e0b' }} /> : <StarOutlined />}
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          >
            {showFavoritesOnly ? t('仅收藏') : t('收藏')}
          </Button>
          <Select
            allowClear placeholder={t('状态')} style={{ width: 120 }}
            value={contactStatusFilter}
            onChange={v => setContactStatusFilter(v ?? undefined)}
            options={Object.entries(CONTACT_STATUS_CONFIG).map(([k, v]) => ({ label: v.label, value: k }))}
          />
          <Tooltip title={t('刷新数据')}>
            <Button icon={<SyncOutlined />} onClick={() => { refreshEmployees(); invalidate(['dashboard']); }} />
          </Tooltip>
        </Space>
        <Space size={8}>
          {selectedRowKeys.length > 0 && (
            <>
              <Text type="secondary" style={{ fontSize: 12 }}>{t('已选 {count} 项', { count: selectedRowKeys.length })}</Text>
              <Dropdown menu={{ items: [
                { key: 'fav', icon: <StarOutlined />, label: t('批量收藏'), onClick: async () => {
                  await employeeApi.batchFavorite(selectedRowKeys, true);
                  message.success(t('已收藏 {count} 人', { count: selectedRowKeys.length }));
                  setSelectedRowKeys([]); refreshEmployees(); invalidate(['dashboard']);
                }},
                { key: 'unfav', icon: <StarFilled style={{ color: '#f59e0b' }} />, label: t('批量取消收藏'), onClick: async () => {
                  await employeeApi.batchFavorite(selectedRowKeys, false);
                  message.success(t('已取消收藏 {count} 人', { count: selectedRowKeys.length }));
                  setSelectedRowKeys([]); refreshEmployees(); invalidate(['dashboard']);
                }},
                { type: 'divider' },
                ...(Object.keys(CONTACT_STATUS_CONFIG) as ContactStatus[]).map(s => ({
                  key: s, label: t('设为{label}', { label: t(CONTACT_STATUS_CONFIG[s]?.label || s) }),
                  onClick: async () => {
                    await employeeApi.batchUpdate(selectedRowKeys, { contact_status: s });
                    message.success(t('已更新 {count} 人状态', { count: selectedRowKeys.length }));
                    setSelectedRowKeys([]); refreshEmployees(); invalidate(['dashboard']);
                  },
                })),
              ] }} trigger={['click']}>
                <Button icon={<MoreOutlined />} size="small">{t('批量操作')}</Button>
              </Dropdown>
              <Popconfirm title={t('确定删除 {count} 个员工？', { count: selectedRowKeys.length })} onConfirm={handleBatchDelete}>
                <Button danger icon={<DeleteOutlined />} size="small">{t('批量删除')}</Button>
              </Popconfirm>
            </>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
            {t('添加员工')}
          </Button>
        </Space>
      </div>

      {/* Table */}
      <div ref={tableWrapRef} style={{ flex: 1, overflow: 'hidden' }}>
        <Table
          columns={columns}
          dataSource={employees.items}
          rowKey="id"
          loading={loading}
          scroll={{ x: totalWidth + SELECTION_COL_WIDTH, y: 'calc(100vh - 260px)' }}
          components={{ header: { cell: ResizableTitle } }}
          rowSelection={{ selectedRowKeys, columnWidth: SELECTION_COL_WIDTH, onChange: (keys) => setSelectedRowKeys(keys as number[]) }}
          pagination={{
            current: currentPage, pageSize: employees.page_size, total: employees.total,
            showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total) => <Text type="secondary" style={{ fontSize: 12 }}>{t('共 {count} 条', { count: total })}</Text>,
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

      {/* ── Add Employee Modal — only employee fields ── */}
      <Modal
        title={<Space><UserAddOutlined /> {t('添加员工')}</Space>}
        open={addModalOpen}
        onOk={handleAddEmployee}
        onCancel={() => { setAddModalOpen(false); addForm.resetFields(); }}
        okText="确认添加"
        confirmLoading={deduceLoadingId !== null}
        width={520}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" size="middle">
          <Form.Item
            label={t('所属企业')}
            name="company_id"
            rules={[{ required: true, message: t('请选择所属企业') }]}
          >
            <Select
              showSearch
              placeholder="输入关键字搜索企业..."
              filterOption={false}
              onSearch={handleCompanySearch}
              options={companyOptions}
              loading={companySearchLoading}
              notFoundContent={companySearchLoading ? '搜索中...' : '无匹配企业'}
            />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}><Form.Item label={t('姓名')} name="employee_name" rules={[{ required: true }]}><Input placeholder="Alex Demo" /></Form.Item></Col>
            <Col span={12}><Form.Item label={t('职位')} name="position"><AutoComplete options={frequentPositions.map(v => ({ value: v }))} placeholder="CTO" filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}><Form.Item label={t('电话')} name="phone"><Input placeholder="+49 123 456789" /></Form.Item></Col>
            <Col span={8}><Form.Item label="WhatsApp" name="whatsapp"><Input placeholder="+49 987 654321" /></Form.Item></Col>
            <Col span={8}><Form.Item label={t('生日')} name="birthday"><DatePicker style={{ width: '100%' }} placeholder={t('选择生日')} format="YYYY-MM-DD" /></Form.Item></Col>
          </Row>
          <Form.Item label={t('个人邮箱')} name="personal_email"><Input placeholder="alex@example.com" /></Form.Item>
          <Form.Item label="LinkedIn" name="linkedin"><Input placeholder="https://linkedin.com/in/xxx" /></Form.Item>
          <Form.Item label={t('备注')} name="notes"><Input.TextArea rows={2} placeholder={t('个人备注...')} /></Form.Item>

          {deduceMode === 'manual' && (
            <Form.Item label={t('推导邮箱')} tooltip={t('开启后将根据企业域名推导可能的邮箱地址')}>
              <Switch checked={deduceEmail} onChange={setDeduceEmail} checkedChildren="推导" unCheckedChildren="跳过" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* ── Edit Employee Modal ── */}
      <Modal
        title={t('编辑员工')}
        open={editModalOpen}
        onOk={handleEditEmployee}
        onCancel={() => { setEditModalOpen(false); setEditingEmployee(null); editForm.resetFields(); }}
        okText="保存"
        width={520}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" size="middle">
          <Form.Item label="所属企业" name="company_id">
            <Select
              showSearch
              allowClear
              placeholder="输入关键字搜索企业...（可清空）"
              filterOption={false}
              onSearch={handleCompanySearch}
              options={companyOptions}
              loading={companySearchLoading}
              notFoundContent={companySearchLoading ? '搜索中...' : '无匹配企业'}
            />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}><Form.Item label={t('姓名')} name="full_name" rules={[{ required: true }]}><Input placeholder="Alex Demo" /></Form.Item></Col>
            <Col span={12}><Form.Item label={t('职位')} name="position"><AutoComplete options={frequentPositions.map(v => ({ value: v }))} placeholder="CTO" filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}><Form.Item label={t('电话')} name="phone"><Input placeholder="+49 123 456789" /></Form.Item></Col>
            <Col span={8}><Form.Item label="WhatsApp" name="whatsapp"><Input placeholder="+49 987 654321" /></Form.Item></Col>
            <Col span={8}><Form.Item label={t('生日')} name="birthday"><DatePicker style={{ width: '100%' }} placeholder={t('选择生日')} format="YYYY-MM-DD" /></Form.Item></Col>
          </Row>
          <Form.Item label={t('个人邮箱')} name="personal_email"><Input placeholder="alex@example.com" /></Form.Item>
          <Form.Item label="LinkedIn" name="linkedin"><Input placeholder="https://linkedin.com/in/xxx" /></Form.Item>
          <Form.Item label={t('备注')} name="notes"><Input.TextArea rows={2} placeholder={t('个人备注...')} /></Form.Item>
        </Form>
      </Modal>

      {/* Dev letter floating card */}
      {devLetterContent && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 100 }}>
          <Card
            size="small"
            title={<Space><MailOutlined /> {t('开发信')}</Space>}
            extra={
              <Space size={4}>
                <Select size="small" value={devLetterLang} onChange={setDevLetterLang} style={{ width: 80 }}
                  options={[
                    { label: '🇬🇧 English', value: 'en' },
                    { label: '🇩🇪 Deutsch', value: 'de' },
                    { label: '🇫🇷 Français', value: 'fr' },
                    { label: '🇪🇸 Español', value: 'es' },
                    { label: '🇮🇹 Italiano', value: 'it' },
                    { label: '🇵🇹 Português', value: 'pt' },
                    { label: '🇳🇱 Nederlands', value: 'nl' },
                    { label: '🇷🇺 Русский', value: 'ru' },
                    { label: '🇯🇵 日本語', value: 'ja' },
                    { label: '🇨🇳 中文', value: 'zh' },
                  ]}
                />
                <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopy(devLetterContent)}>复制</Button>
                <Button size="small" type="primary" onClick={async () => {
                  try {
                    await devLetterApi.create({
                      employee_id: detailEmployee?.id,
                      company_id: detailEmployee?.company_id,
                      content: devLetterContent,
                      language: devLetterLang,
                    });
                    message.success(t('开发信已保存'));
                    setDevLetterContent('');
                    refreshEmployees();
                    invalidate(['dashboard']);
                  } catch { message.error('保存失败'); }
                }}>保存</Button>
                <Button size="small" onClick={() => setDevLetterContent('')}>关闭</Button>
              </Space>
            }
            style={{ width: 420, borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
          >
            <Paragraph style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: 0, maxHeight: 300, overflow: 'auto' }}>{devLetterContent}</Paragraph>
          </Card>
        </div>
      )}

      {/* Detail drawer */}
      <Drawer
        title={detailEmployee?.full_name}
        open={detailDrawerOpen}
        onClose={() => { setDetailDrawerOpen(false); setDevLetterContent(''); }}
        width={520}
      >
        {detailEmployee && (
          <Tabs items={[
            {
              key: 'info', label: t('基本信息'),
              children: (
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label={t('姓名')}>{detailEmployee.full_name}</Descriptions.Item>
                  <Descriptions.Item label={t('职位')}>{detailEmployee.position || '-'}</Descriptions.Item>
                  <Descriptions.Item label={t('部门')}>{detailEmployee.department || '-'}</Descriptions.Item>
                  <Descriptions.Item label={t('企业')}>
                    {!detailEmployee.company_id && detailEmployee.former_company_name ? (
                      <Space size={4}>
                        <Text>{detailEmployee.former_company_name}</Text>
                        <Tag color="red" style={{ fontSize: 11 }}>{t('已删除')}</Tag>
                      </Space>
                    ) : (detailEmployee.company_name || '-')}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('电话')}>{detailEmployee.phone || '-'}</Descriptions.Item>
                  <Descriptions.Item label="WhatsApp">{detailEmployee.whatsapp || '-'}</Descriptions.Item>
                  <Descriptions.Item label={t('个人邮箱')}>{detailEmployee.personal_email || '-'}</Descriptions.Item>
                  <Descriptions.Item label="LinkedIn">{detailEmployee.linkedin || '-'}</Descriptions.Item>
                  <Descriptions.Item label={t('生日')}>{detailEmployee.birthday ? dayjs(detailEmployee.birthday).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
                  <Descriptions.Item label={t('备注')}>{detailEmployee.notes || '-'}</Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: 'emails', label: `${t('邮箱')} (${detailEmployee.emails?.length || 0})`,
              children: (
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  {/* Deduce button - always visible */}
                  {(detailEmployee.emails?.length || 0) === 0 ? (
                    <Card
                      size="small"
                      style={{ borderRadius: 8, border: '1px dashed #c7d2fe', background: '#f5f3ff', textAlign: 'center', padding: '8px 0' }}
                    >
                      <Space direction="vertical" size={4} align="center">
                        <Text type="secondary" style={{ fontSize: 13 }}>{t('暂无邮箱，点击推导')}</Text>
                        <Button
                          type="primary"
                          icon={<ThunderboltOutlined />}
                          loading={deduceLoadingId === detailEmployee.id}
                          onClick={async () => {
                            if (!detailEmployee.company_id) { message.warning(t('该员工无关联企业，无法推导')); return; }
                            setDeduceLoadingId(detailEmployee.id);
                            try {
                              const company = await companyApi.get(detailEmployee.company_id);
                              const domain = company.domain || (() => { try { return new URL(company.website!.startsWith('http') ? company.website! : `https://${company.website}`).hostname.replace('www.', ''); } catch { return ''; } })();
                              if (!domain) { message.warning(t('关联企业无域名，无法推导邮箱')); return; }
                              message.loading({ content: t('正在推导邮箱...'), key: 'deduce', duration: 0 });
                              await emailApi.deduce({ employee_id: detailEmployee.id, full_name: detailEmployee.full_name, domain, template_group: deduceTemplateGroup });
                              message.success({ content: t('推导完成'), key: 'deduce', duration: 3 });
                              const updated = await employeeApi.get(detailEmployee.id);
                              setDetailEmployee(updated);
                              refreshEmployees();
                              invalidate(['dashboard']);
                            } catch (err: any) {
                              message.error({ content: t('推导失败') + ': ' + (err?._userMessage || t('网络错误')), key: 'deduce' });
                            } finally { setDeduceLoadingId(null); }
                          }}
                        >
                          {t('推导邮箱')}
                        </Button>
                      </Space>
                    </Card>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                      <Button
                        size="small"
                        icon={<ThunderboltOutlined />}
                        loading={deduceLoadingId === detailEmployee.id}
                        onClick={async () => {
                          if (!detailEmployee.company_id) { message.warning(t('该员工无关联企业，无法推导')); return; }
                          setDeduceLoadingId(detailEmployee.id);
                          try {
                            const company = await companyApi.get(detailEmployee.company_id);
                            const domain = company.domain || (() => { try { return new URL(company.website!.startsWith('http') ? company.website! : `https://${company.website}`).hostname.replace('www.', ''); } catch { return ''; } })();
                            if (!domain) { message.warning(t('关联企业无域名，无法推导邮箱')); return; }
                            message.loading({ content: t('正在推导邮箱...'), key: 'deduce', duration: 0 });
                            await emailApi.deduce({ employee_id: detailEmployee.id, full_name: detailEmployee.full_name, domain, template_group: deduceTemplateGroup });
                            message.success({ content: t('推导完成'), key: 'deduce', duration: 3 });
                            const updated = await employeeApi.get(detailEmployee.id);
                            setDetailEmployee(updated);
                            refreshEmployees();
                            invalidate(['dashboard']);
                          } catch (err: any) {
                            message.error({ content: t('推导失败') + ': ' + (err?._userMessage || t('网络错误')), key: 'deduce' });
                          } finally { setDeduceLoadingId(null); }
                        }}
                      >
                        {t('推导邮箱')}
                      </Button>
                    </div>
                  )}
                  {(() => {
                    const all = detailEmployee.emails || [];
                    // Manual emails always shown; valid deduced emails shown; likely_valid/unknown collapsed
                    const manual = all.filter(e => e.source === 'manual');
                    const validDeduced = all.filter(e => e.source !== 'manual' && e.verification_status === 'valid');
                    const others = all.filter(e => e.source !== 'manual' && e.verification_status !== 'valid');
                    const primary = [...manual, ...validDeduced];

                    const handleStatusChange = async (emailId: number, newStatus: string) => {
                      try {
                        await emailApi.update(emailId, { verification_status: newStatus });
                        const updated = await employeeApi.get(detailEmployee.id);
                        setDetailEmployee(updated);
                        refreshEmployees();
                        invalidate(['dashboard']);
                      } catch { message.error(t('状态更新失败')); }
                    };

                    return (<>
                      {primary.map((e: EmailBrief) => (
                        <Card key={e.id} size="small" style={{ borderRadius: 8, border: '1px solid #e2e8f0' }}>
                          <Space direction="vertical" size={4} style={{ width: '100%' }}>
                            <Space>
                              <EmailVerifyIcon status={e.verification_status} onStatusChange={(s) => handleStatusChange(e.id, s)} />
                              <Text copyable style={{ fontSize: 13, fontFamily: 'monospace' }}>{e.email}</Text>
                              {e.is_primary && <Tag color="blue" style={{ fontSize: 11 }}>{t('主要')}</Tag>}
                              <Tag style={{ fontSize: 11 }}>{e.pattern_type}</Tag>
                              <Tag style={{ fontSize: 11 }}>{e.source}</Tag>
                            </Space>
                            <Space size={8}>
                              <Tooltip title={t('复制收件人格式')}>
                                <Button size="small" icon={<CopyOutlined />}
                                  onClick={() => handleCopy(formatEmailCopy(emailCopyFormat, {
                                    company_name: detailEmployee.company_name,
                                    full_name: detailEmployee.full_name,
                                    position: detailEmployee.position,
                                    email: e.email,
                                  }))}
                                />
                              </Tooltip>
                            </Space>
                          </Space>
                        </Card>
                      ))}
                      {others.length > 0 && (
                        <Collapse size="small" items={[{
                          key: 'others',
                          label: <Text type="secondary" style={{ fontSize: 12 }}>{t('其他推导结果 ({count})', { count: others.length })}</Text>,
                          children: others.map((e: EmailBrief) => (
                            <Card key={e.id} size="small" style={{ borderRadius: 8, marginBottom: 4, border: '1px solid #f1f5f9' }}>
                              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                <Space>
                                  <EmailVerifyIcon status={e.verification_status} onStatusChange={(s) => handleStatusChange(e.id, s)} />
                                  <Text copyable style={{ fontSize: 12, fontFamily: 'monospace' }}>{e.email}</Text>
                                  <Tag style={{ fontSize: 11 }}>{e.pattern_type}</Tag>
                                  <Tag style={{ fontSize: 11 }}>{e.source}</Tag>
                                </Space>
                                <Space size={8}>
                                  <Tooltip title={t('复制收件人格式')}>
                                    <Button size="small" icon={<CopyOutlined />}
                                      onClick={() => handleCopy(formatEmailCopy(emailCopyFormat, {
                                        company_name: detailEmployee.company_name,
                                        full_name: detailEmployee.full_name,
                                        position: detailEmployee.position,
                                        email: e.email,
                                      }))}
                                    />
                                  </Tooltip>
                                </Space>
                              </Space>
                            </Card>
                          )),
                        }]} />
                      )}
                    </>);
                  })()}
                </Space>
              ),
            },
            {
              key: 'letter', label: t('开发信'),
              children: (
                <EmployeeLetterHistory
                  employee={detailEmployee}
                  onGenerate={() => handleGenerateLetter(detailEmployee)}
                  aiLoading={aiLoading}
                  onCopy={handleCopy}
                  devLetterLang={devLetterLang}
                  onLangChange={setDevLetterLang}
                />
              ),
            },
          ]} />
        )}
      </Drawer>
    </div>
  );
}

// ── Step colors ──
const STEP_COLORS = ['#3b82f6', '#06b6d4', '#6366f1', '#8b5cf6', '#f59e0b', '#6b7280'];

/** Dev letter history list with view / edit / delete. */
function EmployeeLetterHistory({
  employee,
  onGenerate,
  aiLoading,
  onCopy,
  devLetterLang,
  onLangChange,
}: {
  employee: Employee;
  onGenerate: () => void;
  aiLoading: boolean;
  onCopy: (t: string) => void;
  devLetterLang: string;
  onLangChange: (lang: string) => void;
}) {
  const { t } = useI18n();
  const [letters, setLetters] = useState<DevLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewLetter, setViewLetter] = useState<DevLetter | null>(null);
  const [editLetter, setEditLetter] = useState<DevLetter | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const loadLetters = useCallback(() => {
    setLoading(true);
    devLetterApi.list(employee.id)
      .then(data => setLetters(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employee.id]);

  useEffect(() => { loadLetters(); }, [loadLetters]);

  const handleDelete = async (id: number) => {
    try {
      await devLetterApi.delete(id);
      setLetters(prev => prev.filter(l => l.id !== id));
      if (viewLetter?.id === id) setViewLetter(null);
      message.success('已删除');
    } catch {
      message.error('删除失败');
    }
  };

  const handleEditSave = async () => {
    if (!editLetter) return;
    setEditSaving(true);
    try {
      const updated = await devLetterApi.update(editLetter.id, { content: editContent });
      setLetters(prev => prev.map(l => l.id === updated.id ? updated : l));
      if (viewLetter?.id === updated.id) setViewLetter(updated);
      setEditLetter(null);
      message.success('已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button type="primary" icon={<MailOutlined />} onClick={onGenerate} loading={aiLoading}>
          {t('AI 生成开发信')}
        </Button>
        <Select size="small" value={devLetterLang} onChange={onLangChange} style={{ width: 100 }}
          options={[
            { label: '🇬🇧 English', value: 'en' },
            { label: '🇩🇪 Deutsch', value: 'de' },
            { label: '🇫🇷 Français', value: 'fr' },
            { label: '🇪🇸 Español', value: 'es' },
            { label: '🇮🇹 Italiano', value: 'it' },
            { label: '🇵🇹 Português', value: 'pt' },
            { label: '🇳🇱 Nederlands', value: 'nl' },
            { label: '🇷🇺 Русский', value: 'ru' },
            { label: '🇯🇵 日本語', value: 'ja' },
            { label: '🇨🇳 中文', value: 'zh' },
          ]}
        />
      </div>

      {/* History list */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Text strong style={{ fontSize: 13 }}>📬 {t('开发信历史')}</Text>
        <Badge count={letters.length} overflowCount={99} style={{ backgroundColor: '#4f46e5' }} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 12 }}><Text type="secondary">{t('加载中...')}</Text></div>
      ) : letters.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>{t('暂无开发信记录')}</Text>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {letters.map(letter => (
            <div
              key={letter.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid #f1f5f9', background: '#fafbfc',
                transition: 'all 0.2s',
              }}
              onClick={() => setViewLetter(letter)}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#c7d2fe'; e.currentTarget.style.background = '#f5f3ff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#f1f5f9'; e.currentTarget.style.background = '#fafbfc'; }}
            >
              <Space size={6}>
                {letter.step ? (
                  <Tag color={STEP_COLORS[letter.step - 1]} style={{ fontSize: 11, marginRight: 0 }}>
                    {t('第 {step} 封', { step: letter.step })}
                  </Tag>
                ) : (
                  <Tag style={{ fontSize: 11 }}>{t('通用')}</Tag>
                )}
                <Tag color={letter.is_sent ? 'green' : 'default'} style={{ fontSize: 11 }}>
                  {letter.is_sent ? t('已发送') : t('草稿')}
                </Tag>
                {letter.language && letter.language !== 'en' && (
                  <Tag style={{ fontSize: 11 }}>{letter.language.toUpperCase()}</Tag>
                )}
                <Text ellipsis style={{ fontSize: 12, maxWidth: 120, color: '#64748b' }}>
                  {letter.content?.slice(0, 40)}…
                </Text>
              </Space>
              <Space size={4} onClick={e => e.stopPropagation()}>
                <Tooltip title={t('编辑')}>
                  <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditLetter(letter); setEditContent(letter.content); }} />
                </Tooltip>
                <Popconfirm title={t('确定删除该开发信？')} onConfirm={() => handleDelete(letter.id)} okText={t('删除')} cancelText={t('取消')}>
                  <Tooltip title={t('删除')}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Tooltip>
                </Popconfirm>
              </Space>
            </div>
          ))}
        </div>
      )}

      {/* View letter modal */}
      <Modal
        title={
          <Space>
            <MailOutlined />
            {viewLetter?.step ? t('第 {step} 封 · {purpose}', { step: viewLetter.step, purpose: t(LETTER_STEPS[viewLetter.step - 1]?.purpose || '') }) : t('开发信')}
            {viewLetter?.language && <Tag>{viewLetter.language.toUpperCase()}</Tag>}
            {viewLetter?.is_sent ? <Tag color="green">{t('已发送')}</Tag> : <Tag>{t('草稿')}</Tag>}
          </Space>
        }
        open={!!viewLetter && !editLetter}
        onCancel={() => setViewLetter(null)}
        width={640}
        footer={[
          <Button key="edit" icon={<EditOutlined />} onClick={() => { if (viewLetter) { setEditLetter(viewLetter); setEditContent(viewLetter.content); } }}>{t('编辑')}</Button>,
          <Button key="copy" icon={<CopyOutlined />} onClick={() => { if (viewLetter) onCopy(viewLetter.content); }}>{t('复制全文')}</Button>,
          <Button key="close" type="primary" onClick={() => setViewLetter(null)}>{t('关闭')}</Button>,
        ]}
      >
        {viewLetter && (
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {formatDateTime(viewLetter.created_at)}
              {viewLetter.template_name && ` · ${viewLetter.template_name}`}
            </Text>
            <Divider style={{ margin: '12px 0' }} />
            <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8, margin: 0 }}>
              {viewLetter.content}
            </Paragraph>
          </div>
        )}
      </Modal>

      {/* Edit letter modal */}
      <Modal
        title={
          <Space>
            <EditOutlined />
            {t('编辑开发信')}
            {editLetter?.step ? ` · ${t('第 {step} 封', { step: editLetter.step })}` : ''}
          </Space>
        }
        open={!!editLetter}
        onCancel={() => setEditLetter(null)}
        width={640}
        footer={[
          <Button key="cancel" onClick={() => setEditLetter(null)}>{t('取消')}</Button>,
          <Button key="save" type="primary" loading={editSaving} onClick={handleEditSave}>{t('保存')}</Button>,
        ]}
      >
        {editLetter && (
          <Input.TextArea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            autoSize={{ minRows: 10, maxRows: 30 }}
            style={{ fontSize: 13, lineHeight: 1.8 }}
          />
        )}
      </Modal>
    </Space>
  );
}
