/** Company API methods. */

import api from './client';
import type { Company, CompanyCreate, PaginatedResult } from '../types';

export interface CompanyListParams {
  page?: number;
  page_size?: number;
  country?: string;
  industry?: string;
  /** 按主营产品/业务筛选，命中任意一个即算 */
  product_ids?: number[];
  search?: string;
  is_favorite?: boolean;
  status?: string;
  sort_by?: string;
  sort_order?: string;
}

export const companyApi = {
  list: (params: CompanyListParams) =>
    api.get<PaginatedResult<Company>>('/companies/', { params }).then((r) => r.data),

  get: (id: number) =>
    api.get<Company>(`/companies/${id}`).then((r) => r.data),

  create: (data: CompanyCreate, checkDup = true) =>
    api.post<Company>('/companies/', data, { params: { check_dup: checkDup } }).then((r) => r.data),

  update: (id: number, data: Partial<CompanyCreate>) =>
    api.put<Company>(`/companies/${id}`, data).then((r) => r.data),

  delete: (id: number, deleteEmployees = false) =>
    api.delete(`/companies/${id}`, { params: { delete_employees: deleteEmployees } }),

  toggleFavorite: (id: number) =>
    api.post<Company>(`/companies/${id}/favorite`).then((r) => r.data),

  listCountries: () =>
    api.get<string[]>('/companies/countries/list').then((r) => r.data),

  listIndustries: () =>
    api.get<string[]>('/companies/industries/list').then((r) => r.data),

  batchDelete: (ids: number[], deleteEmployees = false) =>
    api.post<{ success: boolean; deleted: number }>('/companies/batch-delete', { ids, delete_employees: deleteEmployees }).then((r) => r.data),

  batchFavorite: (ids: number[], favorite: boolean) =>
    api.post<{ success: boolean; updated: number }>('/companies/batch/favorite', { ids, favorite }).then((r) => r.data),

  frequentValues: () =>
    api.get<{ countries: string[]; regions: string[]; industries: string[] }>('/companies/frequent-values').then((r) => r.data),
};
