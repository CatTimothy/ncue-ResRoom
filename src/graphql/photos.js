import { fail } from '../lib/errors.js';
import { withLogin } from '../lib/guards.js';
import { paging, visible } from '../lib/search.js';

export const photosTypeDefs = /* GraphQL */ `
  type Photo {
    id: ID!
    albumId: ID!
    "網頁顯示用的壓縮版"
    url: String!
    "下載用的原始檔"
    originalUrl: String!
    alt: String!
    createdAt: String!
  }

  extend type Query {
    photos(albumId: ID!, limit: Int = 50, offset: Int = 0): [Photo!]!
  }

  extend type Mutation {
    uploadPhoto(file: File!, alt: String!, albumId: ID!): Photo!
    "可同時把照片移到另一本相簿"
    updatePhoto(id: ID!, alt: String!, albumId: ID!): Photo!
    deletePhoto(id: ID!): Boolean!
  }
`;

export function createPhotosResolvers({ db, storage }) {
  return {
    Query: {
      photos: (_, { albumId, limit, offset }, { user }) => db.prepare(`
        SELECT p.* FROM photos p JOIN albums a ON a.id = p.album_id
        WHERE p.album_id = $1 AND ${visible(2, 'a.published_at')}
        ORDER BY p.id DESC
        ${paging(3)}
      `).all(albumId, Boolean(user), limit, offset),
    },

    Mutation: withLogin({
      uploadPhoto: (_, { file, alt, albumId }) => storage.saveImage(file, (storedName, filename) => db.prepare(`
        INSERT INTO photos (stored_name, alt, album_id, filename) VALUES ($1, btrim($2), $3, $4) RETURNING *
      `).get(storedName, alt, albumId, filename)),

      async updatePhoto(_, { id, alt, albumId }) {
        const row = await db.prepare('UPDATE photos SET alt = btrim($1), album_id = $2 WHERE id = $3 RETURNING *')
          .get(alt, albumId, id);
        return row ?? fail('找不到這張照片');
      },

      deletePhoto: (_, { id }) => storage.deleteRow('photos', id),
    }),

    Photo: { url: storage.displayUrlOf, originalUrl: storage.urlOf },
  };
}
