const TIME_ZONE = 'Asia/Taipei';

const dateParts = new Intl.DateTimeFormat('en-US', {
  calendar: 'roc',
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

const dateTimeFormat = new Intl.DateTimeFormat('zh-TW', {
  timeZone: TIME_ZONE,
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** 將 ISO 時間轉成台灣時區的民國日期 */
export function rocDate(iso) {
  const parts = Object.fromEntries(dateParts.formatToParts(new Date(iso)).map(({ type, value }) => [type, value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

export function rocDateText(iso) {
  const { year, month, day } = rocDate(iso);
  return `民國 ${year} 年 ${month} 月 ${day} 日`;
}

/** 日期與時間，例如「11/4 15:20」 */
export function savedTimeText(time) {
  return dateTimeFormat.format(new Date(time));
}

/** 完整日期與時間，例如「民國 115 年 11 月 4 日 15:20」 */
export function rocDateTimeText(iso) {
  return `${rocDateText(iso)} ${timeFormat.format(new Date(iso))}`;
}

export function albumDeleteQuestion({ name, photoCount }) {
  const photos = photoCount ? `相簿內的 ${photoCount} 張照片會一起刪除，` : '';
  return `確定要刪除相簿「${name}」嗎？${photos}`;
}

/** 內容是否在建立後編輯過 */
export const wasEdited = (item) => item.modifiedAt !== item.createdAt;

/** 是否還沒到發布時間 */
export const isScheduled = (item, now = Date.now()) => new Date(item.publishedAt).getTime() > now;

/** ISO 時間轉成 datetime-local 輸入框的值（使用者所在時區） */
export function toLocalInput(iso) {
  const date = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** datetime-local 輸入框的值轉成 ISO 時間 */
export const fromLocalInput = (value) => new Date(value).toISOString();

/** 拆開「110(1)校外參訪」這類相簿名稱；不符合時 term 為 null */
export function parseAlbum(name) {
  const match = /^\s*(\d{2,3})\s*[(（]\s*([12])\s*[)）]\s*(.+?)\s*$/.exec(name);
  if (!match) return { term: null, name: name.trim() };
  return { term: `${match[1]} 學年度第 ${match[2]} 學期`, name: match[3] };
}

export function fileSizeText(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
