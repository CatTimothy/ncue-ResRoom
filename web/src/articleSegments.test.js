import assert from 'node:assert/strict';
import { test } from 'node:test';
import { replaceImageAlt } from './articleSegments.js';

const photo = (url, index = 0, total = 1) => ({ url, sameUrl: { index, total } });

test('修改內文裡圖片的說明，其他內容不變', () => {
  assert.equal(
    replaceImageAlt('前面\n![舊的](/files/a.webp)\n後面', photo('/files/a.webp'), '新的'),
    '前面\n![新的](/files/a.webp)\n後面',
  );
});

test('同網址的圖片只改指定的那一張', () => {
  const source = '![一](/a.webp) ![二](/b.webp) ![三](/a.webp)';
  assert.equal(replaceImageAlt(source, photo('/a.webp', 1, 2), '新的'), '![一](/a.webp) ![二](/b.webp) ![新的](/a.webp)');
  assert.equal(replaceImageAlt(source, photo('/b.webp'), '新的'), '![一](/a.webp) ![新的](/b.webp) ![三](/a.webp)');
});

test('保留圖片標題與角括號網址，新說明的方括號會跳脫', () => {
  assert.equal(replaceImageAlt('![舊](/a.webp "標題")', photo('/a.webp'), '新'), '![新](/a.webp "標題")');
  assert.equal(replaceImageAlt('![舊](</a b.webp>)', photo('/a b.webp'), '新'), '![新](</a b.webp>)');
  assert.equal(replaceImageAlt('![舊](/a.webp)', photo('/a.webp'), '[115] 新'), String.raw`![\[115\] 新](/a.webp)`);
  assert.equal(replaceImageAlt(String.raw`![舊\]的](/a.webp)`, photo('/a.webp'), '新'), '![新](/a.webp)');
});

test('網址編碼不同也能對應', () => {
  assert.equal(replaceImageAlt('![舊](/圖.webp)', photo('/%E5%9C%96.webp'), '新'), '![新](/圖.webp)');
});

test('內文和畫面對不起來時不修改', () => {
  assert.throws(() => replaceImageAlt('沒有圖片', photo('/a.webp'), '新'), /找不到/);
  assert.throws(() => replaceImageAlt('<img src="/a.webp">', photo('/a.webp'), '新'), /找不到/);
  // 畫面上只有一張，內文卻有兩段語法：其中一段可能在程式碼區塊裡，分不出是哪一張
  assert.throws(() => replaceImageAlt('`![程式碼](/a.webp)`\n![真的](/a.webp)', photo('/a.webp'), '新'), /找不到/);
});

test('說明不可為空', () => {
  assert.throws(() => replaceImageAlt('![舊](/a.webp)', photo('/a.webp'), ''), /不可為空/);
});
