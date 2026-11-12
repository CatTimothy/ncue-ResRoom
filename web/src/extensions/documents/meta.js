/** 擴充功能的基本資料，見 ../announcements/meta.js */
export default {
  key: 'DOCUMENTS',
  label: '文件下載',
  description: '上傳申請表等文件，依分類列出供訪客下載。',
  path: '/documents',
  order: 30,
  system: true,
  permissions: { MANAGE_DOCUMENTS: '文件' },
};
