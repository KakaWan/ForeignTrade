/** Settings API methods. */

import api from './client';
import type { AppSettings } from '../types';

export const settingsApi = {
  get: () =>
    api.get<AppSettings>('/settings/').then((r) => r.data),

  update: (data: Record<string, unknown>) =>
    api.put<AppSettings>('/settings/', data).then((r) => r.data),

  testAi: () =>
    api.post<{ success: boolean; response?: string; error?: string }>('/settings/test-ai').then((r) => r.data),
};
