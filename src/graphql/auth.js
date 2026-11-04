import { gqlError } from '../lib/errors.js';
import { hashPassword, MAX_PASSWORD_LENGTH, verifyPassword } from '../lib/password.js';

export const authTypeDefs = /* GraphQL */ `
  type User {
    username: String!
  }

  extend type Query {
    "目前登入的使用者，未登入時為 null"
    me: User
  }

  extend type Mutation {
    login(username: String!, password: String!): User!
    logout: Boolean!
  }
`;

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

export function createAuthResolvers({ db, sessions }) {
  const attempts = new Map();

  /** 累計一次登入嘗試，回傳是否仍在限制內 */
  function recordAttempt(key) {
    const now = Date.now();
    if (attempts.size > 10000) {
      for (const [k, entry] of attempts) if (entry.resetAt <= now) attempts.delete(k);
    }
    const entry = attempts.get(key);
    if (!entry || entry.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }
    entry.count += 1;
    return entry.count <= MAX_ATTEMPTS;
  }

  return {
    Query: {
      me: (_, __, context) => context.user,
    },

    Mutation: {
      async login(_, { username, password }, context) {
        const key = `${context.req.socket.remoteAddress}:${username}`;
        if (!recordAttempt(key)) throw gqlError('嘗試次數過多，請 15 分鐘後再試', 'TOO_MANY_REQUESTS');

        const user = await db.prepare('SELECT * FROM users WHERE username = $1').get(username);
        let valid = false;
        if (password.length <= MAX_PASSWORD_LENGTH) {
          // 帳號不存在時同樣計算雜湊，避免從回應時間判斷帳號是否存在
          if (user) valid = await verifyPassword(password, user.passwordHash);
          else await hashPassword(password);
        }
        if (!valid) throw gqlError('帳號或密碼錯誤', 'BAD_CREDENTIALS');

        attempts.delete(key);
        await sessions.start(user.username, context.res);
        return user;
      },

      async logout(_, __, context) {
        await sessions.end(context.tokenHash, context.res);
        return true;
      },

    },
  };
}
