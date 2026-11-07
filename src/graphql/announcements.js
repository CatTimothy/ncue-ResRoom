import { renderAnnouncement } from '../lib/content.js';
import { fail } from '../lib/errors.js';
import { hasPermission, withPermission } from '../lib/guards.js';
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
    "公告日期。未到發布時間時，只有登入後才看得到"
    publishedAt: String!
    "公告單位"
    unit: String!
    "瀏覽人次；登入後的瀏覽不計入"
    views: Int!
    "截止日期 YYYY-MM-DD；沒有時為 null。只用於顯示，過期不會隱藏"
    deadline: String
    "聯絡人"
    contactPerson: String!
    "分機"
    extension: String!
  }

  extend type Query {
    "search 比對標題或發布日期，例如 115/11/4、2026-11、11/4"
    announcements(search: String, limit: Int = 20, offset: Int = 0): [Announcement!]!
    announcement(id: ID!): Announcement
  }

  extend type Mutation {
    "未提供 id 時新增，提供時更新；新增時未提供 publishedAt 則立即發布。更新時未提供的公告資訊不變，deadline 傳 null 可清除"
    saveAnnouncement(
      id: ID
      title: String!
      content: String!
      publishedAt: String
      unit: String
      deadline: String
      contactPerson: String
      extension: String
    ): Announcement!
    deleteAnnouncement(id: ID!): Boolean!
    "不需登入。回傳目前的瀏覽人次；公告不存在或尚未發布時回傳 null"
    recordAnnouncementView(id: ID!): Int
  }
`;

export function createAnnouncementsResolvers({ db }) {
  return {
    Query: {
      announcements: (_, { search, limit, offset }, context) => db.prepare(`
        SELECT * FROM announcements
        WHERE ${visible(1)} AND ${searchCondition('title')}
        ORDER BY published_at DESC, id DESC
        ${paging(6)}
      `).all(hasPermission(context, 'MANAGE_ANNOUNCEMENTS'), ...searchParams(search), limit, offset),

      announcement: (_, { id }, context) => db
        .prepare(`SELECT * FROM announcements WHERE id = $1 AND ${visible(2)}`)
        .get(id, hasPermission(context, 'MANAGE_ANNOUNCEMENTS')),
    },

    Mutation: {
      ...withPermission('MANAGE_ANNOUNCEMENTS', {
        async saveAnnouncement(_, { id, title, content, publishedAt, ...info }) {
          const details = [info.unit ?? null, info.deadline ?? null, info.contactPerson ?? null, info.extension ?? null];
          if (id == null) {
            return db.prepare(`
              INSERT INTO announcements (title, content, published_at, unit, deadline, contact_person, extension)
              VALUES ($1, $2, COALESCE($3::timestamptz, now()), COALESCE($4, ''), $5::date, COALESCE($6, ''), COALESCE($7, '')) RETURNING *
            `).get(title, content, publishedAt ?? null, ...details);
          }
          const row = await db.prepare(`
            UPDATE announcements
            SET title = $1, content = $2, published_at = COALESCE($3::timestamptz, published_at),
                unit = COALESCE($4, unit), contact_person = COALESCE($6, contact_person),
                extension = COALESCE($7, extension),
                deadline = CASE WHEN $8::boolean THEN $5::date ELSE deadline END,
                modified_at = now()
            WHERE id = $9 RETURNING *
          `).get(title, content, publishedAt ?? null, ...details, info.deadline !== undefined, id);
          return row ?? fail('找不到這則公告');
        },

        async deleteAnnouncement(_, { id }) {
          const { changes } = await db.prepare('DELETE FROM announcements WHERE id = $1').run(id);
          return changes > 0;
        },
      }),

      // 能管理公告的人檢視或編輯時不計入，只回傳目前的人次
      async recordAnnouncementView(_, { id }, context) {
        const row = await (hasPermission(context, 'MANAGE_ANNOUNCEMENTS')
          ? db.prepare('SELECT views FROM announcements WHERE id = $1').get(id)
          : db.prepare('UPDATE announcements SET views = views + 1 WHERE id = $1 AND published_at <= now() RETURNING views').get(id));
        return row?.views ?? null;
      },
    },

    Announcement: { html: renderAnnouncement },
  };
}
