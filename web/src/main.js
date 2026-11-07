import '@fontsource/huninn/400.css';
import { createApp } from 'vue';
import { loadCurrentUser } from './api.js';
import App from './App.vue';
import { router } from './router.js';
import './theme.js';
import './style.css';

loadCurrentUser();
createApp(App).use(router).mount('#app');
