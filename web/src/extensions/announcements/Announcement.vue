<script setup>
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { can, deleteAnnouncement, fetchAnnouncement, fetchAnnouncementSource, recordAnnouncementView, saveAnnouncement } from '../../api.js';
import { replaceImageAlt } from '../../articleSegments.js';
import AnnouncementEditor from './AnnouncementEditor.vue';
import ArticleBody from '../../components/ArticleBody.vue';
import ItemStatus from '../../components/ItemStatus.vue';
import { deleteQuestion, isScheduled, rocDateTimeText, rocShortDate, wasEdited } from '../../format.js';
import { confirmDelete } from '../../page.js';
import { useCachedItem } from '../../useCachedItem.js';
import { useEditMode } from '../../useEditMode.js';

const props = defineProps({ id: { type: String, required: true } });

const router = useRouter();
const { active: editing, close } = useEditMode('MANAGE_ANNOUNCEMENTS');

const state = useCachedItem(
  () => `announcement:${props.id}`,
  () => fetchAnnouncement(props.id),
  (row) => row.title,
);
const { item, status } = state;

// 人次每次瀏覽都會變，不放進快取的內容，以記錄這次瀏覽後的回傳值為準
const views = ref(null);
watch(() => props.id, async (id) => {
  views.value = null;
  try {
    const count = await recordAnnouncementView(id);
    if (id === props.id) views.value = count;
  } catch (error) {
    console.error(error); // 沒記到不影響閱讀
  }
}, { immediate: true });

/** 圖片的說明存在內文裡 */
async function saveImageAlt(photo, alt) {
  const announcement = await fetchAnnouncementSource(props.id);
  await saveAnnouncement({ ...announcement, content: replaceImageAlt(announcement.content, photo, alt) });
}

const remove = () => confirmDelete(
  deleteQuestion(item.value.title),
  () => deleteAnnouncement(props.id),
  () => router.push('/announcements'),
);
</script>

<template>
  <div class="page">
    <AnnouncementEditor v-if="editing" :id="id" :key="id" @done="close" @cancel="close" />

    <template v-else>
      <RouterLink class="back-link" to="/announcements">回到最新消息</RouterLink>

      <ItemStatus :state="state" what="這則消息">
        <template #missing>
          <h1 class="stop">找不到這則消息</h1>
          <p>它可能已被刪除，請回到最新消息查看其他內容。</p>
        </template>
      </ItemStatus>

      <article v-if="status === 'ready'" class="article">
        <div v-if="can('MANAGE_ANNOUNCEMENTS')" class="admin-bar row-actions">
          <RouterLink class="button button--small" :to="{ query: { edit: '1' } }">編輯公告</RouterLink>
          <button type="button" class="button button--small button--quiet" @click="remove">刪除公告</button>
        </div>

        <p class="announcement__label">公告標題</p>
        <h1 class="stop">{{ item.title }}</h1>

        <dl class="announcement-info">
          <div>
            <dt>公告單位</dt>
            <dd>{{ item.unit || '—' }}</dd>
          </div>
          <div>
            <dt>瀏覽人次</dt>
            <dd>{{ views ?? '—' }}</dd>
          </div>
          <div>
            <dt>公告日期</dt>
            <dd>
              <time :datetime="item.publishedAt">{{ rocShortDate(item.publishedAt) }}</time>
              <span v-if="isScheduled(item)" class="tag">尚未發布</span>
            </dd>
          </div>
          <div>
            <dt>截止日期</dt>
            <dd>
              <time v-if="item.deadline" :datetime="item.deadline">{{ rocShortDate(item.deadline) }}</time>
              <template v-else>—</template>
            </dd>
          </div>
          <div>
            <dt>聯絡人</dt>
            <dd>{{ item.contactPerson || '—' }}</dd>
          </div>
          <div>
            <dt>分機</dt>
            <dd>{{ item.extension || '—' }}</dd>
          </div>
        </dl>

        <h2 class="announcement__body-title">詳細內容</h2>
        <ArticleBody :html="item.html" :save-image-alt="can('MANAGE_ANNOUNCEMENTS') ? saveImageAlt : null" />
        <small v-if="wasEdited(item)" class="edited">編輯於 {{ rocDateTimeText(item.modifiedAt) }}</small>
      </article>
    </template>
  </div>
</template>
