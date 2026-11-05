import { extname } from 'node:path';
import { renderPage } from '../lib/content.js';
import { fail } from '../lib/errors.js';
import { requirePermission, withPermission } from '../lib/guards.js';

export const pagesTypeDefs = /* GraphQL */ `
  type Page {
    slug: String!
    title: String!
    format: ContentFormat!
    "未消毒的原始內容，需要 MANAGE_PAGES；顯示時請用 html"
    source: String!
    "已轉換並消毒，可直接顯示"
    html: String!
    updatedAt: String!
  }

  extend type Query {
    pages: [Page!]!
    page(slug: String!): Page
  }

  extend type Mutation {
    "以 slug 新增或覆蓋。content（需指定 format）與 file（.md、.html）擇一提供"
    savePage(slug: String!, title: String!, content: String, format: ContentFormat, file: File): Page!
    deletePage(slug: String!): Boolean!
  }
`;

const FORMAT_BY_EXTENSION = { '.md': 'MARKDOWN', '.markdown': 'MARKDOWN', '.html': 'HTML', '.htm': 'HTML' };

async function pageSource({ content, format, file }) {
  if ((content == null) === (file == null)) fail('content 與 file 必須擇一提供');
  if (content != null) {
    if (!format) fail('提供 content 時必須指定 format');
    return { format, source: content };
  }
  const detected = FORMAT_BY_EXTENSION[extname(file.name).toLowerCase()];
  if (!detected) fail('頁面檔案僅接受 .md 或 .html');
  return { format: detected, source: await file.text() };
}

export function createPagesResolvers({ db }) {
  return {
    Query: {
      pages: () => db.prepare('SELECT * FROM pages ORDER BY slug').all(),
      page: (_, { slug }) => db.prepare('SELECT * FROM pages WHERE slug = $1').get(slug),
    },

    Mutation: withPermission('MANAGE_PAGES', {
      async savePage(_, { slug, title, ...input }) {
        const { format, source } = await pageSource(input);
        return db.prepare(`
          INSERT INTO pages (slug, title, format, source) VALUES ($1, btrim($2), $3, $4)
          ON CONFLICT (slug) DO UPDATE SET
            title = excluded.title, format = excluded.format,
            source = excluded.source, updated_at = now()
          RETURNING *
        `).get(slug, title, format, source);
      },

      async deletePage(_, { slug }) {
        const { changes } = await db.prepare('DELETE FROM pages WHERE slug = $1').run(slug);
        return changes > 0;
      },
    }),

    Page: {
      html: renderPage,
      source(page, _args, context) {
        requirePermission(context, 'MANAGE_PAGES');
        return page.source;
      },
    },
  };
}
