// 讀出 ZIP 的檔案清單（中央目錄）。瀏覽器匯入前的摘要與伺服器的匯入共用，所以只用 DataView、TextDecoder 與 BigInt。
// readAt(offset, length) 回傳 Promise<Uint8Array>；支援 ZIP64。沒有標示 UTF-8 的檔名（舊版 Windows 壓縮）先試 UTF-8，不是的話當作 Big5

const MAX32 = 0xffffffff;
const NOT_ZIP = '這不是 ZIP 檔，或檔案已損毀。';

const view = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function decodeName(bytes, utf8) {
  if (!utf8) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder('big5').decode(bytes);
    }
  }
  return new TextDecoder().decode(bytes);
}

/** 回傳 [{ name, method, compressedSize, size, offset }]，offset 是本地標頭的位置；資料夾不列出 */
export async function readZipIndex(size, readAt) {
  const tailLength = Math.min(size, 22 + 0xffff);
  const tail = await readAt(size - tailLength, tailLength);
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (view(tail).getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error(NOT_ZIP);

  const record = view(tail);
  let count = record.getUint16(end + 10, true);
  let directorySize = record.getUint32(end + 12, true);
  let directoryOffset = record.getUint32(end + 16, true);
  if (count === 0xffff || directorySize === MAX32 || directoryOffset === MAX32) {
    // ZIP64：結尾記錄前面的定位器指出 ZIP64 結尾記錄的位置
    const locator = end - 20;
    if (locator < 0 || record.getUint32(locator, true) !== 0x07064b50) throw new Error(NOT_ZIP);
    const zip64 = view(await readAt(Number(record.getBigUint64(locator + 8, true)), 56));
    if (zip64.getUint32(0, true) !== 0x06064b50) throw new Error(NOT_ZIP);
    count = Number(zip64.getBigUint64(32, true));
    directorySize = Number(zip64.getBigUint64(40, true));
    directoryOffset = Number(zip64.getBigUint64(48, true));
  }

  const directory = await readAt(directoryOffset, directorySize);
  const data = view(directory);
  const entries = [];
  let position = 0;
  for (let i = 0; i < count; i++) {
    if (position + 46 > directory.length || data.getUint32(position, true) !== 0x02014b50) throw new Error(NOT_ZIP);
    const flags = data.getUint16(position + 8, true);
    const nameLength = data.getUint16(position + 28, true);
    const extraLength = data.getUint16(position + 30, true);
    const commentLength = data.getUint16(position + 32, true);
    const entry = {
      name: decodeName(directory.subarray(position + 46, position + 46 + nameLength), Boolean(flags & 0x0800)).replace(/\\/g, '/'),
      method: data.getUint16(position + 10, true),
      size: data.getUint32(position + 24, true),
      compressedSize: data.getUint32(position + 20, true),
      offset: data.getUint32(position + 42, true),
    };
    // ZIP64 額外欄位依序放超過 32 位元的大小、壓縮後大小、位置
    let extra = position + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = data.getUint16(extra, true);
      const length = data.getUint16(extra + 2, true);
      if (id === 0x0001) {
        let field = extra + 4;
        for (const key of ['size', 'compressedSize', 'offset']) {
          if (entry[key] === MAX32 && field + 8 <= extra + 4 + length) {
            entry[key] = Number(data.getBigUint64(field, true));
            field += 8;
          }
        }
      }
      extra += 4 + length;
    }
    if (!entry.name.endsWith('/')) entries.push(entry);
    position = extraEnd + commentLength;
  }
  return entries;
}

// 網站資料（見 src/site-files）第一層會有的檔案與資料夾；整包放在一個資料夾裡壓縮時，去掉那一層
const SITE_ROOT_ENTRIES = ['site-config.json', 'navigation.json', 'visits.json', 'pages', 'announcements', 'albums', 'documents', 'images', 'branding'];
const IGNORED = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/i;

/** 檔名清單整理成網站資料裡的路徑：忽略系統產生的檔案，去掉共同的最外層資料夾；回傳 Map(路徑 → 原本的名稱) */
export function siteFilePaths(names) {
  const usable = names.filter((name) => !IGNORED.test(name));
  const isSiteRoot = (paths) => paths.some((path) => SITE_ROOT_ENTRIES.includes(path.split('/')[0]));
  let strip = '';
  if (!isSiteRoot(usable)) {
    const first = usable[0]?.split('/')[0];
    if (first && usable.every((name) => name.startsWith(`${first}/`))) strip = `${first}/`;
  }
  const paths = new Map(usable.map((name) => [name.slice(strip.length), name]));
  if (!isSiteRoot([...paths.keys()])) throw new Error('這不是網站資料的檔案：裡面沒有 pages、documents、site-config.json 等網站資料。');
  return paths;
}

const IMAGE = /\.(jpe?g|png|gif|webp|avif|tiff?)$/i;

/** 匯入前顯示的摘要：各類內容的數量 */
export function siteSummary(paths) {
  const list = [...paths];
  const albums = new Set(list.filter((path) => /^albums\/[^/]+\//.test(path)).map((path) => path.split('/')[1]));
  return {
    pages: list.filter((path) => /^pages\/[^/]+\.(md|markdown|html?)$/i.test(path)).length,
    announcements: list.filter((path) => /^announcements\/[^/]+\.md$/i.test(path)).length,
    albums: albums.size,
    photos: list.filter((path) => /^albums\/[^/]+\/[^/]+$/.test(path) && IMAGE.test(path)).length,
    documents: list.filter((path) => path.startsWith('documents/') && path !== 'documents/documents.json').length,
  };
}
