import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fail } from './errors.js';
import { ALL_PERMISSIONS } from './permissions.js';

const scryptAsync = promisify(scrypt);
const SCRYPT = { N: 2 ** 15, r: 8, p: 3, maxmem: 128 * 1024 * 1024 };
const KEY_LENGTH = 32;

export const MAX_PASSWORD_LENGTH = 200;

export function checkPasswordStrength(password) {
  if (password.length < 12 || password.length > MAX_PASSWORD_LENGTH) {
    fail(`密碼長度須為 12 到 ${MAX_PASSWORD_LENGTH} 字元`);
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const { N, r, p } = SCRYPT;
  const key = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT);
  return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const [, N, r, p, salt, expected] = stored.split('$');
  const expectedKey = Buffer.from(expected, 'base64');
  const key = await scryptAsync(password, Buffer.from(salt, 'base64'), expectedKey.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return timingSafeEqual(key, expectedKey);
}

/** 第一次啟動時自動建立的帳號。密碼是公開的，登入後要立刻更改 */
export const DEFAULT_USER = { username: 'admin', password: 'admin123456789' };

/**
 * 還沒有任何使用者時，建立預設帳號（有全部權限）。
 * 回傳 'created'（剛建立）、'unchanged'（預設帳號還在用預設密碼）或 null。
 */
export async function ensureDefaultUser(db) {
  const { username, password } = DEFAULT_USER;
  if (!await db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
    // 兩個程序同時啟動時只有一個會新增
    const { changes } = await db.prepare(`
      INSERT INTO users (username, password_hash, permissions)
      SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM users)
    `).run(username, await hashPassword(password), ALL_PERMISSIONS);
    if (changes > 0) return 'created';
  }
  const user = await db.prepare('SELECT password_hash FROM users WHERE username = $1').get(username);
  return user && await verifyPassword(password, user.passwordHash) ? 'unchanged' : null;
}

/** 建立使用者（有全部權限）；已存在時重設密碼並登出其所有裝置，權限不變。供 CLI 使用。 */
export async function saveUser(db, username, password) {
  checkPasswordStrength(password);
  await db.prepare(`
    WITH saved AS (
      INSERT INTO users (username, password_hash, permissions) VALUES ($1, $2, $3)
      ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash
      RETURNING username
    )
    DELETE FROM sessions WHERE username IN (SELECT username FROM saved)
  `).run(username, await hashPassword(password), ALL_PERMISSIONS);
}
