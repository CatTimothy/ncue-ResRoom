<script setup>
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue';
import { allLinks, editorRows, moveLink, SERVICES } from '../navigation.js';

/** 頁首選單 { utility: [key], main: [key] }；key 見 navigation.js 的 menuLink */
const navigation = defineModel({ type: Object, required: true });
const props = defineProps({
  /** 所有頁面 { slug, title }，沒放進選單的列在「未加入」 */
  pages: { type: Array, default: () => [] },
  /** 可以放進選單的網站功能（停用的擴充功能不列出） */
  services: { type: Array, default: () => Object.keys(SERVICES) },
});

const ROWS = { utility: '上方的小選單', main: '主選單', unused: '未加入' };
const ORDER = Object.keys(ROWS);
const hintId = useId();
const root = useTemplateRef('root');
const links = computed(() => allLinks(props.pages, props.services));
const rows = computed(() => editorRows(navigation.value, links.value));
const keys = computed(() => Object.fromEntries(ORDER.map((row) => [row, rows.value[row].map((link) => link.key)])));
const dragging = ref(null);
const status = ref('');

const rowOf = (key) => ORDER.find((row) => keys.value[row].includes(key));

/** 「未加入」那一列由其他兩列算出，移到那裡就是從選單移除 */
function move(key, row, index) {
  navigation.value = moveLink(keys.value, key, row, index);
}

function announce(key) {
  const row = rowOf(key);
  const index = keys.value[row].indexOf(key);
  const { label } = rows.value[row][index];
  status.value = row === 'unused' ? `「${label}」已從選單移除` : `「${label}」在${ROWS[row]}的第 ${index + 1} 個`;
}

// 拖動：指標經過哪個連結，就把拖動中的連結移到它的前面或後面（看指標在左半或右半）
function startDrag(event, key) {
  if (event.button !== 0) return;
  dragging.value = key;
  // 換列時按鈕會重新建立，所以由不會變動的外框接收之後的指標事件
  root.value.setPointerCapture(event.pointerId);
}

function drag(event) {
  const key = dragging.value;
  if (!key) return;
  const under = document.elementFromPoint(event.clientX, event.clientY);
  const list = under?.closest('[data-nav-row]');
  if (!list || !root.value.contains(list)) return;

  const row = list.dataset.navRow;
  const rowKeys = keys.value[row];
  const item = under.closest('[data-nav-item]');
  // 拖到「未加入」或列的空白處：從別列拖過來時放到最後
  if (!item || row === 'unused') {
    if (!rowKeys.includes(key)) move(key, row, rowKeys.length);
    return;
  }
  const target = item.dataset.navItem;
  if (target === key) return;
  const rect = item.getBoundingClientRect();
  let index = rowKeys.indexOf(target) + (event.clientX > rect.left + rect.width / 2 ? 1 : 0);
  const from = rowKeys.indexOf(key);
  if (from !== -1 && from < index) index -= 1; // 先拿掉自己，後面的位置都往前一格
  if (from !== index) move(key, row, index);
}

function endDrag() {
  if (!dragging.value) return;
  announce(dragging.value);
  dragging.value = null;
}

// 鍵盤：左右鍵調整順序，上下鍵換到上一列的最後或下一列的最前面
async function onKey(event, key) {
  const row = rowOf(key);
  const index = keys.value[row].indexOf(key);
  const above = ORDER[ORDER.indexOf(row) - 1];
  const below = ORDER[ORDER.indexOf(row) + 1];
  const moves = {
    ArrowLeft: [row, index - 1],
    ArrowRight: [row, index + 1],
    // 已在最上或最下一列時留在原位
    ArrowUp: above ? [above, keys.value[above].length] : [row, index],
    ArrowDown: below ? [below, 0] : [row, index],
    Home: [row, 0],
    End: [row, keys.value[row].length - 1],
  };
  if (!moves[event.key]) return;
  event.preventDefault();
  move(key, ...moves[event.key]);
  announce(key);
  // 換列時按鈕會重新建立，焦點要放回去
  await nextTick();
  root.value.querySelector(`[data-nav-item="${CSS.escape(key)}"] button`)?.focus();
}
</script>

<template>
  <div
    ref="root"
    class="nav-editor"
    :class="{ 'is-dragging': dragging }"
    @pointermove="drag"
    @pointerup="endDrag"
    @pointercancel="endDrag"
    @lostpointercapture="endDrag"
  >
    <p :id="hintId" class="nav-editor__hint">
      拖動連結調整順序，或拖到另一列；拖到「未加入」就會從選單移除。用鍵盤時，移到連結上按左右方向鍵調整順序，按上下方向鍵換到另一列。
    </p>
    <div v-for="(label, row) in ROWS" :key="row" class="nav-editor__row" :class="`nav-editor__row--${row}`">
      <span class="nav-editor__label">{{ label }}</span>
      <ul class="nav-editor__list" :data-nav-row="row" :aria-label="label">
        <li v-for="link in rows[row]" :key="link.key" :data-nav-item="link.key">
          <button
            type="button"
            class="nav-chip"
            :class="{ 'is-dragging': dragging === link.key }"
            :aria-describedby="hintId"
            @pointerdown="startDrag($event, link.key)"
            @keydown="onKey($event, link.key)"
          >
            <svg class="icon icon--small" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
            </svg>
            {{ link.label }}
          </button>
        </li>
        <li v-if="!rows[row].length" class="nav-editor__empty">
          {{ row === 'unused' ? '所有頁面與功能都已放進選單' : '把連結拖到這裡' }}
        </li>
      </ul>
    </div>
    <p class="visually-hidden" aria-live="polite">{{ status }}</p>
  </div>
</template>
