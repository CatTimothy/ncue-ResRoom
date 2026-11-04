import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { contentVersion, currentUser, notice, uploadPhotos } from './api.js';

const realFetch = globalThis.fetch;
const realTimeout = globalThis.setTimeout;

afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.setTimeout = realTimeout;
});

/** 記錄每次上傳；回傳值由 respond(alt) 決定 */
function mockUpload(respond = () => ({ data: { uploadPhoto: { id: '1' } } })) {
  const calls = [];
  globalThis.setTimeout = () => 0; // 提示文字的計時器不需要真的等待
  globalThis.fetch = async (_url, { body }) => {
    const { variables } = JSON.parse(body.get('operations'));
    calls.push(variables);
    const result = respond(variables.alt);
    if (result instanceof Error) throw result;
    if (result.status) return new Response('', { status: result.status });
    return new Response(JSON.stringify(result));
  };
  return calls;
}

const item = (name, number = null) => ({ file: new File(['x'], name), number, error: '' });

test('多張照片依序上傳：倒序送出，顯示時才會是選擇的順序', async () => {
  const calls = mockUpload();
  const version = contentVersion.value;
  const progress = [];
  const result = await uploadPhotos(
    [item('a.jpg', 1), item('b.jpg', 2), item('c.jpg', 3)],
    { alt: '參訪', albumId: '7' },
    { onProgress: (current) => progress.push(current) },
  );

  assert.deepEqual(calls.map((call) => call.alt), ['參訪（第 3 張）', '參訪（第 2 張）', '參訪（第 1 張）']);
  assert.ok(calls.every((call) => call.albumId === '7'));
  assert.deepEqual(progress, [1, 2, 3]);
  assert.deepEqual(result, { uploaded: 3, failed: [], remaining: [] });
  assert.equal(contentVersion.value, version + 1, '整批完成後只更新一次畫面');
  assert.equal(notice.value, '已上傳 3 張照片');
});

test('只有一張時不加編號', async () => {
  const calls = mockUpload();
  await uploadPhotos([item('a.jpg')], { alt: '合照', albumId: '1' });
  assert.equal(calls[0].alt, '合照');
  assert.equal(notice.value, '照片已上傳');
});

test('其中一張失敗時繼續上傳其他照片，並回報原因', async () => {
  mockUpload((alt) => (alt.includes('第 2 張') ? { errors: [{ message: '無法讀取這張照片' }] } : { data: {} }));
  const b = item('b.jpg', 2);
  const result = await uploadPhotos([item('a.jpg', 1), b, item('c.jpg', 3)], { alt: '參訪', albumId: '1' });
  assert.equal(result.uploaded, 2);
  assert.deepEqual(result.failed, [{ item: b, message: '無法讀取這張照片' }]);
  assert.deepEqual(result.remaining, []);
});

test('全部失敗時不更新畫面', async () => {
  mockUpload(() => new TypeError('Failed to fetch'));
  const version = contentVersion.value;
  const result = await uploadPhotos([item('a.jpg', 1), item('b.jpg', 2)], { alt: '參訪', albumId: '1' });
  assert.equal(result.uploaded, 0);
  assert.equal(result.failed.length, 2);
  assert.match(result.failed[0].message, /無法連線/);
  assert.equal(contentVersion.value, version);
});

test('要求停止時，目前這張傳完就停，其餘照片保留順序', async () => {
  const calls = mockUpload();
  const a = item('a.jpg', 1);
  const b = item('b.jpg', 2);
  const c = item('c.jpg', 3);
  let stop = false;
  const result = await uploadPhotos([a, b, c], { alt: '參訪', albumId: '1' }, {
    onProgress: () => { stop = true; },
    shouldStop: () => stop,
  });
  assert.equal(calls.length, 1);
  assert.equal(result.uploaded, 1);
  assert.deepEqual(result.remaining, [a, b]);
});

test('登入過期時停止上傳、回到未登入狀態，已傳成功的照片仍會顯示', async () => {
  currentUser.value = { username: 'a' };
  let count = 0;
  mockUpload(() => (++count === 2 ? { status: 401 } : { data: {} }));
  const version = contentVersion.value;
  await assert.rejects(
    uploadPhotos([item('a.jpg', 1), item('b.jpg', 2), item('c.jpg', 3)], { alt: '參訪', albumId: '1' }),
    /登入已過期/,
  );
  assert.equal(count, 2);
  assert.equal(currentUser.value, null);
  assert.ok(contentVersion.value > version);
});
