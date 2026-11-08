/** Development Letter API methods. */

import api from './client';
import type { DevLetter, DevLetterGenerate, PreviewSegment } from '../types';

export const devLetterApi = {
  getDefaultPrompt: () =>
    api.get<{ prompt: string }>('/dev-letters/default-prompt').then((r) => r.data),

  generate: (data: DevLetterGenerate & { template_content?: string; sender_profile_id?: number; custom_prompt?: string; step?: number }) =>
    api.post<string>('/dev-letters/generate', data).then((r) => r.data),

  preview: (data: { template_content: string; employee_id?: number; company_id?: number; sender_profile_id?: number }) =>
    api.post<{ segments: PreviewSegment[] }>('/dev-letters/preview', data).then((r) => r.data),

  generateAndSave: (data: DevLetterGenerate & { template_content?: string; sender_profile_id?: number; custom_prompt?: string }) =>
    api.post<DevLetter>('/dev-letters/generate-and-save', data).then((r) => r.data),

  list: (employeeId?: number, companyId?: number) =>
    api.get<DevLetter[]>('/dev-letters/list', {
      params: { employee_id: employeeId, company_id: companyId },
    }).then((r) => r.data),

  create: (data: { employee_id?: number; company_id?: number; content: string; step?: number; language?: string; template_name?: string }) =>
    api.post<DevLetter>('/dev-letters/', data).then((r) => r.data),

  update: (id: number, data: Partial<DevLetter>) =>
    api.put<DevLetter>(`/dev-letters/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/dev-letters/${id}`),
};
