<script setup>
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue';
import { moveNavLink, navMenus, navPaths } from '../navigation.js';

/** 頁首選單的排列 { utility: [路徑], main: [路徑] } */
const navigation = defineModel({ type: Object, required: true });
const props = defineProps({
  /** 自訂頁面，沒有排過的會出現在主選單最後 */
  pages: { type: Array, default: () => [] },
});

const ROWS = { utility: '上方的小選單', main: '主選單' };
const hintId = useId();
const root = useTemplateRef('root');
const menus = computed(() => navMenus(navigation.value, props.pages));
const paths = computed(() => navPaths(menus.value));
const dragging = ref(null);
const status = ref('');

const rowOf = (path) => (paths.value.utility.includes(path) ? 'utility' : 'main');

function move(path, row, index) {
  navigation.value = moveNavLink(paths.value, path, row, index);
}

function announce(path) {
  const row = rowOf(path);
  const index = paths.value[row].indexOf(path);
  status.value = `「${menus.value[row][index].label}」在${ROWS[row]}的第 ${index + 1} 個`;
}

// 拖動：指標經過哪個連結，就把拖動中的連結移到它的前面或後面（看指標在左半或右半）
function startDrag(event, path) {
  if (event.button !== 0) return;
  dragging.value = path;
  // 換列時按鈕會重新建立，所以由不會變動的外框接收之後的指標事件
  root.value.setPointerCapture(event.pointerId);
}

function drag(event) {
  const path = dragging.value;
  if (!path) return;
  const under = document.elementFromPoint(event.clientX, event.clientY);
  const list = under?.closest('[data-nav-row]');
  if (!list || !root.value.contains(list)) return;

  const row = list.dataset.navRow;
  const rowPaths = paths.value[row];
  const item = under.closest('[data-nav-item]');
  if (!item) {
    // 列的空白處：從另一列拖過來時放到最後
    if (!rowPaths.includes(path)) move(path, row, rowPaths.length);
    return;
  }
  const target = item.dataset.navItem;
  if (target === path) return;
  const rect = item.getBoundingClientRect();
  let index = rowPaths.indexOf(target) + (event.clientX > rect.left + rect.width / 2 ? 1 : 0);
  const from = rowPaths.indexOf(path);
  if (from !== -1 && from < index) index -= 1; // 先拿掉自己，後面的位置都往前一格
  if (from !== index) move(path, row, index);
}

function endDrag() {
  if (!dragging.value) return;
  announce(dragging.value);
  dragging.value = null;
}

// 鍵盤：左右鍵調整順序，上下鍵換到另一列
async function onKey(event, path) {
  const row = rowOf(path);
  const index = paths.value[row].indexOf(path);
  const moves = {
    ArrowLeft: [row, index - 1],
    ArrowRight: [row, index + 1],
    ArrowUp: ['utility', row === 'utility' ? index : paths.value.utility.length],
    ArrowDown: ['main', row === 'main' ? index : 0],
    Home: [row, 0],
    End: [row, paths.value[row].length - 1],
  };
  if (!moves[event.key]) return;
  event.preventDefault();
  move(path, ...moves[event.key]);
  announce(path);
  // 換列時按鈕會重新建立，焦點要放回去
  await nextTick();
  root.value.querySelector(`[data-nav-item="${CSS.escape(path)}"] button`)?.focus();
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
      拖動連結調整順序，也可以拖到另一列。用鍵盤時，移到連結上按左右方向鍵調整順序，按上下方向鍵換到另一列。
    </p>
    <div v-for="(label, row) in ROWS" :key="row" class="nav-editor__row">
      <span class="nav-editor__label">{{ label }}</span>
      <ul class="nav-editor__list" :data-nav-row="row" :aria-label="label">
        <li v-for="link in menus[row]" :key="link.to" :data-nav-item="link.to">
          <button
            type="button"
            class="nav-chip"
            :class="{ 'is-dragging': dragging === link.to }"
            :aria-describedby="hintId"
            @pointerdown="startDrag($event, link.to)"
            @keydown="onKey($event, link.to)"
          >
            <svg class="icon icon--small" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
            </svg>
            {{ link.label }}
          </button>
        </li>
        <li v-if="!menus[row].length" class="nav-editor__empty">把連結拖到這裡</li>
      </ul>
    </div>
    <p class="visually-hidden" aria-live="polite">{{ status }}</p>
  </div>
</template>
