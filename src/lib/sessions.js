import { createHash, randomBytes } from 'node:crypto';

const SESSION_SECONDS = 7 * 24 * 60 * 60;

const hashToken = (token) => createHash('sha256').update(token).digest();

export function createSessions({ db, production }) {
  const cookie = (value, maxAge) => (
    `session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${production ? '; Secure' : ''}`
  );

  return {
    /** 從 Cookie 標頭取得目前的使用者 */
    async current(cookieHeader) {
      const token = cookieHeader && /(?:^|;\s*)session=([^;]+)/.exec(cookieHeader)?.[1];
      if (!token) return { user: null, tokenHash: null };
      const tokenHash = hashToken(token);
      const user = await db.prepare(`
        SELECT users.* FROM sessions JOIN users USING (username)
        WHERE sessions.token_hash = $1 AND sessions.expires_at > now()
      `).get(tokenHash);
      return user ? { user, tokenHash } : { user: null, tokenHash: null };
    },

    /** 建立登入狀態並設定 cookie；資料庫只保存權杖的雜湊 */
    async start(username, res) {
      await db.prepare('DELETE FROM sessions WHERE expires_at <= now()').run();
      const token = randomBytes(32).toString('base64url');
      await db.prepare(`
        INSERT INTO sessions (token_hash, username, expires_at)
        VALUES ($1, $2, now() + $3::int * interval '1 second')
      `).run(hashToken(token), username, SESSION_SECONDS);
      res.setHeader('Set-Cookie', cookie(token, SESSION_SECONDS));
    },

    async end(tokenHash, res) {
      if (tokenHash) await db.prepare('DELETE FROM sessions WHERE token_hash = $1').run(tokenHash);
      res.setHeader('Set-Cookie', cookie('', 0));
    },
  };
}
