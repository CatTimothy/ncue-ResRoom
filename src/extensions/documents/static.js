// 文件下載的靜態頁面，對應 web/src/extensions/documents 的畫面
import { fileSizeText, groupDocuments } from '../../../web/src/format.js';
import { emptyStatus, html, latest, listMeta, page } from '../../static-site/template.js';

const documentsPage = (items) => page('/documents', '文件下載', (u) => html`
  <div class="page">
    <h1 class="stop">文件下載</h1>
    <div>
      ${groupDocuments(items).map(([name, documents]) => html`
      <section class="document-group">
        <div class="document-group__head"><h2>${name}</h2></div>
        <ul class="document-list">
          ${documents.map((item) => html`
          <li>
            <div class="document-list__main">
              <a href="${u.local(item.url)}" download="${item.filename}">${item.title}</a>
              <small class="edited">${item.filename.split('.').pop().toUpperCase()}，${fileSizeText(item.size)}</small>
            </div>
          </li>`)}
        </ul>
      </section>`)}
      ${!items.length && emptyStatus('目前沒有文件。')}
    </div>
  </div>`);

export default {
  async load({ db, storage }) {
    const documents = (await db.prepare('SELECT * FROM documents ORDER BY id DESC').all())
      .map((row) => ({ ...row, url: storage.urlOf(row) }));
    return { documents };
  },

  pages: (site, { documents }) => [{
    ...documentsPage(documents),
    meta: listMeta('文件下載', `${site.config.siteTitle}的文件下載，共 ${documents.length} 份文件，包含申請表與紀錄表等表單。`, latest(documents.map((d) => d.createdAt))),
  }],

  /** 給搜尋引擎、AI 的網站資訊（src/http/seo.js 的 llms.txt 列出文件） */
  info: ({ documents }) => ({
    documents: documents.map((doc) => ({ title: doc.title, category: doc.category, url: doc.url, filename: doc.filename })),
  }),
};
