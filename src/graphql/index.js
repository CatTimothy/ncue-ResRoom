import { getOperationAST } from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';
import { albumsTypeDefs, createAlbumsResolvers } from './albums.js';
import { announcementsTypeDefs, createAnnouncementsResolvers } from './announcements.js';
import { authTypeDefs, createAuthResolvers } from './auth.js';
import { contentImagesTypeDefs, createContentImagesResolvers } from './content-images.js';
import { createDocumentsResolvers, documentsTypeDefs } from './documents.js';
import { createNavigationResolvers, navigationTypeDefs } from './navigation.js';
import { createSiteConfigResolvers, siteConfigTypeDefs } from './site-config.js';
import { createPagesResolvers, pagesTypeDefs } from './pages.js';
import { createPhotosResolvers, photosTypeDefs } from './photos.js';
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

// 不會改變公開內容的 mutation；其他 mutation 執行後呼叫 onContentChange（重新產生沒有 JavaScript 時的頁面）
const NON_CONTENT_MUTATIONS = new Set([
  'login', 'logout', 'changePassword', 'createUser', 'setUserPermissions', 'recordVisit', 'recordAnnouncementView',
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
        announcementsTypeDefs,
        albumsTypeDefs,
        photosTypeDefs,
        documentsTypeDefs,
        contentImagesTypeDefs,
        visitsTypeDefs,
        siteConfigTypeDefs,
        navigationTypeDefs,
      ],
      resolvers: [
        createAuthResolvers(deps),
        createPagesResolvers(deps),
        createAnnouncementsResolvers(deps),
        createAlbumsResolvers(deps),
        createPhotosResolvers(deps),
        createDocumentsResolvers(deps),
        createContentImagesResolvers(deps),
        createVisitsResolvers(deps),
        createSiteConfigResolvers(deps),
        createNavigationResolvers(deps),
      ],
    }),
    context: ({ request }) => sessions.current(request.headers.get('cookie')),
    cors: allowedOrigins.length ? { origin: allowedOrigins, credentials: true } : false,
    graphiql: !production,
    plugins: [contentChangePlugin(onContentChange)],
    logging: 'warn',
  });
}
