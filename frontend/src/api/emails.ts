/** Email API methods. */

import api from './client';
import type { EmailDeduceRequest, EmailDeduceResult, EmailRecord } from '../types';

export const emailApi = {
  deduce: (data: EmailDeduceRequest) =>
    api.post<EmailDeduceResult[]>('/emails/deduce', data).then((r) => r.data),

  verify: (emailIds?: number[], emails?: string[]) =>
    api.post<VerifyResult[]>('/emails/verify', { email_ids: emailIds, emails }).then((r) => r.data),

  deduceAndVerify: (data: EmailDeduceRequest) =>
    api.post<VerifyResult[]>('/emails/deduce-and-verify', data).then((r) => r.data),

  list: (employeeId: number) =>
    api.get<EmailRecord[]>('/emails/list', { params: { employee_id: employeeId } }).then((r) => r.data),

  add: (employeeId: number, email: string, isPrimary = false) =>
    api.post<EmailRecord>('/emails/add', {
      employee_id: employeeId,
      email,
      is_primary: isPrimary,
      source: 'manual',
    }).then((r) => r.data),

  update: (id: number, data: Partial<EmailRecord>) =>
    api.put<EmailRecord>(`/emails/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/emails/${id}`),
};

export interface VerifyResult {
  email: string;
  verification_status: string;
  mx_record?: string;
  smtp_response?: string;
  details?: string;
}
