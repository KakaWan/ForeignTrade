/** 主营产品/业务多选组件。
 *
 * 选项按分类分组、显示「中文名 / English Name」，工具栏筛选、企业表单、
 * 批量套用、员工页筛选四处共用，避免各写一份分组逻辑。
 */

import { useMemo } from 'react';
import { Select } from 'antd';
import type { Product } from '../types';

export interface ProductOptionGroup {
  label: string;
  options: { value: number; label: string }[];
}

/** 把产品列表转成 antd Select 的分组 options（按 category 出现顺序） */
export function groupProductOptions(products: Product[]): ProductOptionGroup[] {
  const groups = new Map<string, ProductOptionGroup['options']>();
  for (const p of products) {
    const list = groups.get(p.category) || [];
    list.push({ value: p.id, label: p.name_en ? `${p.name} / ${p.name_en}` : p.name });
    groups.set(p.category, list);
  }
  return Array.from(groups, ([label, options]) => ({ label, options }));
}

export default function ProductSelect({ products, value, onChange, placeholder, style }: {
  products: Product[];
  value?: number[];
  onChange?: (value: number[]) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const options = useMemo(() => groupProductOptions(products), [products]);

  return (
    <Select
      mode="multiple"
      allowClear
      placeholder={placeholder ?? '选择主营产品/业务（可多选）'}
      options={options}
      optionFilterProp="label"
      maxTagCount="responsive"
      value={value}
      onChange={onChange}
      style={{ width: '100%', ...style }}
    />
  );
}
