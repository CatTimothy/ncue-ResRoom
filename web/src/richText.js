// 文字編輯器（RichTextEditor.vue）的內容格式：畫面上像文書處理器，存檔仍是 Markdown。
// 只用 Markdown 寫得出來、網站也會顯示的格式（src/lib/content.js 不顯示內嵌 HTML，所以沒有底線、顏色）
import { Markdown, MarkdownManager } from '@tiptap/markdown';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';

/** 和網站顯示一致：單一換行也會換行（src/lib/content.js 的 breaks） */
export const MARKED_OPTIONS = { breaks: true, gfm: true };

export const richTextExtensions = () => [
  StarterKit.configure({
    underline: false,
    heading: { levels: [1, 2, 3, 4] },
    link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
    dropcursor: { color: 'currentColor', width: 2 },
  }),
  // 圖片放在段落裡，和 Markdown 的 ![說明](網址) 一樣
  Image.configure({ inline: true }),
  TableKit.configure({ table: { resizable: false } }),
  Markdown.configure({ markedOptions: MARKED_OPTIONS }),
];

/** 不開編輯器也能轉換（測試用）：Markdown 讀進來再寫回去 */
export function roundTrip(markdown) {
  const manager = new MarkdownManager({ extensions: richTextExtensions(), markedOptions: MARKED_OPTIONS });
  return manager.serialize(manager.parse(markdown));
}
