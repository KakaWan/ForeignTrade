/** Backup API methods. */

import api from './client';
import type { BackupItem } from '../types';

export const backupApi = {
  list: () =>
    api.get<BackupItem[]>('/backup/list').then((r) => r.data),

  backupNow: () =>
    api.post<{ success: boolean; filename: string }>('/backup/now').then((r) => r.data),

  restore: (filename: string) =>
    api.post<{ success: boolean; message: string }>('/backup/restore', { filename }).then((r) => r.data),

  downloadUrl: (filename: string) =>
    `/api/backup/download/${encodeURIComponent(filename)}`,

  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ success: boolean; filename: string }>('/backup/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },

  delete: (filename: string) =>
    api.delete(`/backup/${filename}`).then((r) => r.data),

  batchDelete: (filenames: string[]) =>
    api.post<{ success: boolean; deleted: number }>('/backup/batch-delete', { filenames }).then((r) => r.data),
};
