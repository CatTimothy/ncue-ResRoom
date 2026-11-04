<script setup>
import { EditorView } from '@codemirror/view';
import ZH_TW from '@vavt/cm-extension/dist/locale/zh-TW';
import { config, MdEditor, NormalToolbar } from 'md-editor-v3';
import 'md-editor-v3/lib/style.css';
import { ref, useTemplateRef } from 'vue';
import { uploadContentImage } from '../api.js';

defineProps({
  modelValue: { type: String, required: true },
  disabled: Boolean,
});
const emit = defineEmits(['update:modelValue', 'error']);

config({
  editorConfig: { languageUserDefined: { 'zh-TW': ZH_TW } },
  // 沒用到裁切圖片；不指定 instance 的話，套件會從外部 CDN 載入
  editorExtensions: { cropper: { instance: class {} } },
  // 預覽要和實際顯示一致：內嵌 HTML 不會顯示
  markdownItConfig: (md) => md.set({ html: false }),
  // 輸入區沒有對應的 label 元素，要另外給名稱，螢幕報讀軟體才知道這是什麼
  codeMirrorExtensions: (extensions) => [
    ...extensions,
    { type: 'accessible-name', extension: EditorView.contentAttributes.of({ 'aria-label': '內容（Markdown）' }) },
  ],
});

const toolbars = [
  'bold', 'underline', 'italic', 'strikeThrough', '-',
  'title', 'quote', 'unorderedList', 'orderedList', '-',
  'link', 0, 'table', 'code', '-',
  'revoke', 'next', '=', 'preview',
];

const editor = useTemplateRef('editor');
const fileInput = useTemplateRef('fileInput');
const uploading = ref(0);

/** 上傳圖片，回傳成功的 { url, alt }；失敗的回報給外層 */
async function upload(files) {
  uploading.value += files.length;
  const results = await Promise.allSettled(files.map(uploadContentImage));
  uploading.value -= files.length;

  const failures = results.flatMap((result) => (result.status === 'rejected' ? [result.reason.message] : []));
  if (failures.length) emit('error', failures.join('、'));
  return results.flatMap((result) => (
    result.status === 'fulfilled' ? [{ url: result.value.url, alt: result.value.name, title: '' }] : []
  ));
}

/** 貼上：由編輯器把圖片的 Markdown 插入游標位置 */
async function onUploadImg(files, callback) {
  callback(await upload(files));
}

async function uploadAndInsert(files) {
  const images = await upload(files);
  if (!images.length) return;
  const markdown = images.map(({ url, alt }) => `![${alt}](${url})`).join('\n\n');
  editor.value.insert(() => ({ targetValue: markdown, select: false, deviationStart: 0, deviationEnd: 0 }));
}

/** 工具列的「新增圖片」 */
function onFilesPicked(event) {
  uploadAndInsert([...event.target.files]);
  event.target.value = '';
}

/** 編輯器本身不處理拖進來的檔案，要在外層接住；拖動文字則交回給編輯器 */
function onDrop(event) {
  const files = [...event.dataTransfer.files];
  if (!files.length) return;
  event.preventDefault();
  event.stopPropagation();
  uploadAndInsert(files);
}
</script>

<template>
  <div class="markdown-editor" @dragover.prevent @drop.capture="onDrop">
    <MdEditor
      ref="editor"
      :model-value="modelValue"
      language="zh-TW"
      :toolbars="toolbars"
      :footers="[]"
      :preview="false"
      :disabled="disabled"
      no-echarts
      no-mermaid
      no-katex
      no-highlight
      no-prettier
      no-img-zoom-in
      :on-upload-img="onUploadImg"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <template #defToolbars>
        <NormalToolbar title="新增圖片" @on-click="fileInput.click()">
          <template #trigger>
            <span class="markdown-editor__add-image">新增圖片</span>
          </template>
        </NormalToolbar>
      </template>
    </MdEditor>
    <input
      ref="fileInput"
      class="visually-hidden"
      type="file"
      accept="image/*"
      multiple
      tabindex="-1"
      aria-hidden="true"
      @change="onFilesPicked"
    />
    <p class="markdown-editor__status" role="status">
      <template v-if="uploading">正在上傳 {{ uploading }} 張圖片…</template>
      <template v-else>可把圖片拖進內容區或直接貼上，會自動上傳並加入圖片語法。</template>
    </p>
  </div>
</template>
