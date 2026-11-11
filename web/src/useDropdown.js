import { onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import { useRoute } from 'vue-router';

/**
 * 按鈕展開的選單（ref="<name>" 包住按鈕與選單）。
 * 點選單外、按 Esc 或換頁時收起；按 Esc 收起後焦點回到按鈕
 */
export function useDropdown(name) {
  const root = useTemplateRef(name);
  const open = ref(false);
  const route = useRoute();

  const close = () => {
    open.value = false;
  };
  const toggle = () => {
    open.value = !open.value;
  };

  function onPointerDown(event) {
    if (!root.value?.contains(event.target)) close();
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    close();
    root.value?.querySelector('[aria-expanded]')?.focus();
  }

  // 焦點離開選單（例如按 Tab 跳過最後一項）時也收起
  function onFocusOut(event) {
    if (event.relatedTarget && !root.value?.contains(event.relatedTarget)) close();
  }

  function listen(on) {
    const method = on ? 'addEventListener' : 'removeEventListener';
    document[method]('pointerdown', onPointerDown);
    root.value?.[method]('keydown', onKeyDown);
    root.value?.[method]('focusout', onFocusOut);
  }

  watch(open, listen);
  watch(() => route.fullPath, close);
  onBeforeUnmount(() => listen(false));

  return { open, toggle, close };
}
