import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createZip } from '../../src/lib/zip.js';
import { SITE_DATA_PERMISSIONS as SERVER_PERMISSIONS } from '../../src/lib/permissions.js';
import { countsText, importQuestion, readSiteData, SITE_DATA_PERMISSIONS } from './siteData.js';

async function zipFile(names) {
  const chunks = [];
  for await (const chunk of (await createZip(names.map((name) => ({ name, data: Buffer.from('x') })))).stream()) chunks.push(chunk);
  return new Blob(chunks);
}

test('site data permissions match the server', () => {
  assert.deepEqual(SITE_DATA_PERMISSIONS, SERVER_PERMISSIONS);
});

test('readSiteData counts the content of a site data zip, also inside one folder', async () => {
  const counts = await readSiteData(await zipFile([
    'seed/site-config.json', 'seed/pages/about.md', 'seed/pages/map.html', 'seed/announcements/2026-11-04-1.md',
    'seed/albums/2021-10-01 參訪/album.json', 'seed/albums/2021-10-01 參訪/a.jpg', 'seed/albums/2021-10-01 參訪/b.png',
    'seed/documents/documents.json', 'seed/documents/111學年度第一學期/申請表.doc', 'seed/images/map.png',
    '__MACOSX/seed/._about.md',
  ]));
  assert.deepEqual(counts, { pages: 2, announcements: 1, albums: 1, photos: 2, documents: 1 });
  assert.equal(countsText(counts), '2 個頁面、1 則公告、1 本相簿、2 張相簿照片、1 份文件');
  assert.match(importQuestion(counts), /^這份網站資料包含2 個頁面/);
});

test('readSiteData rejects other files', async () => {
  await assert.rejects(readSiteData(new Blob(['hello'])), /不是 ZIP/);
  await assert.rejects(readSiteData(await zipFile(['notes/readme.txt'])), /不是網站資料/);
});
