// 活動剪影的靜態頁面，對應 web/src/extensions/photos 的畫面
import { parseAlbum, rocDateText, rocShortDate, wasEdited } from '../../../web/src/format.js';
import { emptyStatus, HOME_CRUMB, html, latest, listMeta, page, raw } from '../../static-site/template.js';

const HOME_ALBUMS = 6;
const SECTION_PHOTOS = 24; // 每本相簿先顯示的張數，和 AlbumSection.vue 一致

function albumGrid(albums, u) {
  if (!albums.length) return '';
  return html`<ul class="album-grid">${albums.map((album) => {
    const title = parseAlbum(album.name);
    return html`
    <li>
      <div class="album-card__cover"><img src="${u.local(album.photos[0].url)}" alt="" loading="lazy" decoding="async" /></div>
      ${title.term && html`<p class="term">${title.term}</p>`}
      <h3><a href="${u.to(`/photos/${album.id}`)}">${title.name}</a></h3>
      <p class="album-card__meta"><time datetime="${album.eventDate}">${rocDateText(album.eventDate)}</time>，${album.photos.length} 張</p>
    </li>`;
  })}</ul>`;
}

function albumHeader(album, u, { heading = 'h1', id = null, linked = false } = {}) {
  const title = parseAlbum(album.name);
  const name = linked ? html`<a href="${u.to(`/photos/${album.id}`)}">${title.name}</a>` : title.name;
  return html`
    <header class="album-head">
      <div>
        ${title.term && html`<p class="term">${title.term}</p>`}
        ${raw(`<${heading}${id ? ` id="${id}"` : ''} class="stop">`)}${name}${raw(`</${heading}>`)}
        <p class="article__date">活動日期：<time datetime="${album.eventDate}">${rocDateText(album.eventDate)}</time>，${album.photos.length} 張</p>
        ${wasEdited(album) && html`<small class="edited edited--short">(編輯於 ${rocShortDate(album.modifiedAt)})</small>`}
      </div>
    </header>`;
}

const photoGrid = (photos, u) => html`
  <ul class="photo-grid">
    ${photos.map((photo) => html`
    <li>
      ${u.mode === 'site'
    ? html`<a class="photo-grid__open" href="${photo.url}" aria-label="開啟照片：${photo.alt}"><img src="${photo.url}" alt="${photo.alt}" loading="lazy" decoding="async" /></a>`
    : html`<button type="button" class="photo-grid__open" aria-label="放大照片：${photo.alt}" data-src="${u.local(photo.url)}" data-alt="${photo.alt}">
        <img src="${u.local(photo.url)}" alt="${photo.alt}" loading="lazy" decoding="async" />
      </button>`}
    </li>`)}
  </ul>`;

const albumsPage = (albums) => page('/photos', '活動剪影', (u) => html`
  <div class="page">
    <h1 class="stop">活動剪影</h1>
    <div>
      ${albums.map((album) => html`
      <section class="album-section" aria-labelledby="album-${album.id}">
        ${albumHeader(album, u, { heading: 'h2', id: `album-${album.id}`, linked: true })}
        <div class="album-section__photos">
          ${photoGrid(album.photos.slice(0, SECTION_PHOTOS), u)}
          ${album.photos.length > SECTION_PHOTOS && html`<p><a href="${u.to(`/photos/${album.id}`)}">查看全部 ${album.photos.length} 張照片</a></p>`}
        </div>
      </section>`)}
      ${!albums.length && emptyStatus('目前沒有相簿。')}
    </div>
  </div>`, { lightbox: true });

const albumPage = (album) => page(`/photos/${album.id}`, parseAlbum(album.name).name, (u) => html`
  <div class="page">
    <a class="back-link" href="${u.to('/photos')}">回到所有相簿</a>
    ${albumHeader(album, u)}
    <div>${photoGrid(album.photos, u)}</div>
  </div>`, { lightbox: true });

function albumMeta(album) {
  const title = parseAlbum(album.name);
  return {
    name: title.name,
    description: `${title.term ? `${title.term} ` : ''}${title.name}，活動日期${rocDateText(album.eventDate)}，共 ${album.photos.length} 張照片。`,
    image: album.photos[0]?.url ?? null,
    images: album.photos.slice(0, 20).map((photo) => ({ url: photo.url, alt: photo.alt })),
    type: 'gallery',
    published: album.eventDate,
    modified: album.modifiedAt,
    breadcrumb: [HOME_CRUMB, { name: '活動剪影', route: '/photos' }],
    text: album.photos.map((photo) => photo.alt).join('、'),
  };
}

export default {
  /** 有照片的相簿，每本帶有 photos */
  async load({ db, storage }) {
    const albums = await db.prepare(`
      SELECT * FROM albums a WHERE EXISTS (SELECT 1 FROM photos p WHERE p.album_id = a.id) ORDER BY event_date DESC, id DESC
    `).all();
    const photos = await db.prepare('SELECT * FROM photos WHERE album_id IS NOT NULL ORDER BY id DESC').all();
    for (const album of albums) {
      album.photos = photos.filter((photo) => photo.albumId === album.id).map((photo) => ({ ...photo, url: storage.displayUrlOf(photo) }));
    }
    return { albums };
  },

  /** 首頁「活動剪影」區塊 */
  home: ({ albums }) => (u) => html`
      <section aria-labelledby="home-photos">
        <div class="section-head stop">
          <h2 id="home-photos">活動剪影</h2>
          ${albums.length > 0 && html`<a href="${u.to('/photos')}">查看所有相簿</a>`}
        </div>
        ${albumGrid(albums.slice(0, HOME_ALBUMS), u)}
        ${!albums.length && emptyStatus('目前沒有相簿。')}
      </section>`,

  pages: (site, { albums }) => [
    {
      ...albumsPage(albums),
      meta: listMeta('活動剪影', `${site.config.siteTitle}的活動剪影，共 ${albums.length} 本相簿。`, latest(albums.map((a) => a.modifiedAt)), albums[0]?.photos[0]?.url),
    },
    ...albums.map((album) => ({ ...albumPage(album), meta: albumMeta(album) })),
  ],
};
