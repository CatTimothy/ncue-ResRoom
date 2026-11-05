import { fail } from '../lib/errors.js';
import { withPermission } from '../lib/guards.js';

const EMAIL = /^[^\s@]+@[^\s@]+$/;
const PHONE = /^[0-9()+ -]*[0-9][0-9()+ -]*$/;
const MAX_TEACHERS = 10;
const MAX_NAME_LENGTH = 100;
const MAX_EXTENSION_LENGTH = 50;

/** GraphQL 欄位對應資料表的 key。新增設定時：加在這裡與下方的型別，並在 schema.sql 寫入預設值 */
const KEYS = {
  footerTitle: 'footer_title',
  phone: 'phone',
  extension: 'extension',
  hours: 'hours',
  teachers: 'teachers',
  copyright: 'copyright',
};

export const siteConfigTypeDefs = /* GraphQL */ `
  "頁尾列出的老師"
  type Teacher {
    name: String!
    email: String!
    "可留空"
    extension: String!
  }

  input TeacherInput {
    name: String!
    email: String!
    extension: String!
  }

  "全站共用的設定，目前是頁尾的聯絡資訊"
  type SiteConfig {
    footerTitle: String!
    phone: String!
    "電話後面的文字，例如分機；可留空"
    extension: String!
    "開放時間；可留空"
    hours: String!
    teachers: [Teacher!]!
    "顯示在 Copyright © 年份 後面的名稱"
    copyright: String!
  }

  extend type Query {
    siteConfig: SiteConfig!
  }

  extend type Mutation {
    saveSiteConfig(
      footerTitle: String!
      phone: String!
      extension: String!
      hours: String!
      teachers: [TeacherInput!]!
      copyright: String!
    ): SiteConfig!
  }
`;

/** 資料表的列轉成 GraphQL 的欄位 */
function toConfig(rows) {
  const values = new Map(rows.map(({ key, value }) => [key, value]));
  return Object.fromEntries(Object.entries(KEYS).map(([field, key]) => [field, values.get(key)]));
}

function cleanTeachers(teachers) {
  if (teachers.length > MAX_TEACHERS) fail(`老師最多 ${MAX_TEACHERS} 位`);
  return teachers.map((teacher) => {
    const name = teacher.name.trim();
    const email = teacher.email.trim();
    const extension = teacher.extension.trim();
    if (email.length > 254 || !EMAIL.test(email)) fail(`電子郵件格式不正確：${email}`);
    if (!name || name.length > MAX_NAME_LENGTH) fail(`${email} 的姓名不可為空，且不可超過 ${MAX_NAME_LENGTH} 字元`);
    if (extension.length > MAX_EXTENSION_LENGTH) fail(`${email} 的分機不可超過 ${MAX_EXTENSION_LENGTH} 字元`);
    return { name, email, extension };
  });
}

function cleanConfig({ footerTitle, phone, extension, hours, teachers, copyright }) {
  const config = {
    footerTitle: footerTitle.trim(),
    phone: phone.trim(),
    extension: extension.trim(),
    hours: hours.trim(),
    teachers: cleanTeachers(teachers),
    copyright: copyright.trim(),
  };
  if (!config.footerTitle || config.footerTitle.length > 100) fail('標題不可為空，且不可超過 100 字元');
  if (!PHONE.test(config.phone) || config.phone.length > 50) fail('電話只能有數字、括號、加號、空格與連字號，且不可超過 50 字元');
  if (config.extension.length > 100) fail('分機不可超過 100 字元');
  if (config.hours.length > 200) fail('開放時間不可超過 200 字元');
  if (!config.copyright || config.copyright.length > 100) fail('版權名稱不可為空，且不可超過 100 字元');
  return config;
}

export function createSiteConfigResolvers({ db }) {
  return {
    Query: {
      siteConfig: async () => toConfig(await db.prepare('SELECT key, value FROM site_config').all()),
    },

    Mutation: withPermission('MANAGE_SITE_CONFIG', {
      async saveSiteConfig(_, input) {
        const config = cleanConfig(input);
        const values = Object.fromEntries(Object.entries(KEYS).map(([field, key]) => [key, config[field]]));
        // 同一個語句寫入所有設定，不會只存到一半
        return toConfig(await db.prepare(`
          INSERT INTO site_config (key, value)
          SELECT key, value FROM jsonb_each($1::jsonb)
          ON CONFLICT (key) DO UPDATE SET value = excluded.value
          RETURNING key, value
        `).all(JSON.stringify(values)));
      },
    }),
  };
}
