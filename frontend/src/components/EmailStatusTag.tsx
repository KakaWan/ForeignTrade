/** Email verification status display component. */

import { Tag } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';

interface Props {
  status: string;
}

const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  valid: { color: 'success', icon: <CheckCircleOutlined />, label: '有效' },
  invalid: { color: 'error', icon: <CloseCircleOutlined />, label: '无效' },
  unknown: { color: 'default', icon: <QuestionCircleOutlined />, label: '未知' },
};

export default function EmailStatusTag({ status }: Props) {
  const config = statusConfig[status] || statusConfig.unknown;
  return (
    <Tag color={config.color} icon={config.icon}>
      {config.label}
    </Tag>
  );
}
