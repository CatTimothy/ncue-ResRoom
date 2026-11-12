/** 擴充功能的基本資料，見 ../announcements/meta.js */
export default {
  key: 'PHOTOS',
  label: '活動剪影',
  description: '以相簿整理活動照片，首頁顯示最新的相簿。',
  path: '/photos',
  order: 20,
  system: true,
  permissions: { MANAGE_ALBUMS: '相簿與照片' },
};
