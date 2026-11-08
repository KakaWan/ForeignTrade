/** Sender Profile API methods. */

import api from './client';
import type { SenderProfile } from '../types';

export interface SenderProfileCreate {
  name: string;
  company_name?: string;
  products?: string;
  website?: string;
  country?: string;
  industry?: string;
  introduction?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  is_default?: boolean;
}

export const senderProfileApi = {
  list: () =>
    api.get<SenderProfile[]>('/sender-profiles/').then((r) => r.data),

  get: (id: number) =>
    api.get<SenderProfile>(`/sender-profiles/${id}`).then((r) => r.data),

  create: (data: SenderProfileCreate) =>
    api.post<SenderProfile>('/sender-profiles/', data).then((r) => r.data),

  update: (id: number, data: Partial<SenderProfileCreate>) =>
    api.put<SenderProfile>(`/sender-profiles/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/sender-profiles/${id}`),
};
