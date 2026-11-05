import { ref } from 'vue';
import { fetchTodayVisits, recordVisit } from './api.js';
import { taipeiDay } from './format.js';

const KEY = 'resroom-visit-day';

// 瀏覽器封鎖儲存空間時，視為今天還沒來過
function readDay() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeDay(day) {
  try {
    localStorage.setItem(KEY, day);
  } catch {
    // 只會讓這位訪客多算一次
  }
}

async function loadVisitors() {
  const today = taipeiDay();
  if (readDay() === today) return fetchTodayVisits();
  const count = await recordVisit();
  writeDay(today);
  return count;
}

/** 今日訪問人數：同一個瀏覽器一天只算一次。載入前或失敗時為 null，頁尾就不顯示 */
export function useTodayVisits() {
  const visitors = ref(null);
  loadVisitors().then((count) => {
    visitors.value = count;
  }).catch((error) => console.error(error));
  return visitors;
}
