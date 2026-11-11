import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allLinks, editorRows, linkInput, menuLink, moveLink, navigationKeys, parsePageUrl } from './navigation.js';

test('連結換成網址與名稱：root 的頁面在第一層，其他頁面在 /pages 底下', () => {
  assert.deepEqual(menuLink({ service: 'HOME', page: null }), { key: 'HOME', to: '/', label: '首頁' });
  assert.deepEqual(menuLink({ service: null, page: { slug: 'about', title: '簡介', root: true } }), { key: 'page:about', to: '/about', label: '簡介' });
  assert.equal(menuLink({ service: null, page: { slug: 'photo-wall', title: '照片', root: false } }).to, '/pages/photo-wall');
});

test('頁面網址輸入框：開頭有 / 在第一層，沒有或寫 /pages/ 在 /pages 底下', () => {
  assert.deepEqual(parsePageUrl('/test'), { slug: 'test', root: true });
  assert.deepEqual(parsePageUrl('test'), { slug: 'test', root: false });
  assert.deepEqual(parsePageUrl(' /pages/guide-2026/ '), { slug: 'guide-2026', root: false });
  for (const bad of ['', '/', 'Test', '/a/b', 'a--b']) assert.equal(parsePageUrl(bad), null, bad);
});

test('key 與 API 的輸入互換', () => {
  assert.deepEqual(linkInput('PHOTOS'), { service: 'PHOTOS' });
  assert.deepEqual(linkInput('page:a-b'), { page: 'a-b' });
  const navigation = { utility: [{ service: 'HOME', page: null }], main: [{ service: null, page: { slug: 'a', title: 'A' } }] };
  assert.deepEqual(navigationKeys(navigation), { utility: ['HOME'], main: ['page:a'] });
});

test('編輯畫面列出還沒放進選單的功能與頁面，找不到的與重複的拿掉', () => {
  const links = allLinks([{ slug: 'a', title: 'A' }, { slug: 'b', title: 'B' }]);
  const rows = editorRows({ utility: ['HOME', 'page:gone', 'HOME'], main: ['page:a', 'HOME'] }, links);
  assert.deepEqual(rows.utility.map((link) => link.key), ['HOME']);
  assert.deepEqual(rows.main.map((link) => link.key), ['page:a']);
  assert.deepEqual(rows.unused.map((link) => link.key), ['ANNOUNCEMENTS', 'PHOTOS', 'DOCUMENTS', 'page:b']);
});

test('移動連結：同一列換位置、換到另一列，或從選單移除', () => {
  const keys = { utility: ['HOME', 'PHOTOS'], main: ['page:a'] };
  assert.deepEqual(moveLink(keys, 'HOME', 'utility', 1).utility, ['PHOTOS', 'HOME']);
  assert.deepEqual(moveLink(keys, 'page:b', 'main', 0), { utility: ['HOME', 'PHOTOS'], main: ['page:b', 'page:a'] });
  assert.deepEqual(moveLink(keys, 'PHOTOS', 'unused', 0), { utility: ['HOME'], main: ['page:a'] });
  assert.deepEqual(moveLink(keys, 'page:a', 'utility', -1).utility, ['page:a', 'HOME', 'PHOTOS']);
  assert.deepEqual(moveLink(keys, 'page:a', 'utility', 99).utility, ['HOME', 'PHOTOS', 'page:a']);
  assert.deepEqual(keys.utility, ['HOME', 'PHOTOS'], '不改動原本的排列');
});
