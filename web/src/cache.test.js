import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCache } from './cache.js';

function memoryStorage(limit = Infinity) {
  const map = new Map();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (key) => map.get(key) ?? null,
    removeItem: (key) => map.delete(key),
    setItem(key, value) {
      if (map.size >= limit && !map.has(key)) throw new Error('QuotaExceededError');
      map.set(key, value);
    },
  };
}

test('存入後可讀回內容與時間', () => {
  const store = memoryStorage();
  const cache = createCache(() => store, () => 1000);
  cache.write('a', [1, 2]);
  assert.deepEqual(cache.read('a'), { time: 1000, data: [1, 2] });
  assert.equal(cache.read('missing'), null);
});

test('超過 1 小時的內容視為沒有快取，並從儲存空間移除', () => {
  const store = memoryStorage();
  let time = 0;
  const cache = createCache(() => store, () => time);
  cache.write('a', 1);
  time = 59 * 60 * 1000;
  assert.equal(cache.read('a').data, 1);
  time = 61 * 60 * 1000;
  assert.equal(cache.read('a'), null);
  assert.equal(store.length, 0);
});

test('過大的內容不存，也不留下舊副本', () => {
  const store = memoryStorage();
  const cache = createCache(() => store, () => 1);
  cache.write('a', 'old');
  cache.write('a', 'x'.repeat(300 * 1024));
  assert.equal(cache.read('a'), null);
  assert.equal(store.length, 0);
});

test('空間不足時清除快取，再存入新內容', () => {
  const store = memoryStorage(4);
  let time = 0;
  const cache = createCache(() => store, () => ++time);
  ['a', 'b', 'c', 'd'].forEach((key) => cache.write(key, key));
  cache.write('e', 'e');
  assert.equal(cache.read('a'), null);
  assert.equal(cache.read('d'), null);
  assert.equal(cache.read('e').data, 'e');
});

test('清除快取時保留同一來源的其他資料，也清掉舊版本', () => {
  const store = memoryStorage();
  store.setItem('other', 'keep');
  store.setItem('resroom:v1:old', '{}');
  const cache = createCache(() => store, () => 1);
  cache.write('a', 1);
  cache.write('b', 2);
  cache.clear();
  assert.deepEqual([...store.map.keys()], ['other']);
});

test('資料毀損或無法使用儲存空間時不會出錯', () => {
  const store = memoryStorage();
  store.setItem('resroom:v4:a', '{壞掉');
  assert.equal(createCache(() => store).read('a'), null);

  const blocked = createCache(() => {
    throw new Error('SecurityError');
  });
  blocked.write('a', 1);
  blocked.remove('a');
  blocked.clear();
  assert.equal(blocked.read('a'), null);
});
