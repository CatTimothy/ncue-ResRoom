// 擴充功能的工具，說明見 docs/extensions.md
//
//   npm run extensions:new -- <資料夾名稱> [--label 名稱] [--description 說明]
//     建立新的擴充功能：網站與伺服器兩邊的 meta.js、index.js 等檔案，再執行 sync
//   npm run extensions:sync [-- --check]
//     掃描 web/src/extensions/*/ 與 src/extensions/*/，重新產生三個清單：
//     web/src/extensions/meta.js、web/src/extensions/index.js、src/extensions/index.js。
//     --check 只檢查清單是否最新，不寫入（過期時結束碼為 1）
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const WEB_DIR = join(ROOT, 'web/src/extensions');
const SERVER_DIR = join(ROOT, 'src/extensions');
const FOLDER = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const KEY = /^[A-Z][A-Z0-9_]*$/;
const PATH = /^\/[a-z0-9]+(-[a-z0-9]+)*$/;
const GENERATED = '// 自動產生，請勿手動修改：新增或移除擴充功能的資料夾後執行 npm run extensions:sync。說明見 docs/extensions.md';

const camel = (folder) => folder.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const pascal = (folder) => camel(folder).replace(/^./, (c) => c.toUpperCase());
const keyOf = (folder) => folder.toUpperCase().replace(/-/g, '_');
const folders = (dir, file) => readdirSync(dir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, file)))
  .map((entry) => entry.name)
  .sort();

/** 讀出每個擴充功能的 meta.js 並檢查；回傳依 order 排好的 [{ folder, meta }] */
async function readExtensions() {
  const { CORE_PATHS, CORE_PERMISSIONS } = await import(pathToFileURL(join(ROOT, 'web/src/reservedPaths.js')));
  const web = folders(WEB_DIR, 'meta.js');
  const server = new Set(folders(SERVER_DIR, 'index.js'));
  const errors = [];
  const seen = { key: new Map(), path: new Map(), permission: new Map() };
  const claim = (kind, value, folder) => {
    if (seen[kind].has(value)) errors.push(`${folder}：${kind} ${value} 和 ${seen[kind].get(value)} 重複`);
    seen[kind].set(value, folder);
  };

  const list = [];
  for (const folder of web) {
    if (!FOLDER.test(folder)) errors.push(`${folder}：資料夾名稱只能是小寫英文、數字與連字號`);
    if (!server.has(folder)) errors.push(`${folder}：缺少伺服器部分 src/extensions/${folder}/index.js`);
    if (!existsSync(join(WEB_DIR, folder, 'index.js'))) errors.push(`${folder}：缺少網站部分 web/src/extensions/${folder}/index.js`);
    server.delete(folder);

    const { default: meta } = await import(pathToFileURL(join(WEB_DIR, folder, 'meta.js')));
    if (!meta || typeof meta !== 'object') {
      errors.push(`${folder}：meta.js 要 export default 一個物件`);
      continue;
    }
    if (!KEY.test(meta.key ?? '') || meta.key === 'HOME') errors.push(`${folder}：key 要是英文大寫、數字與底線，且不能是 HOME`);
    if (!PATH.test(meta.path ?? '')) errors.push(`${folder}：path 要是第一層的網址，例如 /${folder}`);
    else if (CORE_PATHS.includes(meta.path.slice(1))) errors.push(`${folder}：path ${meta.path} 已經用於核心功能`);
    if (typeof meta.label !== 'string' || !meta.label.trim()) errors.push(`${folder}：缺少 label`);
    if (typeof meta.description !== 'string') errors.push(`${folder}：缺少 description`);
    if (!Number.isFinite(meta.order)) errors.push(`${folder}：order 要是數字`);
    for (const permission of Object.keys(meta.permissions ?? {})) {
      if (!KEY.test(permission)) errors.push(`${folder}：權限 ${permission} 要是英文大寫、數字與底線`);
      if (CORE_PERMISSIONS.includes(permission)) errors.push(`${folder}：權限 ${permission} 是核心的權限`);
      claim('permission', permission, folder);
    }
    claim('key', meta.key, folder);
    claim('path', meta.path, folder);
    list.push({ folder, meta });
  }
  for (const folder of server) errors.push(`${folder}：缺少網站部分 web/src/extensions/${folder}/meta.js`);

  if (errors.length) throw new Error(`擴充功能有問題：\n- ${errors.join('\n- ')}`);
  return list.sort((a, b) => a.meta.order - b.meta.order || a.folder.localeCompare(b.folder));
}

const importLines = (list, file) => [...list]
  .sort((a, b) => a.folder.localeCompare(b.folder))
  .map(({ folder }) => `import ${camel(folder)} from './${folder}/${file}';`)
  .join('\n');
const names = (list) => list.map(({ folder }) => camel(folder)).join(', ');

function registryFiles(list) {
  return {
    [join(WEB_DIR, 'meta.js')]: `${GENERATED}
// 所有擴充功能的基本資料，依 order 排列（首頁區塊、權限清單、選單都用這個順序）。伺服器與網站共用，只能是純資料
${importLines(list, 'meta.js')}

/** 每項是 { key, label, description, path, order, system, permissions }，見各資料夾的 meta.js */
export const EXTENSION_METAS = [${names(list)}];

export const extensionMeta = (key) => EXTENSION_METAS.find((meta) => meta.key === key) ?? null;
`,
    [join(WEB_DIR, 'index.js')]: `${GENERATED}
// 擴充功能的網站部分：各資料夾 index.js 的 routes、home。停用的擴充功能，網址顯示找不到頁面，選單與首頁也不顯示
${importLines(list, 'index.js')}

export const EXTENSIONS = [${names(list)}];

/** 所有擴充功能的路由；meta.extension 記錄屬於哪個擴充功能，標題預設是 label */
export const extensionRoutes = () => EXTENSIONS.flatMap(({ key, label, routes }) => routes.map((route) => ({
  ...route,
  meta: { title: label, ...route.meta, extension: key },
})));
`,
    [join(SERVER_DIR, 'index.js')]: `${GENERATED}
// 擴充功能的伺服器部分：各資料夾 index.js 的 typeDefs、createResolvers、passiveMutations、staticSite。啟用狀態見 ./state.js
${importLines(list, 'index.js')}

/** 所有擴充功能，順序和 web/src/extensions/meta.js 一致 */
export const EXTENSIONS = [${names(list)}];
`,
  };
}

const normalize = (text) => text.replace(/\r\n/g, '\n');

async function sync({ check = false } = {}) {
  const list = await readExtensions();
  const stale = [];
  for (const [path, content] of Object.entries(registryFiles(list))) {
    const current = existsSync(path) ? normalize(readFileSync(path, 'utf8')) : null;
    if (current === content) continue;
    stale.push(path.slice(ROOT.length).replace(/\\/g, '/'));
    if (!check) writeFileSync(path, content);
  }
  if (check && stale.length) {
    throw new Error(`擴充功能的清單不是最新的，請執行 npm run extensions:sync：${stale.join('、')}`);
  }
  const summary = list.map(({ meta }) => `${meta.label}（${meta.key}）`).join('、');
  console.log(stale.length ? `已更新 ${stale.join('、')}` : '擴充功能的清單已是最新');
  console.log(`擴充功能：${summary || '無'}`);
}

function option(args, name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

/** 新擴充功能的檔案，路徑相對於專案根目錄 */
function scaffold(folder, { key, label, description, order }) {
  const name = camel(folder);
  const page = `${pascal(folder)}Page`;
  const message = `${name}Message`;
  return {
    [`web/src/extensions/${folder}/meta.js`]: `/** 擴充功能的基本資料：伺服器與網站共用，只能是純資料。欄位說明見 docs/extensions.md */
export default {
  key: '${key}',
  label: '${label}',
  description: '${description}',
  path: '/${folder}',
  order: ${order},
  system: false,
  permissions: { MANAGE_${key}: '${label}' },
};
`,
    [`web/src/extensions/${folder}/index.js`]: `// ${label}的網站部分：網址與（選填的）首頁區塊。說明見 docs/extensions.md
import meta from './meta.js';
import ${page} from './${page}.vue';

export default {
  ...meta,
  routes: [{ path: meta.path, component: ${page} }],
  // home: HomeSection,  // 首頁區塊元件（選填）
};
`,
    [`web/src/extensions/${folder}/${page}.vue`]: `<script setup>
import { ref } from 'vue';
import { query } from '../../api.js';
import meta from './meta.js';

const message = ref('');
const error = ref('');
query('{ ${message} }').then((value) => {
  message.value = value;
}, (reason) => {
  error.value = reason.message;
});
</script>

<template>
  <div class="page">
    <h1 class="stop">{{ meta.label }}</h1>
    <p v-if="error" role="alert" class="notice notice--error">{{ error }}</p>
    <p v-else>{{ message || '載入中…' }}</p>
  </div>
</template>
`,
    [`src/extensions/${folder}/index.js`]: `// ${label}的伺服器部分。基本資料在 web/src/extensions/${folder}/meta.js，說明見 docs/extensions.md
import meta from '../../../web/src/extensions/${folder}/meta.js';
import { create${pascal(folder)}Resolvers, ${name}TypeDefs } from './graphql.js';
import staticSite from './static.js';

export default {
  ...meta,
  typeDefs: [${name}TypeDefs],
  createResolvers: [create${pascal(folder)}Resolvers],
  // 不會改變公開內容的 mutation 名稱（選填）
  passiveMutations: [],
  staticSite,
};
`,
    [`src/extensions/${folder}/graphql.js`]: `// ${label}的 GraphQL schema 與 resolver。停用時 Query 與 Mutation 的欄位會自動回傳 EXTENSION_DISABLED
export const ${name}TypeDefs = /* GraphQL */ \`
  extend type Query {
    "${label}的範例欄位，可以刪掉"
    ${message}: String!
  }
\`;

/** deps 是 { db, storage, sessions }；要求權限時用 src/lib/guards.js 的 withPermission('MANAGE_${key}', { ... }) */
export function create${pascal(folder)}Resolvers() {
  return {
    Query: {
      ${message}: () => '這是「${label}」擴充功能。',
    },
  };
}
`,
    [`src/extensions/${folder}/static.js`]: `// ${label}在沒有 JavaScript 時的頁面與靜態網站，對應 web/src/extensions/${folder} 的畫面。說明見 docs/extensions.md
import meta from '../../../web/src/extensions/${folder}/meta.js';
import { html, listMeta, page } from '../../static-site/template.js';

export default {
  /** 讀出公開的資料；回傳的物件會傳給 pages、home、info */
  async load() {
    return {};
  },

  pages: (site) => [{
    ...page(meta.path, meta.label, () => html\`
  <div class="page">
    <h1 class="stop">\${meta.label}</h1>
  </div>\`),
    meta: listMeta(meta.label, \`\${site.config.siteTitle}的\${meta.label}。\`, null),
  }],
};
`,
  };
}

async function create(args) {
  const folder = args.find((arg) => !arg.startsWith('--') && args[args.indexOf(arg) - 1]?.startsWith('--') !== true);
  if (!folder || !FOLDER.test(folder)) throw new Error('請提供資料夾名稱（小寫英文、數字與連字號），例如：npm run extensions:new -- event-signup --label 活動報名');
  for (const dir of [WEB_DIR, SERVER_DIR]) {
    if (existsSync(join(dir, folder))) throw new Error(`${join(dir, folder)} 已經存在`);
  }
  const existing = await readExtensions();
  const key = keyOf(folder);
  const label = option(args, 'label') ?? folder;
  const description = option(args, 'description') ?? `${label}的說明。`;
  if (/['\\\n]/.test(label + description)) throw new Error('名稱與說明不能有單引號、反斜線或換行');
  const order = Math.max(0, ...existing.map(({ meta }) => meta.order)) + 10;

  const files = scaffold(folder, { key, label, description, order });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(ROOT, path, '..'), { recursive: true });
    writeFileSync(join(ROOT, path), content);
    console.log(`建立 ${path}`);
  }
  await sync();
  console.log(`\n完成。網址是 /${folder}，權限 MANAGE_${key} 要由管理員在帳號管理勾選。重新啟動伺服器並重新建置 web/ 後就會出現。`);
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'sync') await sync({ check: args.includes('--check') });
  else if (command === 'new') await create(args);
  else throw new Error('用法：node src/scripts/extensions.js sync [--check] | new <資料夾名稱> [--label 名稱] [--description 說明]');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
