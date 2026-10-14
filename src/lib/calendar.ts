import 'server-only';

import { holidays as rawHolidays } from '@holiday-jp/holiday_jp';

const holidays = rawHolidays as Record<string, { name: string } | undefined>;

/** 日付 (YYYY-MM-DD) の表示用情報: 曜日・土日祝の区別 */
export type DayInfo = {
  date: string;
  /** 2026/10/01（木） */
  label: string;
  /** sat = 土曜日, holiday = 日曜日・祝日 (振替休日を含む) */
  kind: 'weekday' | 'sat' | 'holiday';
  holidayName?: string;
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function dayInfo(ymd: string): DayInfo {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  const holiday = holidays[ymd];
  const kind = holiday || dow === 0 ? 'holiday' : dow === 6 ? 'sat' : 'weekday';
  return {
    date: ymd,
    label: `${ymd.replaceAll('-', '/')}（${WEEKDAYS[dow]}）`,
    kind,
    holidayName: holiday?.name,
  };
}
