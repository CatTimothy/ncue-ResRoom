import { TAIPEI_TODAY } from '../lib/search.js';

export const visitsTypeDefs = /* GraphQL */ `
  extend type Query {
    "今天（台灣時區）的訪問人數"
    todayVisits: Int!
  }

  extend type Mutation {
    "不需登入。記錄一位今天的訪客並回傳人數；同一位訪客一天只記一次由前端負責"
    recordVisit: Int!
  }
`;

export function createVisitsResolvers({ db }) {
  return {
    Query: {
      async todayVisits() {
        const row = await db.prepare(`SELECT visitors FROM daily_visits WHERE day = ${TAIPEI_TODAY}`).get();
        return row?.visitors ?? 0;
      },
    },

    Mutation: {
      async recordVisit() {
        const { visitors } = await db.prepare(`
          INSERT INTO daily_visits (day, visitors) VALUES (${TAIPEI_TODAY}, 1)
          ON CONFLICT (day) DO UPDATE SET visitors = daily_visits.visitors + 1
          RETURNING visitors
        `).get();
        return visitors;
      },
    },
  };
}
