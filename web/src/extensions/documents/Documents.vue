<script setup>
import { computed, reactive, useTemplateRef } from 'vue';
import { can, deleteDocument, deleteDocuments, fetchDocuments } from '../../api.js';
import DocumentEditor from './DocumentEditor.vue';
import ListStatus from '../../components/ListStatus.vue';
import { deleteQuestion, fileSizeText, groupDocuments } from '../../format.js';
import { confirmDelete } from '../../page.js';
import { usePagedList } from '../../usePagedList.js';

const editor = useTemplateRef('editor');
const list = usePagedList(() => 'documents', fetchDocuments, 50);

const groups = computed(() => groupDocuments(list.items.value));

const remove = (item) => confirmDelete(deleteQuestion(item.title), () => deleteDocument(item.id));

// 多選：只記 id；已經不在清單上的（例如被刪除）不算
const selected = reactive(new Set());
const selectedIds = computed(() => list.items.value.map((item) => item.id).filter((id) => selected.has(id)));
const allSelected = (documents) => documents.every((item) => selected.has(item.id));
const someSelected = (documents) => documents.some((item) => selected.has(item.id));

function toggle(item, checked) {
  if (checked) selected.add(item.id);
  else selected.delete(item.id);
}

/** 整個分類一起勾選或取消 */
function toggleGroup(documents, checked) {
  for (const item of documents) toggle(item, checked);
}

const selectAll = () => toggleGroup(list.items.value, true);
const clearSelection = () => selected.clear();

const removeSelected = () => {
  const ids = selectedIds.value;
  return confirmDelete(`確定要刪除選取的 ${ids.length} 份文件嗎？`, async () => {
    await deleteDocuments(ids);
    clearSelection();
  });
};
</script>

<template>
  <div class="page">
    <h1 class="stop">文件下載</h1>
    <div>
      <div v-if="can('MANAGE_DOCUMENTS')" class="admin-bar">
        <button type="button" class="button button--small" @click="editor.open()">新增文件</button>
      </div>
      <div v-if="can('MANAGE_DOCUMENTS') && selectedIds.length" class="selection-bar" role="region" aria-label="多選操作">
        <span role="status">已選取 {{ selectedIds.length }} 份</span>
        <div class="row-actions">
          <button v-if="selectedIds.length < list.items.value.length" type="button" class="button button--small button--quiet" @click="selectAll">全選</button>
          <button type="button" class="button button--small button--quiet" @click="clearSelection">取消選取</button>
          <button type="button" class="button button--small" @click="editor.openCategory(selectedIds)">變更分類</button>
          <button type="button" class="button button--small" @click="removeSelected">刪除</button>
        </div>
      </div>
      <section v-for="[name, documents] in groups" :key="name" class="document-group">
        <div class="document-group__head">
          <h2>{{ name }}</h2>
          <label v-if="can('MANAGE_DOCUMENTS')" class="document-check">
            <input
              type="checkbox"
              :checked="allSelected(documents)"
              :indeterminate="someSelected(documents) && !allSelected(documents)"
              @change="toggleGroup(documents, $event.target.checked)"
            />
            全選此分類
          </label>
        </div>
        <ul class="document-list">
          <li v-for="item in documents" :key="item.id" :class="{ 'is-selected': selected.has(item.id) }">
            <label v-if="can('MANAGE_DOCUMENTS')" class="document-check">
              <input
                type="checkbox"
                :checked="selected.has(item.id)"
                :aria-label="`選取文件：${item.title}`"
                @change="toggle(item, $event.target.checked)"
              />
            </label>
            <div class="document-list__main">
              <a :href="item.url" download>{{ item.title }}</a>
              <small class="edited">{{ item.filename.split('.').pop().toUpperCase() }}，{{ fileSizeText(item.size) }}</small>
            </div>
            <div v-if="can('MANAGE_DOCUMENTS')" class="row-actions">
              <button type="button" class="button button--small button--quiet" :aria-label="`編輯文件：${item.title}`" @click="editor.open(item)">編輯</button>
              <button type="button" class="button button--small button--quiet" :aria-label="`刪除文件：${item.title}`" @click="remove(item)">刪除</button>
            </div>
          </li>
        </ul>
      </section>
      <ListStatus :list="list" empty-text="目前沒有文件。" what="文件" />
      <DocumentEditor v-if="can('MANAGE_DOCUMENTS')" ref="editor" @batch-saved="clearSelection" />
    </div>
  </div>
</template>
