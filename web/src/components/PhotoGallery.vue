<script setup>
import { computed, nextTick, ref, useTemplateRef } from 'vue';
import { can, deletePhoto, updatePhoto } from '../api.js';
import { canAnimate } from '../motion.js';
import { confirmDelete } from '../page.js';
import PhotoCaption from './PhotoCaption.vue';
import PhotoEditor from './PhotoEditor.vue';

const props = defineProps({
  photos: { type: Array, required: true },
  /** 相簿的照片才能在這裡管理；文章內文的照片沒有 albumId，只能檢視 */
  albumId: { type: String, default: null },
  /** 文章內文的照片說明存在內文裡，由文章決定怎麼儲存 (photo, alt) => Promise；沒有權限時不提供 */
  saveAlt: { type: Function, default: null },
});

const MORPH = 'photo-zoom';
const grid = useTemplateRef('grid');
const dialog = useTemplateRef('dialog');
const image = useTemplateRef('image');
const editor = useTemplateRef('editor');
const caption = useTemplateRef('caption');
const index = ref(0);
const current = computed(() => props.photos[index.value]);
const manageable = computed(() => Boolean(can('MANAGE_ALBUMS') && props.albumId));
const saveCaption = computed(() => props.saveAlt ?? (manageable.value
  ? (photo, alt) => updatePhoto({ id: photo.id, alt, albumId: photo.albumId })
  : null));

const thumbnail = () => grid.value?.querySelectorAll('img')[index.value];

function setMorph(element, on) {
  if (element) element.style.viewTransitionName = on ? MORPH : '';
}

function clearMorph() {
  setMorph(thumbnail(), false);
  setMorph(image.value, false);
}

/** 讓照片從原位置放大到燈箱；不支援或要求減少動態時直接切換 */
async function transition(change) {
  try {
    if (canAnimate()) await document.startViewTransition(change).finished;
    else await change();
  } finally {
    clearMorph();
  }
}

function open(position) {
  index.value = position;
  setMorph(thumbnail(), true);
  // 原生 dialog 會鎖定焦點，關閉時焦點回到原本的照片
  return transition(async () => {
    setMorph(thumbnail(), false);
    dialog.value.showModal();
    await nextTick();
    setMorph(image.value, true);
  });
}

function close() {
  if (!dialog.value.open) return undefined;
  caption.value?.cancelEditing();
  setMorph(image.value, true);
  return transition(async () => {
    setMorph(image.value, false);
    dialog.value.close();
    setMorph(thumbnail(), true);
    await nextTick();
  });
}

function step(delta) {
  index.value = (index.value + delta + props.photos.length) % props.photos.length;
}

/** Esc：正在編輯說明時只取消編輯 */
function onCancel() {
  if (!caption.value?.cancelEditing()) close();
}

function onKeydown(event) {
  if (event.target.tagName === 'INPUT') return; // 方向鍵是用來移動游標的
  if (event.key === 'ArrowLeft') step(-1);
  if (event.key === 'ArrowRight') step(1);
}

const remove = (photo) => confirmDelete(`確定要刪除照片「${photo.alt}」嗎？`, () => deletePhoto(photo.id));
</script>

<template>
  <div v-if="manageable" class="admin-bar">
    <button type="button" class="button button--small" @click="editor.open()">新增照片</button>
  </div>

  <ul v-if="photos.length" ref="grid" class="photo-grid">
    <li v-for="(photo, position) in photos" :key="photo.id">
      <button type="button" class="photo-grid__open" :aria-label="`放大照片：${photo.alt}`" @click="open(position)">
        <img :src="photo.url" :alt="photo.alt" loading="lazy" decoding="async" />
      </button>
      <div v-if="manageable" class="photo-actions">
        <button type="button" class="button button--small" :aria-label="`編輯照片：${photo.alt}`" @click="editor.open(photo)">編輯</button>
        <button type="button" class="button button--small" :aria-label="`刪除照片：${photo.alt}`" @click="remove(photo)">刪除</button>
      </div>
    </li>
  </ul>

  <dialog
    v-if="photos.length"
    ref="dialog"
    class="lightbox"
    aria-label="檢視照片"
    @keydown="onKeydown"
    @cancel.prevent="onCancel"
    @click.self="close"
  >
    <template v-if="current">
      <img ref="image" class="lightbox__image" :src="current.url" :alt="current.alt" />
      <div class="lightbox__bar">
        <div class="lightbox__caption" aria-live="polite">
          <PhotoCaption ref="caption" :photo="current" :save="saveCaption" />
          <span class="lightbox__count">第 {{ index + 1 }} 張，共 {{ photos.length }} 張</span>
        </div>
        <div class="lightbox__actions">
          <button type="button" class="button" :disabled="photos.length < 2" @click="step(-1)">上一張</button>
          <button type="button" class="button" :disabled="photos.length < 2" @click="step(1)">下一張</button>
          <a class="button" :href="current.originalUrl ?? current.url" download>{{ current.originalUrl ? '下載原始檔' : '下載照片' }}</a>
          <button type="button" class="button" @click="close">關閉</button>
        </div>
      </div>
    </template>
  </dialog>

  <PhotoEditor v-if="manageable" ref="editor" :album-id="albumId" />
</template>
