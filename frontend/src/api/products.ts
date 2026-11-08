/** 客户主营业务字典 API methods（存的是客户经营的业务，不是我们的产品）。 */

import api from './client';
import type { Product, ProductCreate } from '../types';

export const productApi = {
  list: (category?: string) =>
    api.get<Product[]>('/products/', { params: { category } }).then((r) => r.data),

  create: (data: ProductCreate) =>
    api.post<Product>('/products/', data).then((r) => r.data),

  update: (id: number, data: Partial<ProductCreate>) =>
    api.put<Product>(`/products/${id}`, data).then((r) => r.data),

  delete: (id: number) =>
    api.delete(`/products/${id}`),

  /** 清空所有自定义项，恢复内置列表（会解绑所有企业已登记的主营业务） */
  reset: () =>
    api.post<Product[]>('/products/reset').then((r) => r.data),
};
