import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileSizeText, fromLocalInput, isScheduled, parseAlbum, rocDate, rocDateText, rocDateTimeText, savedTimeText, toLocalInput, wasEdited } from './format.js';

test('民國日期以台灣時區計算', () => {
  // UTC 11 月 3 日 16:30 在台灣已是 11 月 4 日
  assert.deepEqual(rocDate('2026-11-03T16:30:00Z'), { year: 115, month: 11, day: 4 });
  assert.equal(rocDateText('2026-11-03T16:30:00Z'), '民國 115 年 11 月 4 日');
});

test('時間以台灣時區顯示', () => {
  const text = savedTimeText(Date.parse('2026-11-03T16:30:00Z'));
  assert.match(text, /11\/4/);
  assert.match(text, /00:30/);
  assert.equal(rocDateTimeText('2026-11-03T16:30:00Z'), '民國 115 年 11 月 4 日 00:30');
});

test('拆開相簿名稱中的學年與學期', () => {
  assert.deepEqual(parseAlbum('110(1)校外參訪活動'), { term: '110 學年度第 1 學期', name: '校外參訪活動' });
  assert.deepEqual(parseAlbum('111(1) 職場攻略活動'), { term: '111 學年度第 1 學期', name: '職場攻略活動' });
  assert.deepEqual(parseAlbum('109（2）特教宣導週'), { term: '109 學年度第 2 學期', name: '特教宣導週' });
  assert.deepEqual(parseAlbum('校園風景'), { term: null, name: '校園風景' });
});

test('判斷是否編輯過與是否未發布', () => {
  assert.equal(wasEdited({ createdAt: 'a', modifiedAt: 'a' }), false);
  assert.equal(wasEdited({ createdAt: 'a', modifiedAt: 'b' }), true);
  assert.equal(isScheduled({ publishedAt: '2026-01-02T00:00:00Z' }, Date.parse('2026-01-01T00:00:00Z')), true);
  assert.equal(isScheduled({ publishedAt: '2026-01-01T00:00:00Z' }, Date.parse('2026-01-02T00:00:00Z')), false);
});

test('datetime-local 的值可以轉回同一個時間', () => {
  const iso = '2026-11-03T16:30:00.000Z';
  assert.match(toLocalInput(iso), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(fromLocalInput(toLocalInput(iso)), iso);
});

test('檔案大小', () => {
  assert.equal(fileSizeText(100), '1 KB');
  assert.equal(fileSizeText(2048), '2 KB');
  assert.equal(fileSizeText(3 * 1024 * 1024), '3.0 MB');
});
