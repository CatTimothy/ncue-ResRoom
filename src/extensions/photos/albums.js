import { fail } from '../../lib/errors.js';
import { hasPermission, withPermission } from '../../lib/guards.js';
import { paging, searchCondition, searchParams, TAIPEI_TODAY } from '../../lib/search.js';

export const albumsTypeDefs = /* GraphQL */ `
  type Album {
    id: ID!
    name: String!
    createdAt: String!
    modifiedAt: String!
    "活動日期 YYYY-MM-DD；相簿依此由新到舊排列"
    eventDate: String!
    photoCount: Int!
    "封面的壓縮版網址；沒有照片時為 null"
    coverUrl: String
  }

  extend type Query {
    "search 比對相簿名稱或活動日期。未登入時不列出沒有照片的相簿"
    albums(search: String, limit: Int = 20, offset: Int = 0): [Album!]!
    album(id: ID!): Album
  }

  extend type Mutation {
    "未提供 id 時新增，提供時更新。未提供 eventDate 時，新增用今天（台灣時區），更新則不變"
    saveAlbum(id: ID, name: String!, eventDate: String): Album!
    "連同相簿內的照片一起刪除"
    deleteAlbum(id: ID!): Boolean!
  }
`;

const ALBUM_FIELDS = `
  a.*,
  (SELECT count(*)::int FROM photos p WHERE p.album_id = a.id) AS photo_count,
  (SELECT p.stored_name FROM photos p WHERE p.album_id = a.id ORDER BY p.id DESC LIMIT 1) AS cover_stored_name
`;

export function createAlbumsResolvers({ db, storage }) {
  const withCount = (id) => db.prepare(`SELECT ${ALBUM_FIELDS} FROM albums a WHERE a.id = $1`).get(id);

  return {
    Query: {
      albums: (_, { search, limit, offset }, context) => db.prepare(`
        SELECT ${ALBUM_FIELDS} FROM albums a
        WHERE ($1::boolean OR EXISTS (SELECT 1 FROM photos p WHERE p.album_id = a.id))
          AND ${searchCondition('name', 'a.event_date')}
        ORDER BY event_date DESC, id DESC
        ${paging(6)}
      `).all(hasPermission(context, 'MANAGE_ALBUMS'), ...searchParams(search), limit, offset),

      album: (_, { id }) => withCount(id),
    },

    Mutation: withPermission('MANAGE_ALBUMS', {
      async saveAlbum(_, { id, name, eventDate }) {
        if (id == null) {
          const created = await db.prepare(`
            INSERT INTO albums (name, event_date)
            VALUES ($1, COALESCE($2::date, ${TAIPEI_TODAY})) RETURNING id
          `).get(name, eventDate ?? null);
          return withCount(created.id);
        }
        const updated = await db.prepare(`
          UPDATE albums SET name = $1, event_date = COALESCE($2::date, event_date), modified_at = now()
          WHERE id = $3 RETURNING id
        `).get(name, eventDate ?? null, id);
        return updated ? withCount(id) : fail('找不到這本相簿');
      },

      async deleteAlbum(_, { id }) {
        const photos = await db.prepare('SELECT stored_name FROM photos WHERE album_id = $1').all(id);
        const { changes } = await db.prepare('DELETE FROM albums WHERE id = $1').run(id);
        await storage.removeFiles(photos.map((photo) => photo.storedName));
        return changes > 0;
      },
    }),

    Album: {
      coverUrl: ({ coverStoredName }) => (coverStoredName ? storage.displayUrlOf({ storedName: coverStoredName }) : null),
    },
  };
}
