<script setup>
import { saveSiteConfig } from '../api.js';
import { useEditor } from '../useEditor.js';
import EditorDialog from './EditorDialog.vue';

const { dialog, form, changed, busy, error, show, run } = useEditor({
  footerTitle: '',
  phone: '',
  extension: '',
  hours: '',
  teachers: [],
  copyright: '',
});

function open(config) {
  // 複製一份：編輯到一半不能改到畫面上的內容
  show({ ...config, teachers: config.teachers.map((teacher) => ({ ...teacher })) });
}

const MAX_TEACHERS = 10;

const submit = () => run(async () => {
  await saveSiteConfig(form);
  dialog.value.close();
});

defineExpose({ open });
</script>

<template>
  <EditorDialog
    ref="dialog"
    title="編輯頁尾"
    submit-label="儲存"
    :busy="busy"
    :dirty="changed"
    :error="error"
    @submit="submit"
  >
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
    <label class="field">
      <span>版權名稱</span>
      <input v-model="form.copyright" required maxlength="100" />
      <small>顯示在「Copyright © 年份」後面，年份會自動更新。</small>
    </label>
  </EditorDialog>
</template>
