import { gqlError } from '../lib/errors.js';

const TITLE = 'title 不可為空，且不可超過 200 字元';
const CONTENT = '內容不可超過 2 MB';

const CONSTRAINT_MESSAGES = {
  users_username_check: 'username 須為 3 到 50 個英數字、點、底線或連字號',
  pages_slug_check: 'slug 僅可使用小寫英數字與連字號，且不可超過 100 字元',
  pages_title_check: TITLE,
  pages_source_check: CONTENT,
  announcements_title_check: TITLE,
  announcements_content_check: CONTENT,
  announcements_unit_check: '公告單位不可超過 100 字元',
  announcements_contact_person_check: '聯絡人不可超過 100 字元',
  announcements_extension_check: '分機不可超過 50 字元',
  photos_alt_check: 'alt 不可為空，且不可超過 500 字元',
  albums_name_check: '相簿名稱不可為空，且不可超過 100 字元',
  photos_album_id_fkey: '找不到這本相簿',
  documents_stored_name_check: '不支援此文件格式',
  documents_title_check: TITLE,
  documents_category_check: 'category 不可超過 100 字元',
  documents_filename_check: '檔名不可超過 255 字元',
  documents_size_check: '文件不可超過 20 MB',
};

const INVALID_VALUE_MESSAGES = {
  '22P02': '資料格式不正確', // 例如非數字的 id
  22003: '數值超出範圍',
  22007: '時間格式不正確',
  22008: '時間超出範圍',
};

/** 把資料庫拒絕的值轉成使用者看得懂的錯誤；其他錯誤維持原樣，由 Yoga 遮蔽 */
export function translateDbError(error) {
  const message = error.code === '23514' || error.code === '23503'
    ? CONSTRAINT_MESSAGES[error.constraint]
    : INVALID_VALUE_MESSAGES[error.code];
  return message ? gqlError(message, 'BAD_USER_INPUT') : error;
}
