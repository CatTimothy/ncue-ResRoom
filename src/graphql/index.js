import { getOperationAST } from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';
import { EXTENSIONS } from '../extensions/index.js';
import { authTypeDefs, createAuthResolvers } from './auth.js';
import { contentImagesTypeDefs, createContentImagesResolvers } from './content-images.js';
import { createExtensionsResolvers, extensionsTypeDefs, guardExtension } from './extensions.js';
import { createNavigationResolvers, navigationTypeDefs } from './navigation.js';
import { createSiteConfigResolvers, siteConfigTypeDefs } from './site-config.js';
import { createPagesResolvers, pagesTypeDefs } from './pages.js';
import { createVisitsResolvers, visitsTypeDefs } from './visits.js';

const rootTypeDefs = /* GraphQL */ `
  scalar File

  enum ContentFormat {
    HTML
    MARKDOWN
  }

  type Query
  type Mutation
`;

// 不會改變公開內容的 mutation；其他 mutation 執行後呼叫 onContentChange（重新產生沒有 JavaScript 時的頁面）。
// 頁面的編輯者（顯示名稱）只顯示在有 JavaScript 的畫面，所以帳號的 mutation 都算在這裡
const NON_CONTENT_MUTATIONS = new Set([
  'login', 'logout', 'changePassword', 'createUser', 'setUserPermissions', 'setDisplayName', 'deleteUser', 'recordVisit',
  ...EXTENSIONS.flatMap((extension) => extension.passiveMutations ?? []),
]);

/** Yoga 的 plugin：會改變內容的 mutation 執行完後通知 */
const contentChangePlugin = (onContentChange) => ({
  onExecute({ args }) {
    const operation = getOperationAST(args.document, args.operationName);
    if (operation?.operation !== 'mutation') return undefined;
    const fields = operation.selectionSet.selections.map((selection) => selection.name?.value);
    if (fields.every((field) => NON_CONTENT_MUTATIONS.has(field))) return undefined;
    return { onExecuteDone: () => onContentChange() };
  },
});

export function createGraphQLHandler({ db, storage, sessions, production, allowedOrigins, onContentChange = () => {} }) {
  const deps = { db, storage, sessions };
  return createYoga({
    schema: createSchema({
      typeDefs: [
        rootTypeDefs,
        authTypeDefs,
        pagesTypeDefs,
        ...EXTENSIONS.flatMap((extension) => extension.typeDefs),
        contentImagesTypeDefs,
        visitsTypeDefs,
        siteConfigTypeDefs,
        navigationTypeDefs,
        extensionsTypeDefs,
      ],
      resolvers: [
        createAuthResolvers(deps),
        createPagesResolvers(deps),
        ...EXTENSIONS.flatMap((extension) => extension.createResolvers.map((create) => guardExtension(db, extension, create(deps)))),
        createContentImagesResolvers(deps),
        createVisitsResolvers(deps),
        createSiteConfigResolvers(deps),
        createNavigationResolvers(deps),
        createExtensionsResolvers(deps),
      ],
    }),
    context: ({ request }) => sessions.current(request.headers.get('cookie')),
    cors: allowedOrigins.length ? { origin: allowedOrigins, credentials: true } : false,
    graphiql: !production,
    plugins: [contentChangePlugin(onContentChange)],
    logging: 'warn',
  });
}
