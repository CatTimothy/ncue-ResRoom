import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { translateDbError } from './errors.js';

const TIMESTAMPTZ_OID = 1184;

const toCamelCase = (key) => key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const camelizeRow = (row) => Object.fromEntries(
  Object.entries(row).map(([key, value]) => [toCamelCase(key), value]),
);

export async function openDb(connectionString) {
  if (!connectionString) throw new Error('必須設定 DATABASE_URL');

  const types = new pg.TypeOverrides();
  const parseTimestamp = types.getTypeParser(TIMESTAMPTZ_OID);
  types.setTypeParser(TIMESTAMPTZ_OID, (value) => parseTimestamp(value).toISOString());

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
