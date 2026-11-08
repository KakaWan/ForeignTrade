/** 仪表盘聚合接口。
 *
 * 时间一律传 `tz_offset_minutes`：后端按**调用者的本地日**分桶，而不是 UTC 日
 * （否则晚上新增的记录会被算到第二天）。
 */

import api from './client';
import type { CalendarMonth, DashboardSummary, DayActivity } from '../types';
import { clientTzOffsetMinutes } from '../utils/date';

export const dashboardApi = {
  summary: (trendDays = 30) =>
    api.get<DashboardSummary>('/dashboard/summary', {
      params: { tz_offset_minutes: clientTzOffsetMinutes(), trend_days: trendDays },
    }).then((r) => r.data),

  calendar: (year: number, month: number) =>
    api.get<CalendarMonth>('/dashboard/calendar', {
      params: { year, month, tz_offset_minutes: clientTzOffsetMinutes() },
    }).then((r) => r.data),

  day: (date: string) =>
    api.get<DayActivity>('/dashboard/day', {
      params: { date, tz_offset_minutes: clientTzOffsetMinutes() },
    }).then((r) => r.data),
};
