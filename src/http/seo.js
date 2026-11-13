// 搜尋引擎與 AI 用的資訊，都從 src/http/noscript.js 預先產生的頁面取得，內容改變時跟著更新：
// - 每頁 <head> 的描述、canonical、Open Graph、JSON-LD 結構化資料（headTags，由 src/http/static.js 放進 index.html）
// - /sitemap.xml、/robots.txt
// - /llms.txt（網站摘要與連結）、/llms-full.txt（所有頁面與公告的全文），給 AI 工具讀取，格式見 https://llmstxt.org/

const escapeXml = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** 網站的網址：設定了 SITE_URL 就用它，否則依這次請求的 Host（反向代理時看 X-Forwarded-Proto） */
export function originOf(req, siteUrl) {
  if (siteUrl) return siteUrl.replace(/\/+$/, '');
  const forwarded = req.headers['x-forwarded-proto']?.split(',')[0].trim();
  const protocol = forwarded || (req.socket.encrypted ? 'https' : 'http');
  return `${protocol}://${req.headers.host}`;
}

const absolute = (origin, url) => (url && url.startsWith('/') ? origin + url : url);

/** JSON 放進 <script> 時不能出現 </script> */
const jsonScript = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function structuredData(page, site, origin) {
  const url = origin + page.route;
  const organization = {
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name: site.title,
    url: `${origin}/`,
    logo: absolute(origin, site.logo),
    ...(site.phone && { telephone: site.phone }),
  };
  const items = [];
  if (page.type === 'website') {
    items.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: site.title, url: `${origin}/`, inLanguage: 'zh-Hant-TW', description: site.description, publisher: { '@id': organization['@id'] } });
    items.push({ '@context': 'https://schema.org', ...organization });
  } else if (page.type === 'article') {
    items.push({
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: page.name,
      description: page.description,
      url,
      mainEntityOfPage: url,
      inLanguage: 'zh-Hant-TW',
      datePublished: page.published,
      dateModified: page.modified,
      ...(page.image && { image: [absolute(origin, page.image)] }),
      author: organization,
      publisher: organization,
    });
  } else if (page.type === 'gallery') {
    items.push({
      '@context': 'https://schema.org',
      '@type': 'ImageGallery',
      name: page.name,
      description: page.description,
      url,
      inLanguage: 'zh-Hant-TW',
      dateModified: page.modified,
      image: page.images.map((image) => ({ '@type': 'ImageObject', contentUrl: absolute(origin, image.url), caption: image.alt })),
    });
  } else {
    items.push({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.name,
      description: page.description,
      url,
      inLanguage: 'zh-Hant-TW',
      ...(page.modified && { dateModified: page.modified }),
    });
  }
  if (page.breadcrumb.length) {
    const trail = [...page.breadcrumb, { name: page.name, route: page.route }];
    items.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: trail.map((crumb, index) => ({ '@type': 'ListItem', position: index + 1, name: crumb.name, item: origin + crumb.route })),
    });
  }
  return items;
}

/** 這一頁 <head> 裡的標籤；page 是 null（不是公開頁面）時請搜尋引擎不要收錄 */
export function headTags(page, site, origin) {
  if (!page) return '<meta name="robots" content="noindex" />';
  const url = origin + page.route;
  const image = absolute(origin, page.image ?? site.logo);
  const meta = (attribute, name, content) => (content ? `<meta ${attribute}="${name}" content="${escapeXml(content)}" />` : '');
  return [
    meta('name', 'description', page.description),
    `<link rel="canonical" href="${escapeXml(url)}" />`,
    meta('property', 'og:site_name', site.title),
    meta('property', 'og:locale', 'zh_TW'),
    meta('property', 'og:type', page.type === 'article' ? 'article' : 'website'),
    meta('property', 'og:title', page.name),
    meta('property', 'og:description', page.description),
    meta('property', 'og:url', url),
    meta('property', 'og:image', image),
    page.type === 'article' ? meta('property', 'article:published_time', page.published) : '',
    page.type === 'article' ? meta('property', 'article:modified_time', page.modified) : '',
    meta('name', 'twitter:card', page.image ? 'summary_large_image' : 'summary'),
    `<link rel="alternate" type="text/plain" title="給 AI 讀取的網站摘要" href="${origin}/llms.txt" />`,
    ...structuredData(page, site, origin).map(jsonScript),
  ].filter(Boolean).join('\n    ');
}

/** 不給搜尋引擎收錄的路徑：管理畫面與 API */
const DISALLOW = ['/settings', '/login', '/graphql', '/site-data', '/static-site'];

const robotsTxt = (origin) => [
  'User-agent: *',
  'Allow: /',
  ...DISALLOW.map((path) => `Disallow: ${path}`),
  // /pages 是所有頁面的管理清單，底下的 /pages/<網址> 是內容，要收錄
  'Disallow: /pages$',
  '',
  `Sitemap: ${origin}/sitemap.xml`,
  '',
].join('\n');

function sitemapXml(snapshot, origin) {
  const urls = [...snapshot.pages.values()].map((page) => [
    '  <url>',
    `    <loc>${escapeXml(origin + page.route)}</loc>`,
    page.modified ? `    <lastmod>${escapeXml(new Date(page.modified).toISOString())}</lastmod>` : '',
    '  </url>',
  ].filter(Boolean).join('\n'));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

const dateOf = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

function contactLines(site) {
  return [
    `- ${site.contactTitle}：電話 ${site.phone}${site.extension ? ` ${site.extension}` : ''}`,
    site.hours && `- 開放時間：${site.hours}`,
    ...site.teachers.map((t) => `- 聯絡老師：${t.name}（${t.email}${t.extension ? `，分機 ${t.extension}` : ''}）`),
  ].filter(Boolean);
}

function pagesOfType(snapshot, test) {
  return [...snapshot.pages.values()].filter(test);
}

/** 網站摘要：每頁一行連結與描述 */
function llmsTxt(snapshot, origin) {
  const { site } = snapshot;
  const link = (page) => `- [${page.name}](${origin}${page.route}): ${page.description}`;
  const sections = [
    ['頁面', pagesOfType(snapshot, (p) => p.type === 'page' && p.breadcrumb.length === 1 && !site.extensionPaths.includes(p.route))],
    ['最新消息', pagesOfType(snapshot, (p) => p.type === 'article')],
    ['活動剪影', pagesOfType(snapshot, (p) => p.type === 'gallery')],
  ];
  return [
    `# ${site.title}`,
    '',
    `> ${site.description}`,
    '',
    ...contactLines(site),
    '',
    `完整的頁面與公告內容：${origin}/llms-full.txt`,
    '',
    ...sections.filter(([, pages]) => pages.length).flatMap(([heading, pages]) => [
      `## ${heading}`, '', ...pages.map((page) => (page.type === 'article' ? `${link(page)}（${dateOf(page.published)}）` : link(page))), '',
    ]),
    ...(site.documents.length ? [
      '## 文件下載',
      '',
      ...site.documents.map((doc) => `- [${doc.title}](${origin}${doc.url}): ${doc.category ?? '其他文件'}，${doc.filename}`),
      '',
    ] : []),
  ].join('\n');
}

/** 所有頁面與公告的全文 */
function llmsFullTxt(snapshot, origin) {
  const { site } = snapshot;
  const entries = pagesOfType(snapshot, (p) => p.text && (p.type === 'page' || p.type === 'article'));
  return [
    `# ${site.title}`,
    '',
    `> ${site.description}`,
    '',
    ...contactLines(site),
    '',
    ...entries.flatMap((page) => [
      `## ${page.name}`,
      '',
      `網址：${origin}${page.route}`,
      page.type === 'article' ? `發布日期：${dateOf(page.published)}` : `最後更新：${dateOf(page.modified)}`,
      '',
      // 內文裡的站內連結（/ 開頭）補上網站的網址
      page.text.replace(/\]\((\/[^)\s]*)\)/g, (_, path) => `](${origin}${path})`),
      '',
    ]),
  ].join('\n');
}

const FILES = {
  '/robots.txt': ['text/plain; charset=utf-8', (snapshot, origin) => robotsTxt(origin)],
  '/sitemap.xml': ['application/xml; charset=utf-8', sitemapXml],
  '/llms.txt': ['text/plain; charset=utf-8', llmsTxt],
  '/llms-full.txt': ['text/plain; charset=utf-8', llmsFullTxt],
};

/** 處理上面的檔案；不是這些網址時回傳 false */
export function createSeoHandler({ noscript, siteUrl }) {
  return async function serveSeo(req, res, pathname) {
    const file = FILES[pathname];
    if (!file) return false;
    const [type, render] = file;
    const snapshot = await noscript.snapshot();
    if (!snapshot) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '10' });
      res.end('Service unavailable');
      return true;
    }
    const body = render(snapshot, originOf(req, siteUrl));
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  };
}
