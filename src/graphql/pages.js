import { pagePath, RESERVED_SLUGS } from '../../web/src/navigation.js';
import { extname } from 'node:path';
import { renderPage } from '../lib/content.js';
import { fail } from '../lib/errors.js';
import { requirePermission, withPermission } from '../lib/guards.js';

export const pagesTypeDefs = /* GraphQL */ `
  type Page {
    slug: String!
    "true 時網址在第一層（/slug），否則在 /pages/slug"
    root: Boolean!
    "頁面的網址，例如 /about 或 /pages/guide"
    path: String!
    title: String!
    format: ContentFormat!
    "未消毒的原始內容，需要 MANAGE_PAGES；顯示時請用 html"
    source: String!
    "已轉換並消毒，可直接顯示"
    html: String!
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    pages: [Page!]!
    page(slug: String!): Page
  }

  extend type Mutation {
    """
    以 slug 新增或覆蓋。content（需指定 format）與 file（.md、.html）擇一提供。
    root 決定網址在第一層或 /pages 底下；提供 previousSlug 時是修改那個頁面的網址。新增的頁面會自動加到主選單的最後
    """
    savePage(slug: String!, title: String!, content: String, format: ContentFormat, file: File, root: Boolean = false, previousSlug: String): Page!
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
      async savePage(_, { slug, title, root, previousSlug, ...input }) {
        if (root && RESERVED_SLUGS.includes(slug)) fail(`網址「/${slug}」已經用於網站功能，請換一個`);
        const { format, source } = await pageSource(input);

        // 修改網址：選單裡的連結由外鍵的 ON UPDATE CASCADE 跟著改
        if (previousSlug != null && previousSlug !== slug) {
          const renamed = await db.prepare(`
            UPDATE pages SET slug = $1, root = $2, title = $3, format = $4, source = $5, updated_at = now()
            WHERE slug = $6 RETURNING *
          `).get(slug, root, title, format, source, previousSlug);
          return renamed ?? fail('找不到要修改的頁面，可能已被刪除');
        }

        // xmax = 0 表示這次是新增，不是覆蓋既有的頁面
        const page = await db.prepare(`
          INSERT INTO pages (slug, root, title, format, source) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (slug) DO UPDATE SET
            root = excluded.root, title = excluded.title, format = excluded.format,
            source = excluded.source, updated_at = now()
          RETURNING *, (xmax = 0) AS inserted
        `).get(slug, root, title, format, source);
        if (page.inserted) {
          await db.prepare(`
            INSERT INTO navigation_links (menu, position, page_slug)
            SELECT 'MAIN', COALESCE(max(position) + 1, 0), $1 FROM navigation_links WHERE menu = 'MAIN'
            ON CONFLICT DO NOTHING
          `).run(slug);
        }
        return page;
      },

      async deletePage(_, { slug }) {
        const { changes } = await db.prepare('DELETE FROM pages WHERE slug = $1').run(slug);
        return changes > 0;
      },
    }),

    Page: {
      path: pagePath,
      html: renderPage,
      source(page, _args, context) {
        requirePermission(context, 'MANAGE_PAGES');
        return page.source;
      },
    },
  };
}
