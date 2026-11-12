import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderAnnouncement, renderPage } from '../../src/lib/content.js';
import { roundTrip } from './richText.js';

/** 比較顯示結果時忽略標籤之間的空白 */
const shown = (html) => html.replace(/>\s+</g, '><').trim();
const samePage = (source) => assert.equal(
  shown(renderPage({ format: 'MARKDOWN', source: roundTrip(source) })),
  shown(renderPage({ format: 'MARKDOWN', source })),
);

test('文字編輯器支援的格式存成 Markdown 後顯示不變', () => {
  samePage([
    '## 標題', '', '第一行\n第二行', '', '![說明](/files/display/x.webp)', '',
    '| a | b |\n|---|---|\n| 1 | 2 |', '', '> 引言', '', '1. 一\n2. 二', '', '- 甲\n- 乙', '',
    '**粗** *斜* ~~刪~~ [連結](https://example.com/a?b=1&c=2)', '', '---', '', '```\ncode\n```',
  ].join('\n'));
});

test('公告也一樣：單一換行維持換行', () => {
  const content = '第一行\n第二行\n\n[申請表.doc](/files/00000000-0000-0000-0000-000000000000.doc)';
  assert.equal(shown(renderAnnouncement({ content: roundTrip(content) })), shown(renderAnnouncement({ content })));
});
