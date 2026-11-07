<script setup>
import { watch } from 'vue';
import { useRouter } from 'vue-router';
import { can, currentUser, saveSiteConfig, userChecked } from '../api.js';
import EditorForm from '../components/EditorForm.vue';
import ImageField from '../components/ImageField.vue';
import { DEFAULT_IMAGES, siteConfig } from '../siteConfig.js';
import { defaultColors, THEME_COLORS } from '../theme.js';
import { useLeaveGuard } from '../useEditMode.js';
import { useEditor } from '../useEditor.js';

const MAX_TEACHERS = 10;
const THEMES = {
  lightTheme: { mode: 'light', label: '淺色主題' },
  darkTheme: { mode: 'dark', label: '深色主題' },
};
const DEFAULT_COLORS = Object.fromEntries(Object.entries(THEMES).map(([field, { mode }]) => [field, defaultColors(mode)]));

const router = useRouter();
const { form, changed, busy, error, reset, markSaved, run } = useEditor({});
useLeaveGuard(changed);

/** 顏色欄位要有值，沒有設定的填入內建顏色；儲存時再把和內建相同的改回 null */
const withDefaults = (field, colors) => Object.fromEntries(
  Object.entries(DEFAULT_COLORS[field]).map(([name, color]) => [name, colors[name] ?? color]),
);
const onlyChanged = (field) => Object.fromEntries(
  Object.entries(form[field]).map(([name, color]) => [name, color === DEFAULT_COLORS[field][name] ? null : color]),
);

// 設定載入後填入表單；編輯中不被背景更新蓋掉
watch(siteConfig, (config) => {
  if (!config || changed.value) return;
  reset({
    ...config,
    teachers: config.teachers.map((teacher) => ({ ...teacher })),
    lightTheme: withDefaults('lightTheme', config.lightTheme),
    darkTheme: withDefaults('darkTheme', config.darkTheme),
  });
}, { immediate: true });

const submit = () => run(async () => {
  await saveSiteConfig({ ...form, lightTheme: onlyChanged('lightTheme'), darkTheme: onlyChanged('darkTheme') });
  markSaved();
});

const leave = () => router.push('/');
</script>

<template>
  <div class="page">
    <p v-if="!userChecked || (currentUser && !siteConfig)" class="loading">載入中…</p>
    <p v-else-if="!can('MANAGE_SITE_CONFIG')">你沒有修改網站設定的權限。</p>

    <EditorForm
      v-else
      class="form--page"
      title="網站設定"
      submit-label="儲存"
      :busy="busy"
      :error="error"
      @submit="submit"
      @cancel="leave"
    >
      <fieldset class="settings-group">
        <legend>網站</legend>
        <label class="field">
          <span>網站標題</span>
          <input v-model="form.siteTitle" required maxlength="100" />
          <small>顯示在瀏覽器分頁上，例如「最新消息｜{{ form.siteTitle }}」。</small>
        </label>
        <label class="field">
          <span>標誌旁的名稱（選填）</span>
          <input v-model="form.logoText" maxlength="50" />
        </label>
        <div class="field-row">
          <ImageField v-model="form.logoUrl" label="標誌" :fallback="DEFAULT_IMAGES.logoUrl" hint="顯示在頁首，高度約 44 像素；建議用透明背景的圖片。" @error="error = $event" />
          <ImageField v-model="form.faviconUrl" label="網站圖示（favicon）" :fallback="DEFAULT_IMAGES.faviconUrl" hint="顯示在瀏覽器分頁上，建議用正方形的圖片。" @error="error = $event" />
        </div>
      </fieldset>

      <fieldset class="settings-group">
        <legend>首頁</legend>
        <div class="field-row">
          <label class="field">
            <span>標題上方的文字（選填）</span>
            <input v-model="form.heroPrefix" maxlength="50" />
          </label>
          <label class="field">
            <span>標題</span>
            <input v-model="form.heroTitle" required maxlength="50" />
          </label>
        </div>
        <label class="field">
          <span>標題下方的文字（選填）</span>
          <input v-model="form.heroText" maxlength="200" />
        </label>
        <ImageField v-model="form.campusUrl" label="主視覺圖片" :fallback="DEFAULT_IMAGES.campusUrl" hint="建議用橫向的照片。" @error="error = $event" />
        <label class="field">
          <span>主視覺圖片的說明</span>
          <input v-model="form.campusAlt" required maxlength="200" />
          <small>給看不到圖片的人，例如使用螢幕報讀軟體的訪客。</small>
        </label>
      </fieldset>

      <fieldset class="settings-group">
        <legend>頁尾</legend>
        <label class="field">
          <span>標題</span>
          <input v-model="form.footerTitle" required maxlength="100" />
        </label>
        <div class="field-row">
          <label class="field">
            <span>電話</span>
            <input v-model="form.phone" type="tel" required maxlength="50" pattern="[0-9\(\)+ \-]*[0-9][0-9\(\)+ \-]*" />
            <small>只填號碼，例如 (04)7232105。</small>
          </label>
          <label class="field">
            <span>分機（選填）</span>
            <input v-model="form.extension" maxlength="100" />
            <small>例如 轉 5552、5556、5557。</small>
          </label>
        </div>
        <label class="field">
          <span>開放時間（選填）</span>
          <input v-model="form.hours" maxlength="200" />
        </label>
        <div class="field">
          <span>聯絡老師（選填）</span>
          <div v-for="(teacher, index) in form.teachers" :key="index" class="teacher-row">
            <input v-model="teacher.name" required maxlength="100" placeholder="姓名" :aria-label="`第 ${index + 1} 位老師的姓名`" />
            <input v-model="teacher.email" type="email" required maxlength="254" placeholder="電子郵件" :aria-label="`第 ${index + 1} 位老師的電子郵件`" />
            <input v-model="teacher.extension" maxlength="50" placeholder="分機" :aria-label="`第 ${index + 1} 位老師的分機`" />
            <button type="button" class="button button--small button--quiet" :aria-label="`移除第 ${index + 1} 位老師`" @click="form.teachers.splice(index, 1)">移除</button>
          </div>
          <div>
            <button type="button" class="button button--small button--quiet" :disabled="form.teachers.length >= MAX_TEACHERS" @click="form.teachers.push({ name: '', email: '', extension: '' })">新增老師</button>
          </div>
          <small>姓名和電子郵件必填，分機可留空。最多 {{ MAX_TEACHERS }} 位。</small>
        </div>
      </fieldset>

      <fieldset class="settings-group">
        <legend>主題</legend>
        <label class="field">
          <span>預設主題</span>
          <select v-model="form.defaultTheme">
            <option value="SYSTEM">依訪客裝置的設定</option>
            <option value="LIGHT">淺色</option>
            <option value="DARK">深色</option>
          </select>
          <small>訪客按頁首的「深色模式」切換後，會改用自己的選擇。</small>
        </label>
        <div class="field-row">
          <div v-for="(theme, field) in THEMES" :key="field" class="field">
            <span>{{ theme.label }}</span>
            <label v-for="(label, key) in THEME_COLORS" :key="key" class="color-field">
              <input v-model="form[field][key]" type="color" />
              {{ label }}
            </label>
            <div>
              <button type="button" class="button button--small button--quiet" @click="form[field] = { ...DEFAULT_COLORS[field] }">還原內建顏色</button>
            </div>
          </div>
        </div>
      </fieldset>
    </EditorForm>
  </div>
</template>
