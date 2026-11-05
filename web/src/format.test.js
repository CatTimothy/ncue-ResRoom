import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileBaseName, fileSizeText, groupDocuments, markdownLink, fromLocalInput, fromRocInput, groupByYear, monthDayText, isScheduled, parseAlbum, rocDate, rocDateText, rocDateTimeText, rocShortDate, savedTimeText, taipeiDay, telHref, toLocalInput, toRocInput, wasEdited } from './format.js';

test('民國日期以台灣時區計算', () => {
  // UTC 11 月 3 日 16:30 在台灣已是 11 月 4 日
  assert.deepEqual(rocDate('2026-11-03T16:30:00Z'), { year: 115, month: 11, day: 4 });
  assert.equal(rocDateText('2026-11-03T16:30:00Z'), '民國 115 年 11 月 4 日');
});

test('Markdown 連結會跳脫文字裡的方括號', () => {
  assert.equal(markdownLink('報名表', '/files/a.pdf'), '[報名表](/files/a.pdf)');
  assert.equal(markdownLink('[115] 報名表', '/files/a.pdf'), String.raw`[\[115\] 報名表](/files/a.pdf)`);
});

test('文件依分類分組，其他文件固定在最後', () => {
  const documents = [
    { id: 4, category: null },
    { id: 3, category: '115學年度' },
    { id: 2, category: '其他文件' },
    { id: 1, category: '114學年度' },
  ];
  assert.deepEqual(
    groupDocuments(documents).map(([name, items]) => [name, items.map((item) => item.id)]),
    [['115學年度', [3]], ['114學年度', [1]], ['其他文件', [4, 2]]],
  );
  assert.deepEqual(groupDocuments([{ id: 1, category: 'A' }]).map(([name]) => name), ['A']);
  assert.deepEqual(groupDocuments([]), []);
});

test('電話號碼轉成 tel: 連結', () => {
  assert.equal(telHref('(04)7232105'), 'tel:+88647232105');
  assert.equal(telHref('04-723 2105'), 'tel:+88647232105');
  assert.equal(telHref('+886 4 7232105'), 'tel:+88647232105');
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

test('公告的短日期：時間與純日期都以台灣時區計算', () => {
  assert.equal(rocShortDate('2026-11-03T16:30:00Z'), '115/11/04');
  assert.equal(rocShortDate('2026-11-10'), '115/11/10');
});

test('今天以台灣時區計算', () => {
  assert.equal(taipeiDay(Date.parse('2026-11-03T16:30:00Z')), '2026-11-04');
  assert.equal(taipeiDay(Date.parse('2026-11-03T15:30:00Z')), '2026-11-03');
});

test('照片說明的預設值是去掉副檔名的檔名', () => {
  assert.equal(fileBaseName('校外參訪 01.final.JPG'), '校外參訪 01.final');
  assert.equal(fileBaseName('沒有副檔名'), '沒有副檔名');
  assert.equal(fileBaseName('.jpg'), '.jpg');
});

test('民國日期輸入轉成西元，各種寫法都接受', () => {
  for (const text of ['115/11/04', '115/11/4', '115-11-4', '115.11.4', '115／11／4', '115年11月4日', ' 115/11/04 ']) {
    assert.equal(fromRocInput(text), '2026-11-04', text);
  }
  assert.equal(fromRocInput('99/1/2'), '2010-01-02');
  assert.equal(fromRocInput('115/11/4 9:05', true), '2026-11-04T09:05');
  assert.equal(fromRocInput('115年11月4日 15:20', true), '2026-11-04T15:20');
  assert.equal(fromRocInput(''), '');
});

test('民國日期輸入拒絕不存在的日期與錯誤格式', () => {
  for (const text of ['115/2/30', '115/13/1', '115/0/1', '0/1/1', '2026/11/04', '115/11', 'abc']) {
    assert.equal(fromRocInput(text), null, text);
  }
  assert.equal(fromRocInput('115/11/4', true), null, '需要時間時不可省略');
  assert.equal(fromRocInput('115/11/4 15:20'), null, '只要日期時不可加時間');
  assert.equal(fromRocInput('115/11/4 24:00', true), null);
  assert.equal(fromRocInput('115/11/4 12:60', true), null);
  assert.equal(fromRocInput('116/2/29'), null, '民國 116 年不是閏年');
  assert.equal(fromRocInput('113/2/29'), '2024-02-29', '民國 113 年是閏年');
});

test('西元輸入值轉成民國顯示', () => {
  assert.equal(toRocInput('2026-11-04'), '115/11/04');
  assert.equal(toRocInput('2026-11-04T15:20'), '115/11/04 15:20');
  assert.equal(toRocInput(''), '');
  assert.equal(fromRocInput(toRocInput('2026-11-04T15:20'), true), '2026-11-04T15:20');
});

test('公告依民國年分組，跨年以台灣時區為準，順序不變', () => {
  const a = { publishedAt: '2026-11-03T16:30:00Z' };
  const b = { publishedAt: '2026-01-01T00:00:00Z' };
  const c = { publishedAt: '2025-12-31T16:30:00Z' }; // 台灣時間已是 115 年 1 月 1 日
  const d = { publishedAt: '2025-12-31T15:30:00Z' }; // 台灣時間還是 114 年
  assert.deepEqual(groupByYear([a, b, c, d]), [{ year: 115, items: [a, b, c] }, { year: 114, items: [d] }]);
  assert.deepEqual(groupByYear([]), []);
});

test('清單的月日以台灣時區計算', () => {
  assert.equal(monthDayText('2026-11-03T16:30:00Z'), '11月4日');
  assert.equal(monthDayText('2026-12-31T00:00:00Z'), '12月31日');
});
