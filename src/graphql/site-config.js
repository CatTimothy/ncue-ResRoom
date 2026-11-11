import { snakeizeKeys } from '../db/index.js';
import { withPermission } from '../lib/guards.js';

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

  "訪客沒有自己選擇時使用的主題；SYSTEM 依訪客裝置的設定"
  enum ThemeMode {
    SYSTEM
    LIGHT
    DARK
  }

  "主題顏色，格式為 #rrggbb；null 表示使用網站內建的顏色"
  type ThemeColors {
    background: String
    surface: String
    text: String
    primary: String
    accent: String
  }

  input ThemeColorsInput {
    background: String
    surface: String
    text: String
    primary: String
    accent: String
  }

  "全站共用的設定。圖片網址是 null 時使用網站內建的圖片"
  type SiteConfig {
    "瀏覽器分頁的標題"
    siteTitle: String!
    "頁首標誌旁的名稱；可留空"
    logoText: String!
    faviconUrl: String
    logoUrl: String
    "首頁主視覺的圖片"
    campusUrl: String
    campusAlt: String!
    "首頁標題上方的小字；可留空"
    heroPrefix: String!
    heroTitle: String!
    "首頁標題下方的文字；可留空"
    heroText: String!
    footerTitle: String!
    phone: String!
    "電話後面的文字，例如分機；可留空"
    extension: String!
    "開放時間；可留空"
    hours: String!
    teachers: [Teacher!]!
    defaultTheme: ThemeMode!
    lightTheme: ThemeColors!
    darkTheme: ThemeColors!
  }

  "欄位同 SiteConfig；圖片網址要用 uploadContentImage 取得"
  input SiteConfigInput {
    siteTitle: String!
    logoText: String!
    faviconUrl: String
    logoUrl: String
    campusUrl: String
    campusAlt: String!
    heroPrefix: String!
    heroTitle: String!
    heroText: String!
    footerTitle: String!
    phone: String!
    extension: String!
    hours: String!
    teachers: [TeacherInput!]!
    defaultTheme: ThemeMode!
    lightTheme: ThemeColorsInput!
    darkTheme: ThemeColorsInput!
  }

  extend type Query {
    siteConfig: SiteConfig!
  }

  extend type Mutation {
    "整份取代；格式由資料庫檢查"
    saveSiteConfig(input: SiteConfigInput!): SiteConfig!
  }
`;

/** 直接寫入的欄位；teachers 與主題顏色需要先整理，另外處理 */
const COLUMNS = [
  'site_title', 'logo_text', 'favicon_url', 'logo_url', 'campus_url', 'campus_alt',
  'hero_prefix', 'hero_title', 'hero_text', 'footer_title', 'phone', 'extension', 'hours', 'default_theme',
];

// 整份設定以 JSON 傳入，由資料庫轉成資料列；文字欄位的頭尾空白由 trim_columns 觸發程序去除
const SAVE = `
  UPDATE site_config c SET
    ${COLUMNS.map((column) => `${column} = r.${column}`).join(',\n    ')},
    teachers = (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name', trim_text(t.item ->> 'name'),
        'email', trim_text(t.item ->> 'email'),
        'extension', trim_text(t.item ->> 'extension')
      ) ORDER BY t.n), '[]')
      FROM jsonb_array_elements(r.teachers) WITH ORDINALITY AS t (item, n)
    ),
    light_theme = jsonb_strip_nulls($1::jsonb -> 'light_theme'),
    dark_theme = jsonb_strip_nulls($1::jsonb -> 'dark_theme')
  FROM jsonb_populate_record(NULL::site_config, $1::jsonb - 'light_theme' - 'dark_theme') AS r
  RETURNING c.*
`;

export function createSiteConfigResolvers({ db }) {
  return {
    Query: {
      siteConfig: () => db.prepare('SELECT * FROM site_config').get(),
    },

    Mutation: withPermission('MANAGE_SITE_CONFIG', {
      saveSiteConfig: (_, { input }) => db.prepare(SAVE).get(JSON.stringify(snakeizeKeys(input))),
    }),
  };
}
