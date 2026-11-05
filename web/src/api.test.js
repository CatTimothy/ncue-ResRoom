import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { can, contentVersion, currentUser, notice, uploadDocuments, uploadPhotos } from './api.js';
import { permissionsText } from './permissions.js';

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

const item = (name) => ({ file: new File(['x'], name), alt: `說明 ${name}`, error: '' });

test('多張照片依序上傳：倒序送出，顯示時才會是選擇的順序', async () => {
  const calls = mockUpload();
  const version = contentVersion.value;
  const progress = [];
  const result = await uploadPhotos(
    [item('a.jpg'), item('b.jpg'), item('c.jpg')],
    '7',
    { onProgress: (current) => progress.push(current) },
  );

  assert.deepEqual(calls.map((call) => call.alt), ['說明 c.jpg', '說明 b.jpg', '說明 a.jpg'], '每張用自己的說明');
  assert.ok(calls.every((call) => call.albumId === '7'));
  assert.deepEqual(progress, [1, 2, 3]);
  assert.deepEqual(result, { uploaded: 3, failed: [], remaining: [] });
  assert.equal(contentVersion.value, version + 1, '整批完成後只更新一次畫面');
  assert.equal(notice.value, '已上傳 3 張照片');
});

test('只有一張時的提示文字', async () => {
  mockUpload();
  await uploadPhotos([item('a.jpg')], '1');
  assert.equal(notice.value, '照片已上傳');
});

test('其中一張失敗時繼續上傳其他照片，並回報原因', async () => {
  mockUpload((alt) => (alt.includes('b.jpg') ? { errors: [{ message: '無法讀取這張照片' }] } : { data: {} }));
  const b = item('b.jpg');
  const result = await uploadPhotos([item('a.jpg'), b, item('c.jpg')], '1');
  assert.equal(result.uploaded, 2);
  assert.deepEqual(result.failed, [{ item: b, message: '無法讀取這張照片' }]);
  assert.deepEqual(result.remaining, []);
});

test('全部失敗時不更新畫面', async () => {
  mockUpload(() => new TypeError('Failed to fetch'));
  const version = contentVersion.value;
  const result = await uploadPhotos([item('a.jpg'), item('b.jpg')], '1');
  assert.equal(result.uploaded, 0);
  assert.equal(result.failed.length, 2);
  assert.match(result.failed[0].message, /無法連線/);
  assert.equal(contentVersion.value, version);
});

test('要求停止時，目前這張傳完就停，其餘照片保留順序', async () => {
  const calls = mockUpload();
  const a = item('a.jpg');
  const b = item('b.jpg');
  const c = item('c.jpg');
  let stop = false;
  const result = await uploadPhotos([a, b, c], '1', {
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
    uploadPhotos([item('a.jpg'), item('b.jpg'), item('c.jpg')], '1'),
    /登入已過期/,
  );
  assert.equal(count, 2);
  assert.equal(currentUser.value, null);
  assert.ok(contentVersion.value > version);
});

test('依目前使用者的權限判斷能不能操作', () => {
  currentUser.value = null;
  assert.equal(can('MANAGE_PAGES'), false);
  currentUser.value = { username: 'a', permissions: ['MANAGE_PAGES'] };
  assert.equal(can('MANAGE_PAGES'), true);
  assert.equal(can('MANAGE_USERS'), false);
  currentUser.value = null;
});

test('權限名稱依固定順序列出', () => {
  assert.equal(permissionsText([]), '沒有權限');
  assert.equal(permissionsText(['MANAGE_USERS', 'MANAGE_ANNOUNCEMENTS']), '公告、帳號管理');
  assert.equal(permissionsText(['MANAGE_ANNOUNCEMENTS', 'MANAGE_ALBUMS', 'MANAGE_DOCUMENTS', 'MANAGE_PAGES', 'MANAGE_SITE_CONFIG', 'MANAGE_USERS']), '全部權限');
});

test('一次上傳多份文件，一份失敗不影響其他份，完成後只更新一次畫面', async () => {
  let count = 0;
  mockUpload(() => (++count === 2 ? { errors: [{ message: '不支援此文件格式' }] } : { data: { uploadDocument: { id: count } } }));
  const version = contentVersion.value;
  const results = await uploadDocuments([1, 2, 3].map((n) => ({ file: new File(['x'], `${n}.pdf`), title: String(n), category: null })));
  assert.deepEqual(results.map((result) => result.status), ['fulfilled', 'rejected', 'fulfilled']);
  assert.equal(contentVersion.value, version + 1);
});

test('上傳文件時登入過期就停止，只回報一次', async () => {
  currentUser.value = { username: 'a', permissions: [] };
  let count = 0;
  mockUpload(() => (++count === 1 ? { status: 401 } : { data: { uploadDocument: { id: count } } }));
  const results = await uploadDocuments([1, 2, 3].map((n) => ({ file: new File(['x'], `${n}.pdf`), title: String(n), category: null })));
  assert.equal(count, 1);
  assert.deepEqual(results.map((result) => result.status), ['rejected']);
  assert.match(results[0].reason.message, /登入已過期/);
  assert.equal(currentUser.value, null);
});
