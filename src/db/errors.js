import { gqlError } from '../lib/errors.js';

/** 約束名稱對應 schema.sql；共用型別（DOMAIN）的約束名稱是「型別名稱_check」 */
const CONSTRAINT_MESSAGES = {
  title_text_check: 'title 不可為空，且不可超過 200 字元',
  content_text_check: '內容不可超過 2 MB',
  image_path_check: '圖片網址必須是上傳後取得的網址',
  theme_colors_check: '主題顏色必須是 #rrggbb 格式',
  users_username_check: 'username 須為 3 到 50 個英數字、點、底線或連字號',
  pages_pkey: '這個網址已經有頁面了，請換一個',
  pages_slug_check: 'slug 僅可使用小寫英數字與連字號，且不可超過 100 字元',
  announcements_unit_check: '公告單位不可超過 100 字元',
  announcements_contact_person_check: '聯絡人不可超過 100 字元',
  announcements_extension_check: '分機不可超過 50 字元',
  photos_alt_check: 'alt 不可為空，且不可超過 500 字元',
  albums_name_check: '相簿名稱不可為空，且不可超過 100 字元',
  photos_album_id_fkey: '找不到這本相簿',
  documents_stored_name_check: '不支援此文件格式',
  documents_category_check: 'category 不可超過 100 字元',
  documents_filename_check: '檔名不可超過 255 字元',
  documents_size_check: '文件不可超過 20 MB',
  site_config_site_title_check: '網站標題不可為空，且不可超過 100 字元',
  site_config_logo_text_check: '標誌旁的名稱不可超過 50 字元',
  site_config_campus_alt_check: '主視覺圖片的說明不可為空，且不可超過 200 字元',
  site_config_hero_prefix_check: '首頁標題上方的文字不可超過 50 字元',
  site_config_hero_title_check: '首頁標題不可為空，且不可超過 50 字元',
  site_config_hero_text_check: '首頁說明文字不可超過 200 字元',
  site_config_footer_title_check: '頁尾標題不可為空，且不可超過 100 字元',
  site_config_phone_check: '電話只能有數字、括號、加號、空格與連字號，且不可超過 50 字元',
  site_config_extension_check: '電話分機不可超過 100 字元',
  site_config_hours_check: '開放時間不可超過 200 字元',
  site_config_teachers_check: '聯絡老師最多 10 位',
  site_config_teacher_name_check: '老師的姓名不可為空，且不可超過 100 字元',
  site_config_teacher_email_check: '老師的電子郵件格式不正確',
  site_config_teacher_extension_check: '老師的分機不可超過 50 字元',
  navigation_links_target_check: '每個連結要指定 page 或 service 其中一個',
  navigation_links_page_slug_fkey: '頁首選單裡有不存在的頁面',
  navigation_links_page_slug_key: '同一個頁面或功能只能出現一次',
  navigation_links_service_key: '同一個頁面或功能只能出現一次',
  extensions_key_check: '擴充功能的代號只能是英文大寫、數字與底線',
};

const INVALID_VALUE_MESSAGES = {
  '22P02': '資料格式不正確', // 例如非數字的 id
  22003: '數值超出範圍',
  22007: '時間格式不正確',
  22008: '時間超出範圍',
};

/** 把資料庫拒絕的值轉成使用者看得懂的錯誤；其他錯誤維持原樣，由 Yoga 遮蔽 */
export function translateDbError(error) {
  const message = ['23514', '23503', '23505'].includes(error.code)
    ? CONSTRAINT_MESSAGES[error.constraint]
    : INVALID_VALUE_MESSAGES[error.code];
  return message ? gqlError(message, 'BAD_USER_INPUT') : error;
}
