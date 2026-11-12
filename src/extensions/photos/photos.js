import { fail } from '../../lib/errors.js';
import { withPermission } from '../../lib/guards.js';
import { paging } from '../../lib/search.js';

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
      photos: (_, { albumId, limit, offset }) => db.prepare(`
        SELECT * FROM photos WHERE album_id = $1 ORDER BY id DESC ${paging(2)}
      `).all(albumId, limit, offset),
    },

    Mutation: withPermission('MANAGE_ALBUMS', {
      uploadPhoto: (_, { file, alt, albumId }) => storage.saveImage(file, (storedName, filename) => db.prepare(`
        INSERT INTO photos (stored_name, alt, album_id, filename) VALUES ($1, $2, $3, $4) RETURNING *
      `).get(storedName, alt, albumId, filename)),

      async updatePhoto(_, { id, alt, albumId }) {
        // 內文圖片（album_id 是 NULL）不屬於相簿，不能從這裡修改或刪除
        const row = await db.prepare('UPDATE photos SET alt = $1, album_id = $2 WHERE id = $3 AND album_id IS NOT NULL RETURNING *')
          .get(alt, albumId, id);
        return row ?? fail('找不到這張照片');
      },

      async deletePhoto(_, { id }) {
        const row = await db.prepare('DELETE FROM photos WHERE id = $1 AND album_id IS NOT NULL RETURNING stored_name').get(id);
        if (!row) return false;
        await storage.removeFiles([row.storedName]);
        return true;
      },
    }),

    Photo: { url: storage.displayUrlOf, originalUrl: storage.urlOf },
  };
}
