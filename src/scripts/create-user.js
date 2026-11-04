// 建立第一位使用者，或在忘記密碼時重設：npm run create-user -- <username>
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { openDb } from '../db/index.js';
import { saveUser } from '../lib/password.js';

const [username] = process.argv.slice(2);
if (!username) {
  console.error('用法：npm run create-user -- <username>');
  process.exit(1);
}

// 不把密碼放在命令列參數，也不回顯，避免留在 shell 歷史或畫面上
process.stdout.write('請輸入密碼（至少 12 字元）：');
const silent = new Writable({ write: (_chunk, _encoding, done) => done() });
const prompt = createInterface({ input: process.stdin, output: silent, terminal: Boolean(process.stdin.isTTY) });
const password = await prompt.question('');
prompt.close();
process.stdout.write('\n');

const db = await openDb(process.env.DATABASE_URL);
try {
  await saveUser(db, username, password);
  console.log(`使用者 ${username} 已設定完成`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
