import { withPermission } from '../lib/guards.js';

export const navigationTypeDefs = /* GraphQL */ `
  "頁首選單可以連到的網站功能"
  enum NavService {
    "首頁 /"
    HOME
    ANNOUNCEMENTS
    PHOTOS
    DOCUMENTS
  }

  "選單上的頁面，只有連結需要的欄位"
  type NavPage {
    slug: String!
    title: String!
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
  SELECT n.menu, n.service, p.slug, p.title
  FROM navigation_links n LEFT JOIN pages p ON p.slug = n.page_slug
  ORDER BY n.menu, n.position
`;

/** 整份取代頁首選單；navigation 是 { utility, main }，每項是 { page } 或 { service } */
export async function writeNavigation(db, navigation) {
  const links = Object.entries(MENUS).flatMap(([menu, key]) => navigation[key].map(({ page = null, service = null }, position) => (
    { menu, position, page_slug: page, service }
  )));
  await db.prepare('SELECT save_navigation($1)').run(JSON.stringify(links));
}

/** 目前的頁首選單 { utility, main }，每項是 { service, page: { slug, title } | null } */
export async function readNavigation(db) {
  const result = { utility: [], main: [] };
  for (const { menu, service, slug, title } of await db.prepare(LIST).all()) {
    result[MENUS[menu]].push({ service, page: slug ? { slug, title } : null });
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
