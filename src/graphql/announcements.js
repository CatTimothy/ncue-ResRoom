import { renderAnnouncement } from '../lib/content.js';
import { fail } from '../lib/errors.js';
import { withLogin } from '../lib/guards.js';
import { paging, searchCondition, searchParams, visible } from '../lib/search.js';

export const announcementsTypeDefs = /* GraphQL */ `
  type Announcement {
    id: ID!
    title: String!
    "Markdown 原文；圖片寫法為 ![說明](圖片網址)，內嵌 HTML 不會顯示"
    content: String!
    "由 content 轉換並消毒，可直接顯示"
    html: String!
    createdAt: String!
    modifiedAt: String!
    "未到發布時間時，只有登入後才看得到"
    publishedAt: String!
  }

  extend type Query {
    "search 比對標題或發布日期，例如 115/11/4、2026-11、11/4"
    announcements(search: String, limit: Int = 20, offset: Int = 0): [Announcement!]!
    announcement(id: ID!): Announcement
  }

  extend type Mutation {
    "未提供 id 時新增，提供時更新；新增時未提供 publishedAt 則立即發布"
    saveAnnouncement(id: ID, title: String!, content: String!, publishedAt: String): Announcement!
    deleteAnnouncement(id: ID!): Boolean!
  }
`;

export function createAnnouncementsResolvers({ db }) {
  return {
    Query: {
      announcements: (_, { search, limit, offset }, { user }) => db.prepare(`
        SELECT * FROM announcements
        WHERE ${visible(1)} AND ${searchCondition('title')}
        ORDER BY published_at DESC, id DESC
        ${paging(6)}
      `).all(Boolean(user), ...searchParams(search), limit, offset),

      announcement: (_, { id }, { user }) => db
        .prepare(`SELECT * FROM announcements WHERE id = $1 AND ${visible(2)}`)
        .get(id, Boolean(user)),
    },

    Mutation: withLogin({
      async saveAnnouncement(_, { id, title, content, publishedAt }) {
        if (id == null) {
          return db.prepare(`
            INSERT INTO announcements (title, content, published_at)
            VALUES (btrim($1), $2, COALESCE($3::timestamptz, now())) RETURNING *
          `).get(title, content, publishedAt ?? null);
        }
        const row = await db.prepare(`
          UPDATE announcements
          SET title = btrim($1), content = $2, published_at = COALESCE($3::timestamptz, published_at), modified_at = now()
          WHERE id = $4 RETURNING *
        `).get(title, content, publishedAt ?? null, id);
        return row ?? fail('找不到這則公告');
      },

      async deleteAnnouncement(_, { id }) {
        const { changes } = await db.prepare('DELETE FROM announcements WHERE id = $1').run(id);
        return changes > 0;
      },
    }),

    Announcement: { html: renderAnnouncement },
  };
}
