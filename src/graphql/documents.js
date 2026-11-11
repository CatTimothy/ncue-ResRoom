import { extname } from 'node:path';
import { fail } from '../lib/errors.js';
import { withPermission } from '../lib/guards.js';
import { paging } from '../lib/search.js';

export const documentsTypeDefs = /* GraphQL */ `
  type Document {
    id: ID!
    title: String!
    category: String
    url: String!
    filename: String!
    size: Int!
    createdAt: String!
  }

  extend type Query {
    documents(limit: Int = 50, offset: Int = 0): [Document!]!
  }

  extend type Mutation {
    uploadDocument(file: File!, title: String!, category: String): Document!
    updateDocument(id: ID!, title: String!, category: String): Document!
    deleteDocument(id: ID!): Boolean!
    "一次變更多份文件的分類；回傳實際變更的份數"
    setDocumentsCategory(ids: [ID!]!, category: String): Int!
    "一次刪除多份文件；回傳實際刪除的份數"
    deleteDocuments(ids: [ID!]!): Int!
  }
`;

export function createDocumentsResolvers({ db, storage }) {
  return {
    Query: {
      documents: (_, { limit, offset }) => db.prepare(`SELECT * FROM documents ORDER BY id DESC ${paging(1)}`).all(limit, offset),
    },

    Mutation: withPermission('MANAGE_DOCUMENTS', {
      async uploadDocument(_, { file, title, category }) {
        const ext = extname(file.name).toLowerCase();
        const bytes = Buffer.from(await file.arrayBuffer());
        return storage.save(bytes, ext, (storedName) => db.prepare(`
          INSERT INTO documents (stored_name, title, category, filename, size)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `).get(storedName, title, category ?? null, file.name, bytes.length));
      },

      async updateDocument(_, { id, title, category }) {
        const row = await db.prepare('UPDATE documents SET title = $1, category = $2 WHERE id = $3 RETURNING *')
          .get(title, category ?? null, id);
        return row ?? fail('找不到這份文件');
      },

      deleteDocument: (_, { id }) => storage.deleteRow('documents', id),

      async setDocumentsCategory(_, { ids, category }) {
        const rows = await db.prepare('UPDATE documents SET category = $1 WHERE id = ANY($2::bigint[]) RETURNING id')
          .all(category ?? null, ids);
        return rows.length;
      },

      async deleteDocuments(_, { ids }) {
        const rows = await db.prepare('DELETE FROM documents WHERE id = ANY($1::bigint[]) RETURNING stored_name').all(ids);
        await storage.removeFiles(rows.map((row) => row.storedName));
        return rows.length;
      },
    }),

    Document: { url: storage.urlOf },
  };
}
