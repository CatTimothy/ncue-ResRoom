<script setup>
import { useTemplateRef } from 'vue';
import { useRouter } from 'vue-router';
import { can, deleteAlbum, fetchAlbum } from '../../api.js';
import AlbumEditor from './AlbumEditor.vue';
import AlbumHeader from './AlbumHeader.vue';
import AlbumPhotos from './AlbumPhotos.vue';
import ItemStatus from '../../components/ItemStatus.vue';
import { albumDeleteQuestion } from '../../format.js';
import { confirmDelete } from '../../page.js';
import { useCachedItem } from '../../useCachedItem.js';

const props = defineProps({ id: { type: String, required: true } });

const router = useRouter();
const editor = useTemplateRef('editor');

const state = useCachedItem(
  () => `album:${props.id}`,
  () => fetchAlbum(props.id),
  (row) => row.name,
);
const { item: album, status } = state;

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
      <AlbumHeader :album="album" @edit="editor.open(album)" @remove="remove" />
      <div>
        <AlbumPhotos :album-id="id" />
      </div>
      <AlbumEditor v-if="can('MANAGE_ALBUMS')" ref="editor" />
    </template>
  </div>
</template>
