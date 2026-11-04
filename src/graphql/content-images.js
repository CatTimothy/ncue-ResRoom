import { withLogin } from '../lib/guards.js';

export const contentImagesTypeDefs = /* GraphQL */ `
  type ContentImage {
    "壓縮版網址，可直接寫進 Markdown"
    url: String!
    "原始檔名（不含副檔名），可當作圖片說明的預設值"
    name: String!
  }

  extend type Mutation {
    "上傳公告或頁面內文要用的圖片；沒有內容引用超過 1 天的圖片，會在下次上傳時清除"
    uploadContentImage(file: File!): ContentImage!
  }
`;

export function createContentImagesResolvers({ storage }) {
  return {
    Mutation: withLogin({
      uploadContentImage: (_, { file }) => storage.saveContentImage(file),
    }),
  };
}
