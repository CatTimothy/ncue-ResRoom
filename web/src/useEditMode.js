import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { currentUser } from './api.js';
import { focusMain } from './page.js';

/**
 * 文章的編輯模式記在網址上（?edit=1、?new=1），清單的按鈕才能直接帶到這裡。
 * 未登入時忽略，顯示一般內容；編輯到一半才過期或登出時留在編輯畫面，內容才不會消失。
 */
export function useEditMode(param = 'edit') {
  const route = useRoute();
  const router = useRouter();
  const editing = ref(false);
  const active = computed(() => param in route.query && (Boolean(currentUser.value) || editing.value));

  // 原本的按鈕消失了，要把焦點移到內容開頭
  watch(active, async (value) => {
    editing.value = value;
    await nextTick();
    window.scrollTo(0, 0);
    focusMain();
  });

  return {
    active,
    /** 結束後按上一頁，不會再回到編輯模式 */
    close: () => router.replace({ query: {} }),
  };
}

/** 有尚未儲存的內容時，換頁、關閉分頁或結束編輯都要先確認 */
export function useLeaveGuard(dirty) {
  const confirmLeave = () => !dirty.value || window.confirm('尚未儲存的內容會遺失，確定要離開嗎？');
  onBeforeRouteLeave(confirmLeave);
  onBeforeRouteUpdate(confirmLeave);

  const warn = (event) => {
    if (dirty.value) event.preventDefault();
  };
  onMounted(() => window.addEventListener('beforeunload', warn));
  onBeforeUnmount(() => window.removeEventListener('beforeunload', warn));
}
