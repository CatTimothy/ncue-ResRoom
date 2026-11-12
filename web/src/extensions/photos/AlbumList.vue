<script setup>
import { useTemplateRef } from 'vue';
import { can, deleteAlbum } from '../../api.js';
import { albumDeleteQuestion, parseAlbum, rocDateText } from '../../format.js';
import { confirmDelete } from '../../page.js';
import AlbumEditor from './AlbumEditor.vue';

defineProps({ items: { type: Array, required: true } });

const editor = useTemplateRef('editor');

const remove = (album) => confirmDelete(albumDeleteQuestion(album), () => deleteAlbum(album.id));
</script>

<template>
  <div v-if="can('MANAGE_ALBUMS')" class="admin-bar">
    <button type="button" class="button button--small" @click="editor.open()">新增相簿</button>
  </div>

  <ul v-if="items.length" class="album-grid">
    <li v-for="album in items" :key="album.id">
      <div class="album-card__cover">
        <img v-if="album.coverUrl" :src="album.coverUrl" alt="" loading="lazy" decoding="async" />
        <span v-else>還沒有照片</span>
      </div>
      <p v-if="parseAlbum(album.name).term" class="term">{{ parseAlbum(album.name).term }}</p>
      <h3><RouterLink :to="`/photos/${album.id}`">{{ parseAlbum(album.name).name }}</RouterLink></h3>
      <p class="album-card__meta">
        <time :datetime="album.eventDate">{{ rocDateText(album.eventDate) }}</time>，{{ album.photoCount }} 張
      </p>
      <div v-if="can('MANAGE_ALBUMS')" class="photo-actions">
        <button type="button" class="button button--small" :aria-label="`編輯相簿：${album.name}`" @click="editor.open(album)">編輯</button>
        <button type="button" class="button button--small" :aria-label="`刪除相簿：${album.name}`" @click="remove(album)">刪除</button>
      </div>
    </li>
  </ul>

  <AlbumEditor v-if="can('MANAGE_ALBUMS')" ref="editor" />
</template>
