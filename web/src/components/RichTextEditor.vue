<script setup>
// 像文書處理器的文字編輯器：直接看到排版後的樣子，存檔仍是 Markdown（格式見 ../richText.js）
import { EditorContent, useEditor } from '@tiptap/vue-3';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { can, uploadContentImage, uploadDocuments } from '../api.js';
import { DOCUMENT_ACCEPT, parseDocumentName } from '../format.js';
import { richTextExtensions } from '../richText.js';
import { isExtensionEnabled } from '../siteConfig.js';

const props = defineProps({
  modelValue: { type: String, required: true },
  disabled: Boolean,
  /** 輸入區的名稱，給螢幕報讀軟體 */
  label: { type: String, default: '內容' },
});
const emit = defineEmits(['update:modelValue', 'error']);

const canUploadDocuments = can('MANAGE_DOCUMENTS') && isExtensionEnabled('DOCUMENTS');
const fileInput = ref(null);
const documentInput = ref(null);
const uploading = ref(0);
/** 還在上傳的拖放位置；上傳期間內容可能改變，位置要跟著移動 */
const pendingDrops = new Set();
/** 最後一次送出去的內容；外面傳回同樣的值時不用重新載入（會讓游標跳到最前面） */
let lastValue = props.modelValue;

const isImage = (file) => file.type.startsWith('image/');

const editor = useEditor({
  content: props.modelValue,
  contentType: 'markdown',
  editable: !props.disabled,
  extensions: richTextExtensions(),
  editorProps: {
    attributes: {
      class: 'article__body rich-text__content',
      'aria-label': props.label,
      'aria-multiline': 'true',
      role: 'textbox',
    },
    // 檔案要自己上傳：擋下瀏覽器預設的行為。拖動文字則交給編輯器
    handleDrop: (view, event) => {
      if (!event.dataTransfer?.files.length) return false;
      event.preventDefault();
      const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.head;
      insertFiles([...event.dataTransfer.files], pos);
      return true;
    },
    // 貼上圖片：上傳後插在游標位置
    handlePaste: (view, event) => {
      const files = [...(event.clipboardData?.files ?? [])].filter(isImage);
      if (!files.length) return false;
      event.preventDefault();
      insertFiles(files, view.state.selection.head);
      return true;
    },
  },
  onUpdate: ({ editor: current }) => {
    lastValue = current.getMarkdown();
    emit('update:modelValue', lastValue);
  },
  onTransaction: ({ transaction }) => {
    if (!transaction.docChanged) return;
    for (const drop of pendingDrops) drop.pos = transaction.mapping.map(drop.pos);
  },
});

// 內容載入後（或外面換了內容）重新放進編輯器；不算使用者的修改
watch(() => props.modelValue, (value) => {
  if (!editor.value || value === lastValue) return;
  lastValue = value;
  editor.value.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
});
watch(() => props.disabled, (disabled) => editor.value?.setEditable(!disabled));
onBeforeUnmount(() => pendingDrops.clear());

/** 上傳並回傳成功的結果；失敗的回報給外層。send 回傳 Promise.allSettled 的結果 */
async function uploadAll(files, send) {
  if (!files.length) return [];
  uploading.value += files.length;
  const results = await send(files);
  uploading.value -= files.length;
  const failures = results.flatMap((result) => (result.status === 'rejected' ? [result.reason.message] : []));
  if (failures.length) emit('error', failures.join('、'));
  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}

/** 圖片一張一段 */
const imageNodes = async (files) => (await uploadAll(files, (list) => Promise.allSettled(list.map(uploadContentImage))))
  .map(({ url, name }) => ({ type: 'paragraph', content: [{ type: 'image', attrs: { src: url, alt: name } }] }));

/** 透過文件 API 上傳，所以也會列在「文件下載」頁；內容裡插入下載連結，一份一段 */
const documentNodes = async (files) => (await uploadAll(files, (list) => uploadDocuments(list.map((file) => ({ file, ...parseDocumentName(file.name) })))))
  .map(({ title, url }) => ({ type: 'paragraph', content: [{ type: 'text', text: title, marks: [{ type: 'link', attrs: { href: url } }] }] }));

/** 上傳圖片與文件，插在 pos（上傳期間內容改變時跟著移動） */
async function insertFiles(files, pos) {
  // 內容還在載入：載入完成時會蓋掉插入的內容，檔案卻已經上傳了
  if (props.disabled) return;
  const images = files.filter(isImage);
  const documents = files.filter((file) => !isImage(file));
  if (documents.length && !canUploadDocuments) {
    emit('error', '你沒有上傳文件的權限，這裡只能放入圖片。');
    if (!images.length) return;
  }

  const drop = { pos };
  pendingDrops.add(drop);
  const nodes = (await Promise.all([imageNodes(images), canUploadDocuments ? documentNodes(documents) : []])).flat();
  pendingDrops.delete(drop);
  // 上傳期間離開了編輯畫面
  if (!editor.value || editor.value.isDestroyed || !nodes.length) return;
  editor.value.chain().focus().insertContentAt(Math.min(drop.pos, editor.value.state.doc.content.size), nodes).run();
}

function onFilesPicked(event, onlyImages) {
  const files = [...event.target.files];
  event.target.value = '';
  insertFiles(onlyImages ? files.filter(isImage) : files, editor.value.state.selection.head);
}

/** 新增或修改連結；網址留空就移除連結 */
function editLink() {
  const current = editor.value.getAttributes('link').href ?? '';
  const url = window.prompt('連結網址（留空會移除連結）', current);
  if (url === null) return;
  const chain = editor.value.chain().focus().extendMarkRange('link');
  if (!url.trim()) {
    chain.unsetLink().run();
  } else if (editor.value.state.selection.empty && !current) {
    // 沒有選取文字：插入網址本身當作連結文字
    chain.insertContent({ type: 'text', text: url.trim(), marks: [{ type: 'link', attrs: { href: url.trim() } }] }).run();
  } else {
    chain.setLink({ href: url.trim() }).run();
  }
}

// 段落樣式，和文書處理器的「樣式」選單一樣
const BLOCK_STYLES = [
  { value: 'paragraph', label: '內文' },
  { value: 'h2', label: '標題 1' },
  { value: 'h3', label: '標題 2' },
  { value: 'h4', label: '標題 3' },
];
const blockStyle = computed(() => {
  if (!editor.value) return 'paragraph';
  for (const level of [2, 3, 4]) if (editor.value.isActive('heading', { level })) return `h${level}`;
  // 舊內容的「# 標題」也當作最大的標題
  if (editor.value.isActive('heading', { level: 1 })) return 'h2';
  return 'paragraph';
});
function setBlockStyle(value) {
  const chain = editor.value.chain().focus();
  if (value === 'paragraph') chain.setParagraph().run();
  else chain.setHeading({ level: Number(value.slice(1)) }).run();
}

/** 執行工具列的指令，執行後游標留在內容裡 */
const exec = (action) => action(editor.value.chain().focus()).run();
const inTable = computed(() => editor.value?.isActive('table') ?? false);
const TABLE_TOOLS = [
  { label: '上方插入列', action: (c) => c.addRowBefore() },
  { label: '下方插入列', action: (c) => c.addRowAfter() },
  { label: '左側插入欄', action: (c) => c.addColumnBefore() },
  { label: '右側插入欄', action: (c) => c.addColumnAfter() },
  { label: '刪除列', action: (c) => c.deleteRow() },
  { label: '刪除欄', action: (c) => c.deleteColumn() },
  { label: '刪除表格', action: (c) => c.deleteTable() },
];
</script>

<template>
  <div class="rich-text" :class="{ 'is-disabled': disabled }">
    <div v-if="editor" class="rich-text__toolbar" role="toolbar" :aria-label="`${label}的格式`">
      <div class="rich-text__group">
        <button type="button" class="rich-text__button" title="復原（Ctrl+Z）" aria-label="復原" :disabled="disabled || !editor.can().undo()" @click="exec((c) => c.undo())">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
        </button>
        <button type="button" class="rich-text__button" title="重做（Ctrl+Y）" aria-label="重做" :disabled="disabled || !editor.can().redo()" @click="exec((c) => c.redo())">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>
        </button>
      </div>

      <div class="rich-text__group">
        <select class="rich-text__select" aria-label="段落樣式" :value="blockStyle" :disabled="disabled" @change="setBlockStyle($event.target.value)">
          <option v-for="style in BLOCK_STYLES" :key="style.value" :value="style.value">{{ style.label }}</option>
        </select>
      </div>

      <div class="rich-text__group">
        <button type="button" class="rich-text__button" title="粗體（Ctrl+B）" aria-label="粗體" :aria-pressed="editor.isActive('bold')" :disabled="disabled" @click="exec((c) => c.toggleBold())">
          <b aria-hidden="true">B</b>
        </button>
        <button type="button" class="rich-text__button" title="斜體（Ctrl+I）" aria-label="斜體" :aria-pressed="editor.isActive('italic')" :disabled="disabled" @click="exec((c) => c.toggleItalic())">
          <i aria-hidden="true">I</i>
        </button>
        <button type="button" class="rich-text__button" title="刪除線（Ctrl+Shift+S）" aria-label="刪除線" :aria-pressed="editor.isActive('strike')" :disabled="disabled" @click="exec((c) => c.toggleStrike())">
          <s aria-hidden="true">S</s>
        </button>
        <button type="button" class="rich-text__button" title="連結" aria-label="連結" :aria-pressed="editor.isActive('link')" :disabled="disabled" @click="editLink">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
        </button>
      </div>

      <div class="rich-text__group">
        <button type="button" class="rich-text__button" title="項目符號" aria-label="項目符號" :aria-pressed="editor.isActive('bulletList')" :disabled="disabled" @click="exec((c) => c.toggleBulletList())">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="3" /></svg>
        </button>
        <button type="button" class="rich-text__button" title="編號" aria-label="編號" :aria-pressed="editor.isActive('orderedList')" :disabled="disabled" @click="exec((c) => c.toggleOrderedList())">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 4.5h1.5V9M4 9h3M4 14.5a1.5 1.5 0 0 1 3 .5c0 1-3 2-3 3.5h3" stroke-width="1.6" /></svg>
        </button>
        <button type="button" class="rich-text__button" title="引言" aria-label="引言" :aria-pressed="editor.isActive('blockquote')" :disabled="disabled" @click="exec((c) => c.toggleBlockquote())">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14M10 7h9M10 12h9M10 17h6" /></svg>
        </button>
        <button type="button" class="rich-text__button" title="分隔線" aria-label="分隔線" :disabled="disabled" @click="exec((c) => c.setHorizontalRule())">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18" /></svg>
        </button>
      </div>

      <div class="rich-text__group">
        <button type="button" class="rich-text__button rich-text__button--text" :disabled="disabled" @click="fileInput.click()">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5L5 20" /></svg>
          圖片
        </button>
        <button v-if="canUploadDocuments" type="button" class="rich-text__button rich-text__button--text" :disabled="disabled" @click="documentInput.click()">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>
          文件
        </button>
        <button type="button" class="rich-text__button rich-text__button--text" :disabled="disabled || inTable" @click="exec((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" /></svg>
          表格
        </button>
      </div>

      <div v-if="inTable" class="rich-text__group rich-text__group--table" role="group" aria-label="表格">
        <button v-for="tool in TABLE_TOOLS" :key="tool.label" type="button" class="rich-text__button rich-text__button--text" :disabled="disabled" @click="exec(tool.action)">
          {{ tool.label }}
        </button>
      </div>
    </div>

    <EditorContent :editor="editor" class="rich-text__body" />

    <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onFilesPicked($event, true)" />
    <input ref="documentInput" type="file" :accept="DOCUMENT_ACCEPT" multiple hidden @change="onFilesPicked($event, false)" />
    <p class="rich-text__status" role="status">
      <template v-if="uploading">正在上傳 {{ uploading }} 個檔案…</template>
      <template v-else-if="canUploadDocuments">可把圖片或文件拖進內容區，會自動上傳並插入放開的位置；圖片也可以直接貼上。文件也會列在「文件下載」頁。按 Shift+Enter 換行但不分段。</template>
      <template v-else>可把圖片拖進內容區或直接貼上，會自動上傳並插入放開的位置。按 Shift+Enter 換行但不分段。</template>
    </p>
  </div>
</template>
