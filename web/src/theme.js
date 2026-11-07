import { computed, ref, watchEffect } from 'vue';
import { siteConfig } from './siteConfig.js';

/** 可在網站設定修改的顏色，對應 style.css 的同名變數 */
export const THEME_COLORS = {
  background: '背景',
  surface: '卡片與輸入框',
  text: '文字',
  primary: '連結與重點',
  accent: '頁首與標記',
};

// 訪客自己選的主題。實際套用的主題另外記在 APPLIED_KEY，index.html 開頭的程式在畫面出現前就套用，不會先閃一下另一個主題
const CHOICE_KEY = 'resroom-theme';
const APPLIED_KEY = 'resroom-theme-applied';

function readChoice() {
  try {
    const value = localStorage.getItem(CHOICE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 儲存空間被封鎖時，只是下次開啟時不記得
  }
}

const choice = ref(readChoice());
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const systemDark = ref(darkQuery.matches);
darkQuery.addEventListener('change', (event) => {
  systemDark.value = event.matches;
});

// index.html 開頭的程式依上次套用的主題設定好的模式
const initialMode = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

/** 目前的主題：訪客的選擇優先，其次是網站設定的預設，SYSTEM 時依裝置設定；設定載入前沿用上次的主題 */
export const themeMode = computed(() => {
  if (choice.value) return choice.value;
  if (!siteConfig.value) return initialMode;
  const preset = siteConfig.value.defaultTheme;
  if (preset === 'SYSTEM') return systemDark.value ? 'dark' : 'light';
  return preset.toLowerCase();
});

export function toggleTheme() {
  choice.value = themeMode.value === 'dark' ? 'light' : 'dark';
  store(CHOICE_KEY, choice.value);
}

/** 主題的內建顏色：從 style.css 讀出，網站設定只保存和它不同的顏色 */
export function defaultColors(mode) {
  const probe = document.createElement('div');
  probe.dataset.theme = mode;
  probe.hidden = true;
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const colors = Object.fromEntries(Object.keys(THEME_COLORS).map((name) => [name, style.getPropertyValue(`--${name}`).trim()]));
  probe.remove();
  return colors;
}

let lastApplied = null;
watchEffect(() => {
  const root = document.documentElement;
  const mode = themeMode.value;
  root.dataset.theme = mode;
  // 設定還沒載入：保留 index.html 還原的顏色，也不要用空的顏色蓋掉保存的主題
  if (!siteConfig.value) return;
  const custom = siteConfig.value[mode === 'dark' ? 'darkTheme' : 'lightTheme'];
  const colors = {};
  for (const name of Object.keys(THEME_COLORS)) {
    if (custom[name]) {
      root.style.setProperty(`--${name}`, custom[name]);
      colors[name] = custom[name];
    } else {
      root.style.removeProperty(`--${name}`);
    }
  }
  const applied = JSON.stringify({ mode, colors });
  if (applied === lastApplied) return; // 設定在每次修改內容後都會重新取得，主題沒變就不用再處理
  lastApplied = applied;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--accent').trim());
  store(APPLIED_KEY, applied);
});
