import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { rename, rm, writeFile } from 'node:fs/promises';
import { extname, join, parse, win32 } from 'node:path';
import sharp from 'sharp';
import { fail } from './errors.js';

// 網頁顯示用的壓縮版：長邊最多 1600 像素；同時去除 EXIF，避免拍攝地點等資訊外流
const DISPLAY_MAX_SIDE = 1600;
const DISPLAY_QUALITY = 80;

// sharp 的快取會讓檔案保持開啟，在 Windows 上會無法刪除照片
sharp.cache(false);

const IMAGE_EXTENSIONS = { jpeg: '.jpg', png: '.png', gif: '.gif', webp: '.webp', tiff: '.tiff' };
const UNSUPPORTED_IMAGE = '照片僅接受 JPEG、PNG、GIF、WebP、AVIF 或 TIFF';

/** 依檔案內容判斷格式，不信任副檔名；不支援時丟出說明實際格式的錯誤 */
async function imageExtension(bytes, name) {
  const brand = bytes.subarray(4, 12).toString('latin1');
  if (/^ftyp(heic|heix|hevc|hevx|mif1|msf1)/.test(brand)) {
    fail(`「${name}」實際上是 HEIC 格式（iPhone 常見），請先轉成 JPEG 再上傳`);
  }
  const { format, compression } = await sharp(bytes, { limitInputPixels: false }).metadata().catch(() => ({}));
  const ext = format === 'heif' && compression === 'av1' ? '.avif' : IMAGE_EXTENSIONS[format];
  return ext ?? fail(format && format !== 'svg' ? `「${name}」實際上是 ${format.toUpperCase()} 格式。${UNSUPPORTED_IMAGE}` : UNSUPPORTED_IMAGE);
}

/** 下載時的檔名：保留原名，但副檔名以實際格式為準 */
function downloadName(name, ext) {
  const base = win32.basename(name, extname(name)).replace(/[\p{Cc}]/gu, '').trim().slice(0, 200);
  return `${base || 'image'}${ext}`;
}

export function createStorage({ db, dataDir }) {
  const uploadsDir = join(dataDir, 'uploads');
  const displayDir = join(dataDir, 'display'); // 可由原始檔重新產生，不需要備份
  mkdirSync(uploadsDir, { recursive: true });
  mkdirSync(displayDir, { recursive: true });

  const pathOf = (storedName) => join(uploadsDir, storedName);
  const displayIdOf = (storedName) => parse(storedName).name;
  const displayPath = (id) => join(displayDir, `${id}.webp`);
  const displayPathOf = (storedName) => displayPath(displayIdOf(storedName));

  const remove = (storedName) => Promise.all([
    rm(pathOf(storedName), { force: true }),
    rm(displayPathOf(storedName), { force: true }),
  ]);

  async function createDisplay(storedName) {
    const target = displayPathOf(storedName);
    const temp = `${target}.${randomUUID()}.tmp`; // 同時有多個請求時，不會讀到寫到一半的檔案
    try {
      await sharp(pathOf(storedName), { animated: true, limitInputPixels: false })
        .rotate()
        .resize({ width: DISPLAY_MAX_SIDE, height: DISPLAY_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: DISPLAY_QUALITY })
        .toFile(temp);
      await rename(temp, target);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
    return target;
  }

  const displayUrlOf = ({ storedName }) => `/files/display/${displayIdOf(storedName)}.webp`;
  const removeFiles = (storedNames) => Promise.all(storedNames.map(remove));

  /** 寫入檔案後呼叫 insert 建立資料列；資料庫拒絕時會移除檔案 */
  async function save(bytes, ext, insert) {
    const storedName = `${randomUUID()}${ext}`;
    await writeFile(pathOf(storedName), bytes);
    try {
      return await insert(storedName);
    } catch (error) {
      await remove(storedName);
      throw error;
    }
  }

  /** 儲存上傳的圖片並產生壓縮版；insert 收到 (storedName, filename) */
  async function saveImage(file, insert) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const ext = await imageExtension(bytes, file.name);
    return save(bytes, ext, async (storedName) => {
      await createDisplay(storedName).catch((error) => {
        console.error(error);
        fail('無法讀取這張照片，檔案可能已損毀');
      });
      return insert(storedName, downloadName(file.name, ext));
    });
  }

  /** 清除沒有內容引用（見 schema.sql 的 image_references）的圖片；留 1 天緩衝，避免刪到還在編輯中的內容所用的圖片 */
  async function sweepContentImages() {
    const rows = await db.prepare(`
      DELETE FROM content_images ci
      WHERE ci.created_at < now() - interval '1 day'
        AND NOT EXISTS (SELECT 1 FROM image_references r WHERE strpos(r.text, split_part(ci.stored_name, '.', 1)) > 0)
      RETURNING ci.stored_name
    `).all();
    await removeFiles(rows.map((row) => row.storedName));
  }

  return {
    pathOf,
    displayPath,
    createDisplay,
    displayUrlOf,
    save,
    saveImage,
    removeFiles,

    /** 公告與頁面內文、網站設定用的圖片。順便清除不再使用的舊圖片，不必在每次儲存內容時都檢查 */
    async saveContentImage(file) {
      await sweepContentImages().catch((error) => console.error(error));
      return saveImage(file, async (storedName, filename) => {
        await db.prepare('INSERT INTO content_images (stored_name, filename) VALUES ($1, $2)').run(storedName, filename);
        return { url: displayUrlOf({ storedName }), name: parse(filename).name };
      });
    },

    urlOf: ({ storedName }) => `/files/${storedName}`,

    /** 刪除資料列與對應檔案。table 只能傳入程式內的固定名稱 */
    async deleteRow(table, id) {
      const row = await db.prepare(`DELETE FROM ${table} WHERE id = $1 RETURNING stored_name`).get(id);
      if (!row) return false;
      await remove(row.storedName);
      return true;
    },
  };
}
