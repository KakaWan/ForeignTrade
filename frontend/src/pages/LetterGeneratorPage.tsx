/** Letter Generator page — 6-step progressive outreach sequence.
 *
 * Three tabs: 生成开发信 | 邮件模板 | 我的企业
 *
 * The 6-step sequence:
 *   Step 1: 破冰首邮 (Day 1)
 *   Step 2: 爆款精准推荐 (Day 4)
 *   Step 3: 实力信任背书 (Day 7)
 *   Step 4: 痛点提问+方案 (Day 10)
 *   Step 5: 轻提醒+小刺激 (Day 15)
 *   Step 6: 收尾留后路 (Day 25)
 *
 * Wildcard system:
 *   - Template has {FieldName} data wildcards and {AI:instruction} AI wildcards
 *   - Preview: ALL data wildcards replaced (blue), AI sections shown as placeholder (purple)
 *   - Before AI call: ALL wildcards replaced in BOTH template AND system prompt
 *   - AI receives ZERO wildcards — only real data + natural language instructions
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Card, Select, Button, Space, Typography, message, Modal, Form,
  Input, Tag, Row, Col, Spin, Table, Popconfirm, Tooltip, Divider,
} from 'antd';
import {
  SendOutlined, CopyOutlined, QuestionCircleOutlined,
  PlusOutlined, EditOutlined, SaveOutlined, DeleteOutlined,
  EyeOutlined, RobotOutlined,
  HistoryOutlined, CloseCircleOutlined, ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { letterTemplateApi } from '../api/letterTemplates';
import { senderProfileApi } from '../api/senderProfiles';
import { companyApi } from '../api/companies';
import { employeeApi } from '../api/employees';
import { devLetterApi } from '../api/devLetters';
import type { LetterTemplate, SenderProfile, Company, Employee, PreviewSegment, ContactStatus, DevLetter } from '../types';
import { LETTER_STEPS, CONTACT_STATUS_CONFIG } from '../types';
import { useAppStore } from '../store/useAppStore';
import { formatDateTime } from '../utils/date';
import { useI18n } from '../i18n';

const { Text, Paragraph } = Typography;

const DEFAULT_PROMPT_EN = 'You are a professional foreign-trade business email assistant. Fill only the sections marked for AI generation in the template. Keep the language natural, professional, and targeted. Do not modify any other text. Do not add a subject line or signature unless the template already includes one.';

// ── Available wildcard fields (for reference panel) ─────────────
const WILDCARD_FIELDS = [
  { category: '👤 客户员工', fields: [
    { key: 'FirstName', desc: '名' }, { key: 'LastName', desc: '姓' },
    { key: 'FullName', desc: '全名' }, { key: 'Position', desc: '职位' },
    { key: 'Department', desc: '部门' }, { key: 'Phone', desc: '电话' },
    { key: 'PersonalEmail', desc: '个人邮箱' }, { key: 'WhatsApp', desc: 'WhatsApp' },
    { key: 'LinkedIn', desc: 'LinkedIn' },
  ]},
  { category: '🏢 客户企业', fields: [
    { key: 'CompanyName', desc: '企业名称' }, { key: 'CompanyWebsite', desc: '网站' },
    { key: 'CompanyIndustry', desc: '行业' }, { key: 'CompanyCountry', desc: '国家' },
    { key: 'CompanyRegion', desc: '地区' }, { key: 'CompanyOpenEmail', desc: '开放邮箱' },
    { key: 'CompanyPhone', desc: '企业电话' }, { key: 'CompanyDomain', desc: '域名' },
    { key: 'CompanyProducts', desc: '客户主营产品/业务（中英文对照，可多选）' },
  ]},
  { category: '🏭 我的企业', fields: [
    { key: 'MyCompanyName', desc: '我方企业名称' }, { key: 'MyProducts', desc: '主营产品/服务' },
    { key: 'MyWebsite', desc: '我方网站' }, { key: 'MyCountry', desc: '我方国家' },
    { key: 'MyIndustry', desc: '我方行业' }, { key: 'MyIntroduction', desc: '企业简介' },
    { key: 'MyContactPerson', desc: '联系人' }, { key: 'MyPhone', desc: '我方电话' },
    { key: 'MyEmail', desc: '我方邮箱' }, { key: 'MyAddress', desc: '我方地址' },
  ]},
  { category: '🤖 AI 生成区', fields: [
    { key: 'AI:指令', desc: '如 {AI:写一段问候语} — AI 根据指令生成内容' },
  ]},
];

// ── Preview renderer ────────────────────────────────────────────
function PreviewContent({ segments }: { segments: PreviewSegment[] }) {
  const { t, lang } = useI18n();
  return (
    <span style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8 }}>
      {segments.map((seg, i) => {
        if (seg.type === 'data') {
          return (
            <Tooltip key={i} title={`${t('字段')}: ${seg.field || ''}`}>
              <span style={{
                color: '#2563eb', fontWeight: 500,
                background: '#eff6ff', padding: '0 2px', borderRadius: 3,
              }}>
                {seg.content}
              </span>
            </Tooltip>
          );
        }
        if (seg.type === 'ai') {
          return (
            <span key={i} style={{
              color: '#7c3aed', fontStyle: 'italic',
              background: '#f5f3ff', padding: '1px 4px', borderRadius: 4,
              border: '1px dashed #c4b5fd',
            }}>
              [{lang === 'zh-CN' ? 'AI生成' : 'AI'}: {seg.content.length > 40 ? seg.content.slice(0, 40) + '…' : seg.content}]
            </span>
          );
        }
        return <span key={i}>{seg.content}</span>;
      })}
    </span>
  );
}

// ── Step colors for visual tracker ──────────────────────────────
const STEP_COLORS = ['#3b82f6', '#06b6d4', '#6366f1', '#8b5cf6', '#f59e0b', '#6b7280'];

// ── Main Component ──────────────────────────────────────────────
export default function LetterGeneratorPage() {
  const { t, lang } = useI18n();
  // ── Persisted state from Zustand (survives navigation) ──
  const {
    letterGen: {
      selectedProfileId, selectedCompanyId, selectedEmployeeId,
      currentStep, templateContent, systemPrompt,
      generatedContent, generating, generateError,
      previewSegments, letterHistory, historyLoading,
      activeTab, employeeDrafts, employeeSteps,
    },
    setLetterGen, invalidate,
  } = useAppStore();

  // ── Local UI state (only matters while on this page) ──
  const [templates, setTemplates] = useState<LetterTemplate[]>([]);
  const [profiles, setProfiles] = useState<SenderProfile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [companySearchLoading, setCompanySearchLoading] = useState(false);
  const [showFieldRef, setShowFieldRef] = useState(false);
  const companySearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track previous employee to save draft on switch
  const prevEmployeeIdRef = useRef<number | undefined>(selectedEmployeeId);
  // History view / edit state
  const [viewLetter, setViewLetter] = useState<DevLetter | null>(null);
  const [editLetter, setEditLetter] = useState<DevLetter | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Shorthand setters for store fields
  const setSelectedProfileId = (v: number | undefined) => setLetterGen({ selectedProfileId: v });
  const setSelectedCompanyId = (v: number | undefined) => setLetterGen({ selectedCompanyId: v });
  const setSelectedEmployeeId = (v: number | undefined) => setLetterGen({ selectedEmployeeId: v });
  const setCurrentStep = (v: number) => setLetterGen({ currentStep: v });
  const setTemplateContent = (v: string) => setLetterGen({ templateContent: v });
  const setSystemPrompt = (v: string) => setLetterGen({ systemPrompt: v });
  const setGeneratedContent = (v: string) => setLetterGen({ generatedContent: v });
  const setGenerating = (v: boolean) => setLetterGen({ generating: v });
  const setGenerateError = (v: string) => setLetterGen({ generateError: v });
  const setPreviewSegments = (v: PreviewSegment[]) => setLetterGen({ previewSegments: v });
  const setLetterHistory = (v: DevLetter[]) => setLetterGen({ letterHistory: v });
  const setHistoryLoading = (v: boolean) => setLetterGen({ historyLoading: v });
  const setActiveTab = (v: 'generate' | 'templates' | 'profiles') => setLetterGen({ activeTab: v });

  useEffect(() => { loadTemplates(); loadProfiles(); }, []);

  const loadTemplates = async () => {
    try { setTemplates(await letterTemplateApi.list()); } catch { /* */ }
  };
  const loadProfiles = async () => {
    try { setProfiles(await senderProfileApi.list()); } catch { /* */ }
  };

  // Load default prompt from backend
  useEffect(() => {
    devLetterApi.getDefaultPrompt()
      .then(data => {
        setDefaultPrompt(data.prompt);
        if (!systemPrompt) setSystemPrompt(lang === 'en-US' ? DEFAULT_PROMPT_EN : data.prompt);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the default prompt in the current UI language without overwriting
  // a prompt the user has edited.
  useEffect(() => {
    if (!defaultPrompt) return;
    const target = lang === 'en-US' ? DEFAULT_PROMPT_EN : defaultPrompt;
    const isDefault = !systemPrompt || systemPrompt === defaultPrompt || systemPrompt === DEFAULT_PROMPT_EN;
    if (isDefault && systemPrompt !== target) setSystemPrompt(target);
  }, [lang, defaultPrompt, systemPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Set default profile on load
  useEffect(() => {
    if (profiles.length && !selectedProfileId) {
      const def = profiles.find(p => p.is_default) || profiles[0];
      setSelectedProfileId(def.id);
    }
  }, [profiles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Company search with debounce
  const handleCompanySearch = useCallback((query: string) => {
    if (companySearchTimerRef.current) clearTimeout(companySearchTimerRef.current);
    companySearchTimerRef.current = setTimeout(() => {
      setCompanySearchLoading(true);
      companyApi.list({ page: 1, page_size: 50, search: query || undefined, sort_by: 'name', sort_order: 'asc' })
        .then(data => setCompanies(data.items))
        .catch(() => {})
        .finally(() => setCompanySearchLoading(false));
    }, 300);
  }, []);

  // Load initial companies
  useEffect(() => {
    setCompanySearchLoading(true);
    companyApi.list({ page: 1, page_size: 50, sort_by: 'name', sort_order: 'asc' })
      .then(data => setCompanies(data.items))
      .catch(() => {})
      .finally(() => setCompanySearchLoading(false));
  }, []);

  // Load employees when company changes
  useEffect(() => {
    if (!selectedCompanyId) { setEmployees([]); setSelectedEmployeeId(undefined); setSelectedEmployee(null); return; }
    employeeApi.list({ company_id: selectedCompanyId, page_size: 100 })
      .then(data => setEmployees(data.items))
      .catch(() => setEmployees([]));
  }, [selectedCompanyId]);

  // Draft key helper: per-employee per-step
  const draftKey = (empId: number, step: number) => `${empId}-${step}`;

  // When employee is selected, save old employee's draft and restore new employee's state
  useEffect(() => {
    const prevId = prevEmployeeIdRef.current;
    // Save the previous employee's draft before switching
    if (prevId && prevId !== selectedEmployeeId && generatedContent) {
      setLetterGen({
        employeeDrafts: { ...employeeDrafts, [draftKey(prevId, currentStep)]: generatedContent },
      });
    }
    prevEmployeeIdRef.current = selectedEmployeeId;

    if (!selectedEmployeeId) { setSelectedEmployee(null); return; }
    const emp = employees.find(e => e.id === selectedEmployeeId);
    if (emp) {
      setSelectedEmployee(emp);
      // Restore step: prefer saved employeeSteps, then emp.letter_step + 1
      const savedStep = employeeSteps[selectedEmployeeId];
      const nextStep = savedStep || Math.min((emp.letter_step || 0) + 1, 6);
      setCurrentStep(nextStep);
    }
    // Restore per-employee per-step draft content
    const restoreStep = employeeSteps[selectedEmployeeId] || currentStep;
    setGeneratedContent(employeeDrafts[draftKey(selectedEmployeeId, restoreStep)] || '');
    setGenerateError('');
  }, [selectedEmployeeId, employees]); // eslint-disable-line react-hooks/exhaustive-deps

  // When step changes, save current draft, load the step template and restore draft
  useEffect(() => {
    const stepTemplate = templates.find(t => t.step === currentStep);
    if (stepTemplate) {
      setTemplateContent(stepTemplate.content);
    } else {
      setTemplateContent('');
    }
    // Save current step for this employee
    if (selectedEmployeeId) {
      setLetterGen({ employeeSteps: { ...employeeSteps, [selectedEmployeeId]: currentStep } });
    }
    // Restore draft for this employee at the new step
    if (selectedEmployeeId) {
      const draft = employeeDrafts[draftKey(selectedEmployeeId, currentStep)];
      setGeneratedContent(draft || '');
    } else {
      setGeneratedContent('');
    }
    setGenerateError('');
  }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load letter history when employee changes
  useEffect(() => {
    if (!selectedEmployeeId) { setLetterHistory([]); return; }
    setHistoryLoading(true);
    devLetterApi.list(selectedEmployeeId)
      .then(data => setLetterHistory(data))
      .catch(() => setLetterHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [selectedEmployeeId]);

  // Real-time preview: call /preview whenever inputs change
  useEffect(() => {
    if (!templateContent) { setPreviewSegments([]); return; }
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const result = await devLetterApi.preview({
          template_content: templateContent,
          employee_id: selectedEmployeeId,
          company_id: selectedCompanyId,
          sender_profile_id: selectedProfileId,
        });
        setPreviewSegments(result.segments || []);
      } catch { setPreviewSegments([]); }
      finally { setPreviewLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [templateContent, selectedEmployeeId, selectedCompanyId, selectedProfileId]);

  // Generate
  const handleGenerate = async () => {
    if (!selectedEmployeeId) {
      message.warning('请选择客户员工');
      return;
    }
    if (!templateContent) {
      message.warning('请选择或编辑模板内容');
      return;
    }
    setGenerating(true);
    setGeneratedContent('');
    setGenerateError('');
    try {
      const content = await devLetterApi.generate({
        employee_id: selectedEmployeeId,
        company_id: selectedCompanyId,
        sender_profile_id: selectedProfileId,
        template_content: templateContent,
        custom_prompt: systemPrompt || undefined,
        step: currentStep,
      });
      setGeneratedContent(content);
      setGenerateError('');
      // Persist draft for this employee at current step
      setLetterGen({ employeeDrafts: { ...employeeDrafts, [draftKey(selectedEmployeeId, currentStep)]: content } });
    } catch (err: any) {
      const errMsg = err?._userMessage || err?.response?.data?.detail || err?.message || '未知错误';
      setGenerateError(errMsg);
      message.error({ content: `生成失败: ${errMsg}`, duration: 8 });
      console.error('AI generation error:', err);
    } finally { setGenerating(false); }
  };

  // Save generated letter
  const handleSave = async () => {
    if (!selectedEmployeeId || !generatedContent) return;
    try {
      await devLetterApi.create({
        employee_id: selectedEmployeeId,
        company_id: selectedCompanyId,
        content: generatedContent,
        step: currentStep,
        language: 'en',
        template_name: templates.find(t => t.step === currentStep)?.name,
      });
      // Update employee letter_step
      if (selectedEmployee && currentStep > (selectedEmployee.letter_step || 0)) {
        await employeeApi.update(selectedEmployee.id, {
          letter_step: currentStep,
          contact_status: selectedEmployee.contact_status === 'new' ? 'contacting' : undefined,
        } as any);
        setSelectedEmployee({ ...selectedEmployee, letter_step: currentStep, contact_status: selectedEmployee.contact_status === 'new' ? 'contacting' : selectedEmployee.contact_status });
      }
      message.success('开发信已保存');
      // Clear draft for this employee at current step (saved to DB)
      const newDrafts = { ...employeeDrafts };
      delete newDrafts[draftKey(selectedEmployeeId, currentStep)];
      setLetterGen({ employeeDrafts: newDrafts });
      // Invalidate related caches so other pages see updated status
      invalidate(['employees', 'companies', 'dashboard']);
      // Reload history
      devLetterApi.list(selectedEmployeeId).then(data => setLetterHistory(data)).catch(() => {});
    } catch { message.error('保存失败'); }
  };

  // Update contact status
  const handleUpdateContactStatus = async (status: string) => {
    if (!selectedEmployeeId) return;
    try {
      await employeeApi.update(selectedEmployeeId, { contact_status: status } as any);
      if (selectedEmployee) {
        setSelectedEmployee({ ...selectedEmployee, contact_status: status });
      }
      invalidate(['employees', 'dashboard']);
      message.success('联系状态已更新');
    } catch { message.error('更新失败'); }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => message.success('已复制到剪贴板'));
  };

  const handleDeleteLetter = async (id: number) => {
    try {
      await devLetterApi.delete(id);
      setLetterHistory(letterHistory.filter(l => l.id !== id));
      if (viewLetter?.id === id) setViewLetter(null);
      message.success('已删除');
    } catch { message.error('删除失败'); }
  };

  const handleEditLetterSave = async () => {
    if (!editLetter) return;
    setEditSaving(true);
    try {
      const updated = await devLetterApi.update(editLetter.id, { content: editContent });
      setLetterHistory(letterHistory.map(l => l.id === updated.id ? updated : l));
      if (viewLetter?.id === updated.id) setViewLetter(updated);
      setEditLetter(null);
      message.success('已保存');
    } catch { message.error('保存失败'); }
    finally { setEditSaving(false); }
  };

  const handleResetPrompt = () => {
    setSystemPrompt(lang === 'en-US' ? DEFAULT_PROMPT_EN : defaultPrompt);
    message.info(t('已恢复默认提示词'));
  };

  // Save current templateContent back to the matching step template in DB
  const handleSaveTemplateContent = async () => {
    const stepTemplate = templates.find(t => t.step === currentStep);
    if (!stepTemplate) {
      message.warning('当前步骤没有对应模板，请先在「邮件模板」中创建');
      return;
    }
    try {
      await letterTemplateApi.update(stepTemplate.id, { content: templateContent });
      message.success('模板已保存');
      loadTemplates(); // refresh local list
    } catch {
      message.error('模板保存失败');
    }
  };

  // ── Template CRUD modal ──
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<LetterTemplate | null>(null);
  const [tplForm] = Form.useForm();

  const openNewTemplate = () => { setEditingTpl(null); tplForm.resetFields(); setTplModalOpen(true); };
  const openEditTemplate = (t: LetterTemplate) => { setEditingTpl(t); tplForm.setFieldsValue({ name: t.name, content: t.content, step: t.step }); setTplModalOpen(true); };
  const handleSaveTemplate = async () => {
    try {
      const values = await tplForm.validateFields();
      if (editingTpl) { await letterTemplateApi.update(editingTpl.id, values); message.success('模板已更新'); }
      else { await letterTemplateApi.create(values); message.success('模板已创建'); }
      setTplModalOpen(false); loadTemplates();
    } catch { /* */ }
  };

  // ── Profile CRUD modal ──
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<SenderProfile | null>(null);
  const [profileForm] = Form.useForm();

  const openNewProfile = () => { setEditingProfile(null); profileForm.resetFields(); setProfileModalOpen(true); };
  const openEditProfile = (p: SenderProfile) => {
    setEditingProfile(p);
    profileForm.setFieldsValue(p);
    setProfileModalOpen(true);
  };
  const handleSaveProfile = async () => {
    try {
      const values = await profileForm.validateFields();
      if (editingProfile) { await senderProfileApi.update(editingProfile.id, values); message.success('企业档案已更新'); }
      else { await senderProfileApi.create(values); message.success('企业档案已创建'); }
      setProfileModalOpen(false); loadProfiles();
    } catch { /* */ }
  };

  // ── Tab: Generate ──
  const employeeStep = selectedEmployee?.letter_step || 0;

  const renderStepTracker = () => (
    <Card title={`📊 ${t('开发信递进流程')}`} size="small" style={{ borderRadius: 10 }}>
      {/* Visual step dots */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '0 4px' }}>
        {LETTER_STEPS.map((s, i) => {
          const isDone = employeeStep >= s.step;
          const isCurrent = currentStep === s.step;
          return (
            <div key={s.step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => setCurrentStep(s.step)}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600,
                background: isDone ? STEP_COLORS[i] : isCurrent ? '#e0e7ff' : '#f1f5f9',
                color: isDone ? '#fff' : isCurrent ? '#4f46e5' : '#94a3b8',
                border: isCurrent ? '2px solid #4f46e5' : 'none',
                transition: 'all 0.2s',
              }}>
                {isDone ? '✓' : s.step}
              </div>
              <Text style={{ fontSize: 10, marginTop: 2, color: isCurrent ? '#4f46e5' : '#64748b', textAlign: 'center', maxWidth: 52 }}>
                {lang === 'zh-CN' ? s.purpose : s.purpose_en}
              </Text>
              <Text style={{ fontSize: 9, color: '#94a3b8' }}>{t('Day')} {s.day}</Text>
            </div>
          );
        })}
      </div>
      {/* Current step detail */}
      {LETTER_STEPS.map(s => s.step === currentStep ? (
        <div key={s.step} style={{
          background: '#f0f9ff', padding: '8px 12px', borderRadius: 8, borderLeft: `3px solid ${STEP_COLORS[currentStep - 1]}`,
        }}>
          <Text strong style={{ fontSize: 13 }}>{t('第 {step} 封 · {purpose}', { step: currentStep, purpose: lang === 'zh-CN' ? s.purpose : s.purpose_en })}</Text>
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>{t('建议 Day {day} 发送', { day: s.day })}</Text>
          <div style={{ marginTop: 4 }}><Text style={{ fontSize: 12 }}>{t(s.description)}</Text></div>
        </div>
      ) : null)}
      {/* Contact status */}
      {selectedEmployee && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text strong style={{ fontSize: 13 }}>{t('联系状态:')}</Text>
          <Select size="small" value={selectedEmployee.contact_status || 'new'}
            onChange={handleUpdateContactStatus}
            style={{ width: 120 }}
            options={Object.entries(CONTACT_STATUS_CONFIG).map(([k, v]) => ({ label: t(v.label), value: k }))}
          />
        </div>
      )}
    </Card>
  );

  const renderGenerateTab = () => (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      {/* Left config panel */}
      <div style={{ width: 420, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto', paddingRight: 4 }}>
        <Card title={`📧 ${t('开发信配置')}`} size="small" style={{ borderRadius: 10 }}
          extra={<Button size="small" icon={<QuestionCircleOutlined />} onClick={() => setShowFieldRef(true)}>{t('字段参考')}</Button>}
        >
          {/* Sender profile */}
          <div style={{ marginBottom: 10 }}>
            <Text strong style={{ fontSize: 13 }}>🏭 {t('我的企业')}</Text>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <Select style={{ flex: 1 }} placeholder={t('选择发件企业档案...')}
                value={selectedProfileId} onChange={setSelectedProfileId}
                options={profiles.map(p => ({ label: `${p.is_default ? '⭐ ' : ''}${p.company_name || p.name}`, value: p.id }))}
              />
              <Tooltip title={t('管理企业档案')}><Button icon={<PlusOutlined />} size="small" onClick={openNewProfile} /></Tooltip>
            </div>
          </div>
          {/* Company */}
          <div style={{ marginBottom: 10 }}>
            <Text strong style={{ fontSize: 13 }}>🏢 {t('客户企业')}</Text>
            <Select showSearch style={{ width: '100%', marginTop: 4 }} placeholder={t('搜索并选择企业...')}
              filterOption={false} onSearch={handleCompanySearch} loading={companySearchLoading}
              value={selectedCompanyId} onChange={setSelectedCompanyId}
              notFoundContent={companySearchLoading ? t('搜索中...') : t('无匹配企业')}
              options={companies.map(c => ({ label: `${c.name}${c.industry ? ` (${c.industry})` : ''}${c.country ? ` - ${c.country}` : ''}`, value: c.id }))}
            />
          </div>
          {/* Employee */}
          <div>
            <Text strong style={{ fontSize: 13 }}>👤 {t('客户员工')}</Text>
            <Select style={{ width: '100%', marginTop: 4 }}
              placeholder={selectedCompanyId ? t('选择员工...') : t('请先选择企业')}
              disabled={!selectedCompanyId} showSearch optionFilterProp="label"
              value={selectedEmployeeId} onChange={setSelectedEmployeeId}
              options={employees.map(e => ({
                label: `${e.full_name}${e.position ? ` - ${e.position}` : ''}${e.contact_status && e.contact_status !== 'new' ? ` [${t(CONTACT_STATUS_CONFIG[e.contact_status as ContactStatus]?.label || e.contact_status)}]` : ''}`,
                value: e.id,
              }))}
            />
          </div>
        </Card>

        {/* Step tracker */}
        {selectedEmployeeId ? renderStepTracker() : (
          <Card size="small" style={{ borderRadius: 10, textAlign: 'center', padding: 20 }}>
            <Text type="secondary">{t('选择客户员工后显示开发信递进流程')}</Text>
          </Card>
        )}

        {/* AI System Prompt */}
        <Card title={<Space><RobotOutlined /> {t('AI 提示词')}</Space>} size="small" style={{ borderRadius: 10 }}
          extra={<Space size={4}><Button size="small" onClick={handleResetPrompt}>{t('恢复默认')}</Button></Space>}
        >
          <Input.TextArea rows={4} value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
            placeholder={defaultPrompt || t('输入 AI 系统提示词...')}
            style={{ borderRadius: 8, fontSize: 13 }}
          />
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>💡 {t('提示词支持通配符，如 {example}、{example2} 等', { example: '{MyCompanyName}', example2: '{CompanyName}' })}</Text>
          </div>
        </Card>

        {/* Template content editor */}
        <Card title={<Space><EditOutlined /> {t('第 {step} 封模板', { step: currentStep })}</Space>} size="small" style={{ borderRadius: 10 }}
          extra={
            <Space size={4}>
              <Button size="small" icon={<ReloadOutlined />} onClick={() => {
                const stepTemplate = templates.find(t => t.step === currentStep);
                setTemplateContent(stepTemplate?.content || '');
                message.info(t('已重载模板'));
              }}>{t('重载')}</Button>
              <Button size="small" type="primary" icon={<SaveOutlined />} onClick={handleSaveTemplateContent}
                disabled={!templateContent}>{t('保存模板')}</Button>
            </Space>
          }
        >
          <Input.TextArea rows={8} value={templateContent}
            onChange={e => setTemplateContent(e.target.value)}
            style={{ borderRadius: 8, fontFamily: 'monospace', fontSize: 13 }}
          />
        </Card>

        <Button type="primary" icon={<SendOutlined />} block size="large"
          onClick={handleGenerate} loading={generating}
          disabled={!selectedEmployeeId || !templateContent}
        >
          {generating ? t('生成中...') : t('生成第 {step} 封开发信', { step: currentStep })}
        </Button>
      </div>

      {/* Right: Preview + Result + History */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
        <Card title={<Space><EyeOutlined /> {t('实时预览')}</Space>} size="small" style={{ borderRadius: 10 }}
          extra={<Space><Tag color="blue">{t('蓝色 = 数据')}</Tag><Tag color="purple">{t('紫色 = AI')}</Tag></Space>}
        >
          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, minHeight: 60 }}>
            {previewLoading ? <Spin size="small" /> :
              previewSegments.length > 0 ? <PreviewContent segments={previewSegments} /> :
              <Text type="secondary">{t('选择模板并设置数据后显示预览...')}</Text>
            }
          </div>
        </Card>

        <Card title={`✉️ ${t('生成结果')}`} size="small" style={{ borderRadius: 10, flex: 0 }}
          extra={generatedContent && (
            <Space>
              <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopy(generatedContent)}>{t('复制')}</Button>
              <Button size="small" icon={<SaveOutlined />} onClick={handleSave}>{t('保存')}</Button>
            </Space>
          )}
        >
          {generating ? (
            <div style={{ textAlign: 'center', padding: 30 }}>
              <Spin size="large" />
              <div style={{ marginTop: 12, color: '#64748b', fontSize: 13 }}>{t('AI 正在生成，请稍候…（通常需要 10-30 秒）')}</div>
            </div>
          ) : generateError ? (
            <div style={{ padding: 16, background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <CloseCircleOutlined style={{ color: '#dc2626', fontSize: 18, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <Text strong style={{ color: '#dc2626', fontSize: 13 }}>{t('生成失败')}</Text>
                  <div style={{ marginTop: 4, fontSize: 13, color: '#7f1d1d', lineHeight: 1.6 }}>{generateError}</div>
                  <Button size="small" type="primary" danger icon={<ReloadOutlined />} style={{ marginTop: 8 }}
                    onClick={handleGenerate}>{t('重试')}</Button>
                </div>
              </div>
            </div>
          ) : generatedContent ? (
            <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8, margin: 0, maxHeight: 200, overflow: 'auto' }}>{generatedContent}</Paragraph>
          ) : (
            <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>
              <SendOutlined style={{ fontSize: 36, marginBottom: 8 }} />
              <div>{t('配置完成后点击「生成开发信」')}</div>
            </div>
          )}
        </Card>

        {/* Letter History */}
        <Card title={<Space><HistoryOutlined /> {t('开发信历史')}</Space>} size="small" style={{ borderRadius: 10, flex: 1 }}
          extra={selectedEmployeeId && <Tag>{t('{count} 封', { count: letterHistory.length })}</Tag>}
        >
          {historyLoading ? <Spin size="small" /> :
            letterHistory.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {letterHistory.map(letter => (
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
                    </Space>
                    <Space size={4} onClick={e => e.stopPropagation()}>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {new Date(letter.created_at).toLocaleDateString(lang === 'zh-CN' ? 'zh-CN' : 'en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Tooltip title={t('编辑')}>
                        <Button type="text" size="small" icon={<EditOutlined />}
                          onClick={() => { setEditLetter(letter); setEditContent(letter.content); }} />
                      </Tooltip>
                      <Popconfirm title={t('确定删除该开发信？')} onConfirm={() => handleDeleteLetter(letter.id)} okText={t('删除')} cancelText={t('取消')}>
                        <Tooltip title={t('删除')}>
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                        </Tooltip>
                      </Popconfirm>
                    </Space>
                  </div>
                ))}
              </div>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>{t('选择员工后显示开发信历史')}</Text>
            )
          }
        </Card>

        {/* View letter modal */}
        <Modal
          title={
            <Space>
              <HistoryOutlined />
              {viewLetter?.step ? t('第 {step} 封 · {purpose}', { step: viewLetter.step, purpose: lang === 'zh-CN' ? (LETTER_STEPS[viewLetter.step - 1]?.purpose || '') : (LETTER_STEPS[viewLetter.step - 1]?.purpose_en || '') }) : t('开发信')}
              {viewLetter?.language && <Tag>{viewLetter.language.toUpperCase()}</Tag>}
              {viewLetter?.is_sent ? <Tag color="green">{t('已发送')}</Tag> : <Tag>{t('草稿')}</Tag>}
            </Space>
          }
          open={!!viewLetter && !editLetter}
          onCancel={() => setViewLetter(null)}
          width={640}
          footer={[
            <Button key="edit" icon={<EditOutlined />} onClick={() => { if (viewLetter) { setEditLetter(viewLetter); setEditContent(viewLetter.content); } }}>{t('编辑')}</Button>,
            <Button key="copy" icon={<CopyOutlined />} onClick={() => { if (viewLetter) handleCopy(viewLetter.content); }}>{t('复制全文')}</Button>,
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
          title={<Space><EditOutlined /> {t('编辑开发信')}{editLetter?.step ? ` · ${t('第 {step} 封', { step: editLetter.step })}` : ''}</Space>}
          open={!!editLetter}
          onCancel={() => setEditLetter(null)}
          width={640}
          footer={[
            <Button key="cancel" onClick={() => setEditLetter(null)}>{t('取消')}</Button>,
            <Button key="save" type="primary" loading={editSaving} onClick={handleEditLetterSave}>{t('保存')}</Button>,
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
      </div>
    </div>
  );

  // ── Tab: Templates ──
  const tplColumns: ColumnsType<LetterTemplate> = [
    { title: t('步骤'), dataIndex: 'step', key: 'step', width: 60, align: 'center',
      render: (step: number | null) => step ? <Tag color={STEP_COLORS[step - 1]}>{t('第 {step} 封', { step })}</Tag> : <Tag>{t('通用')}</Tag>,
    },
    { title: t('名称'), dataIndex: 'name', key: 'name', width: 200,
      render: (name: string, r: LetterTemplate) => <Space>{r.is_default && <Tag color="gold">{t('默认')}</Tag>}{name}</Space>,
    },
    { title: t('内容预览'), dataIndex: 'content', key: 'content', ellipsis: true,
      render: (c: string) => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{c.slice(0, 100)}…</Text>,
    },
    { title: t('操作'), key: 'actions', width: 150, align: 'center',
      render: (_: unknown, r: LetterTemplate) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditTemplate(r)}>{t('编辑')}</Button>
          <Popconfirm title={t('确定删除？')} onConfirm={async () => { await letterTemplateApi.delete(r.id); loadTemplates(); message.success(t('已删除')); }}>
            <Button size="small" danger icon={<DeleteOutlined />}>{t('删除')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const renderTemplatesTab = () => (
    <Card title={`📧 ${t('邮件模板管理')}`} size="small" style={{ borderRadius: 10 }}
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={openNewTemplate}>{t('新建模板')}</Button>}
    >
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        {t('模板按步骤划分（第1-6封），支持')} <Text code>{'{字段名}'}</Text> {t('插入数据、')} <Text code>{'{AI:指令}'}</Text> {t('让 AI 生成内容。所有通配符在发送给 AI 前会被替换为真实数据。')}
      </Paragraph>
      <Table dataSource={templates} columns={tplColumns} rowKey="id" size="small" pagination={false} />
    </Card>
  );

  // ── Tab: Sender Profiles ──
  const profileColumns: ColumnsType<SenderProfile> = [
    { title: t('档案名'), dataIndex: 'name', key: 'name', width: 120 },
    { title: t('企业名称'), dataIndex: 'company_name', key: 'company_name', width: 160 },
    { title: t('主营产品'), dataIndex: 'products', key: 'products', ellipsis: true },
    { title: t('行业'), dataIndex: 'industry', key: 'industry', width: 100 },
    { title: t('联系人姓名'), dataIndex: 'contact_person', key: 'contact_person', width: 100 },
    { title: t('操作'), key: 'actions', width: 150, align: 'center',
      render: (_: unknown, r: SenderProfile) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditProfile(r)}>{t('编辑')}</Button>
          <Popconfirm title={t('确定删除？')} onConfirm={async () => { await senderProfileApi.delete(r.id); loadProfiles(); message.success(t('已删除')); }}>
            <Button size="small" danger icon={<DeleteOutlined />}>{t('删除')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const renderProfilesTab = () => (
    <Card title={`🏭 ${t('我的企业档案')}`} size="small" style={{ borderRadius: 10 }}
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={openNewProfile}>{t('新建档案')}</Button>}
    >
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        {t('保存我方企业信息，开发信模板和 AI 提示词中可通过通配符插入（如 {example}、{example2}、{example3} 等）。可保存多个企业档案，方便针对不同业务线使用不同身份。', { example: '{MyCompanyName}', example2: '{MyProducts}', example3: '{MyContactPerson}' })}
      </Paragraph>
      <Table dataSource={profiles} columns={profileColumns} rowKey="id" size="small" pagination={false} />
    </Card>
  );

  return (
    <div style={{ padding: '16px 20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: '2px solid #e2e8f0' }}>
        {[
          { key: 'generate' as const, label: `🤖 ${t('生成开发信')}` },
          { key: 'templates' as const, label: `📧 ${t('邮件模板')}` },
          { key: 'profiles' as const, label: `🏭 ${t('我的企业')}` },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: activeTab === tab.key ? 600 : 400,
            color: activeTab === tab.key ? '#4f46e5' : '#64748b',
            borderBottom: activeTab === tab.key ? '2px solid #4f46e5' : '2px solid transparent',
            marginBottom: -2,
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'generate' && renderGenerateTab()}
        {activeTab === 'templates' && renderTemplatesTab()}
        {activeTab === 'profiles' && renderProfilesTab()}
      </div>

      {/* Template edit modal */}
      <Modal title={editingTpl ? t('编辑模板') : t('新建模板')} open={tplModalOpen}
        onOk={handleSaveTemplate} onCancel={() => setTplModalOpen(false)} okText="保存" width={700} destroyOnClose
      >
        <Form form={tplForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}><Form.Item label={t('模板名称')} name="name" rules={[{ required: true }]}><Input placeholder={t('第1封 - 破冰首邮')} /></Form.Item></Col>
            <Col span={12}>
              <Form.Item label={t('步骤')} name="step" tooltip={t('1-6 对应6封递进开发信，留空为通用模板')}>
                <Select placeholder="选择步骤" allowClear options={[
                  { label: '第1封 - 破冰首邮', value: 1 },
                  { label: '第2封 - 爆款精准推荐', value: 2 },
                  { label: '第3封 - 实力信任背书', value: 3 },
                  { label: '第4封 - 痛点提问+方案', value: 4 },
                  { label: '第5封 - 轻提醒+小刺激', value: 5 },
                  { label: '第6封 - 收尾留后路', value: 6 },
                  { label: '通用模板（无步骤）', value: null },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={t('模板内容')} name="content" rules={[{ required: true }]}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>用 {'{FieldName}'} 插入数据，用 {'{AI:指令}'} 让 AI 生成内容</Text>}>
            <Input.TextArea rows={14} style={{ fontFamily: 'monospace' }}
              placeholder={"Hi {FirstName},\n\n{AI:Write a personalized opening mentioning {CompanyName}'s work in {CompanyIndustry}}\n\nBest regards,\n{MyContactPerson}\n{MyCompanyName}"} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Profile edit modal */}
      <Modal title={editingProfile ? t('编辑企业档案') : t('新建企业档案')} open={profileModalOpen}
        onOk={handleSaveProfile} onCancel={() => setProfileModalOpen(false)} okText="保存" width={640} destroyOnClose
      >
        <Form form={profileForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}><Form.Item label={t('档案名称')} name="name" rules={[{ required: true }]}><Input placeholder={t('默认档案')} /></Form.Item></Col>
            <Col span={12}><Form.Item label={t('企业名称')} name="company_name"><Input placeholder={t('我方公司名称')} /></Form.Item></Col>
          </Row>
          <Form.Item label={t('主营产品/服务')} name="products"><Input.TextArea rows={2} placeholder={t('外贸服装、电子产品…')} /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item label={t('网站')} name="website"><Input placeholder="www.example.com" /></Form.Item></Col>
            <Col span={12}><Form.Item label={t('行业')} name="industry"><Input placeholder={t('外贸')} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item label={t('国家')} name="country"><Input placeholder="China" /></Form.Item></Col>
            <Col span={12}><Form.Item label={t('地址')} name="address"><Input placeholder={t('详细地址')} /></Form.Item></Col>
          </Row>
          <Form.Item label={t('企业简介')} name="introduction"><Input.TextArea rows={2} placeholder={t('简要介绍企业优势、历史、规模等')} /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item label={t('联系人姓名')} name="contact_person"><Input placeholder={t('张经理')} /></Form.Item></Col>
            <Col span={12}><Form.Item label={t('电话')} name="phone"><Input placeholder="+86 ..." /></Form.Item></Col>
          </Row>
          <Form.Item label={t('邮箱')} name="email"><Input placeholder="contact@example.com" /></Form.Item>
        </Form>
      </Modal>

      {/* Field reference modal */}
      <Modal title="📋 可用字段参考" open={showFieldRef} onCancel={() => setShowFieldRef(false)} footer={null} width={640}>
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          在模板和 AI 提示词中使用 <Text code>{'{字段名}'}</Text> 插入数据，
          使用 <Text code>{'{AI:指令}'}</Text> 让 AI 生成内容。
          所有通配符在发送给 AI 前会被替换为真实数据，AI 不会看到任何通配符。
        </Paragraph>
        <Divider style={{ margin: '8px 0 16px' }} />
        {WILDCARD_FIELDS.map(cat => (
          <div key={cat.category} style={{ marginBottom: 16 }}>
            <Text strong style={{ fontSize: 14 }}>{cat.category}</Text>
            <div style={{ marginTop: 8 }}>
              {cat.fields.map(f => (
                <Row key={f.key} gutter={8} style={{ marginBottom: 4, padding: '4px 0' }}>
                  <Col span={8}>
                    <Tag color={f.key.startsWith('AI:') ? 'purple' : 'blue'} style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {`{${f.key}}`}
                    </Tag>
                  </Col>
                  <Col span={16}><Text type="secondary" style={{ fontSize: 13 }}>{f.desc}</Text></Col>
                </Row>
              ))}
            </div>
          </div>
        ))}
      </Modal>
    </div>
  );
}
