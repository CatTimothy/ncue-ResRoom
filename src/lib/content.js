import { Marked, marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const { allowedTags, allowedAttributes } = sanitizeHtml.defaults;

const PAGE_OPTIONS = {
  allowedTags: [...allowedTags, 'img', 'iframe'],
  allowedAttributes: {
    ...allowedAttributes,
    '*': ['class', 'id', 'lang', 'dir', 'title', 'aria-*'],
    img: ['src', 'alt', 'width', 'height', 'loading'],
    iframe: ['src', 'title', 'width', 'height', 'allow', 'allowfullscreen', 'loading'],
  },
  // 僅允許影片與地圖嵌入
  allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com', 'www.google.com'],
  allowIframeRelativeUrls: false,
};

const ANNOUNCEMENT_OPTIONS = {
  allowedTags: [...allowedTags, 'img'],
  allowedAttributes: { ...allowedAttributes, img: ['src', 'alt', 'title'] },
  allowedSchemesByTag: { img: ['http', 'https'] },
};

// 公告只支援 Markdown：直接略過內嵌的 HTML
const markdownOnly = new Marked({ renderer: { html: () => '' } });

export function renderPage({ format, source }) {
  return sanitizeHtml(format === 'MARKDOWN' ? marked.parse(source) : source, PAGE_OPTIONS);
}

export function renderAnnouncement({ content }) {
  return sanitizeHtml(markdownOnly.parse(content), ANNOUNCEMENT_OPTIONS);
}
