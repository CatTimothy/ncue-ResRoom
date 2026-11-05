const TIME_ZONE = 'Asia/Taipei';

const pad = (n) => String(n).padStart(2, '0');

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });

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

/** 依發布時間的民國年分組，保留原本的順序：[{ year, items }] */
export function groupByYear(items) {
  const groups = [];
  for (const item of items) {
    const { year } = rocDate(item.publishedAt);
    if (groups.at(-1)?.year === year) groups.at(-1).items.push(item);
    else groups.push({ year, items: [item] });
  }
  return groups;
}

/** 同一年內的日期，例如「11月5日」 */
export function monthDayText(iso) {
  const { month, day } = rocDate(iso);
  return `${month}月${day}日`;
}

/** 公告資訊用的短日期，例如「115/11/04」 */
export function rocShortDate(iso) {
  const { year, month, day } = rocDate(iso);
  return `${year}/${pad(month)}/${pad(day)}`;
}

/** 台灣時區的今天，例如「2026-11-04」 */
export const taipeiDay = (time = Date.now()) => dayFormat.format(time);

/** 去掉副檔名的檔名，當作照片說明的預設值 */
export const fileBaseName = (name) => name.replace(/\.[^.]+$/, '') || name;

/** 日期與時間，例如「11/4 15:20」 */
export function savedTimeText(time) {
  return dateTimeFormat.format(new Date(time));
}

/** 完整日期與時間，例如「民國 115 年 11 月 4 日 15:20」 */
export function rocDateTimeText(iso) {
  return `${rocDateText(iso)} ${timeFormat.format(new Date(iso))}`;
}

export const deleteQuestion = (title) => `確定要刪除「${title}」嗎？`;

export function albumDeleteQuestion({ name, photoCount }) {
  const photos = photoCount ? `相簿內的 ${photoCount} 張照片會一起刪除，` : '';
  return `確定要刪除相簿「${name}」嗎？${photos}`;
}

/** 內容是否在建立後編輯過 */
export const wasEdited = (item) => item.modifiedAt !== item.createdAt;

/** 是否還沒到發布時間 */
export const isScheduled = (item, now = Date.now()) => new Date(item.publishedAt).getTime() > now;

/** ISO 時間轉成輸入值 YYYY-MM-DDTHH:mm（使用者所在時區）；顯示時再由 toRocInput 轉成民國 */
export function toLocalInput(iso) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 輸入值 YYYY-MM-DDTHH:mm 轉成 ISO 時間 */
export const fromLocalInput = (value) => new Date(value).toISOString();

/** 西元的輸入值（YYYY-MM-DD 或 YYYY-MM-DDTHH:mm）轉成民國顯示，例如「115/11/04 15:20」 */
export function toRocInput(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(value);
  if (!match) return '';
  const [, year, month, day, time] = match;
  return `${Number(year) - 1911}/${month}/${day}${time ? ` ${time}` : ''}`;
}

/**
 * 民國日期轉成西元的輸入值。接受 115/11/4、115-11-4、115.11.4、115年11月4日；withTime 時後面還要有 15:20。
 * 空白回傳空字串，格式不正確或日期不存在（例如 2 月 30 日）回傳 null。
 */
export function fromRocInput(text, withTime = false) {
  const value = text.trim();
  if (!value) return '';
  const match = /^(\d{1,3})\s*[/／.\-年]\s*(\d{1,2})\s*[/／.\-月]\s*(\d{1,2})\s*日?(?:\s*(\d{1,2})[:：](\d{2}))?$/.exec(value);
  if (!match || withTime !== (match[4] !== undefined)) return null;

  const [year, month, day, hour = 0, minute = 0] = match.slice(1).map((part) => part && Number(part));
  const date = new Date(Date.UTC(year + 1911, month - 1, day));
  if (year < 1 || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59) return null;

  const iso = `${year + 1911}-${pad(month)}-${pad(day)}`;
  return withTime ? `${iso}T${pad(hour)}:${pad(minute)}` : iso;
}

/** 拆開「110(1)校外參訪」這類相簿名稱；不符合時 term 為 null */
export function parseAlbum(name) {
  const match = /^\s*(\d{2,3})\s*[(（]\s*([12])\s*[)）]\s*(.+?)\s*$/.exec(name);
  if (!match) return { term: null, name: name.trim() };
  return { term: `${match[1]} 學年度第 ${match[2]} 學期`, name: match[3] };
}

/** 電話號碼的 tel: 連結，台灣的區碼 0 換成 +886 */
export function telHref(phone) {
  const number = phone.replace(/[^\d+]/g, '');
  return `tel:${number.replace(/^0/, '+886')}`;
}

export function fileSizeText(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
