/** Employee API methods. */

import api from './client';
import type { Employee, EmployeeCreate, PaginatedResult, UpcomingBirthday } from '../types';

export interface EmployeeListParams {
  page?: number;
  page_size?: number;
  company_id?: number;
  country?: string;
  /** 按所属企业的主营产品/业务筛选，命中任意一个即算 */
  product_ids?: number[];
  position?: string;
  seniority?: string;
  search?: string;
  is_favorite?: boolean;
  status?: string;
  contact_status?: string;
  sort_by?: string;
  sort_order?: string;
}

export const employeeApi = {
  list: (params: EmployeeListParams) =>
    api.get<PaginatedResult<Employee>>('/employees/', { params }).then((r) => r.data),

  get: (id: number) =>
    api.get<Employee>(`/employees/${id}`).then((r) => r.data),

  create: (data: EmployeeCreate, checkDup = true) =>
    api.post<Employee>('/employees/', data, { params: { check_dup: checkDup } }).then((r) => r.data),

  update: (id: number, data: Partial<EmployeeCreate>) =>
    api.put<Employee>(`/employees/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/employees/${id}`),

  toggleFavorite: (id: number) =>
    api.post<Employee>(`/employees/${id}/favorite`).then((r) => r.data),

  batchCreate: (employees: EmployeeCreate[]) =>
    api.post<Employee[]>('/employees/batch', employees).then((r) => r.data),

  batchDelete: (ids: number[]) =>
    api.post<{ success: boolean; deleted: number }>('/employees/batch-delete', { ids }).then((r) => r.data),

  batchUpdate: (ids: number[], data: { contact_status?: string; letter_step?: number }) =>
    api.post<{ success: boolean; updated: number }>('/employees/batch-update', { ids, ...data }).then((r) => r.data),

  batchFavorite: (ids: number[], favorite: boolean) =>
    api.post<{ success: boolean; updated: number }>('/employees/batch/favorite', { ids, favorite }).then((r) => r.data),

  upcomingBirthdays: (days = 30) =>
    api.get<UpcomingBirthday[]>('/employees/upcoming-birthdays', { params: { days } }).then((r) => r.data),

  frequentValues: () =>
    api.get<{ positions: string[]; departments: string[]; seniorities: string[] }>('/employees/frequent-values').then((r) => r.data),
};
