// 產生 ZIP 檔（靜態網站的下載）。檔案先算好 CRC 與大小再寫標頭，不用資料描述區，各種解壓縮工具都能開；
// 超過 4 GB 或 65535 個檔案時使用 ZIP64
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { crc32, deflateRawSync } from 'node:zlib';

const MAX32 = 0xffffffff;
const MAX16 = 0xffff;
const UTF8_NAMES = 0x0800;

/** MS-DOS 格式的時間與日期（當地時間，精確到 2 秒） */
function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

async function fileCrc(path) {
  let crc = 0;
  for await (const chunk of createReadStream(path)) crc = crc32(chunk, crc);
  return crc;
}

/** ZIP64 額外欄位；values 是超過 32 位元、要放在這裡的數值 */
function zip64Extra(values) {
  if (!values.length) return Buffer.alloc(0);
  const extra = Buffer.alloc(4 + values.length * 8);
  extra.writeUInt16LE(0x0001, 0);
  extra.writeUInt16LE(values.length * 8, 2);
  values.forEach((value, i) => extra.writeBigUInt64LE(BigInt(value), 4 + i * 8));
  return extra;
}

function localHeader(entry, stamp) {
  const large = entry.size >= MAX32 || entry.compressedSize >= MAX32;
  const extra = large ? zip64Extra([entry.size, entry.compressedSize]) : Buffer.alloc(0);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(large ? 45 : 20, 4);
  header.writeUInt16LE(UTF8_NAMES, 6);
  header.writeUInt16LE(entry.method, 8);
  header.writeUInt16LE(stamp.time, 10);
  header.writeUInt16LE(stamp.day, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(large ? MAX32 : entry.compressedSize, 18);
  header.writeUInt32LE(large ? MAX32 : entry.size, 22);
  header.writeUInt16LE(entry.nameBytes.length, 26);
  header.writeUInt16LE(extra.length, 28);
  return Buffer.concat([header, entry.nameBytes, extra]);
}

function centralHeader(entry, stamp) {
  const over = (value) => value >= MAX32;
  const extra = zip64Extra([entry.size, entry.compressedSize, entry.offset].filter(over));
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(45, 4);
  header.writeUInt16LE(extra.length ? 45 : 20, 6);
  header.writeUInt16LE(UTF8_NAMES, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt16LE(stamp.time, 12);
  header.writeUInt16LE(stamp.day, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(over(entry.compressedSize) ? MAX32 : entry.compressedSize, 20);
  header.writeUInt32LE(over(entry.size) ? MAX32 : entry.size, 24);
  header.writeUInt16LE(entry.nameBytes.length, 28);
  header.writeUInt16LE(extra.length, 30);
  header.writeUInt32LE(over(entry.offset) ? MAX32 : entry.offset, 42);
  return Buffer.concat([header, entry.nameBytes, extra]);
}

function endRecords(count, directorySize, directoryOffset) {
  const needs64 = count > MAX16 || directorySize >= MAX32 || directoryOffset >= MAX32;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Math.min(count, MAX16), 8);
  end.writeUInt16LE(Math.min(count, MAX16), 10);
  end.writeUInt32LE(Math.min(directorySize, MAX32), 12);
  end.writeUInt32LE(Math.min(directoryOffset, MAX32), 16);
  if (!needs64) return end;

  const record = Buffer.alloc(56);
  record.writeUInt32LE(0x06064b50, 0);
  record.writeBigUInt64LE(44n, 4);
  record.writeUInt16LE(45, 12);
  record.writeUInt16LE(45, 14);
  record.writeBigUInt64LE(BigInt(count), 24);
  record.writeBigUInt64LE(BigInt(count), 32);
  record.writeBigUInt64LE(BigInt(directorySize), 40);
  record.writeBigUInt64LE(BigInt(directoryOffset), 48);
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeBigUInt64LE(BigInt(directoryOffset + directorySize), 8);
  locator.writeUInt32LE(1, 16);
  return Buffer.concat([record, locator, end]);
}

/**
 * entries：{ name, data }（記憶體裡的內容，會壓縮）或 { name, path }（磁碟上的檔案，直接存入）。
 * 回傳 { length, stream() }：length 是整個 ZIP 的大小，stream() 依序產生內容
 */
export async function createZip(entries, date = new Date()) {
  const stamp = dosDateTime(date);
  const prepared = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name);
    let item;
    if (entry.path) {
      const { size } = await stat(entry.path);
      item = { nameBytes, path: entry.path, method: 0, size, compressedSize: size, crc: await fileCrc(entry.path) };
    } else {
      const deflated = deflateRawSync(entry.data);
      const smaller = deflated.length < entry.data.length;
      item = {
        nameBytes,
        data: smaller ? deflated : entry.data,
        method: smaller ? 8 : 0,
        size: entry.data.length,
        compressedSize: smaller ? deflated.length : entry.data.length,
        crc: crc32(entry.data),
      };
    }
    item.offset = offset;
    item.header = localHeader(item, stamp);
    offset += item.header.length + item.compressedSize;
    prepared.push(item);
  }

  const directory = Buffer.concat(prepared.map((item) => centralHeader(item, stamp)));
  const end = endRecords(prepared.length, directory.length, offset);

  return {
    length: offset + directory.length + end.length,
    async* stream() {
      for (const item of prepared) {
        yield item.header;
        if (item.data) yield item.data;
        else yield* createReadStream(item.path);
      }
      yield directory;
      yield end;
    },
  };
}
