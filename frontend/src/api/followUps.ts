/** Follow-up API methods. */

import api from './client';
import type { FollowUp } from '../types';

export const followUpApi = {
  list: () =>
    api.get<FollowUp[]>('/follow-ups').then((r) => r.data),

  create: (data: Partial<FollowUp>) =>
    api.post<FollowUp>('/follow-ups', data).then((r) => r.data),

  update: (id: number, data: Partial<FollowUp>) =>
    api.put<FollowUp>(`/follow-ups/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/follow-ups/${id}`),

  batchUpdateStatus: (ids: number[], status: string) =>
    api.put<{ success: boolean; updated: number }>('/follow-ups/batch', { ids, status }).then((r) => r.data),

  batchDelete: (ids: number[]) =>
    api.delete<{ success: boolean; deleted: number }>('/follow-ups/batch', { data: { ids } }).then((r) => r.data),
};
