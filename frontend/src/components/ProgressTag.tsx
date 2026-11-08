/** Development letter progress and contact status tags. */

import { Tag } from 'antd';
import type { ContactStatus } from '../types';
import { CONTACT_STATUS_CONFIG } from '../types';
import { useI18n } from '../i18n';

interface Props {
  progress: string;
}

const progressConfig: Record<string, { color: string; label: string }> = {
  draft: { color: 'default', label: '草稿' },
  sent: { color: 'processing', label: '已发送' },
  replied: { color: 'warning', label: '已回复' },
  interested: { color: 'success', label: '感兴趣' },
  negotiating: { color: 'purple', label: '谈判中' },
  closed: { color: 'gold', label: '已成交' },
};

export default function ProgressTag({ progress }: Props) {
  const { t } = useI18n();
  const config = progressConfig[progress] || { color: 'default', label: progress };
  return <Tag color={config.color}>{t(config.label)}</Tag>;
}

/** Contact status tag — for employee list and letter page. */
export function ContactStatusTag({ status }: { status: ContactStatus | string }) {
  const { t } = useI18n();
  const config = CONTACT_STATUS_CONFIG[status as ContactStatus] || { color: 'default', label: status };
  return <Tag color={config.color}>{t(config.label)}</Tag>;
}

/** Letter step badge — shows step number and purpose. */
export function LetterStepTag({ step, compact }: { step: number; compact?: boolean }) {
  const { t, lang } = useI18n();
  if (step === 0) return <Tag>{t('未开始')}</Tag>;
  const stepInfo = [
    null,
    { color: 'blue', label: '1-破冰' },
    { color: 'cyan', label: '2-推荐' },
    { color: 'geekblue', label: '3-背书' },
    { color: 'purple', label: '4-痛点' },
    { color: 'orange', label: '5-提醒' },
    { color: 'default', label: '6-收尾' },
  ][step] || { color: 'default', label: t('第 {step} 封', { step }) };
  const compactLabel = lang === 'zh-CN' ? t('第 {step} 封', { step }) : `S${step}`;
  return <Tag color={stepInfo.color}>{compact ? compactLabel : t(stepInfo.label)}</Tag>;
}
