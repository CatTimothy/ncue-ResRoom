/** 把搜尋字串視為日期；不是日期時回傳 null。民國年與西元年都接受 */
function parseDate(query) {
  const onlyMonth = /^\d{1,2}\s*月$/.test(query);
  const parts = query
    .replace(/日$/, '')
    .split(/[-/.／－年月\s]+/)
    .filter(Boolean);
  if (!parts.length || parts.length > 3 || !parts.every((part) => /^\d+$/.test(part))) return null;

  const numbers = parts.map(Number);
  let year = null;
  let month = null;
  let day = null;
  if (parts.length === 3) [year, month, day] = numbers;
  else if (parts.length === 2) {
    if (parts[0].length >= 3) [year, month] = numbers;
    else [month, day] = numbers;
  } else if (onlyMonth) [month] = numbers;
  else if (parts[0].length >= 3) [year] = numbers;
  else return null;

  if (month !== null && (month < 1 || month > 12)) return null;
  if (day !== null && (day < 1 || day > 31)) return null;
  if (year !== null && year < 1000) year += 1911;
  return { year, month, day };
}

/** 回傳 searchCondition 需要的四個參數：文字、年、月、日 */
export function searchParams(search) {
  const text = search?.trim() || null;
  const date = text && parseDate(text);
  return [text, date?.year ?? null, date?.month ?? null, date?.day ?? null];
}

/** 標題符合，或台灣時區的發布日期符合。使用參數 $2 到 $5；欄位名稱只能傳入程式內的固定值 */
export function searchCondition(titleColumn) {
  const local = "(published_at AT TIME ZONE 'Asia/Taipei')";
  return `(
    $2::text IS NULL
    OR strpos(lower(${titleColumn}), lower($2)) > 0
    OR (
      ($3::int IS NOT NULL OR $4::int IS NOT NULL OR $5::int IS NOT NULL)
      AND ($3::int IS NULL OR EXTRACT(YEAR FROM ${local}) = $3)
      AND ($4::int IS NULL OR EXTRACT(MONTH FROM ${local}) = $4)
      AND ($5::int IS NULL OR EXTRACT(DAY FROM ${local}) = $5)
    )
  )`;
}

/** 分頁：limit 是參數 $n，offset 是 $(n+1)。單次最多 100 筆 */
export const paging = (n) => `LIMIT LEAST(GREATEST($${n}::int, 1), 100) OFFSET GREATEST($${n + 1}::int, 0)`;

/** 已到發布時間，或參數 $n（是否已登入）為真 */
export const visible = (n, column = 'published_at') => `($${n}::boolean OR ${column} <= now())`;
