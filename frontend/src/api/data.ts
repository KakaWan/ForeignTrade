/** Data import/export API — download template, import, export. */

import api from './client';

// ── Types ──────────────────────────────────────────────

export interface ImportResult {
  total: number;
  companies_success: number;
  employees_success: number;
  skipped: number;
  errors: string[];
}

// ── Helpers ────────────────────────────────────────────

/** Trigger browser file download from a Blob. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Delay revoke so the click can complete
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 150);
}

/** Fetch a file from an API endpoint and trigger browser download. */
async function fetchAndDownload(url: string, params: Record<string, string | undefined>, filename: string) {
  const response = await api.get(url, {
    params,
    responseType: 'blob',
  });
  // Axios with responseType:'blob' puts the Blob in response.data
  const blob = response.data instanceof Blob
    ? response.data
    : new Blob([response.data]);
  downloadBlob(blob, filename);
}

// ── API ────────────────────────────────────────────────

export const dataApi = {
  /** Download the user's custom template (empty, headers only) */
  downloadTemplate: () =>
    fetchAndDownload('/data/template/user', {}, '模板-外贸企业.xlsx'),

  /** Import from user template format */
  importTemplate: async (file: File, skipDuplicates = true, signal?: AbortSignal): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<ImportResult>('/data/import/template', formData, {
      params: { skip_duplicates: skipDuplicates },
      headers: { 'Content-Type': 'multipart/form-data' },
      signal,
    });
    return response.data;
  },

  /** Export data in user template format */
  exportTemplate: (country?: string) =>
    fetchAndDownload('/data/export/template', country ? { country } : {}, '外贸企业导出.xlsx'),
};
