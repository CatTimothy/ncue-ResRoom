import { EXTENSIONS } from '../extensions/index.js';
import { enabledExtensionKeys } from '../extensions/state.js';
import { withPermission } from '../lib/guards.js';

/** 選單可以連到的網站功能：首頁與每個擴充功能 */
export const NAV_SERVICES = ['HOME', ...EXTENSIONS.map(({ key }) => key)];

export const navigationTypeDefs = /* GraphQL */ `
  "頁首選單可以連到的網站功能：HOME 是首頁 /，其他是擴充功能（見 Extension）"
  enum NavService {
    ${NAV_SERVICES.join(' ')}
  }

  "選單上的頁面，只有連結需要的欄位"
  type NavPage {
    slug: String!
    title: String!
    "true 時網址在第一層，否則在 /pages 底下"
    root: Boolean!
  }

  "頁首選單的連結：page 與 service 只會有一個"
  type NavLink {
    page: NavPage
    service: NavService
  }

  "page 是頁面的 slug；page 與 service 擇一提供"
  input NavLinkInput {
    page: String
    service: NavService
  }

  "頁首選單，依畫面上的順序"
  type Navigation {
    "頁首上方較小的一列"
    utility: [NavLink!]!
    main: [NavLink!]!
  }

  input NavigationInput {
    utility: [NavLinkInput!]!
    main: [NavLinkInput!]!
  }

  extend type Query {
    navigation: Navigation!
  }

  extend type Mutation {
    "整份取代；同一個頁面或功能只能出現一次，沒有列出的就不在選單上。格式由資料庫檢查"
    saveNavigation(input: NavigationInput!): Navigation!
  }
`;

const MENUS = { UTILITY: 'utility', MAIN: 'main' };

const LIST = `
  SELECT n.menu, n.service, p.slug, p.title, p.root
  FROM navigation_links n LEFT JOIN pages p ON p.slug = n.page_slug
  ORDER BY n.menu, n.position
`;

/**
 * 整份取代頁首選單；navigation 是 { utility, main }，每項是 { page } 或 { service }。
 * 停用中的擴充功能不在畫面上，原本的連結接在同一列的最後保留下來
 */
export async function writeNavigation(db, navigation) {
  const enabled = await enabledExtensionKeys(db);
  const listed = new Set([...navigation.utility, ...navigation.main].map((link) => link.service).filter(Boolean));
  const hidden = (await db.prepare('SELECT menu, service FROM navigation_links WHERE service IS NOT NULL ORDER BY position').all())
    .filter(({ service }) => service !== 'HOME' && !enabled.has(service) && !listed.has(service));
  const links = Object.entries(MENUS).flatMap(([menu, key]) => [
    ...navigation[key],
    ...hidden.filter((link) => link.menu === menu).map(({ service }) => ({ service })),
  ].map(({ page = null, service = null }, position) => ({ menu, position, page_slug: page, service })));
  await db.prepare('SELECT save_navigation($1)').run(JSON.stringify(links));
}

/**
 * 目前的頁首選單 { utility, main }，每項是 { service, page: { slug, title } | null }。
 * 停用或已移除的擴充功能不列出，資料庫裡的連結保留，重新啟用時回到原本的位置
 */
export async function readNavigation(db) {
  const enabled = await enabledExtensionKeys(db);
  const result = { utility: [], main: [] };
  for (const { menu, service, slug, title, root } of await db.prepare(LIST).all()) {
    if (service && service !== 'HOME' && !enabled.has(service)) continue;
    result[MENUS[menu]].push({ service, page: slug ? { slug, title, root } : null });
  }
  return result;
}

export function createNavigationResolvers({ db }) {
  const navigation = () => readNavigation(db);

  return {
    Query: { navigation },

    Mutation: withPermission('MANAGE_SITE_CONFIG', {
      async saveNavigation(_, { input }) {
        await writeNavigation(db, input);
        return navigation();
      },
    }),
  };
}
