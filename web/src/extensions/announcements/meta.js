/** 擴充功能的基本資料：伺服器（src/extensions）與網站共用，不能引用 .vue 等只有網站才能載入的檔案。欄位說明見 docs/extensions.md */
export default {
  key: 'ANNOUNCEMENTS',
  label: '最新消息',
  description: '發布公告，可預約發布時間，首頁顯示最新的幾則。',
  path: '/announcements',
  order: 10,
  system: true,
  permissions: { MANAGE_ANNOUNCEMENTS: '公告' },
};
