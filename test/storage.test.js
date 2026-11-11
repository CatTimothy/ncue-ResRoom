import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createStorage } from '../src/lib/storage.js';

test('上傳資料夾無法寫入時，啟動就失敗並說明原因', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'resroom-storage-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // DATA_DIR 指到一個檔案，底下無法建立資料夾
  const dataDir = join(dir, 'not-a-folder');
  writeFileSync(dataDir, '');
  assert.throws(() => createStorage({ db: null, dataDir }), /無法寫入上傳資料夾.*DATA_DIR/);
});

test('資料夾可以寫入時正常建立，且不留下測試檔', (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'resroom-storage-'));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  createStorage({ db: null, dataDir });
  assert.deepEqual(readdirSync(join(dataDir, 'uploads')), []);
});

