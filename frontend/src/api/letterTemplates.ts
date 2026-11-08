/** Letter Template API methods. */

import api from './client';
import type { LetterTemplate, LetterTemplateCreate } from '../types';

export const letterTemplateApi = {
  list: () =>
    api.get<LetterTemplate[]>('/letter-templates/').then((r) => r.data),

  get: (id: number) =>
    api.get<LetterTemplate>(`/letter-templates/${id}`).then((r) => r.data),

  create: (data: LetterTemplateCreate) =>
    api.post<LetterTemplate>('/letter-templates/', data).then((r) => r.data),

  update: (id: number, data: Partial<LetterTemplateCreate>) =>
    api.put<LetterTemplate>(`/letter-templates/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/letter-templates/${id}`),
};
