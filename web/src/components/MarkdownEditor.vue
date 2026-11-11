<script>
import { dropCursor, EditorView } from '@codemirror/view';
import ZH_TW from '@vavt/cm-extension/dist/locale/zh-TW';
import { config } from 'md-editor-v3';

// 套件的設定是全域的，只需要做一次
/** 還在上傳的拖放位置；上傳期間內容可能改變，位置要跟著移動 */
const pendingDrops = new Set();

config({
  editorConfig: { languageUserDefined: { 'zh-TW': ZH_TW } },
  // 沒用到裁切圖片；不指定 instance 的話，套件會從外部 CDN 載入
  editorExtensions: { cropper: { instance: class {} } },
  // 預覽要和實際顯示一致：內嵌 HTML 不會顯示，單一換行也會換行
  markdownItConfig: (md) => md.set({ html: false, breaks: true }),
  // 輸入區沒有對應的 label 元素，要另外給名稱，螢幕報讀軟體才知道這是什麼
  codeMirrorExtensions: (extensions) => [
    ...extensions,
    { type: 'accessible-name', extension: EditorView.contentAttributes.of({ 'aria-label': '內容（Markdown）' }) },
    // 拖曳時用游標預覽插入位置
    { type: 'drop-cursor', extension: dropCursor() },
    {
      type: 'pending-drops',
      extension: EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        for (const drop of pendingDrops) {
          if (drop.view === update.view) drop.pos = update.changes.mapPos(drop.pos, 1);
        }
      }),
    },
  ],
});
</script>

<script setup>
import { MdEditor, NormalToolbar } from 'md-editor-v3';
import 'md-editor-v3/lib/style.css';
import { ref, useTemplateRef } from 'vue';
import { can, uploadContentImage, uploadDocuments } from '../api.js';
import { DOCUMENT_ACCEPT, markdownLink, parseDocumentName } from '../format.js';
import { themeMode } from '../theme.js';

const props = defineProps({
  modelValue: { type: String, required: true },
  disabled: Boolean,
});
const emit = defineEmits(['update:modelValue', 'error']);

// 數字對應下方 defToolbars 的順序：0 是新增圖片，1 是新增文件
const canUploadDocuments = can('MANAGE_DOCUMENTS');
const toolbars = [
  'bold', 'underline', 'italic', 'strikeThrough', '-',
  'title', 'quote', 'unorderedList', 'orderedList', '-',
  'link', 0, ...(canUploadDocuments ? [1] : []), 'table', 'code', '-',
  'revoke', 'next', '=', 'preview',
];

const editor = useTemplateRef('editor');
const fileInput = useTemplateRef('fileInput');
const documentInput = useTemplateRef('documentInput');
const uploading = ref(0);

/** 上傳並回傳成功的結果；失敗的回報給外層。send 回傳 Promise.allSettled 的結果 */
async function uploadAll(files, send) {
  uploading.value += files.length;
  const results = await send(files);
  uploading.value -= files.length;

  const failures = results.flatMap((result) => (result.status === 'rejected' ? [result.reason.message] : []));
  if (failures.length) emit('error', failures.join('、'));
  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}

/** 上傳圖片，回傳成功的 { url, alt } */
async function upload(files) {
  const images = await uploadAll(files, (list) => Promise.allSettled(list.map(uploadContentImage)));
  return images.map(({ url, name }) => ({ url, alt: name, title: '' }));
}

function insertMarkdown(lines) {
  if (!lines.length) return;
  editor.value.insert(() => ({ targetValue: lines.join('\n\n'), select: false, deviationStart: 0, deviationEnd: 0 }));
}

/** 插在拖放的位置。游標還在那裡的話移到內容後面，已經移到別處就不打擾 */
function insertAt(view, pos, lines) {
  const text = lines.join('\n\n');
  const { empty, head } = view.state.selection.main;
  view.dispatch({
    changes: { from: pos, insert: text },
    selection: empty && head === pos ? { anchor: pos + text.length } : undefined,
    scrollIntoView: true,
  });
}

const imageLines = async (files) => (await upload(files)).map(({ url, alt }) => `!${markdownLink(alt, url)}`);

/** 貼上：由編輯器把圖片的 Markdown 插入游標位置 */
async function onUploadImg(files, callback) {
  callback(await upload(files));
}

/** 透過文件 API 上傳，所以也會列在「文件下載」頁；內容裡插入下載連結 */
async function documentLines(files) {
  const documents = await uploadAll(files, (list) => uploadDocuments(list.map((file) => ({ file, ...parseDocumentName(file.name) }))));
  return documents.map(({ title, url }) => markdownLink(title, url));
}

/** 工具列的「新增圖片」 */
function onFilesPicked(event) {
  imageLines([...event.target.files]).then(insertMarkdown);
  event.target.value = '';
}

/** 工具列的「新增文件」 */
function onDocumentsPicked(event) {
  documentLines([...event.target.files]).then(insertMarkdown);
  event.target.value = '';
}

/** 檔案要自己上傳：擋下 CodeMirror 預設的行為（把檔案內容當文字插入）。拖動文字則交給編輯器 */
function onEditorDrop(event) {
  if (event.dataTransfer?.files.length) event.preventDefault();
}

/** 在外層接住，放在工具列等輸入區以外的地方也算 */
async function onDrop(event) {
  const files = [...event.dataTransfer.files];
  if (!files.length) return;
  event.preventDefault();
  // 內容還在載入：載入完成時會蓋掉插入的連結，檔案卻已經上傳了
  if (props.disabled) return;

  const isImage = (file) => file.type.startsWith('image/');
  const images = files.filter(isImage);
  const documents = files.filter((file) => !isImage(file));
  if (documents.length && !canUploadDocuments) {
    emit('error', '你沒有上傳文件的權限，這裡只能拖入圖片。');
    if (!images.length) return;
  }

  const view = editor.value.getEditorView();
  // 放在輸入區以外的地方時，維持插在目前的游標位置
  const overInput = view.dom.contains(event.target);
  const pos = overInput
    ? view.posAtCoords({ x: event.clientX, y: event.clientY }, false)
    : view.state.selection.main.head;
  view.dispatch({ selection: { anchor: pos } });
  view.focus();

  const drop = { view, pos };
  pendingDrops.add(drop);
  const [imageMarkdown, documentMarkdown] = await Promise.all([
    imageLines(images),
    canUploadDocuments ? documentLines(documents) : [],
  ]);
  pendingDrops.delete(drop);

  // 上傳期間離開了編輯畫面
  if (!editor.value) return;
  const lines = [...imageMarkdown, ...documentMarkdown];
  if (lines.length) insertAt(view, drop.pos, lines);
}
</script>

<template>
  <div class="markdown-editor" @dragover.prevent @drop="onDrop">
    <MdEditor
      ref="editor"
      :model-value="modelValue"
      language="zh-TW"
      :theme="themeMode"
      :toolbars="toolbars"
      :footers="[]"
      :preview="false"
      :scroll-auto="false"
      :disabled="disabled"
      no-echarts
      no-mermaid
      no-katex
      no-highlight
      no-prettier
      no-img-zoom-in
      :on-upload-img="onUploadImg"
      :on-drop="onEditorDrop"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <template #defToolbars>
        <NormalToolbar title="新增圖片" @on-click="fileInput.click()">
          <template #trigger>
            <span class="markdown-editor__tool">新增圖片</span>
          </template>
        </NormalToolbar>
        <NormalToolbar title="新增文件" @on-click="documentInput.click()">
          <template #trigger>
            <span class="markdown-editor__tool">新增文件</span>
          </template>
        </NormalToolbar>
      </template>
    </MdEditor>
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      multiple
      hidden
      @change="onFilesPicked"
    />
    <input
      ref="documentInput"
      type="file"
      :accept="DOCUMENT_ACCEPT"
      multiple
      hidden
      @change="onDocumentsPicked"
    />
    <p class="markdown-editor__status" role="status">
      <template v-if="uploading">正在上傳 {{ uploading }} 個檔案…</template>
      <template v-else-if="canUploadDocuments">可把圖片或文件拖進內容區，會自動上傳並插入游標標示的位置；圖片也可以直接貼上。文件也會列在「文件下載」頁。</template>
      <template v-else>可把圖片拖進內容區或直接貼上，會自動上傳並插入圖片語法；拖曳時游標會標示插入的位置。</template>
    </p>
  </div>
</template>
