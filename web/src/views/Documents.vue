<script setup>
import { computed, useTemplateRef } from 'vue';
import { currentUser, deleteDocument, fetchDocuments } from '../api.js';
import DocumentEditor from '../components/DocumentEditor.vue';
import ListStatus from '../components/ListStatus.vue';
import { deleteQuestion, fileSizeText } from '../format.js';
import { confirmDelete } from '../page.js';
import { usePagedList } from '../usePagedList.js';

const editor = useTemplateRef('editor');
const list = usePagedList(() => 'documents', fetchDocuments, 50);

const groups = computed(() => {
  const byCategory = new Map();
  for (const document of list.items.value) {
    const name = document.category ?? '其他文件';
    if (!byCategory.has(name)) byCategory.set(name, []);
    byCategory.get(name).push(document);
  }
  return [...byCategory];
});

const remove = (item) => confirmDelete(deleteQuestion(item.title), () => deleteDocument(item.id));
</script>

<template>
  <div class="page">
    <h1 class="stop">文件下載</h1>
    <div>
      <div v-if="currentUser" class="admin-bar">
        <button type="button" class="button button--small" @click="editor.open()">新增文件</button>
      </div>
      <section v-for="[name, documents] in groups" :key="name" class="document-group">
        <h2>{{ name }}</h2>
        <ul class="document-list">
          <li v-for="item in documents" :key="item.id">
            <div>
              <a :href="item.url" download>{{ item.title }}</a>
              <small class="edited">{{ item.filename.split('.').pop().toUpperCase() }}，{{ fileSizeText(item.size) }}</small>
            </div>
            <div v-if="currentUser" class="row-actions">
              <button type="button" class="button button--small button--quiet" :aria-label="`編輯文件：${item.title}`" @click="editor.open(item)">編輯</button>
              <button type="button" class="button button--small button--quiet" :aria-label="`刪除文件：${item.title}`" @click="remove(item)">刪除</button>
            </div>
          </li>
        </ul>
      </section>
      <ListStatus :list="list" empty-text="目前沒有文件。" what="文件" />
      <DocumentEditor v-if="currentUser" ref="editor" />
    </div>
  </div>
</template>
