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

// 訪客自己選的主題；index.html 開頭的程式也讀同樣的鍵，畫面出現前就套用，不會先閃一下另一個主題
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

/** 目前的主題：訪客的選擇優先，其次是網站設定的預設，SYSTEM 時依裝置設定 */
export const themeMode = computed(() => {
  if (choice.value) return choice.value;
  const preset = siteConfig.value?.defaultTheme ?? 'SYSTEM';
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

watchEffect(() => {
  const root = document.documentElement;
  const mode = themeMode.value;
  const custom = siteConfig.value?.[mode === 'dark' ? 'darkTheme' : 'lightTheme'] ?? {};
  const colors = {};
  root.dataset.theme = mode;
  for (const name of Object.keys(THEME_COLORS)) {
    if (custom[name]) {
      root.style.setProperty(`--${name}`, custom[name]);
      colors[name] = custom[name];
    } else {
      root.style.removeProperty(`--${name}`);
    }
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--accent').trim());
  store(APPLIED_KEY, JSON.stringify({ mode, colors }));
});
