import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { translateDbError } from './errors.js';

const TIMESTAMPTZ_OID = 1184;
const DATE_OID = 1082;

const toCamelCase = (key) => key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const camelizeRow = (row) => Object.fromEntries(
  Object.entries(row).map(([key, value]) => [toCamelCase(key), value]),
);

/** camelizeRow 的反向：GraphQL 的輸入物件轉成欄位名稱，例如交給 jsonb_populate_record */
export const snakeizeKeys = (object) => Object.fromEntries(
  Object.entries(object).map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), value]),
);

export async function openDb(connectionString) {
  if (!connectionString) throw new Error('必須設定 DATABASE_URL');

  const types = new pg.TypeOverrides();
  const parseTimestamp = types.getTypeParser(TIMESTAMPTZ_OID);
  types.setTypeParser(TIMESTAMPTZ_OID, (value) => parseTimestamp(value).toISOString());
  // 日期沒有時區，維持 YYYY-MM-DD，轉成 Date 反而會受伺服器時區影響
  types.setTypeParser(DATE_OID, (value) => value);

  const pool = new pg.Pool({ connectionString, types });
  // 閒置連線斷線時 pool 會發出 error；未監聽會讓整個程序結束
  pool.on('error', (error) => console.error('PostgreSQL 連線錯誤：', error.message));

  try {
    await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  } catch (error) {
    await pool.end();
    throw error;
  }

  return {
    /** 具名的伺服器端 prepared statement：prepare(sql).get / all / run(...參數) */
    prepare(text) {
      const name = `q_${createHash('sha256').update(text).digest('hex').slice(0, 32)}`;
      const execute = (values) => pool.query({ name, text, values }).catch((error) => {
        throw translateDbError(error);
      });
      return {
        get: async (...values) => {
          const { rows } = await execute(values);
          return rows[0] && camelizeRow(rows[0]);
        },
        all: async (...values) => (await execute(values)).rows.map(camelizeRow),
        run: async (...values) => ({ changes: (await execute(values)).rowCount }),
      };
    },
    close: () => pool.end(),
  };
}
