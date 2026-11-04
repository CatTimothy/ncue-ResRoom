import { createSchema, createYoga } from 'graphql-yoga';
import { albumsTypeDefs, createAlbumsResolvers } from './albums.js';
import { announcementsTypeDefs, createAnnouncementsResolvers } from './announcements.js';
import { authTypeDefs, createAuthResolvers } from './auth.js';
import { contentImagesTypeDefs, createContentImagesResolvers } from './content-images.js';
import { createDocumentsResolvers, documentsTypeDefs } from './documents.js';
import { createPagesResolvers, pagesTypeDefs } from './pages.js';
import { createPhotosResolvers, photosTypeDefs } from './photos.js';

const rootTypeDefs = /* GraphQL */ `
  scalar File

  enum ContentFormat {
    HTML
    MARKDOWN
  }

  type Query
  type Mutation
`;

export function createGraphQLHandler({ db, storage, sessions, production, allowedOrigins }) {
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
      ],
      resolvers: [
        createAuthResolvers(deps),
        createPagesResolvers(deps),
        createAnnouncementsResolvers(deps),
        createAlbumsResolvers(deps),
        createPhotosResolvers(deps),
        createDocumentsResolvers(deps),
        createContentImagesResolvers(deps),
      ],
    }),
    context: ({ request }) => sessions.current(request.headers.get('cookie')),
    cors: allowedOrigins.length ? { origin: allowedOrigins, credentials: true } : false,
    graphiql: !production,
    logging: 'warn',
  });
}
