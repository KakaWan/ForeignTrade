/** 日期工具 —— 全站唯一的时间格式化入口。
 *
 * **为什么需要它**：后端所有时间列都是 `datetime.utcnow()` 存的 naive UTC，序列化
 * 出来是不带 Z / 不带偏移的 ISO 串（如 "2026-10-16T13:31:08"）。而 `dayjs(...)` /
 * `new Date(...)` 对无偏移串**按本地时间解析** —— 于是前端把 UTC 墙钟当本地原样打印，
 * 全站时间整体偏移一个 UTC offset（本机 7 小时）。
 *
 * 这里统一用 `dayjs.utc(s).local()` 先按 UTC 解析再转本地，修正显示。
 * 新增任何时间展示都请用它，不要再直接 `dayjs(后端时间)`。
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

/** 只有日期、没有时间的串（后端 date 列 / 日历的 YYYY-MM-DD）。
 *  这类值**不是时间戳**，不能做时区换算 —— 否则 UTC 午夜转成本地会整体退一天
 *  （曾把「2026-10-16 的操作」显示成 2026-10-15）。 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** 后端时间串 → 本地 dayjs 对象。
 *  - 完整时间戳（UTC）→ 转成本地
 *  - 纯日期串 → 原样解析，不做换算
 */
export function parseServerTime(value?: string | Date | null) {
  if (!value) return null;
  if (typeof value === 'string' && DATE_ONLY.test(value)) return dayjs(value);
  return dayjs.utc(value).local();
}

export function formatDate(value?: string | Date | null, fallback = '-'): string {
  const d = parseServerTime(value);
  return d ? d.format('YYYY-MM-DD') : fallback;
}

export function formatDateTime(value?: string | Date | null, fallback = '-'): string {
  const d = parseServerTime(value);
  return d ? d.format('YYYY-MM-DD HH:mm') : fallback;
}

/** 只要时分，用于「当天操作明细」这类同一天内的时间轴 */
export function formatTime(value?: string | Date | null, fallback = '-'): string {
  const d = parseServerTime(value);
  return d ? d.format('HH:mm') : fallback;
}

/** 相对今天的天数差（未来为正、过去为负），按「日」粒度比较 */
export function daysFromToday(value?: string | Date | null): number | null {
  const d = parseServerTime(value);
  return d ? d.startOf('day').diff(dayjs().startOf('day'), 'day') : null;
}

/** 提交给后端前的当前时区偏移（分钟，东为正）——
 *  后端据此把时间戳按**调用者的本地日**分桶，而不是 UTC 日 */
export function clientTzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

export { dayjs };
