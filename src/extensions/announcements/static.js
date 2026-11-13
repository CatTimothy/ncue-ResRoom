// 最新消息的靜態頁面，對應 web/src/extensions/announcements 的畫面
import {
  groupByYear, monthDayText, rocDateText, rocDateTimeText, rocShortDate, wasEdited,
} from '../../../web/src/format.js';
import { renderAnnouncement } from '../../lib/content.js';
import {
  articleBody, emptyStatus, excerpt, firstImage, HOME_CRUMB, html, latest, listMeta, page, textOf,
} from '../../static-site/template.js';

const HOME_ANNOUNCEMENTS = 5;

function announcementList(items, u) {
  return groupByYear(items).map((group) => html`
    <div class="announcement-year">
      <p class="announcement-year__label">${group.year} 年</p>
      <ol class="announcement-list">
        ${group.items.map((item) => html`
        <li>
          <time class="date__day" datetime="${item.publishedAt}" aria-label="${rocDateText(item.publishedAt)}">${monthDayText(item.publishedAt)}</time>
          <div>
            <a href="${u.to(`/announcements/${item.id}`)}">${item.title}</a>
            ${wasEdited(item) && html`<small class="edited edited--short">(編輯於 ${rocShortDate(item.modifiedAt)})</small>`}
          </div>
        </li>`)}
      </ol>
    </div>`);
}

const announcementsPage = (announcements) => page('/announcements', '最新消息', (u) => html`
  <div class="page">
    <h1 class="stop">最新消息</h1>
    <div>
      ${announcementList(announcements, u)}
      ${!announcements.length && emptyStatus('目前沒有新消息。')}
    </div>
  </div>`);

function announcementPage(item) {
  const info = [
    ['公告單位', item.unit || '—'],
    ['瀏覽人次', item.views],
    ['公告日期', html`<time datetime="${item.publishedAt}">${rocShortDate(item.publishedAt)}</time>`],
    ['截止日期', item.deadline ? html`<time datetime="${item.deadline}">${rocShortDate(item.deadline)}</time>` : '—'],
    ['聯絡人', item.contactPerson || '—'],
    ['分機', item.extension || '—'],
  ];
  return page(`/announcements/${item.id}`, item.title, (u) => html`
    <div class="page">
      <a class="back-link" href="${u.to('/announcements')}">回到最新消息</a>
      <article class="article">
        <p class="announcement__label">公告標題</p>
        <h1 class="stop">${item.title}</h1>
        <dl class="announcement-info">
          ${info.map(([label, value]) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`)}
        </dl>
        <h2 class="announcement__body-title">詳細內容</h2>
        ${articleBody(renderAnnouncement(item), u)}
        ${wasEdited(item) && html`<small class="edited">編輯於 ${rocDateTimeText(item.modifiedAt)}</small>`}
      </article>
    </div>`);
}

function announcementMeta(item) {
  const markup = renderAnnouncement(item);
  const info = [item.unit && `公告單位：${item.unit}`, item.contactPerson && `聯絡人：${item.contactPerson}`, item.extension && `分機：${item.extension}`]
    .filter(Boolean).join('，');
  return {
    name: item.title,
    description: excerpt(textOf(markup)) || item.title,
    image: firstImage(markup),
    type: 'article',
    published: item.publishedAt,
    modified: item.modifiedAt,
    breadcrumb: [HOME_CRUMB, { name: '最新消息', route: '/announcements' }],
    text: [info, textOf(markup, { links: true })].filter(Boolean).join('\n'),
  };
}

export default {
  /** 已發布的公告，與下一則預約發布的時間（到時候公開內容會改變） */
  async load({ db }) {
    const items = await db.prepare(`
      SELECT * FROM announcements WHERE published_at <= now() ORDER BY published_at DESC, id DESC
    `).all();
    const { next } = await db.prepare('SELECT min(published_at) AS next FROM announcements WHERE published_at > now()').get();
    return { items, nextChange: next };
  },

  /** 首頁「最新消息」區塊 */
  home: ({ items }) => (u) => html`
      <section aria-labelledby="home-news">
        <div class="section-head stop">
          <h2 id="home-news">最新消息</h2>
          ${items.length > 0 && html`<a href="${u.to('/announcements')}">查看所有消息</a>`}
        </div>
        ${announcementList(items.slice(0, HOME_ANNOUNCEMENTS), u)}
        ${!items.length && emptyStatus('目前沒有新消息。')}
      </section>`,

  /** 首頁的最後修改時間要算進的日期 */
  homeModified: ({ items }) => items.map((a) => a.modifiedAt),

  pages: (site, { items }) => [
    {
      ...announcementsPage(items),
      meta: listMeta('最新消息', `${site.config.siteTitle}的最新消息，共 ${items.length} 則公告。`, latest(items.map((a) => a.modifiedAt))),
    },
    ...items.map((item) => ({ ...announcementPage(item), meta: announcementMeta(item) })),
  ],
};
