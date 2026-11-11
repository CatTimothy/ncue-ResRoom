import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tarHeader, tarPadding, TAR_END } from '../../src/lib/tar.js';
import { SITE_DATA_PERMISSIONS as SERVER_PERMISSIONS } from '../../src/lib/permissions.js';
import { countsText, importQuestion, readSiteData, SITE_DATA_PERMISSIONS } from './siteData.js';

const archive = (name, data) => {
  const json = Buffer.from(JSON.stringify(data));
  return new Blob([tarHeader(name, json.length), json, tarPadding(json.length), TAR_END]);
};

test('site data permissions match the server', () => {
  assert.deepEqual(SITE_DATA_PERMISSIONS, SERVER_PERMISSIONS);
});

test('readSiteData summarizes an exported file', async () => {
  const file = archive('data.json', {
    format: 'ncue-resroom-site-data',
    version: 1,
    exportedAt: '2026-11-11T02:00:00.000Z',
    tables: { pages: [{}, {}], announcements: [{}], photos: [], documents: [{}] },
  });
  const summary = await readSiteData(file);
  assert.deepEqual(summary, {
    exportedAt: '2026-11-11T02:00:00.000Z',
    counts: { pages: 2, announcements: 1, albums: 0, photos: 0, documents: 1 },
  });
  assert.equal(countsText(summary.counts), '2 個頁面、1 則公告、沒有相簿、沒有照片與內文圖片、1 份文件');
  assert.match(importQuestion(summary), /輸出於 .+，包含2 個頁面/);
});

test('readSiteData rejects other files', async () => {
  await assert.rejects(readSiteData(new Blob(['hello'])), /不是本網站/);
  await assert.rejects(readSiteData(archive('other.json', { format: 'ncue-resroom-site-data', tables: {} })), /不是本網站/);
  await assert.rejects(readSiteData(archive('data.json', { format: 'other', tables: {} })), /不是本網站/);
});
