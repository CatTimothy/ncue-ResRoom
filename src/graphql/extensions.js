import { EXTENSIONS } from '../extensions/index.js';
import { isExtensionEnabled } from '../extensions/state.js';
import { fail, gqlError } from '../lib/errors.js';
import { withPermission } from '../lib/guards.js';

export const extensionsTypeDefs = /* GraphQL */ `
  "擴充功能：最新消息、活動剪影等網站功能。停用時網址、選單連結與 API 都不提供，但資料會保留"
  type Extension {
    "英文大寫的代號，也是 NavService 的值"
    key: String!
    label: String!
    description: String!
    "第一層網址，例如 /announcements"
    path: String!
    "隨系統提供"
    system: Boolean!
    enabled: Boolean!
  }

  extend type Query {
    "所有擴充功能，依畫面上的順序；不需登入"
    extensions: [Extension!]!
  }

  extend type Mutation {
    "啟用時，若頁首選單沒有這項功能，加到主選單的最後"
    setExtensionEnabled(key: String!, enabled: Boolean!): Extension!
  }
`;

/** 停用的擴充功能：它的 Query 與 Mutation 欄位一律回傳錯誤 */
export function guardExtension(db, extension, resolvers) {
  const guard = (fields) => Object.fromEntries(Object.entries(fields).map(([name, resolve]) => [
    name,
    async (...args) => {
      if (!(await isExtensionEnabled(db, extension.key))) throw gqlError(`「${extension.label}」功能已停用`, 'EXTENSION_DISABLED');
      return resolve(...args);
    },
  ]));
  return {
    ...resolvers,
    ...(resolvers.Query && { Query: guard(resolvers.Query) }),
    ...(resolvers.Mutation && { Mutation: guard(resolvers.Mutation) }),
  };
}

export function createExtensionsResolvers({ db }) {
  async function list() {
    const rows = await db.prepare('SELECT key, enabled FROM extensions').all();
    const enabled = new Map(rows.map((row) => [row.key, row.enabled]));
    return EXTENSIONS.map(({ key, label, description, path, system }) => ({
      key, label, description, path, system, enabled: enabled.get(key) ?? true,
    }));
  }

  return {
    Query: { extensions: list },

    Mutation: withPermission('MANAGE_SITE_CONFIG', {
      async setExtensionEnabled(_, { key, enabled }) {
        if (!EXTENSIONS.some((extension) => extension.key === key)) fail('找不到這個擴充功能');
        await db.prepare('SELECT set_extension_enabled($1, $2)').run(key, enabled);
        return (await list()).find((extension) => extension.key === key);
      },
    }),
  };
}
