<script setup>
import { computed, useTemplateRef } from 'vue';
import { useRouter } from 'vue-router';
import { currentUser, deleteAlbum, fetchAlbum, fetchPhotos } from '../api.js';
import AlbumEditor from '../components/AlbumEditor.vue';
import ItemStatus from '../components/ItemStatus.vue';
import ListStatus from '../components/ListStatus.vue';
import PhotoGallery from '../components/PhotoGallery.vue';
import { albumDeleteQuestion, isScheduled, parseAlbum, rocDateText, wasEdited } from '../format.js';
import { confirmDelete } from '../page.js';
import { useCachedItem } from '../useCachedItem.js';
import { usePagedList } from '../usePagedList.js';

const props = defineProps({ id: { type: String, required: true } });

const router = useRouter();
const editor = useTemplateRef('editor');

const state = useCachedItem(
  () => `album:${props.id}`,
  () => fetchAlbum(props.id),
  (row) => row.name,
);
const { item: album, status } = state;
const photos = usePagedList(
  () => `album:${props.id}:photos`,
  (limit, offset) => fetchPhotos(props.id, limit, offset),
  48,
);
const title = computed(() => (album.value ? parseAlbum(album.value.name) : null));

const remove = () => confirmDelete(
  albumDeleteQuestion(album.value),
  () => deleteAlbum(props.id),
  () => router.push('/photos'),
);
</script>

<template>
  <div class="page">
    <RouterLink class="back-link" to="/photos">回到所有相簿</RouterLink>

    <ItemStatus :state="state" what="這本相簿">
      <template #missing>
        <h1 class="stop">找不到這本相簿</h1>
        <p>它可能已被刪除，請回到所有相簿查看其他活動。</p>
      </template>
    </ItemStatus>

    <template v-if="status === 'ready'">
      <header class="album-head">
        <div>
          <p v-if="title.term" class="term">{{ title.term }}</p>
          <h1 class="stop">{{ title.name }}</h1>
          <p class="article__date">
            <time :datetime="album.publishedAt">{{ rocDateText(album.publishedAt) }}</time>，{{ album.photoCount }} 張
            <span v-if="isScheduled(album)" class="tag">尚未發布</span>
          </p>
          <small v-if="wasEdited(album)" class="edited">編輯於 {{ rocDateText(album.modifiedAt) }}</small>
        </div>
        <div v-if="currentUser" class="row-actions">
          <button type="button" class="button button--small button--quiet" @click="editor.open(album)">編輯相簿</button>
          <button type="button" class="button button--small button--quiet" @click="remove">刪除相簿</button>
        </div>
      </header>

      <div>
        <PhotoGallery :photos="photos.items.value" :album-id="id" />
        <ListStatus :list="photos" empty-text="這本相簿還沒有照片。" what="照片" />
      </div>
      <AlbumEditor v-if="currentUser" ref="editor" />
    </template>
  </div>
</template>
