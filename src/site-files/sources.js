// 網站資料的來源：上傳的 ZIP 檔。提供 { paths, read(path) }，路徑以 / 分隔，相對於網站資料的最外層
import { open, stat } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { readZipIndex, siteFilePaths } from '../../web/src/zipIndex.js';
import { fail } from '../lib/errors.js';

function checked(names) {
  try {
    return siteFilePaths(names);
  } catch (error) {
    return fail(error.message);
  }
}

/** ZIP 檔；用完要呼叫 close() */
export async function zipSource(file) {
  const handle = await open(file, 'r');
  try {
    const { size } = await stat(file);
    const readAt = async (position, length) => {
      if (position < 0 || position + length > size) fail('這不是 ZIP 檔，或檔案已損毀');
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, position);
      return buffer;
    };
    let entries;
    try {
      entries = await readZipIndex(size, readAt);
    } catch (error) {
      fail(error.message);
    }
    const byName = new Map(entries.map((entry) => [entry.name, entry]));
    const paths = checked(entries.map((entry) => entry.name));
    return {
      paths: [...paths.keys()],
      async read(path) {
        const entry = byName.get(paths.get(path));
        const header = await readAt(entry.offset, 30);
        if (header.readUInt32LE(0) !== 0x04034b50) fail('ZIP 檔已損毀');
        const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
        const data = await readAt(start, entry.compressedSize);
        if (entry.method === 0) return data;
        if (entry.method === 8) return inflateRawSync(data);
        return fail(`「${path}」使用不支援的壓縮方式，請用一般的 ZIP 壓縮`);
      },
      close: () => handle.close(),
    };
  } catch (error) {
    await handle.close();
    throw error;
  }
}
