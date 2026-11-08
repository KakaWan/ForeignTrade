/** Settings page — AI config, email patterns, custom prompts, SMTP. */

import { useEffect, useState } from 'react';
import {
  Card, Form, Input, Select, Button, Switch, Slider, Divider,
  Space, Tabs, Table, message, Typography, Alert, Tag, InputNumber,
  Spin, Row, Col, Segmented, Collapse, Modal, Checkbox, Popconfirm,
  Upload, Tooltip,
} from 'antd';
import {
  ApiOutlined, MailOutlined, ExperimentOutlined,
  SaveOutlined, CheckCircleOutlined, InfoCircleOutlined,
  PlusOutlined, DeleteOutlined, StarOutlined,
  DatabaseOutlined, UndoOutlined, ClockCircleOutlined,
  DownloadOutlined, UploadOutlined,
} from '@ant-design/icons';
import { settingsApi } from '../api/settings';
import { backupApi } from '../api/backup';
import { useAppStore } from '../store/useAppStore';
import type { EmailPattern, AiPatternItem, BackupItem } from '../types';
import { useI18n } from '../i18n';

const { Text, Paragraph, Title } = Typography;

// Masked values from server look like "****abcd" — don't send these back
const isMasked = (v: string) => /^\*{2,}/.test(v);

export default function SettingsPage() {
  const { t } = useI18n();
  const { invalidate, setSettings: setStoreSettings } = useAppStore();
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [patterns, setPatterns] = useState<EmailPattern[]>([]);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Pattern add modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addGroup, setAddGroup] = useState('standard');
  const [addForm] = Form.useForm();

  // AI generate modal
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiGroup, setAiGroup] = useState('standard');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResults, setAiResults] = useState<AiPatternItem[]>([]);
  const [aiSelected, setAiSelected] = useState<Set<number>>(new Set());

  const [aiForm] = Form.useForm();
  const [smtpForm] = Form.useForm();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await Promise.all([loadSettings(), loadPatterns()]);
      } catch { /* */ } finally { setLoading(false); }
    })();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await settingsApi.get();
      syncFromServer(data);
    } catch (err) {
      console.warn('Settings load failed, using defaults:', err);
      aiForm.setFieldsValue({
        ai_provider: 'anthropic',
        ai_max_tokens: 8192,
        ai_temperature: 0.7,
      });
      smtpForm.setFieldsValue({ smtp_port: 587, smtp_use_tls: true });
    }
  };

  const loadPatterns = async () => {
    try {
      const resp = await fetch('/api/email-patterns');
      if (resp.ok) {
        const data = await resp.json();
        setPatterns(Array.isArray(data) ? data : []);
      }
    } catch { /* patterns not critical */ }
  };

  /** Strip masked (****) values so we don't overwrite real secrets with junk.
   *  Empty strings are preserved so users can clear a field. */
  const stripMasked = (values: Record<string, unknown>) => {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (typeof v === 'string' && isMasked(v)) continue;  // skip masked secrets
      cleaned[k] = v;
    }
    return cleaned;
  };

  /** Sync state + form from a full SettingsResponse */
  const syncFromServer = (data: any) => {
    setSettings(data as Record<string, unknown>);
    setStoreSettings(data);  // Sync to global store so other pages see updated settings
    aiForm.setFieldsValue({
      ai_provider: data.ai_provider || 'anthropic',
      anthropic_api_key: data.anthropic_api_key ?? '',
      anthropic_base_url: data.anthropic_base_url || '',
      anthropic_model: data.anthropic_model || '',
      openai_api_key: data.openai_api_key ?? '',
      openai_base_url: data.openai_base_url || '',
      openai_model: data.openai_model || '',
      ai_max_tokens: data.ai_max_tokens || 8192,
      ai_temperature: data.ai_temperature ?? 0.7,
    });
    smtpForm.setFieldsValue({
      smtp_host: data.smtp_host || '',
      smtp_port: data.smtp_port || 587,
      smtp_user: data.smtp_user || '',
      smtp_password: data.smtp_password ?? '',
      smtp_use_tls: data.smtp_use_tls ?? true,
    });
  };

  const handleSaveAi = async () => {
    try {
      const values = await aiForm.validateFields();
      const cleaned = stripMasked(values);
      const updated = await settingsApi.update(cleaned);
      syncFromServer(updated);
      invalidate(['employees', 'companies', 'followUps', 'dashboard', 'letterTemplates', 'senderProfiles']);
      message.success('AI 设置已保存（重启后依然有效）');
    } catch (err: any) {
      message.error('保存失败: ' + (err?._userMessage || err?.message || ''));
    }
  };

  const handleSaveSmtp = async () => {
    try {
      const values = await smtpForm.validateFields();
      const cleaned = stripMasked(values);
      const updated = await settingsApi.update(cleaned);
      syncFromServer(updated);
      invalidate(['employees', 'companies', 'followUps', 'dashboard', 'letterTemplates', 'senderProfiles']);
      message.success('SMTP 设置已保存（重启后依然有效）');
    } catch (err: any) {
      message.error('保存失败: ' + (err?._userMessage || err?.message || ''));
    }
  };

  const handleTestAi = async () => {
    setTesting(true); setTestResult(null);
    try {
      const result = await settingsApi.testAi();
      setTestResult({
        success: result.success,
        message: result.success ? result.response || '连接成功' : result.error || '连接失败',
      });
    } catch (err: any) {
      setTestResult({ success: false, message: '连接失败: ' + (err?._userMessage || err?.message || '未知错误') });
    } finally { setTesting(false); }
  };

  const handleTogglePattern = async (patternId: number, enabled: boolean) => {
    try {
      await fetch(`/api/email-patterns/${patternId}?is_enabled=${enabled}`, { method: 'PUT' });
      loadPatterns();
      message.success('已更新');
    } catch { message.error('更新失败'); }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <Spin size="large" tip="加载设置..." />
      </div>
    );
  }

  const aiConfigured = (settings as any)?.ai_configured;

  // Handle adding a custom pattern
  const handleAddPattern = async () => {
    try {
      const values = await addForm.validateFields();
      const resp = await fetch('/api/email-patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, template_group: addGroup }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        message.error(err.detail || '添加失败');
        return;
      }
      message.success('格式已添加');
      setAddModalOpen(false);
      addForm.resetFields();
      loadPatterns();
    } catch { message.error('添加失败'); }
  };

  // Handle AI pattern generation
  const handleAiGenerate = async () => {
    setAiLoading(true);
    setAiResults([]);
    setAiSelected(new Set());
    try {
      const country = (document.getElementById('ai-country') as HTMLInputElement)?.value || '';
      const industry = (document.getElementById('ai-industry') as HTMLInputElement)?.value || '';
      const prompt = (document.getElementById('ai-prompt') as HTMLInputElement)?.value || '';
      const resp = await fetch('/api/email-patterns/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: country || undefined, industry: industry || undefined, template_group: aiGroup, prompt: prompt || undefined }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        message.error(err.detail || 'AI 生成失败');
        return;
      }
      const data = await resp.json();
      setAiResults(data);
      setAiSelected(new Set(data.map((_: unknown, i: number) => i)));
    } catch (err: any) {
      message.error('AI 生成失败: ' + (err?.message || '网络错误'));
    } finally { setAiLoading(false); }
  };

  // Save selected AI patterns
  const handleSaveAiPatterns = async () => {
    const selected = aiResults.filter((_, i) => aiSelected.has(i));
    if (!selected.length) { message.warning('请至少选择一个格式'); return; }
    let success = 0;
    for (const item of selected) {
      try {
        const resp = await fetch('/api/email-patterns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...item, template_group: aiGroup, is_enabled: true }),
        });
        if (resp.ok) success++;
      } catch { /* best-effort */ }
    }
    message.success(`已添加 ${success} 个格式`);
    setAiModalOpen(false);
    loadPatterns();
  };

  return (
    <div style={{ padding: '16px 20px', maxWidth: 960, margin: '0 auto' }}>
      <Title level={4} style={{ marginBottom: 16, color: '#1e293b' }}>⚙️ {t('系统设置')}</Title>

      <Tabs
        type="card"
        items={[
          {
            key: 'ai',
            label: <span><ApiOutlined /> {t('AI 配置')}</span>,
            children: (
              <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }} styles={{ body: { padding: 24 } }}>
                {!aiConfigured && (
                  <Alert type="warning" message={t('AI API Key 未配置')}
                    description={t('请配置 API Key 后才能使用开发信 AI 生成功能')}
                    style={{ marginBottom: 16 }} showIcon />
                )}
                <Form form={aiForm} layout="vertical">
                  <Form.Item label={t('API 协议')} name="ai_provider" tooltip={t('Anthropic 使用 Claude Messages API；OpenAI 兼容协议适用于 OpenAI、DeepSeek、Qwen 等')}>
                    <Select options={[
                      { label: 'Anthropic (Claude)', value: 'anthropic' },
                      { label: 'OpenAI 兼容 (OpenAI / DeepSeek / Qwen 等)', value: 'openai' },
                    ]} />
                  </Form.Item>

                  <Form.Item noStyle shouldUpdate={(prev, cur) => prev.ai_provider !== cur.ai_provider}>
                    {({ getFieldValue, setFieldsValue }) => {
                      const provider = getFieldValue('ai_provider');

                      // Provider presets (from ccswitch)
                      const anthropicPresets = [
                        { label: 'Anthropic 官方', key: 'official', url: 'https://api.anthropic.com', model: 'claude-sonnet-5' },
                        { label: '百度千帆', key: 'qianfan', url: 'https://qianfan.baidubce.com/anthropic/coding', model: 'qianfan-code-latest' },
                        { label: '火山引擎', key: 'volcengine', url: 'https://ark.cn-beijing.volces.com/api/coding', model: 'ark-code-latest' },
                        { label: '阿里百炼', key: 'bailian', url: 'https://dashscope.aliyuncs.com/apps/anthropic', model: '' },
                        { label: 'Kimi', key: 'kimi', url: 'https://api.moonshot.cn/anthropic', model: 'kimi-k2.7-code' },
                        { label: '智谱', key: 'zhipu', url: 'https://open.bigmodel.cn/api/paas/v4', model: '' },
                        { label: 'MiniMax', key: 'minimax', url: 'https://api.minimaxi.com/anthropic', model: 'MiniMax-M2.7' },
                      ];
                      const openaiPresets = [
                        { label: 'OpenAI 官方', key: 'official', url: 'https://api.openai.com/v1', model: 'gpt-4o' },
                        { label: 'DeepSeek', key: 'deepseek', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
                        { label: '硅基流动', key: 'siliconflow', url: 'https://api.siliconflow.cn/v1', model: '' },
                      ];

                      return provider === 'anthropic' ? (
                        <>
                          <Row gutter={16}>
                            <Col span={24}><Form.Item label={t('API Key')} name="anthropic_api_key" tooltip={t('已保存的 Key 显示为掩码，清空后填入新值即可覆盖')}><Input.Password placeholder="sk-ant-..." /></Form.Item></Col>
                          </Row>
                          <Row gutter={16}>
                            <Col span={12}><Form.Item label={t('API 地址')} name="anthropic_base_url" tooltip={t('根地址，系统自动拼接 /v1/messages')}>
                              <Input placeholder="https://api.anthropic.com" addonAfter={
                                <Select size="small" bordered={false} style={{ width: 90 }} placeholder="快速选" defaultValue={undefined}
                                  onChange={(v) => { const p = anthropicPresets.find(x => x.key === v); if (p) { setFieldsValue({ anthropic_base_url: p.url, anthropic_model: p.model || undefined }); } }}
                                  options={anthropicPresets.map(p => ({ label: p.label, value: p.key }))} />
                              } /></Form.Item></Col>
                            <Col span={12}><Form.Item label={t('模型')} name="anthropic_model"><Input placeholder="claude-sonnet-5" /></Form.Item></Col>
                          </Row>
                        </>
                      ) : (
                        <>
                          <Row gutter={16}>
                            <Col span={24}><Form.Item label={t('API Key')} name="openai_api_key" tooltip={t('已保存的 Key 显示为掩码，清空后填入新值即可覆盖')}><Input.Password placeholder="sk-..." /></Form.Item></Col>
                          </Row>
                          <Row gutter={16}>
                            <Col span={12}><Form.Item label={t('API 地址')} name="openai_base_url" tooltip={t('根地址，系统自动拼接 /chat/completions')}>
                              <Input placeholder="https://api.openai.com/v1" addonAfter={
                                <Select size="small" bordered={false} style={{ width: 90 }} placeholder="快速选" defaultValue={undefined}
                                  onChange={(v) => { const p = openaiPresets.find(x => x.key === v); if (p) { setFieldsValue({ openai_base_url: p.url, openai_model: p.model || undefined }); } }}
                                  options={openaiPresets.map(p => ({ label: p.label, value: p.key }))} />
                              } /></Form.Item></Col>
                            <Col span={12}><Form.Item label={t('模型')} name="openai_model"><Input placeholder="gpt-4o / deepseek-chat / qwen-plus" /></Form.Item></Col>
                          </Row>
                        </>
                      );
                    }}
                  </Form.Item>

                  <Divider orientation="left" plain style={{ color: '#64748b' }}>{t('通用参数')}</Divider>
                  <Row gutter={16}>
                    <Col span={12}><Form.Item label={t('最大 Token 数')} name="ai_max_tokens" tooltip={t('输出最大 token 数')}><InputNumber min={64} max={1000000} step={256} style={{ width: '100%' }} addonAfter="tokens" /></Form.Item></Col>
                    <Col span={12}>
                      <Form.Item label={t('温度 (创造性)')} name="ai_temperature">
                        <Slider min={0} max={1} step={0.1} marks={{ 0: t('精确'), 0.5: t('平衡'), 1: t('创意') }} />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Space>
                    <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveAi}>{t('保存设置')}</Button>
                    <Button icon={<ExperimentOutlined />} onClick={handleTestAi} loading={testing}>{t('测试连接')}</Button>
                  </Space>

                  {testResult && (
                    <Alert type={testResult.success ? 'success' : 'error'}
                      message={testResult.success ? `✅ ${t('AI 连接成功')}` : `❌ ${t('AI 连接失败')}`}
                      description={testResult.message}
                      style={{ marginTop: 12 }} showIcon closable onClose={() => setTestResult(null)} />
                  )}
                </Form>
              </Card>
            ),
          },
          {
            key: 'patterns',
            label: <span><MailOutlined /> {t('邮箱推导模式')}</span>,
            children: (
              <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }} styles={{ body: { padding: 24 } }}>
                <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                  {t('配置邮箱推导与验证功能。可独立控制推导和验证的启用状态，也可自定义邮箱格式或用 AI 生成。')}
                </Paragraph>

                {/* ── 功能状态控制 ── */}
                <Row gutter={24} style={{ marginBottom: 24 }}>
                  <Col span={12}>
                    <div style={{ padding: 16, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fafbfc' }}>
                      <Text strong style={{ display: 'block', marginBottom: 8 }}>📧 {t('邮箱验证')}</Text>
                      <Segmented
                        value={(settings as any)?.email_verify_mode || 'manual'}
                        onChange={async (val) => {
                          try {
                            const updated = await settingsApi.update({ email_verify_mode: val as string });
                            syncFromServer(updated);
                            message.success('验证模式已切换');
                          } catch { message.error('切换失败'); }
                        }}
                        options={[
                          { label: `🚫 ${t('禁用')}`, value: 'disabled' },
                          { label: `👆 ${t('手动')}`, value: 'manual' },
                          { label: `🤖 ${t('自动')}`, value: 'auto' },
                        ]}
                        style={{ marginBottom: 8, width: '100%' }}
                      />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {(settings as any)?.email_verify_mode === 'disabled' && t('验证功能已关闭，所有验证按钮将隐藏')}
                        {(settings as any)?.email_verify_mode === 'manual' && t('需手动点击验证按钮，逐个验证（限速保护）')}
                        {(settings as any)?.email_verify_mode === 'auto' && t('推导邮箱后自动触发验证')}
                      </Text>
                      {(settings as any)?.email_verify_mode !== 'disabled' && (
                        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{t('每分钟验证上限')}</Text>
                          <InputNumber
                            min={1} max={30}
                            value={(settings as any)?.email_verify_rate_limit || 5}
                            onChange={async (val) => {
                              if (!val) return;
                              try {
                                const updated = await settingsApi.update({ email_verify_rate_limit: val });
                                syncFromServer(updated);
                              } catch { message.error('保存失败'); }
                            }}
                            size="small"
                            style={{ width: 64 }}
                          />
                          <Text type="secondary" style={{ fontSize: 11 }}>{t('封/分钟')}</Text>
                        </div>
                      )}
                    </div>
                  </Col>
                  <Col span={12}>
                    <div style={{ padding: 16, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fafbfc' }}>
                      <Text strong style={{ display: 'block', marginBottom: 8 }}>🔍 {t('邮箱推导')}</Text>
                      <Segmented
                        value={(settings as any)?.email_deduce_mode || 'disabled'}
                        onChange={async (val) => {
                          try {
                            const updated = await settingsApi.update({ email_deduce_mode: val as string });
                            syncFromServer(updated);
                            message.success('推导模式已切换');
                          } catch { message.error('切换失败'); }
                        }}
                        options={[
                          { label: `🚫 ${t('禁用')}`, value: 'disabled' },
                          { label: `👆 ${t('手动')}`, value: 'manual' },
                          { label: `🤖 ${t('自动')}`, value: 'auto' },
                        ]}
                        style={{ marginBottom: 8, width: '100%' }}
                      />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {(settings as any)?.email_deduce_mode === 'disabled' && t('推导功能已关闭，添加员工时不会推导邮箱')}
                        {(settings as any)?.email_deduce_mode === 'manual' && t('添加员工时可手动选择是否推导邮箱')}
                        {(settings as any)?.email_deduce_mode === 'auto' && t('添加员工时自动推导邮箱')}
                      </Text>
                    </div>
                  </Col>
                </Row>

                <Divider style={{ margin: '16px 0' }} />

                {/* ── 默认推导模式选择 ── */}
                <div style={{ marginBottom: 24 }}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>{t('默认推导模式')}</Text>
                  <Segmented
                    value={(settings as any)?.email_deduce_template_group || 'standard'}
                    onChange={async (val) => {
                      try {
                        const updated = await settingsApi.update({ email_deduce_template_group: val as string });
                        syncFromServer(updated);
                        message.success(t('推导模式已切换'));
                      } catch { message.error(t('切换失败')); }
                    }}
                    options={[
                      { label: `🔒 ${t('保守模式')}`, value: 'conservative' },
                      { label: `📋 ${t('标准模式')}`, value: 'standard' },
                      { label: `🔍 ${t('全面模式')}`, value: 'comprehensive' },
                    ]}
                    style={{ marginBottom: 8 }}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('当前激活')}：<Text strong style={{ color: '#4f46e5' }}>
                      {t(({ conservative: '保守模式', standard: '标准模式', comprehensive: '全面模式' } as Record<string, string>)[(settings as any)?.email_deduce_template_group || 'standard'])}
                    </Text>
                    {' — '}{t('新增员工邮箱推导时将使用此模式')}
                  </Text>
                </div>

                <Divider style={{ margin: '16px 0' }} />

                {/* ── 占位符说明 ── */}
                <Collapse size="small" style={{ marginBottom: 16 }} items={[{
                  key: 'help',
                  label: <Text style={{ fontSize: 13 }}>📋 {t('推导格式占位符说明')}</Text>,
                  children: (
                    <Table size="small" pagination={false} dataSource={[
                      { key: 'first', placeholder: '{first}', desc: '完整名（小写）', example: 'alexander' },
                      { key: 'last', placeholder: '{last}', desc: '完整姓（小写）', example: 'thompson' },
                      { key: 'fi', placeholder: '{fi}', desc: '名首字母', example: 'a' },
                      { key: 'li', placeholder: '{li}', desc: '姓首字母', example: 't' },
                      { key: 'f3', placeholder: '{f3}', desc: '名前3字母（不足则全名）', example: 'ale' },
                      { key: 'l3', placeholder: '{l3}', desc: '姓前3字母（不足则全姓）', example: 'tho' },
                      { key: 'f4', placeholder: '{f4}', desc: '名前4字母（不足则全名）', example: 'alex' },
                      { key: 'l4', placeholder: '{l4}', desc: '姓前4字母（不足则全姓）', example: 'thom' },
                    ]} columns={[
                      { title: t('占位符'), dataIndex: 'placeholder', key: 'p', width: 120, render: (v: string) => <Tag style={{ fontFamily: 'monospace' }}>{v}</Tag> },
                      { title: t('含义'), dataIndex: 'desc', key: 'd' },
                      { title: t('示例'), dataIndex: 'example', key: 'e', width: 120, render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
                    ]} />
                  ),
                }]} />

                {/* ── 模式详细配置 ── */}
                {patterns.length === 0 ? (
                  <Alert type="info" message="暂无推导模式数据" description="请确保后端服务正常运行" showIcon />
                ) : (
                  <Tabs
                    activeKey={(settings as any)?.email_deduce_template_group || 'standard'}
                    items={['conservative', 'standard', 'comprehensive'].map((group) => {
                      const isActive = (settings as any)?.email_deduce_template_group === group;
                      const groupPatterns = patterns.filter((p) => p.template_group === group);
                      return {
                        key: group,
                        label: (
                          <Space size={4}>
                            {{ conservative: '🔒', standard: '📋', comprehensive: '🔍' }[group]}
                            {t({ conservative: '保守模式', standard: '标准模式', comprehensive: '全面模式' }[group] ?? group)}
                            <Tag style={{ fontSize: 10, lineHeight: '16px', marginRight: 0, marginLeft: 2 }}>{groupPatterns.length}</Tag>
                            {isActive && <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', marginRight: 0, marginLeft: 2 }}>当前</Tag>}
                          </Space>
                        ),
                        children: (
                          <>
                            <Space style={{ marginBottom: 12 }}>
                              <Button size="small" type="primary" icon={<PlusOutlined />}
                                onClick={() => { setAddGroup(group); addForm.resetFields(); setAddModalOpen(true); }}>
                                {t('添加格式')}
                              </Button>
                              <Button size="small" icon={<StarOutlined />}
                                onClick={() => { setAiGroup(group); setAiResults([]); setAiSelected(new Set()); setAiModalOpen(true); }}>
                                {t('AI 生成')}
                              </Button>
                            </Space>
                            <Table
                              dataSource={groupPatterns}
                              rowKey="id" size="small" pagination={false}
                              style={{ borderRadius: 8, overflow: 'hidden' }}
                              columns={[
                                { title: t('模式名称'), dataIndex: 'name', key: 'name', width: 140 },
                                { title: t('格式'), dataIndex: 'pattern', key: 'pattern', width: 140, render: (p: string) => <Tag style={{ fontFamily: 'monospace' }}>{p}</Tag> },
                                { title: t('说明'), dataIndex: 'description', key: 'desc', ellipsis: true },
                                {
                                  title: t('启用'), dataIndex: 'is_enabled', key: 'enabled', width: 70, align: 'center' as const,
                                  render: (enabled: boolean, record: EmailPattern) => (
                                    <Switch size="small" checked={enabled} onChange={(val) => handleTogglePattern(record.id, val)} />
                                  ),
                                },
                                {
                                  title: '', key: 'actions', width: 40, align: 'center' as const,
                                  render: (_: unknown, record: EmailPattern) => (
                                    <Popconfirm title="确定删除此格式？" onConfirm={async () => {
                                      try {
                                        await fetch(`/api/email-patterns/${record.id}`, { method: 'DELETE' });
                                        loadPatterns();
                                        message.success('已删除');
                                      } catch { message.error('删除失败'); }
                                    }}>
                                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                                    </Popconfirm>
                                  ),
                                },
                              ]}
                            />
                            <div style={{ marginTop: 12, textAlign: 'right' }}>
                              <Button size="small" danger onClick={() => {
                                Modal.confirm({
                                  title: '重置为默认设置',
                                  content: `将删除"${{ conservative: '保守', standard: '标准', comprehensive: '全面' }[group]}模式"下所有自定义格式，恢复为默认格式。此操作不可撤销。`,
                                  okText: '确认重置',
                                  okType: 'danger',
                                  cancelText: '取消',
                                  onOk: async () => {
                                    try {
                                      await fetch(`/api/email-patterns/reset/${group}`, { method: 'POST' });
                                      loadPatterns();
                                      message.success('已重置为默认设置');
                                    } catch { message.error('重置失败'); }
                                  },
                                });
                              }}>{t('重置为默认设置')}</Button>
                            </div>
                          </>
                        ),
                      };
                    })}
                  />
                )}
              </Card>
            ),
          },
          {
            key: 'email-format',
            label: <span><MailOutlined /> {t('邮箱格式')}</span>,
            children: (
              <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }} styles={{ body: { padding: 24 } }}>
                <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                  {t('配置复制邮箱时的收件人格式模板。复制邮箱时会按此格式拼接企业名称、姓名、职位和邮箱地址。')}
                </Paragraph>

                <Form layout="vertical">
                  <Form.Item label={t('复制格式模板')} tooltip={t('使用占位符定义复制格式，复制时会自动替换为实际内容')}>
                    <Input
                      value={(() => {
                        const fmt = (settings as any)?.email_copy_format;
                        return fmt || '"{company_name} {full_name}-{position}" <{email}>';
                      })()}
                      onChange={(e) => {
                        const newSettings = { ...(settings as any), email_copy_format: e.target.value };
                        setSettings(newSettings);
                      }}
                      placeholder='"{company_name} {full_name}-{position}" <{email}>'
                      style={{ fontFamily: 'monospace' }}
                    />
                  </Form.Item>

                  {/* Preview */}
                  <Card size="small" style={{ marginBottom: 16, background: '#f8fafc', borderRadius: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>{t('预览效果')}：</Text>
                    <Text strong style={{ fontSize: 13, fontFamily: 'monospace' }}>
                      {(() => {
                        const fmt = (settings as any)?.email_copy_format || '"{company_name} {full_name}-{position}" <{email}>';
                        let result = fmt;
                        result = result.replace(/\{company_name\}/g, 'Bernsteiner GmbH');
                        result = result.replace(/\{full_name\}/g, 'Barbara B');
                        result = result.replace(/\{position\}/g, 'CEO');
                        result = result.replace(/\{email\}/g, 'barbara.b@bernsteiner.at');
                        result = result.replace(/-+(?=[\s,>])/g, '');
                        result = result.replace(/\s{2,}/g, ' ');
                        return result;
                      })()}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                      示例数据：Bernsteiner GmbH / Barbara B / CEO / barbara.b@bernsteiner.at
                    </Text>
                  </Card>

                  {/* Placeholder reference */}
                  <Collapse size="small" style={{ marginBottom: 16 }} items={[{
                    key: 'help',
                    label: <Text style={{ fontSize: 13 }}>📋 {t('可用占位符')}</Text>,
                    children: (
                      <Table size="small" pagination={false} dataSource={[
                        { key: 'company_name', placeholder: '{company_name}', desc: '企业名称', example: 'Bernsteiner GmbH' },
                        { key: 'full_name', placeholder: '{full_name}', desc: '员工姓名', example: 'Barbara B' },
                        { key: 'position', placeholder: '{position}', desc: '职位（为空时自动省略"-"前缀）', example: 'CEO' },
                        { key: 'email', placeholder: '{email}', desc: '邮箱地址', example: 'barbara.b@bernsteiner.at' },
                      ]} columns={[
                        { title: t('占位符'), dataIndex: 'placeholder', key: 'p', width: 150, render: (v: string) => <Tag style={{ fontFamily: 'monospace' }}>{v}</Tag> },
                        { title: t('含义'), dataIndex: 'desc', key: 'd' },
                        { title: t('示例'), dataIndex: 'example', key: 'e', width: 180, render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
                      ]} />
                    ),
                  }]} />

                  <Button type="primary" icon={<SaveOutlined />} onClick={async () => {
                    try {
                      const updated = await settingsApi.update({ email_copy_format: (settings as any)?.email_copy_format });
                      syncFromServer(updated);
                      message.success('邮箱格式已保存');
                    } catch (err: any) {
                      message.error('保存失败: ' + (err?._userMessage || err?.message || ''));
                    }
                  }}>{t('保存格式')}</Button>
                </Form>
              </Card>
            ),
          },
          {
            key: 'smtp',
            label: <span><MailOutlined /> {t('SMTP 配置')}</span>,
            children: (
              <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }} styles={{ body: { padding: 24 } }}>
                <Alert type="info" message={t('SMTP 为未来自动发送功能预留')}
                  description={t('当前版本仅支持手动发送模式，填写后将在后续版本中启用自动发送功能')}
                  style={{ marginBottom: 16 }} showIcon />
                <Form form={smtpForm} layout="vertical">
                  <Row gutter={16}>
                    <Col span={16}><Form.Item label={t('SMTP 主机')} name="smtp_host"><Input placeholder="smtp.gmail.com" /></Form.Item></Col>
                    <Col span={8}><Form.Item label={t('端口')} name="smtp_port"><InputNumber min={1} max={65535} style={{ width: '100%' }} /></Form.Item></Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}><Form.Item label={t('用户名')} name="smtp_user"><Input placeholder="your@email.com" /></Form.Item></Col>
                    <Col span={12}><Form.Item label={t('密码')} name="smtp_password"><Input.Password /></Form.Item></Col>
                  </Row>
                  <Form.Item label={t('使用 TLS')} name="smtp_use_tls" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveSmtp}>{t('保存 SMTP 设置')}</Button>
                </Form>
              </Card>
            ),
          },
          {
            key: 'backup',
            label: <span><DatabaseOutlined /> {t('数据备份')}</span>,
            children: <BackupTab settings={settings as Record<string, unknown>} syncFromServer={syncFromServer} />,
          },
          {
            key: 'system',
            label: `📊 ${t('系统信息')}`,
            children: (
              <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }} styles={{ body: { padding: 24 } }}>
                <Row gutter={[16, 16]}>
                  <Col span={8}>
                    <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{t('数据库引擎')}</Text>
                      <div><Text strong>{(settings as any)?.db_engine || 'sqlite'}</Text></div>
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{t('AI 状态')}</Text>
                      <div>{aiConfigured
                        ? <Tag color="success" icon={<CheckCircleOutlined />}>{t('已配置')}</Tag>
                        : <Tag color="warning" icon={<InfoCircleOutlined />}>{t('未配置')}</Tag>
                      }</div>
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{t('AI 提供商')}</Text>
                      <div><Text strong>{(settings as any)?.ai_provider || '-'}</Text></div>
                    </Card>
                  </Col>
                </Row>
                <Divider />
                <Row gutter={[16, 8]}>
                  <Col span={12}><Text type="secondary">{t('默认分页大小')}：</Text><Text>{(settings as any)?.default_page_size || 20}</Text></Col>
                  <Col span={12}><Text type="secondary">{t('邮箱验证并发数')}：</Text><Text>{(settings as any)?.email_verify_max_concurrent || 5}</Text></Col>
                </Row>
              </Card>
            ),
          },
        ]}
      />

      {/* Add pattern modal */}
      <Modal title="添加邮箱格式" open={addModalOpen}
        onOk={handleAddPattern} onCancel={() => setAddModalOpen(false)} okText="添加">
        <Form form={addForm} layout="vertical">
          <Form.Item label="格式名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：first_last_dot" />
          </Form.Item>
          <Form.Item label="格式模板" name="pattern" rules={[{ required: true, message: '请输入格式模板' }]}
            tooltip="使用占位符如 {first}, {last}, {fi}, {li}, {f3}, {l3} 等">
            <Input placeholder="如：{first}.{last}" style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item label="说明" name="description">
            <Input placeholder="如：名.姓（最常见格式）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* AI generate patterns modal */}
      <Modal title="✨ AI 生成邮箱格式" open={aiModalOpen}
        onCancel={() => setAiModalOpen(false)} width={640}
        footer={aiResults.length > 0 ? [
          <Button key="cancel" onClick={() => setAiModalOpen(false)}>取消</Button>,
          <Button key="save" type="primary" onClick={handleSaveAiPatterns}
            disabled={aiSelected.size === 0}>
            添加选中 ({aiSelected.size})
          </Button>,
        ] : null}>
        {aiResults.length === 0 ? (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Text type="secondary">输入国家/地区和行业，AI 将根据当地商务邮件习惯生成邮箱格式。</Text>
            <Input id="ai-country" placeholder="国家/地区（如：德国、日本、巴西）" />
            <Input id="ai-industry" placeholder="行业（如：汽车、金融、印刷）" />
            <Input id="ai-prompt" placeholder="额外提示（如：当地习惯用姓在前）" />
            <Button type="primary" icon={<StarOutlined />} loading={aiLoading}
              onClick={handleAiGenerate} block>
              生成格式
            </Button>
          </Space>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Text type="secondary">AI 已生成以下格式，勾选需要添加的：</Text>
            {aiResults.map((item, i) => (
              <Card key={i} size="small" style={{ borderRadius: 8 }}>
                <Checkbox checked={aiSelected.has(i)} onChange={(e) => {
                  const next = new Set(aiSelected);
                  e.target.checked ? next.add(i) : next.delete(i);
                  setAiSelected(next);
                }}>
                  <Space>
                    <Tag style={{ fontFamily: 'monospace' }}>{item.pattern}</Tag>
                    <Text strong>{item.name}</Text>
                    {item.description && <Text type="secondary" style={{ fontSize: 12 }}>- {item.description}</Text>}
                  </Space>
                </Checkbox>
              </Card>
            ))}
          </Space>
        )}
      </Modal>
    </div>
  );
}

// ── Backup Tab Component ────────────────────────────────────────
function BackupTab({ settings, syncFromServer }: {
  settings: Record<string, unknown>;
  syncFromServer: (data: any) => void;
}) {
  const { t } = useI18n();
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const data = await backupApi.list();
      setBackups(data);
    } catch { /* */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadBackups(); }, []);

  const handleBackupNow = async () => {
    setBackingUp(true);
    try {
      await backupApi.backupNow();
      message.success('备份成功');
      loadBackups();
    } catch { message.error('备份失败'); }
    finally { setBackingUp(false); }
  };

  const handleRestore = (filename: string) => {
    Modal.confirm({
      title: '⚠️ 确认恢复数据',
      content: `将从备份 "${filename}" 恢复数据库，当前数据将被覆盖。此操作不可撤销，确定继续？`,
      okText: '确认恢复',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await backupApi.restore(filename);
          message.success('数据已恢复，建议刷新页面');
          setTimeout(() => window.location.reload(), 1500);
        } catch { message.error('恢复失败'); }
      },
    });
  };

  const handleDelete = async (filename: string) => {
    try {
      await backupApi.delete(filename);
      message.success('已删除');
      loadBackups();
    } catch { message.error('删除失败'); }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await backupApi.upload(file);
      message.success('备份文件已上传');
      loadBackups();
    } catch { message.error('上传失败'); }
    finally { setUploading(false); }
    return false; // prevent antd default upload
  };

  const handleDownload = (filename: string) => {
    const link = document.createElement('a');
    link.href = backupApi.downloadUrl(filename);
    link.download = filename;
    link.click();
  };

  const updateBackupSetting = async (key: string, value: unknown) => {
    try {
      const updated = await settingsApi.update({ [key]: value });
      syncFromServer(updated);
    } catch { message.error('保存失败'); }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const unitLabels: Record<string, string> = {
    minute: '分钟', hour: '小时', day: '天', week: '周', month: '月',
  };

  return (
    <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }} styles={{ body: { padding: 24 } }}>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {t('备份包含')} <Tag color="blue">{t('数据库')}</Tag>{t('（企业、员工、邮箱、开发信等所有业务数据）')} {t('和')} <Tag color="green">{t('设置')}</Tag>{t('（AI 配置、邮箱验证模式、SMTP、备份配置等）')}，
        {t('打包为 .zip 文件存储在')} <Text code>data/backups/</Text> {t('目录')}。
      </Paragraph>

      {/* Settings */}
      <div style={{ padding: 16, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fafbfc', marginBottom: 20 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col span={24}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Text strong>{t('定时备份')}</Text>
              <Switch
                checked={!!settings?.backup_enabled}
                onChange={(val) => updateBackupSetting('backup_enabled', val)}
                checkedChildren={t('开启')}
                unCheckedChildren={t('关')}
              />
              {!!settings?.backup_enabled && (
                <Tag color="blue" icon={<ClockCircleOutlined />}>
                  {t('每 {interval} {unit} 自动备份', { interval: String(settings?.backup_interval || 1), unit: t(unitLabels[(settings?.backup_unit as string) || 'day']) })}
                </Tag>
              )}
            </div>
          </Col>
          {!!settings?.backup_enabled && (
            <>
              <Col span={12}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>{t('备份频率')}</Text>
                  <InputNumber
                    min={1} max={999}
                    value={(settings?.backup_interval as number) || 1}
                    onChange={(val) => val && updateBackupSetting('backup_interval', val)}
                    style={{ width: 80 }}
                  />
                  <Select
                    value={(settings?.backup_unit as string) || 'day'}
                    onChange={(val) => updateBackupSetting('backup_unit', val)}
                    style={{ width: 100 }}
                    options={Object.entries(unitLabels).map(([k, v]) => ({ label: t(v), value: k }))}
                  />
                </div>
              </Col>
              <Col span={12}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>{t('保留数量')}</Text>
                  <InputNumber
                    min={1} max={100}
                    value={(settings?.backup_keep_count as number) || 10}
                    onChange={(val) => val && updateBackupSetting('backup_keep_count', val)}
                    style={{ width: 80 }}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>{t('份（超出自动清理最旧的）')}</Text>
                </div>
              </Col>
            </>
          )}
        </Row>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <Button type="primary" icon={<DatabaseOutlined />} onClick={handleBackupNow} loading={backingUp}>
            {t('立即备份')}
          </Button>
          <Upload
            accept=".zip,.db"
            showUploadList={false}
            beforeUpload={(file) => { handleUpload(file); return false; }}
          >
            <Button icon={<UploadOutlined />} loading={uploading}>{t('加载备份')}</Button>
          </Upload>
        </div>
      </div>

      {/* Backup list */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text strong style={{ fontSize: 14 }}>📦 {t('备份文件')}</Text>
        <Space size={8}>
          {selectedRowKeys.length > 0 && (
            <Popconfirm title={`确定删除 ${selectedRowKeys.length} 个备份？`} onConfirm={async () => {
              try {
                await backupApi.batchDelete(selectedRowKeys);
                message.success(`已删除 ${selectedRowKeys.length} 个备份`);
                setSelectedRowKeys([]);
                loadBackups();
              } catch { message.error('删除失败'); }
            }}>
              <Button danger size="small" icon={<DeleteOutlined />}>{t('批量删除')}</Button>
            </Popconfirm>
          )}
          <Button size="small" icon={<UndoOutlined />} onClick={loadBackups} loading={loading}>{t('刷新')}</Button>
        </Space>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      ) : backups.length === 0 ? (
        <Alert type="info" message={t('暂无备份文件')} description={t('点击「立即备份」创建第一个备份')} showIcon />
      ) : (
        <Table
          dataSource={backups}
          rowKey="filename"
          size="small"
          pagination={false}
          rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys as string[]) }}
          columns={[
            {
              title: t('文件名'), dataIndex: 'filename', key: 'filename',
              render: (name: string) => <Text code style={{ fontSize: 12 }}>{name}</Text>,
            },
            {
              title: t('大小'), dataIndex: 'size', key: 'size', width: 100, align: 'right' as const,
              render: (size: number) => formatSize(size),
            },
            {
              title: t('包含'), dataIndex: 'includes', key: 'includes', width: 140,
              render: (includes: string[]) => (
                <Space size={4}>
                  {includes?.includes('foreigntrade.db') && <Tag color="blue" style={{ fontSize: 11 }}>{t('数据库')}</Tag>}
                  {includes?.includes('config.json') && <Tag color="green" style={{ fontSize: 11 }}>{t('设置')}</Tag>}
                  {!includes?.length && <Tag style={{ fontSize: 11 }}>未知</Tag>}
                </Space>
              ),
            },
            {
              title: t('创建时间'), dataIndex: 'created_at', key: 'created_at', width: 180,
              render: (t: string) => new Date(t).toLocaleString('zh-CN'),
            },
            {
              title: t('操作'), key: 'actions', width: 200, align: 'center' as const,
              render: (_: unknown, record: BackupItem) => (
                <Space>
                  <Tooltip title="下载到本地">
                    <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(record.filename)}>{t('下载')}</Button>
                  </Tooltip>
                  <Button size="small" icon={<UndoOutlined />} onClick={() => handleRestore(record.filename)}>{t('恢复')}</Button>
                  <Popconfirm title="确定删除此备份？" onConfirm={() => handleDelete(record.filename)} okText="删除" cancelText="取消">
                    <Button size="small" danger icon={<DeleteOutlined />}>{t('删除')}</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}
