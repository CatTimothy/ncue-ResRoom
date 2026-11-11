// 網站資料的封存檔格式（tar，ustar）。只處理這個網站自己輸出的內容：檔名都是短的 ASCII，只有一般檔案
import { fail } from './errors.js';

const BLOCK = 512;
const MAX_SIZE = 0o77777777777; // 大小欄位是 11 位八進位數字，約 8 GB

const octal = (value, length) => `${value.toString(8).padStart(length - 1, '0')}\0`;
const paddingOf = (size) => (BLOCK - (size % BLOCK)) % BLOCK;
const checksum = (header) => header.reduce((sum, byte) => sum + byte, 0);

/** 一個檔案的標頭 */
export function tarHeader(name, size, mtime = Date.now()) {
  if (Buffer.byteLength(name) > 100) throw new Error(`檔名太長：${name}`);
  if (size > MAX_SIZE) throw new Error(`檔案太大：${name}`);
  const header = Buffer.alloc(BLOCK);
  header.write(name, 0, 100);
  header.write(octal(0o644, 8), 100);
  header.write(octal(0, 8), 108);
  header.write(octal(0, 8), 116);
  header.write(octal(size, 12), 124);
  header.write(octal(Math.floor(mtime / 1000), 12), 136);
  header.write(' '.repeat(8), 148); // 計算檢查碼時，檢查碼欄位視為空白
  header.write('0', 156); // 一般檔案
  header.write('ustar\x0000', 257);
  header.write(`${checksum(header).toString(8).padStart(6, '0')}\0 `, 148);
  return header;
}

/** 檔案內容後補到 512 位元組的倍數 */
export const tarPadding = (size) => Buffer.alloc(paddingOf(size));

/** 封存檔的結尾：兩個全是 0 的區塊 */
export const TAR_END = Buffer.alloc(BLOCK * 2);

const field = (header, start, length) => {
  const raw = header.subarray(start, start + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? length : end).toString('utf8');
};

function parseHeader(header) {
  const stored = Number.parseInt(field(header, 148, 8).trim(), 8);
  header.fill(' ', 148, 156);
  if (stored !== checksum(header)) fail('檔案已損毀或不是網站資料的檔案');
  const size = Number.parseInt(field(header, 124, 12).trim() || '0', 8);
  if (!Number.isSafeInteger(size) || size < 0) fail('檔案已損毀或不是網站資料的檔案');
  const prefix = field(header, 345, 155);
  const name = field(header, 0, 100);
  const type = field(header, 156, 1);
  return { name: prefix ? `${prefix}/${name}` : name, size, isFile: type === '' || type === '0' };
}

/**
 * 依序讀出封存檔裡的檔案。每個一般檔案呼叫 onEntry(name, size)，回傳 { write(chunk), close() } 接收內容，
 * 或回傳 null 略過。write 回傳 Promise 時會等它完成再讀下一段，不會把整個上傳讀進記憶體。
 * 讀到一半出錯時不會中斷 stream，呼叫的地方仍可回應錯誤訊息
 */
export async function readTar(stream, onEntry) {
  let buffer = Buffer.alloc(0);
  let entry = null; // { remaining, padding, sink }
  try {
    for await (const chunk of stream.iterator({ destroyOnReturn: false })) {
      buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
      for (;;) {
        if (entry && entry.remaining > 0) {
          if (!buffer.length) break;
          const part = buffer.subarray(0, Math.min(entry.remaining, buffer.length));
          buffer = buffer.subarray(part.length);
          entry.remaining -= part.length;
          await entry.sink?.write(part);
        } else if (entry) {
          if (buffer.length < entry.padding) break;
          buffer = buffer.subarray(entry.padding);
          const { sink } = entry;
          entry = null;
          await sink?.close();
        } else {
          if (buffer.length < BLOCK) break;
          const header = Buffer.from(buffer.subarray(0, BLOCK));
          buffer = buffer.subarray(BLOCK);
          if (header.every((byte) => byte === 0)) return; // 封存檔結束；之後的補白不用讀
          const { name, size, isFile } = parseHeader(header);
          const sink = isFile ? await onEntry(name, size) : null;
          entry = { remaining: size, padding: paddingOf(size), sink };
        }
      }
    }
    fail('檔案不完整，可能沒有上傳完成');
  } finally {
    await entry?.sink?.close();
  }
}
