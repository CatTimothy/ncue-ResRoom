import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import pg from 'pg';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db/index.js';
import { seedContent } from '../src/db/seed.js';
import { createStorage } from '../src/lib/storage.js';
import { saveUser } from '../src/lib/password.js';
import { ALL_PERMISSIONS } from '../src/lib/permissions.js';
import { DEFAULT_NAVIGATION } from '../web/src/navigation.js';
import { PERMISSIONS as WEB_PERMISSIONS } from '../web/src/permissions.js';

const USER = { username: 'admin', password: 'admin-password-123' };
const PASSWORD = 'other-password-1234';
const PNG = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#3366cc' } }).png().toBuffer();

const BASE_URL = process.env.TEST_DATABASE_URL;
if (!BASE_URL) throw new Error('請設定 TEST_DATABASE_URL，帳號需要有建立資料庫的權限');

async function adminQuery(sql) {
  const client = new pg.Client({ connectionString: BASE_URL });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function createDatabase() {
  const name = `resroom_test_${randomBytes(6).toString('hex')}`;
  await adminQuery(`CREATE DATABASE ${name}`);
  const url = new URL(BASE_URL);
  url.pathname = `/${name}`;
  return { name, url: url.href };
}

const dropDatabase = (name) => adminQuery(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);

async function start(options = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'resroom-'));
  const database = await createDatabase();
  const instance = await createApp({ databaseUrl: database.url, dataDir, ...options });
  await saveUser(instance.db, USER.username, USER.password);
  return new Promise((resolve) => {
    instance.server.listen(0, () => resolve({
      ...instance,
      dataDir,
      base: `http://127.0.0.1:${instance.server.address().port}`,
      async stop() {
        instance.server.closeAllConnections();
        instance.server.close();
        await instance.db.close();
        await dropDatabase(database.name);
        rmSync(dataDir, { recursive: true, force: true });
      },
    }));
  });
}

let app;
let auth = {};

before(async () => {
  app = await start();
  auth = (await login(USER.username, USER.password)).headers;
});
after(() => app.stop());

function post(base, query, variables, headers) {
  return fetch(`${base}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  });
}

async function gql(query, variables, headers = auth) {
  return (await post(app.base, query, variables, headers)).json();
}

function upload(query, variables, file, filename, headers = auth) {
  const form = new FormData();
  form.set('operations', JSON.stringify({ query, variables: { ...variables, file: null } }));
  form.set('map', JSON.stringify({ 0: ['variables.file'] }));
  form.set('0', new Blob([file]), filename);
  return fetch(`${app.base}/graphql`, { method: 'POST', headers, body: form });
}

const uploadJson = async (...args) => (await upload(...args)).json();

async function login(username, password, base = app.base) {
  const res = await post(
    base,
    'mutation ($u: String!, $p: String!) { login(username: $u, password: $p) { username } }',
    { u: username, p: password },
  );
  const setCookie = res.headers.get('set-cookie');
  const { data, errors } = await res.json();
  return { user: data?.login, errors, setCookie, headers: setCookie ? { Cookie: setCookie.split(';')[0] } : {} };
}

const newAlbum = async (name) => (await gql(SAVE_ALBUM, { name })).data.saveAlbum;
const uploadsCount = () => readdirSync(join(app.dataDir, 'uploads')).length;

const SAVE_PAGE = `mutation ($slug: String!, $title: String!, $content: String, $format: ContentFormat, $file: File) {
  savePage(slug: $slug, title: $title, content: $content, format: $format, file: $file) { slug title format source html }
}`;
const SAVE_ANNOUNCEMENT = `mutation ($id: ID, $title: String!, $content: String!) {
  saveAnnouncement(id: $id, title: $title, content: $content) { id title content html createdAt modifiedAt publishedAt }
}`;
const UPLOAD_PHOTO = `mutation ($file: File!, $alt: String!, $albumId: ID!) {
  uploadPhoto(file: $file, alt: $alt, albumId: $albumId) { id albumId url originalUrl alt }
}`;
const SAVE_ALBUM = `mutation ($id: ID, $name: String!, $eventDate: String) {
  saveAlbum(id: $id, name: $name, eventDate: $eventDate) { id name createdAt modifiedAt eventDate photoCount coverUrl }
}`;
const UPLOAD_DOCUMENT = `mutation ($file: File!, $title: String!, $category: String) {
  uploadDocument(file: $file, title: $title, category: $category) { id url filename size category }
}`;

test('login and logout manage a hardened session', async () => {
  const session = await login(USER.username, USER.password);
  assert.equal(session.user.username, USER.username);
  assert.match(session.setCookie, /HttpOnly/);
  assert.match(session.setCookie, /SameSite=Strict/);
  assert.doesNotMatch(session.setCookie, /Secure/);

  const stored = await app.db.prepare('SELECT token_hash FROM sessions').all();
  const rawToken = session.headers.Cookie.split('=')[1];
  assert.ok(stored.every((row) => row.tokenHash.toString('base64url') !== rawToken));

  assert.equal((await gql('{ me { username } }', {}, session.headers)).data.me.username, USER.username);
  assert.equal((await gql('mutation { logout }', {}, session.headers)).data.logout, true);
  assert.equal((await gql('{ me { username } }', {}, session.headers)).data.me, null);
});

test('login failures do not reveal whether the account exists', async () => {
  const wrong = await login(USER.username, 'wrong-password-000');
  const unknown = await login('nobody', 'wrong-password-000');
  assert.equal(wrong.errors[0].message, unknown.errors[0].message);
  assert.equal(wrong.setCookie, null);
});

test('repeated login attempts are rate limited, even with the right password', async () => {
  await saveUser(app.db, 'limited', PASSWORD);
  for (let i = 0; i < 10; i += 1) {
    assert.equal((await login('limited', 'wrong-password-000')).errors[0].extensions.code, 'BAD_CREDENTIALS');
  }
  const blocked = await login('limited', PASSWORD);
  assert.equal(blocked.errors[0].extensions.code, 'TOO_MANY_REQUESTS');
  assert.equal(blocked.setCookie, null);
});

test('expired sessions are rejected', async () => {
  const session = await login(USER.username, USER.password);
  await app.db.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00Z'").run();
  assert.equal((await gql('{ me { username } }', {}, session.headers)).data.me, null);
  auth = (await login(USER.username, USER.password)).headers;
});

test('every mutation except login, logout and the view counters requires a session', async () => {
  const blocked = [
    'mutation { deletePage(slug: "a") }',
    'mutation { saveAnnouncement(title: "a", content: "b") { id } }',
    'mutation { deleteAnnouncement(id: 1) }',
    'mutation { updatePhoto(id: 1, alt: "a", albumId: 1) { id } }',
    'mutation { saveAlbum(name: "a") { id } }',
    'mutation { deleteAlbum(id: 1) }',
    'mutation { updateDocument(id: 1, title: "a") { id } }',
    'mutation { deletePhoto(id: 1) }',
    'mutation { deleteDocument(id: 1) }',
    'mutation { deleteDocuments(ids: [1]) }',
    'mutation { setDocumentsCategory(ids: [1], category: "a") }',
  ];
  for (const query of blocked) {
    for (const headers of [{}, { Cookie: 'session=forged' }]) {
      const { errors } = await gql(query, {}, headers);
      assert.equal(errors[0].extensions.code, 'UNAUTHENTICATED', query);
    }
  }
  const multipart = await upload(UPLOAD_PHOTO, { alt: 'a', albumId: 1 }, PNG, 'a.png', {});
  assert.equal(multipart.status, 401);
});

test('users never expose the password hash', async () => {
  assert.ok((await gql('{ me { passwordHash } }')).errors);
  const columns = await app.db.prepare(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position
  `).all();
  assert.deepEqual(columns.map((c) => c.columnName), ['username', 'password_hash', 'permissions']);
});

const SAVE_CONFIG_FROM_CURRENT = 'mutation { saveSiteConfig(input: { siteTitle: "t", logoText: "", campusAlt: "a", heroPrefix: "", heroTitle: "t", heroText: "", footerTitle: "標題", phone: "bad", extension: "", hours: "", teachers: [], defaultTheme: SYSTEM, lightTheme: {}, darkTheme: {} }) { phone } }';
const CREATE_USER = 'mutation ($u: String!, $p: String!, $r: [Permission!]!) { createUser(username: $u, password: $p, permissions: $r) { username permissions } }';
const SET_PERMISSIONS = 'mutation ($u: String!, $r: [Permission!]!) { setUserPermissions(username: $u, permissions: $r) { username permissions } }';
const CHANGE_PASSWORD = 'mutation ($c: String!, $n: String!) { changePassword(currentPassword: $c, newPassword: $n) }';

async function loginWith(username, permissions) {
  await saveUser(app.db, username, PASSWORD);
  await gql(SET_PERMISSIONS, { u: username, r: permissions });
  return (await login(username, PASSWORD)).headers;
}

test('the web app knows every permission', () => {
  assert.deepEqual(Object.keys(WEB_PERMISSIONS), ALL_PERMISSIONS);
});

test('accounts with MANAGE_USERS can list and create users, without overwriting existing accounts', async () => {
  const created = await gql(CREATE_USER, { u: 'new.editor', p: PASSWORD, r: ['MANAGE_PAGES', 'MANAGE_ALBUMS', 'MANAGE_PAGES'] });
  assert.deepEqual(created.data.createUser, { username: 'new.editor', permissions: ['MANAGE_ALBUMS', 'MANAGE_PAGES'] });
  assert.ok((await login('new.editor', PASSWORD)).user);
  const { users } = (await gql('{ users { username permissions } }')).data;
  assert.deepEqual(users.find((u) => u.username === 'new.editor').permissions, ['MANAGE_ALBUMS', 'MANAGE_PAGES']);
  assert.deepEqual(users.find((u) => u.username === USER.username).permissions, ALL_PERMISSIONS);

  const duplicate = await gql(CREATE_USER, { u: 'new.editor', p: 'another-password-123', r: ALL_PERMISSIONS });
  assert.match(duplicate.errors[0].message, /已經存在/);
  assert.ok((await login('new.editor', PASSWORD)).user, 'the original password still works');

  assert.match((await gql(CREATE_USER, { u: 'x', p: PASSWORD, r: [] })).errors[0].message, /username/);
  assert.match((await gql(CREATE_USER, { u: 'short.pw', p: 'short', r: [] })).errors[0].message, /12/);
  assert.ok((await gql(CREATE_USER, { u: 'bad.perm', p: PASSWORD, r: ['NOT_A_PERMISSION'] })).errors);
});

test('document links inserted by the Markdown editor work in pages and announcements', async () => {
  const uploaded = await uploadJson(
    'mutation ($file: File!, $title: String!) { uploadDocument(file: $file, title: $title) { id title url } }',
    { title: '[115] 報名表' },
    'hello',
    'form.pdf',
  );
  const { id, url } = uploaded.data.uploadDocument;
  const markdown = String.raw`[\[115\] 報名表](${url})`;
  const link = `<a href="${url}">[115] 報名表</a>`;

  const page = await gql(SAVE_PAGE, { slug: 'with-document', title: 't', format: 'MARKDOWN', content: markdown });
  assert.ok(page.data.savePage.html.includes(link));
  const announcement = await gql(
    'mutation ($c: String!) { saveAnnouncement(title: "有文件", content: $c) { id html } }',
    { c: markdown },
  );
  assert.ok(announcement.data.saveAnnouncement.html.includes(link));

  const download = await fetch(`${app.base}${url}`);
  assert.equal(download.status, 200);
  assert.equal(await download.text(), 'hello');

  await gql('mutation { deletePage(slug: "with-document") }');
  await gql('mutation ($id: ID!) { deleteAnnouncement(id: $id) }', { id: announcement.data.saveAnnouncement.id });
  await gql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
});

test('each permission only allows its own operations', async () => {
  const OPERATIONS = {
    MANAGE_ANNOUNCEMENTS: ['mutation { saveAnnouncement(title: "t", content: "c") { id } }', 'mutation { deleteAnnouncement(id: "0") }'],
    MANAGE_ALBUMS: ['mutation { saveAlbum(name: "相簿") { id } }', 'mutation { deleteAlbum(id: "0") }', 'mutation { deletePhoto(id: "0") }'],
    MANAGE_DOCUMENTS: ['mutation { deleteDocument(id: "0") }', 'mutation { deleteDocuments(ids: ["0"]) }', 'mutation { setDocumentsCategory(ids: ["0"]) }'],
    MANAGE_PAGES: ['mutation { savePage(slug: "perm-test", title: "t", format: MARKDOWN, content: "c") { slug } }', 'mutation { deletePage(slug: "perm-test") }'],
    MANAGE_SITE_CONFIG: [SAVE_CONFIG_FROM_CURRENT, 'mutation { saveNavigation(input: { utility: [{}], main: [] }) { main { service } } }'],
    MANAGE_USERS: ['{ users { username } }', 'mutation { createUser(username: "perm.test", password: "perm-password-123", permissions: []) { username } }', 'mutation { setUserPermissions(username: "nobody.here", permissions: []) { username } }'],
  };
  assert.deepEqual(Object.keys(OPERATIONS), ALL_PERMISSIONS);

  const code = async (query, headers) => (await gql(query, {}, headers)).errors?.[0].extensions.code;
  for (const permission of ALL_PERMISSIONS) {
    const headers = await loginWith(`only.${permission.toLowerCase().replaceAll('_', '-')}`, [permission]);
    for (const [owner, queries] of Object.entries(OPERATIONS)) {
      for (const query of queries) {
        const result = await code(query, headers);
        if (owner === permission) assert.notEqual(result, 'FORBIDDEN', `${permission} should allow ${query}`);
        else assert.equal(result, 'FORBIDDEN', `${permission} should not allow ${query}`);
      }
    }
  }

  const none = await loginWith('no.permissions', []);
  assert.equal(await code('mutation { saveAlbum(name: "x") { id } }', none), 'FORBIDDEN');
  assert.equal((await gql('{ me { permissions } }', {}, none)).data.me.permissions.length, 0);
  assert.equal(await code('{ users { username } }', {}), 'UNAUTHENTICATED');
  assert.equal(await code('mutation { saveAlbum(name: "x") { id } }', {}), 'UNAUTHENTICATED');

  await app.db.prepare("DELETE FROM albums WHERE name = '相簿'").run();
  await app.db.prepare("DELETE FROM announcements WHERE title = 't' AND content = 'c'").run();
  await app.db.prepare("DELETE FROM users WHERE username = 'perm.test'").run();
});

test('content images need the announcement, page or site config permission', async () => {
  const QUERY = 'mutation ($file: File!) { uploadContentImage(file: $file) { url } }';
  const upload_ = async (headers) => uploadJson(QUERY, {}, PNG, 'a.png', headers);
  assert.ok((await upload_(await loginWith('images.announcements', ['MANAGE_ANNOUNCEMENTS']))).data);
  assert.ok((await upload_(await loginWith('images.pages', ['MANAGE_PAGES']))).data);
  assert.ok((await upload_(await loginWith('images.site', ['MANAGE_SITE_CONFIG']))).data);
  assert.equal((await upload_(await loginWith('images.albums', ['MANAGE_ALBUMS']))).errors[0].extensions.code, 'FORBIDDEN');
});

test('accounts that cannot upload are refused before the body is read', async () => {
  const QUERY = 'mutation ($file: File!) { uploadContentImage(file: $file) { url } }';
  const refused = await upload(QUERY, {}, PNG, 'a.png', await loginWith('no.uploads', ['MANAGE_USERS']));
  assert.equal(refused.status, 403);
});

test('announcement views are only skipped for people who can manage announcements', async () => {
  const VIEW = 'mutation ($id: ID!) { recordAnnouncementView(id: $id) }';
  const { id } = (await gql('mutation { saveAnnouncement(title: "人次", content: "c") { id } }')).data.saveAnnouncement;
  const other = await loginWith('views.albums', ['MANAGE_ALBUMS']);
  assert.equal((await gql(VIEW, { id }, other)).data.recordAnnouncementView, 1);
  assert.equal((await gql(VIEW, { id })).data.recordAnnouncementView, 1);

  const scheduled = (await gql('mutation { saveAnnouncement(title: "排程", content: "c", publishedAt: "2999-01-01T00:00:00Z") { id } }')).data.saveAnnouncement;
  assert.equal((await gql(VIEW, { id: scheduled.id }, other)).data.recordAnnouncementView, null);

  await gql('mutation ($id: ID!) { deleteAnnouncement(id: $id) }', { id });
  await gql('mutation ($id: ID!) { deleteAnnouncement(id: $id) }', { id: scheduled.id });
});

test('permission changes apply to existing sessions, and nobody can change their own', async () => {
  const headers = await loginWith('second.admin', ALL_PERMISSIONS);
  assert.ok((await gql('{ users { username } }', {}, headers)).data.users);

  const changed = await gql(SET_PERMISSIONS, { u: 'second.admin', r: ['MANAGE_PAGES'] });
  assert.deepEqual(changed.data.setUserPermissions.permissions, ['MANAGE_PAGES']);
  assert.equal((await gql('{ users { username } }', {}, headers)).errors[0].extensions.code, 'FORBIDDEN');

  assert.match((await gql(SET_PERMISSIONS, { u: USER.username, r: [] })).errors[0].message, /自己/);
  assert.match((await gql(SET_PERMISSIONS, { u: 'nobody.here', r: [] })).errors[0].message, /找不到/);
});

test('two people removing each other from user management at once leave one who can manage users', async () => {
  await saveUser(app.db, 'race.one', PASSWORD);
  await saveUser(app.db, 'race.two', PASSWORD);
  const one = await login('race.one', PASSWORD);
  const two = await login('race.two', PASSWORD);
  await Promise.all([
    gql(SET_PERMISSIONS, { u: 'race.two', r: [] }, one.headers),
    gql(SET_PERMISSIONS, { u: 'race.one', r: [] }, two.headers),
  ]);
  const users = await app.db.prepare("SELECT permissions FROM users WHERE username LIKE 'race.%'").all();
  assert.equal(users.filter((user) => user.permissions.includes('MANAGE_USERS')).length, 1);
});

test('accounts from before permissions keep full access', async () => {
  const database = await createDatabase();
  try {
    await (await openDb(database.url)).close();
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    await client.query('ALTER TABLE users DROP COLUMN permissions');
    await client.query("INSERT INTO users (username, password_hash) VALUES ('older', 'h')");
    await client.end();

    const db = await openDb(database.url);
    assert.deepEqual((await db.prepare('SELECT permissions FROM users').get()).permissions, ALL_PERMISSIONS);
    await db.close();
  } finally {
    await dropDatabase(database.name);
  }
});

test('drafts, empty albums and page source need the matching permission, not just a login', async () => {
  const draft = (await gql('mutation { saveAnnouncement(title: "未來的公告", content: "c", publishedAt: "2999-01-01T00:00:00Z") { id } }')).data.saveAnnouncement;
  const album = await newAlbum('空相簿');
  await gql(SAVE_PAGE, { slug: 'source-test', title: 't', format: 'MARKDOWN', content: '原文' });
  const DRAFT = 'query ($id: ID!) { announcement(id: $id) { id } }';
  const DRAFTS = '{ announcements(search: "未來的公告") { id } }';
  const ALBUMS = '{ albums(search: "空相簿") { id } }';
  const SOURCE = '{ page(slug: "source-test") { source } }';

  const none = await loginWith('reads.none', ['MANAGE_DOCUMENTS']);
  assert.equal((await gql(DRAFT, { id: draft.id }, none)).data.announcement, null);
  assert.equal((await gql(DRAFTS, {}, none)).data.announcements.length, 0);
  assert.equal((await gql(ALBUMS, {}, none)).data.albums.length, 0);
  assert.equal((await gql(SOURCE, {}, none)).errors[0].extensions.code, 'FORBIDDEN');

  assert.equal((await gql(DRAFT, { id: draft.id }, await loginWith('reads.news', ['MANAGE_ANNOUNCEMENTS']))).data.announcement.id, draft.id);
  assert.equal((await gql(ALBUMS, {}, await loginWith('reads.albums', ['MANAGE_ALBUMS']))).data.albums.length, 1);
  assert.equal((await gql(SOURCE, {}, await loginWith('reads.pages', ['MANAGE_PAGES']))).data.page.source, '原文');

  await gql('mutation ($id: ID!) { deleteAnnouncement(id: $id) }', { id: draft.id });
  await gql('mutation ($id: ID!) { deleteAlbum(id: $id) }', { id: album.id });
  await gql('mutation { deletePage(slug: "source-test") }');
});

test('changing a password needs the current one and signs out other devices', async () => {
  await saveUser(app.db, 'pw.changer', PASSWORD);
  const here = await login('pw.changer', PASSWORD);
  const elsewhere = await login('pw.changer', PASSWORD);
  const NEW = 'brand-new-password-1';

  assert.equal((await gql(CHANGE_PASSWORD, { c: PASSWORD, n: NEW }, {})).errors[0].extensions.code, 'UNAUTHENTICATED');
  assert.match((await gql(CHANGE_PASSWORD, { c: 'wrong-password-000', n: NEW }, here.headers)).errors[0].message, /不正確/);
  assert.match((await gql(CHANGE_PASSWORD, { c: PASSWORD, n: 'short' }, here.headers)).errors[0].message, /12/);
  assert.ok((await login('pw.changer', PASSWORD)).user, 'rejected attempts keep the old password');

  const changed = await post(app.base, CHANGE_PASSWORD, { c: PASSWORD, n: NEW }, here.headers);
  assert.equal((await changed.json()).data.changePassword, true);
  const renewed = { Cookie: changed.headers.get('set-cookie').split(';')[0] };
  assert.notEqual(renewed.Cookie, here.headers.Cookie);
  assert.equal((await gql('{ me { username } }', {}, renewed)).data.me.username, 'pw.changer');
  assert.equal((await gql('{ me { username } }', {}, here.headers)).data.me, null, 'the old token no longer works');
  assert.equal((await gql('{ me { username } }', {}, elsewhere.headers)).data.me, null);
  assert.equal((await login('pw.changer', PASSWORD)).user, undefined);
  assert.ok((await login('pw.changer', NEW)).user);
});

test('guessing the current password is rate limited', async () => {
  await saveUser(app.db, 'pw.guesser', PASSWORD);
  const { headers } = await login('pw.guesser', PASSWORD);
  const NEW = 'brand-new-password-1';
  for (let i = 0; i < 10; i += 1) {
    assert.match((await gql(CHANGE_PASSWORD, { c: 'wrong-password-000', n: NEW }, headers)).errors[0].message, /不正確/);
  }
  assert.equal((await gql(CHANGE_PASSWORD, { c: PASSWORD, n: NEW }, headers)).errors[0].extensions.code, 'TOO_MANY_REQUESTS');
});

test('new albums default to today in Taiwan, and editing keeps the event date', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(Date.now());
  const QUERY = 'query ($id: ID!) { album(id: $id) { eventDate } }';
  const album = await newAlbum('今天的活動');
  assert.equal((await gql(QUERY, { id: album.id })).data.album.eventDate, today);

  await gql(SAVE_ALBUM, { id: album.id, name: '改過的名稱', eventDate: '2020-01-02' });
  await gql(SAVE_ALBUM, { id: album.id, name: '再改一次' });
  assert.equal((await gql(QUERY, { id: album.id })).data.album.eventDate, '2020-01-02');
  await gql('mutation ($id: ID!) { deleteAlbum(id: $id) }', { id: album.id });
});

test('announcements have the expected columns', async () => {
  const columns = await app.db.prepare(`
    SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'announcements' ORDER BY ordinal_position
  `).all();
  assert.deepEqual(columns.map((c) => c.columnName), [
    'id', 'title', 'content', 'created_at', 'modified_at', 'published_at', 'unit', 'views', 'deadline', 'contact_person', 'extension',
  ]);
  assert.equal(columns[2].dataType, 'text');
  assert.equal(columns[3].dataType, 'timestamp with time zone');
  assert.equal(columns[4].dataType, 'timestamp with time zone');
  assert.equal(columns[5].dataType, 'timestamp with time zone');
});

test('old announcements table is upgraded without losing data', async () => {
  const database = await createDatabase();
  const client = new pg.Client({ connectionString: database.url });
  await client.connect();
  await client.query(`
    CREATE TABLE announcements (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT announcements_title_check CHECK (title ~ '\\S' AND char_length(title) <= 200),
      CONSTRAINT announcements_text_check CHECK (octet_length(text) <= 2097152)
    );
    INSERT INTO announcements (title, text, created_at) VALUES ('舊公告', '舊內容', '2020-01-02T03:04:05Z');
  `);
  await client.end();

  try {
    // 開兩次，確認重複套用 schema 不會出錯
    await (await openDb(database.url)).close();
    const db = await openDb(database.url);
    try {
      const row = await db.prepare('SELECT * FROM announcements').get();
      assert.equal(row.content, '舊內容');
      assert.equal(row.text, undefined);
      assert.equal(row.modifiedAt, row.createdAt);
      assert.equal(row.createdAt, '2020-01-02T03:04:05.000Z');
      assert.equal(row.publishedAt, row.createdAt);
      // 約束改名後仍然有效，modified_at 有預設值
      const added = await db.prepare("INSERT INTO announcements (title, content) VALUES ('  新  ', 'c') RETURNING *").get();
      assert.ok(added.modifiedAt);
      assert.equal(added.title, '新', 'the trim trigger survives applying the schema twice');
      await assert.rejects(
        db.prepare('INSERT INTO announcements (title, content) VALUES ($1, $2)').run('t', 'x'.repeat(2097153)),
        /2 MB/,
      );
    } finally {
      await db.close();
    }
  } finally {
    await dropDatabase(database.name);
  }
});

test('announcement CRUD, ordering and paging', async () => {
  const older = (await gql(SAVE_ANNOUNCEMENT, { title: '  舊  ', content: 'a' })).data.saveAnnouncement;
  assert.equal(older.title, '舊');
  assert.match(older.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(older.modifiedAt, older.createdAt, 'a new announcement starts unmodified');
  const newer = (await gql(SAVE_ANNOUNCEMENT, { title: '新', content: 'b' })).data.saveAnnouncement;

  assert.deepEqual((await gql('{ announcements(limit: 1) { id } }')).data.announcements, [{ id: newer.id }]);

  const updated = (await gql(SAVE_ANNOUNCEMENT, { id: older.id, title: '改', content: 'c' })).data.saveAnnouncement;
  assert.equal(updated.title, '改');
  assert.equal(updated.content, 'c');
  assert.equal(updated.createdAt, older.createdAt, 'editing must keep created_at');
  assert.ok(updated.modifiedAt > older.modifiedAt, 'editing must update modified_at');

  assert.match((await gql(SAVE_ANNOUNCEMENT, { id: '99999', title: 'x', content: 'y' })).errors[0].message, /找不到/);
  // 長度以去除頭尾空白後計算
  const paddedResult = await gql(SAVE_ANNOUNCEMENT, { id: older.id, title: ` ${'長'.repeat(200)}
`, content: 'c' });
  const padded = paddedResult.data.saveAnnouncement;
  assert.equal(padded.title, '長'.repeat(200));
  assert.match((await gql(SAVE_ANNOUNCEMENT, { id: older.id, title: '長'.repeat(201), content: 'c' })).errors[0].message, /200/);
  assert.equal((await gql(`mutation { deleteAnnouncement(id: ${newer.id}) }`)).data.deleteAnnouncement, true);
  assert.equal((await gql(`mutation { deleteAnnouncement(id: ${newer.id}) }`)).data.deleteAnnouncement, false);
  await gql(`mutation { deleteAnnouncement(id: ${older.id}) }`);
});

test('announcements render Markdown and pictures, and drop raw HTML', async () => {
  const content = [
    '# 標題',
    '',
    '**粗體** [連結](https://example.com)',
    '',
    '![合照](https://example.com/a.jpg)',
    '![本站](/files/x.png)',
    '',
    '<script>alert(1)</script>',
    '',
    '<iframe src="https://www.youtube.com/embed/abc"></iframe>',
    '',
    '行內 <b onclick="alert(1)">文字</b>',
    '',
    '[壞連結](javascript:alert(1))',
    '![壞圖](javascript:alert(1))',
    '![壞圖](data:image/svg+xml;base64,AAAA)',
  ].join('\n');
  const { data } = await gql(SAVE_ANNOUNCEMENT, { title: 't', content });
  const { html, content: stored, id } = data.saveAnnouncement;

  assert.equal(stored, content);
  assert.ok(html.includes('<h1>標題</h1>'));
  assert.ok(html.includes('<strong>粗體</strong>'));
  assert.ok(html.includes('<a href="https://example.com">連結</a>'));
  assert.ok(html.includes('<img src="https://example.com/a.jpg" alt="合照"'));
  assert.ok(html.includes('<img src="/files/x.png" alt="本站"'));
  assert.ok(html.includes('文字'));
  for (const bad of ['<script', '<iframe', '<b ', '<b>', 'onclick', 'javascript:', 'data:image']) {
    assert.ok(!html.includes(bad), `html should not contain ${bad}: ${html}`);
  }
  await gql(`mutation { deleteAnnouncement(id: ${id}) }`);
});

test('announcements store the school announcement fields', async () => {
  const SAVE = `mutation ($id: ID, $title: String!, $content: String!, $unit: String, $deadline: String, $contactPerson: String, $extension: String) {
    saveAnnouncement(id: $id, title: $title, content: $content, unit: $unit, deadline: $deadline, contactPerson: $contactPerson, extension: $extension) {
      id html unit views deadline contactPerson extension
    }
  }`;
  const content = '本校師資培育中心專案行政助理甄選--公告錄取結果\n正　取：洪○全\n備　取：施○宜';
  const { saveAnnouncement: saved } = (await gql(SAVE, {
    title: '📣公告錄取結果', content, unit: ' 師資培育中心 ', deadline: '2026-11-10', contactPerson: '巫孟橙', extension: '1135',
  })).data;
  assert.equal(saved.unit, '師資培育中心');
  assert.equal(saved.deadline, '2026-11-10');
  assert.equal(saved.contactPerson, '巫孟橙');
  assert.equal(saved.extension, '1135');
  assert.equal(saved.views, 0);
  assert.match(saved.html, /正　取：洪○全<br\s*\/?>\s*備　取：施○宜/, 'a single newline stays a line break');

  const VIEW = 'mutation ($id: ID!) { recordAnnouncementView(id: $id) }';
  assert.equal((await gql(VIEW, { id: saved.id }, {})).data.recordAnnouncementView, 1);
  assert.equal((await gql(VIEW, { id: saved.id }, {})).data.recordAnnouncementView, 2);
  assert.equal((await gql(VIEW, { id: saved.id })).data.recordAnnouncementView, 2, 'admins are not counted');
  assert.equal((await gql(VIEW, { id: '99999' }, {})).data.recordAnnouncementView, null);

  const edited = (await gql(SAVE, { id: saved.id, title: 't', content: 'c' })).data.saveAnnouncement;
  assert.equal(edited.views, 2, 'editing keeps the view count');
  assert.equal(edited.deadline, '2026-11-10', 'omitted fields stay as they were');
  assert.equal(edited.unit, '師資培育中心');
  const cleared = (await gql(SAVE, { id: saved.id, title: 't', content: 'c', deadline: null, unit: '' })).data.saveAnnouncement;
  assert.equal(cleared.deadline, null, 'an explicit null clears the deadline');
  assert.equal(cleared.unit, '');
  assert.equal(cleared.contactPerson, '巫孟橙');

  assert.match((await gql(SAVE, { title: 't', content: 'c', deadline: 'x' })).errors[0].message, /時間格式/);
  assert.match((await gql(SAVE, { title: 't', content: 'c', unit: 'x'.repeat(101) })).errors[0].message, /公告單位/);
  await gql('mutation ($id: ID!) { deleteAnnouncement(id: $id) }', { id: saved.id });
});

test('scheduled announcements do not count or reveal views to visitors', async () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const { id } = (await gql(`mutation { saveAnnouncement(title: "未來", content: "c", publishedAt: "${future}") { id } }`)).data.saveAnnouncement;
  const VIEW = 'mutation ($id: ID!) { recordAnnouncementView(id: $id) }';
  assert.equal((await gql(VIEW, { id }, {})).data.recordAnnouncementView, null);
  assert.equal((await gql(VIEW, { id })).data.recordAnnouncementView, 0);
  await gql('mutation ($id: ID!) { deleteAnnouncement(id: $id) }', { id });
});

test('daily visits are counted without logging in', async () => {
  const before = (await gql('{ todayVisits }', {}, {})).data.todayVisits;
  assert.equal((await gql('mutation { recordVisit }', {}, {})).data.recordVisit, before + 1);
  assert.equal((await gql('mutation { recordVisit }', {}, {})).data.recordVisit, before + 2);
  assert.equal((await gql('{ todayVisits }', {}, {})).data.todayVisits, before + 2);
});

test('inline HTML pages are sanitized but keep allowed embeds', async () => {
  const content = `<h1 class="x">標題</h1><script>alert(1)</script><img src="a.png" alt="圖" onerror="alert(1)">
    <a href="javascript:alert(1)">x</a>
    <iframe src="https://www.youtube.com/embed/abc" title="影片"></iframe>
    <iframe src="https://evil.example/x"></iframe>`;
  const { data, errors } = await gql(SAVE_PAGE, { slug: 'about', title: '簡介', content, format: 'HTML' });
  assert.equal(errors, undefined);
  const { html, source } = data.savePage;
  assert.ok(html.includes('<h1 class="x">標題</h1>'));
  assert.ok(html.includes('https://www.youtube.com/embed/abc'));
  for (const bad of ['<script', 'onerror', 'javascript:', 'evil.example']) {
    assert.ok(!html.includes(bad), `html should not contain ${bad}`);
  }
  assert.equal(source, content);
});

test('pages accept .md and .html uploads and overwrite by slug', async () => {
  const md = await uploadJson(SAVE_PAGE, { slug: 'services', title: '服務' }, '# 服務項目\n\n<script>x</script>', 'p.MD');
  assert.equal(md.data.savePage.format, 'MARKDOWN');
  assert.equal(md.data.savePage.title, '服務');
  assert.ok(md.data.savePage.html.includes('<h1>服務項目</h1>'));
  assert.ok(!md.data.savePage.html.includes('<script'));

  const html = await uploadJson(SAVE_PAGE, { slug: 'services', title: '服務' }, '<p>新內容</p>', 'p.html');
  assert.equal(html.data.savePage.format, 'HTML');

  const { data } = await gql('{ page(slug: "services") { html } pages { slug } }');
  assert.equal(data.page.html, '<p>新內容</p>');
  assert.equal(data.pages.filter((p) => p.slug === 'services').length, 1);
});

test('page source is only readable after login', async () => {
  const anonymous = await gql('{ page(slug: "services") { source } }', {}, {});
  assert.equal(anonymous.errors[0].extensions.code, 'UNAUTHENTICATED');
  assert.ok((await gql('{ page(slug: "services") { html } }', {}, {})).data.page.html);
});

test('pages reject bad input', async () => {
  assert.match((await gql(SAVE_PAGE, { slug: 'a', title: 't' })).errors[0].message, /擇一/);
  assert.match((await gql(SAVE_PAGE, { slug: 'a', title: 't', content: 'x' })).errors[0].message, /format/);
  assert.match((await gql(SAVE_PAGE, { slug: '../x', title: 't', content: 'x', format: 'HTML' })).errors[0].message, /slug/);
  assert.match((await uploadJson(SAVE_PAGE, { slug: 'a', title: 't' }, 'x', 'p.exe')).errors[0].message, /\.md/);
});

const CONFIG_FIELDS = `siteTitle logoText faviconUrl logoUrl campusUrl campusAlt heroPrefix heroTitle heroText
  footerTitle phone extension hours teachers { name email extension }
  defaultTheme lightTheme { background surface text primary accent } darkTheme { background surface text primary accent }`;
const CONFIG_QUERY = `{ siteConfig { ${CONFIG_FIELDS} } }`;
const SAVE_CONFIG = `mutation ($input: SiteConfigInput!) { saveSiteConfig(input: $input) { ${CONFIG_FIELDS} } }`;
const NO_COLORS = { background: null, surface: null, text: null, primary: null, accent: null };
const CONFIG = {
  siteTitle: '資源教室',
  logoText: '資源教室',
  faviconUrl: null,
  logoUrl: null,
  campusUrl: null,
  campusAlt: '校園',
  heroPrefix: '',
  heroTitle: '歡迎',
  heroText: '',
  footerTitle: '聯絡我們',
  phone: '(04)1234567',
  extension: '',
  hours: '',
  teachers: [],
  defaultTheme: 'SYSTEM',
  lightTheme: NO_COLORS,
  darkTheme: NO_COLORS,
};

test('site config starts with the original content and only logged-in users can edit it', async () => {
  assert.deepEqual((await gql(CONFIG_QUERY, {}, {})).data.siteConfig, {
    siteTitle: '國立彰化師範大學資源教室',
    logoText: '資源教室',
    faviconUrl: null,
    logoUrl: null,
    campusUrl: null,
    campusAlt: '彰化師範大學校園：草坪後方的校舍與藍天白雲',
    heroPrefix: '國立彰化師範大學',
    heroTitle: '資源教室',
    heroText: '週一至週五 8:30～17:00 開放',
    footerTitle: '聯絡資源教室',
    phone: '(04)7232105',
    extension: '轉 5552、5556、5557',
    hours: '週一至週五 8:30～17:00',
    teachers: [
      { name: '陳縈媺', email: 'chencc@cc.ncue.edu.tw', extension: '5552' },
      { name: '何宜家', email: 'evea3@cc.ncue.edu.tw', extension: '5557' },
      { name: '周佳慧', email: 'teresa172@cc.ncue.edu.tw', extension: '5556' },
      { name: '何佳霖', email: 'annielinn@cc.ncue.edu.tw', extension: '5556' },
    ],
    defaultTheme: 'SYSTEM',
    lightTheme: NO_COLORS,
    darkTheme: NO_COLORS,
  });

  assert.equal((await gql(SAVE_CONFIG, { input: CONFIG }, {})).errors[0].extensions.code, 'UNAUTHENTICATED');

  const { url } = (await uploadJson('mutation ($file: File!) { uploadContentImage(file: $file) { url } }', {}, PNG, 'logo.png')).data.uploadContentImage;
  const saved = {
    ...CONFIG,
    siteTitle: ' 新網站 ',
    logoUrl: url,
    footerTitle: ' 聯絡我們 ',
    teachers: [{ name: ' 王小明 ', email: ' a@example.com ', extension: ' 1234 ' }, { name: '資源教室', email: 'b@example.com', extension: '' }],
    defaultTheme: 'DARK',
    darkTheme: { ...NO_COLORS, accent: '#112233' },
  };
  const expected = {
    ...saved,
    siteTitle: '新網站',
    footerTitle: '聯絡我們',
    teachers: [{ name: '王小明', email: 'a@example.com', extension: '1234' }, { name: '資源教室', email: 'b@example.com', extension: '' }],
  };
  assert.deepEqual((await gql(SAVE_CONFIG, { input: saved })).data.saveSiteConfig, expected);
  assert.deepEqual((await gql(CONFIG_QUERY, {}, {})).data.siteConfig, expected);
  assert.deepEqual((await app.db.prepare('SELECT dark_theme FROM site_config').get()).darkTheme, { accent: '#112233' }, 'unset colors are not stored');

  // 網站設定用到的圖片不會被當成沒人用的內文圖片清掉
  await app.db.prepare("UPDATE photos SET created_at = now() - interval '2 days' WHERE album_id IS NULL").run();
  await uploadJson('mutation ($file: File!) { uploadContentImage(file: $file) { url } }', {}, PNG, 'other.png');
  assert.equal((await fetch(`${app.base}${url}`)).status, 200);

  await gql(SAVE_CONFIG, { input: { ...CONFIG, teachers: expected.teachers } });
});


const NAVIGATION = '{ navigation { utility { service page { slug title } } main { service page { slug title } } } }';
const SAVE_NAVIGATION = `mutation ($input: NavigationInput!) {
  saveNavigation(input: $input) { utility { service page { slug } } main { service page { slug } } }
}`;
const slugsOf = (links) => links.map((link) => link.service ?? link.page.slug);
const saveNavigation = (input, headers) => gql(SAVE_NAVIGATION, { input }, headers);
/** 測試改過選單後還原成預設的網站功能 */
const resetNavigation = () => saveNavigation({
  utility: DEFAULT_NAVIGATION.utility.map(({ service }) => ({ service })),
  main: DEFAULT_NAVIGATION.main.map(({ service }) => ({ service })),
});

test('navigation starts with the site features the web app shows before it loads', async () => {
  const { navigation } = (await gql(NAVIGATION, {}, {})).data;
  assert.deepEqual(navigation, DEFAULT_NAVIGATION);
});

test('navigation links pages and site features, and only MANAGE_SITE_CONFIG can change it', async () => {
  await gql(SAVE_PAGE, { slug: 'nav-a', title: '頁面 A', format: 'MARKDOWN', content: 'a' });
  await gql(SAVE_PAGE, { slug: 'nav-b', title: '頁面 B', format: 'MARKDOWN', content: 'b' });
  const layout = { utility: [{ page: 'nav-b' }, { service: 'HOME' }], main: [{ service: 'DOCUMENTS' }, { page: 'nav-a' }] };

  assert.equal((await saveNavigation(layout, {})).errors[0].extensions.code, 'UNAUTHENTICATED');
  const editor = await loginWith('nav-editor', ['MANAGE_PAGES']);
  assert.equal((await saveNavigation(layout, editor)).errors[0].extensions.code, 'FORBIDDEN');

  const saved = (await saveNavigation(layout)).data.saveNavigation;
  assert.deepEqual(slugsOf(saved.utility), ['nav-b', 'HOME']);
  assert.deepEqual(slugsOf(saved.main), ['DOCUMENTS', 'nav-a']);
  assert.equal((await gql(NAVIGATION, {}, {})).data.navigation.utility[0].page.title, '頁面 B');

  // 刪除頁面時連結一起移除
  await gql('mutation { deletePage(slug: "nav-b") }');
  assert.deepEqual(slugsOf((await gql(NAVIGATION)).data.navigation.utility), ['HOME']);

  const rejects = async (change, message) => {
    assert.match((await saveNavigation({ ...layout, utility: [], ...change })).errors[0].message, message);
    assert.deepEqual(slugsOf((await gql(NAVIGATION)).data.navigation.main), ['DOCUMENTS', 'nav-a'], 'a rejected save changes nothing');
  };
  await rejects({ utility: [{ page: 'nav-a', service: 'HOME' }] }, /其中一個/);
  await rejects({ utility: [{}] }, /其中一個/);
  await rejects({ utility: [{ page: 'nav-a' }] }, /只能出現一次/);
  await rejects({ utility: [{ page: 'missing' }] }, /不存在的頁面/);

  await gql('mutation { deletePage(slug: "nav-a") }');
  await resetNavigation();
});

test('old navigation paths in site config are moved to the navigation table', async () => {
  const database = await createDatabase();
  try {
    await (await openDb(database.url)).close();
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    await client.query(`
      DROP TABLE navigation_links;
      INSERT INTO pages (slug, title, format, source) VALUES ('about', '簡介', 'MARKDOWN', ''), ('extra', '其他', 'MARKDOWN', '');
      ALTER TABLE site_config ADD COLUMN navigation JSONB;
      UPDATE site_config SET navigation = '{"utility": ["/", "/about", "/gone"], "main": ["/pages/extra", "/photos"]}';
    `);
    await client.end();

    const db = await openDb(database.url);
    try {
      const rows = await db.prepare('SELECT menu, page_slug, service FROM navigation_links ORDER BY menu, position').all();
      assert.deepEqual(rows.map((row) => [row.menu, row.pageSlug ?? row.service]), [
        ['UTILITY', 'HOME'], ['UTILITY', 'about'], ['MAIN', 'extra'], ['MAIN', 'PHOTOS'],
      ]);
      const column = await db.prepare(`
        SELECT 1 FROM information_schema.columns WHERE table_name = 'site_config' AND column_name = 'navigation'
      `).get();
      assert.equal(column, undefined);
    } finally {
      await db.close();
    }
  } finally {
    await dropDatabase(database.name);
  }
});

test('old key-value site config is moved to the new table', async () => {
  const database = await createDatabase();
  const client = new pg.Client({ connectionString: database.url });
  await client.connect();
  await client.query(`
    CREATE TABLE site_config (key TEXT PRIMARY KEY, value JSONB NOT NULL);
    INSERT INTO site_config (key, value) VALUES
      ('footer_title', '"舊標題"'), ('phone', '"(04)1111111"'), ('teachers', '[]'), ('copyright', '"舊版權"');
  `);
  await client.end();
  try {
    await (await openDb(database.url)).close();
    const db = await openDb(database.url);
    try {
      const rows = await db.prepare('SELECT * FROM site_config').all();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].footerTitle, '舊標題');
      assert.equal(rows[0].phone, '(04)1111111');
      assert.deepEqual(rows[0].teachers, []);
      assert.equal(rows[0].hours, '週一至週五 8:30～17:00', 'settings that were not saved keep the default');
      assert.equal(await db.prepare("SELECT to_regclass('site_config_legacy') AS t").get().then((r) => r.t), null);
    } finally {
      await db.close();
    }
  } finally {
    await dropDatabase(database.name);
  }
});

test('site config rejects bad input', async () => {
  const rejects = async (change, message) => assert.match(
    (await gql(SAVE_CONFIG, { input: { ...CONFIG, ...change } })).errors[0].message,
    message,
  );
  await rejects({ siteTitle: '  ' }, /網站標題/);
  await rejects({ heroTitle: 'x'.repeat(51) }, /首頁標題/);
  await rejects({ campusAlt: ' ' }, /說明/);
  await rejects({ logoUrl: 'https://evil.example/logo.png' }, /圖片網址/);
  await rejects({ faviconUrl: '/files/display/../x.webp' }, /圖片網址/);
  await rejects({ lightTheme: { ...NO_COLORS, text: 'red' } }, /#rrggbb/);
  await rejects({ darkTheme: { ...NO_COLORS, accent: '#12345' } }, /#rrggbb/);
  await rejects({ footerTitle: '  ' }, /標題/);
  await rejects({ phone: 'javascript:alert(1)' }, /電話/);
  await rejects({ phone: '()' }, /電話/);
  await rejects({ phone: '1'.repeat(51) }, /電話/);
  await rejects({ footerTitle: 'x'.repeat(101) }, /標題/);
  await rejects({ extension: 'x'.repeat(101) }, /分機/);
  await rejects({ hours: 'x'.repeat(201) }, /開放時間/);
  const teacher = { name: '王小明', email: 'a@example.com', extension: '' };
  await rejects({ teachers: [{ ...teacher, email: 'not-an-email' }] }, /電子郵件/);
  await rejects({ teachers: [{ ...teacher, name: '  ' }] }, /姓名/);
  await rejects({ teachers: [{ ...teacher, extension: '1'.repeat(51) }] }, /分機/);
  await rejects({ teachers: Array(11).fill(teacher) }, /最多/);
});

test('photo upload, serving, filter and delete', async () => {
  const count = uploadsCount();
  const displayCount = readdirSync(join(app.dataDir, 'display')).length;
  const album = await newAlbum('111(1)活動');
  const { data } = await uploadJson(UPLOAD_PHOTO, { alt: '合照', albumId: album.id }, PNG, 'evil.html');
  const photo = data.uploadPhoto;
  assert.match(photo.url, /^\/files\/display\/[0-9a-f-]{36}\.webp$/);
  assert.match(photo.originalUrl, /^\/files\/[0-9a-f-]{36}\.png$/);

  // 網頁顯示的是壓縮版
  const display = await fetch(app.base + photo.url);
  assert.equal(display.headers.get('content-type'), 'image/webp');
  assert.equal(display.headers.get('cache-control'), 'public, max-age=3600');
  assert.equal(display.headers.get('content-disposition'), null);
  assert.equal((await sharp(Buffer.from(await display.arrayBuffer())).metadata()).format, 'webp');

  // 原始檔只能下載，內容不變；檔名不能用來偽裝格式
  const original = await fetch(app.base + photo.originalUrl);
  assert.equal(original.headers.get('content-type'), 'application/octet-stream');
  assert.equal(original.headers.get('cache-control'), 'no-store');
  assert.equal(original.headers.get('content-disposition'), "attachment; filename*=UTF-8''evil.png");
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), PNG);

  const listed = await gql('query ($id: ID!) { photos(albumId: $id) { id } }', { id: album.id });
  assert.deepEqual(listed.data.photos, [{ id: photo.id }]);

  const other = await newAlbum('其他相簿');
  const UPDATE_PHOTO = `mutation ($id: ID!, $alt: String!, $albumId: ID!) {
    updatePhoto(id: $id, alt: $alt, albumId: $albumId) { id albumId url alt }
  }`;
  const updated = (await gql(UPDATE_PHOTO, { id: photo.id, alt: '  新說明  ', albumId: other.id })).data.updatePhoto;
  assert.deepEqual(updated, { id: photo.id, albumId: other.id, url: photo.url, alt: '新說明' });
  assert.equal(readdirSync(join(app.dataDir, 'display')).length, displayCount + 1);
  assert.match((await gql(UPDATE_PHOTO, { id: photo.id, alt: '   ', albumId: other.id })).errors[0].message, /alt/);
  assert.match((await gql(UPDATE_PHOTO, { id: photo.id, alt: 'x', albumId: '99999' })).errors[0].message, /相簿/);
  assert.match((await gql(UPDATE_PHOTO, { id: '99999', alt: 'x', albumId: other.id })).errors[0].message, /找不到/);

  await gql('mutation ($id: ID!) { deletePhoto(id: $id) }', { id: photo.id });
  assert.equal(uploadsCount(), count);
  assert.equal(readdirSync(join(app.dataDir, 'display')).length, displayCount);
  assert.equal((await fetch(app.base + photo.url)).status, 404);
  assert.equal((await fetch(app.base + photo.originalUrl)).status, 404);
});

test('large photos keep the original and show a smaller, compressed copy', async () => {
  // 隨機雜訊幾乎無法壓縮，檔案會超過舊的 10 MB 與 21 MB 上限
  const big = await sharp(randomBytes(3200 * 2400 * 3), { raw: { width: 3200, height: 2400, channels: 3 } }).png().toBuffer();
  assert.ok(big.length > 21 * 1024 * 1024);

  const photo = (await uploadJson(UPLOAD_PHOTO, { alt: '大照片', albumId: (await newAlbum('大照片')).id }, big, '活動 大圖.PNG')).data.uploadPhoto;
  const display = Buffer.from(await (await fetch(app.base + photo.url)).arrayBuffer());
  const { width, height } = await sharp(display).metadata();
  assert.deepEqual([width, height], [1600, 1200]);
  assert.ok(display.length < big.length);

  const original = await fetch(app.base + photo.originalUrl);
  assert.equal(original.headers.get('content-disposition'), `attachment; filename*=UTF-8''${encodeURIComponent('活動 大圖.png')}`);
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), big);

  // 壓縮版不見時（例如只還原了原始檔的備份）會自動重新產生
  rmSync(join(app.dataDir, 'display'), { recursive: true });
  mkdirSync(join(app.dataDir, 'display'));
  assert.equal((await fetch(app.base + photo.url)).status, 200);
  await gql('mutation ($id: ID!) { deletePhoto(id: $id) }', { id: photo.id });
});

test('a photo can be deleted while a download of it was interrupted', async () => {
  const big = await sharp(randomBytes(1000 * 1000 * 3), { raw: { width: 1000, height: 1000, channels: 3 } }).png().toBuffer();
  const photo = (await uploadJson(UPLOAD_PHOTO, { alt: '中斷', albumId: (await newAlbum('中斷')).id }, big, 'a.png')).data.uploadPhoto;
  const controller = new AbortController();
  const response = await fetch(app.base + photo.originalUrl, { signal: controller.signal });
  await response.body.getReader().read();
  controller.abort();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const count = uploadsCount();
  assert.equal((await gql('mutation ($id: ID!) { deletePhoto(id: $id) }', { id: photo.id })).data.deletePhoto, true);
  assert.equal(uploadsCount(), count - 1);
});

test('photo compression respects orientation, strips EXIF and handles every format', async () => {
  const album = await newAlbum('格式');
  const base = sharp({ create: { width: 40, height: 20, channels: 3, background: '#cc3366' } });
  const rotated = await base.clone().jpeg().withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'private' } } }).toBuffer();
  assert.equal((await sharp(rotated).metadata()).orientation, 6);
  const photo = (await uploadJson(UPLOAD_PHOTO, { alt: '旋轉', albumId: album.id }, rotated, 'a.jpg')).data.uploadPhoto;
  const meta = await sharp(Buffer.from(await (await fetch(app.base + photo.url)).arrayBuffer())).metadata();
  assert.deepEqual([meta.width, meta.height], [20, 40]);
  assert.equal(meta.exif, undefined);
  await gql('mutation ($id: ID!) { deletePhoto(id: $id) }', { id: photo.id });

  for (const format of ['jpeg', 'gif', 'webp', 'avif', 'tiff']) {
    const bytes = await base.clone().toFormat(format).toBuffer();
    const { data, errors } = await uploadJson(UPLOAD_PHOTO, { alt: format, albumId: album.id }, bytes, `a.${format}`);
    assert.equal(errors, undefined, format);
    assert.equal((await fetch(app.base + data.uploadPhoto.url)).status, 200, format);
    await gql('mutation ($id: ID!) { deletePhoto(id: $id) }', { id: data.uploadPhoto.id });
  }
});

test('old albums keep their publish day as the event date', async () => {
  const database = await createDatabase();
  const client = new pg.Client({ connectionString: database.url });
  await client.connect();
  await client.query(`
    CREATE TABLE albums (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT albums_name_check CHECK (name ~ '\\S' AND char_length(name) <= 100)
    );
    CREATE INDEX albums_published_at_idx ON albums (published_at DESC, id DESC);
    INSERT INTO albums (name, published_at) VALUES ('舊相簿', '2026-03-15T16:30:00Z');
  `);
  await client.end();

  try {
    await (await openDb(database.url)).close(); // 第一次升級
    const db = await openDb(database.url); // 再次啟動不會出錯，也不會改變資料
    try {
      const row = await db.prepare('SELECT * FROM albums').get();
      assert.equal(row.name, '舊相簿');
      assert.equal(row.eventDate, '2026-03-16', 'uses the Taiwan date');
      assert.equal(row.publishedAt, undefined);
      const added = await db.prepare("INSERT INTO albums (name) VALUES ('新') RETURNING event_date").get();
      assert.match(added.eventDate, /^\d{4}-\d{2}-\d{2}$/);
    } finally {
      await db.close();
    }
  } finally {
    await dropDatabase(database.name);
  }
});

test('old photos table is upgraded without losing data', async () => {
  const database = await createDatabase();
  const client = new pg.Client({ connectionString: database.url });
  await client.connect();
  await client.query(`
    CREATE TABLE photos (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      stored_name TEXT NOT NULL UNIQUE,
      alt TEXT NOT NULL,
      album TEXT,
      size INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT photos_size_check CHECK (size BETWEEN 0 AND 10485760)
    );
    INSERT INTO photos (stored_name, alt, album, size) VALUES
      ('a.png', '舊照片', '110(1)活動', 5), ('c.png', '同相簿', '110(1)活動', 5), ('d.png', '沒相簿', NULL, 5);
  `);
  await client.end();

  try {
    await (await openDb(database.url)).close();
    const db = await openDb(database.url);
    try {
      const rows = await db.prepare(`
        SELECT p.*, a.name FROM photos p JOIN albums a ON a.id = p.album_id ORDER BY p.id
      `).all();
      assert.deepEqual(rows.map((row) => row.name), ['110(1)活動', '110(1)活動', '未分類']);
      assert.equal(rows[0].alt, '舊照片');
      assert.equal(rows[0].filename, null);
      assert.equal(rows[0].album, undefined);
      assert.equal((await db.prepare('SELECT count(*)::int AS n FROM albums').get()).n, 2);
      await db.prepare("INSERT INTO photos (stored_name, alt, album_id) VALUES ('b.png', 'b', $1)").run(rows[0].albumId);
    } finally {
      await db.close();
    }
  } finally {
    await dropDatabase(database.name);
  }
});

test('old content_images table is merged into photos', async () => {
  const database = await createDatabase();
  const client = new pg.Client({ connectionString: database.url });
  await client.connect();
  await client.query(`
    CREATE TABLE content_images (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      stored_name TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    INSERT INTO content_images (stored_name, filename, size, created_at) VALUES
      ('a.png', '活動 照片.png', 5, '2020-06-01T00:00:00Z'), ('b.png', '.png', 5, now());
  `);
  await client.end();

  try {
    await (await openDb(database.url)).close();
    const db = await openDb(database.url);
    try {
      assert.equal((await db.prepare("SELECT to_regclass('content_images') AS t").get()).t, null);
      const rows = await db.prepare('SELECT stored_name, alt, album_id, filename, created_at FROM photos ORDER BY stored_name').all();
      assert.deepEqual(rows.map(({ storedName, alt, albumId, filename }) => ({ storedName, alt, albumId, filename })), [
        { storedName: 'a.png', alt: '活動 照片', albumId: null, filename: '活動 照片.png' },
        { storedName: 'b.png', alt: 'image', albumId: null, filename: '.png' },
      ]);
      assert.equal(new Date(rows[0].createdAt).getUTCFullYear(), 2020);
    } finally {
      await db.close();
    }
  } finally {
    await dropDatabase(database.name);
  }
});

test('rejected photos leave no file behind', async () => {
  const album = await newAlbum('拒絕');
  const count = uploadsCount();
  const fake = await uploadJson(UPLOAD_PHOTO, { alt: 'x', albumId: album.id }, '<svg onload="alert(1)"/>', 'a.png');
  assert.match(fake.errors[0].message, /JPEG/);
  const broken = await uploadJson(UPLOAD_PHOTO, { alt: 'x', albumId: album.id }, PNG.subarray(0, 12), 'a.png');
  assert.match(broken.errors[0].message, /無法讀取|僅接受/);
  const noAlt = await uploadJson(UPLOAD_PHOTO, { alt: '   ', albumId: album.id }, PNG, 'a.png');
  assert.match(noAlt.errors[0].message, /alt/);
  const noAlbum = await uploadJson(UPLOAD_PHOTO, { alt: 'a', albumId: '99999' }, PNG, 'a.png');
  assert.match(noAlbum.errors[0].message, /相簿/);
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(40)]);
  const named = await uploadJson(UPLOAD_PHOTO, { alt: 'a', albumId: album.id }, heic, 'iphone.jpg');
  assert.match(named.errors[0].message, /iphone\.jpg.*HEIC/);
  assert.equal(uploadsCount(), count);
});

test('documents download with their original name', async () => {
  const { data } = await uploadJson(UPLOAD_DOCUMENT, { title: '申請表', category: '111-1' }, 'hello', '伴讀 申請表.doc');
  const doc = data.uploadDocument;
  assert.equal(doc.size, 5);

  const served = await fetch(app.base + doc.url);
  assert.equal(served.headers.get('content-type'), 'application/octet-stream');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(
    served.headers.get('content-disposition'),
    `attachment; filename*=UTF-8''${encodeURIComponent('伴讀 申請表.doc')}`,
  );

  const count = uploadsCount();
  const bad = await uploadJson(UPLOAD_DOCUMENT, { title: 'x' }, 'x', 'a.exe');
  assert.match(bad.errors[0].message, /不支援/);
  assert.equal(uploadsCount(), count);

  await gql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id: doc.id });
  assert.equal((await fetch(app.base + doc.url)).status, 404);
});

test('the built website is served, with client-side routes falling back to index.html', async () => {
  const publicDir = mkdtempSync(join(tmpdir(), 'resroom-public-'));
  mkdirSync(join(publicDir, 'assets'));
  writeFileSync(join(publicDir, 'index.html'), '<title>網站</title>');
  writeFileSync(join(publicDir, 'assets', 'app-abc.js'), 'run()');
  writeFileSync(join(publicDir, 'logo.webp'), 'logo');
  writeFileSync(join(publicDir, '..', 'resroom-outside.txt'), 'secret');
  const site = await start({ publicDir });
  try {
    for (const path of ['/', '/photos', '/announcements/5', '/pages/some-page']) {
      const res = await fetch(site.base + path);
      assert.equal(res.status, 200, path);
      assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8', path);
      assert.equal(res.headers.get('cache-control'), 'no-cache', path);
      assert.equal(await res.text(), '<title>網站</title>', path);
    }

    const asset = await fetch(`${site.base}/assets/app-abc.js`);
    assert.equal(asset.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(await asset.text(), 'run()');
    assert.equal((await fetch(`${site.base}/logo.webp`)).headers.get('content-type'), 'image/webp');

    // 找不到的檔案、API 與上傳檔案的路徑都不會變成網頁；也不能讀到網站資料夾以外的檔案
    for (const path of ['/assets/missing.js', '/missing.png', '/files/none', '/files/00000000-0000-0000-0000-000000000000.png', '/%E0%A4%A', '/..%2fresroom-outside.txt', '/assets/..%2f..%2fresroom-outside.txt']) {
      const res = await fetch(site.base + path);
      assert.equal(res.status, 404, path);
      assert.ok(!(await res.text()).includes('secret'), path);
    }

    const api = await post(site.base, '{ __typename }', {}, {});
    assert.equal(api.status, 200);
  } finally {
    await site.stop();
    rmSync(publicDir, { recursive: true, force: true });
    rmSync(join(publicDir, '..', 'resroom-outside.txt'), { force: true });
  }
});

test('unknown and traversal file paths return 404', async () => {
  writeFileSync(join(app.dataDir, 'secret.txt'), 'secret');
  for (const path of ['/files/00000000-0000-0000-0000-000000000000.png', '/files/..%2fsecret.txt', '/files/../secret.txt']) {
    assert.equal((await fetch(app.base + path)).status, 404, path);
  }
});

test('values are limited by PostgreSQL constraints', async () => {
  const tooLong = await gql(SAVE_ANNOUNCEMENT, { title: 'x'.repeat(201), content: 'c' });
  assert.match(tooLong.errors[0].message, /200/);
  assert.equal(tooLong.errors[0].extensions.code, 'BAD_USER_INPUT');
  assert.match((await gql(SAVE_ANNOUNCEMENT, { title: '   ', content: 'c' })).errors[0].message, /title/);
  assert.match((await gql(SAVE_ANNOUNCEMENT, { title: 't', content: 'x'.repeat(2 * 1024 * 1024 + 1) })).errors[0].message, /2 MB/);

  const direct = (sql) => app.db.prepare(sql).run();
  await assert.rejects(direct("INSERT INTO pages (slug, title, format, source) VALUES ('Bad Slug', 't', 'HTML', '')"));
  await assert.rejects(direct("INSERT INTO users (username, password_hash) VALUES ('a', 'h')"));
  await assert.rejects(direct("INSERT INTO albums (name) VALUES ('   ')"));
  await assert.rejects(direct("INSERT INTO documents (stored_name, title, filename, size) VALUES ('a.exe', 't', 'a.exe', 1)"));
});

test('paging is clamped by SQL', async () => {
  const values = Array.from({ length: 102 }, (_, i) => `('paged${i}', 's')`).join(',');
  await app.db.prepare(`INSERT INTO announcements (title, content) VALUES ${values}`).run();
  assert.equal((await gql('{ announcements(limit: -5) { id } }')).data.announcements.length, 1);
  assert.equal((await gql('{ announcements(limit: 2, offset: -9) { id } }')).data.announcements.length, 2);
  assert.equal((await gql('{ announcements(limit: 100000) { id } }')).data.announcements.length, 100);
  await app.db.prepare("DELETE FROM announcements WHERE title LIKE 'paged%'").run();
});

test('invalid ids are user errors, not server errors', async () => {
  for (const id of ['abc', '1.5', '99999999999999999999']) {
    const result = await gql('query ($id: ID!) { announcement(id: $id) { id } }', { id });
    assert.equal(result.errors[0].extensions.code, 'BAD_USER_INPUT', id);
  }
});

test('statements are named server-side prepared statements', async () => {
  const sql = 'SELECT $1::int AS n';
  assert.deepEqual(await app.db.prepare(sql).get(1), { n: 1 });
  assert.deepEqual(await app.db.prepare(sql).get(2), { n: 2 });

  // 依序執行時 pool 會重用同一條閒置連線，所以看得到這條連線上已準備的語句
  const prepared = await app.db.prepare('SELECT name FROM pg_prepared_statements WHERE statement = $1').all(sql);
  assert.equal(prepared.length, 1);
  assert.match(prepared[0].name, /^q_[0-9a-f]{32}$/);

  const hostile = "x'; DROP TABLE users; --";
  assert.equal(await app.db.prepare('SELECT * FROM users WHERE username = $1').get(hostile), undefined);
  assert.ok(await app.db.prepare('SELECT 1 FROM users LIMIT 1').get());
});

test('announcements are ordered and hidden by published_at, and can be searched', async () => {
  const SAVE = `mutation ($id: ID, $title: String!, $publishedAt: String) {
    saveAnnouncement(id: $id, title: $title, content: "c", publishedAt: $publishedAt) { id createdAt modifiedAt publishedAt }
  }`;
  const save = async (vars) => (await gql(SAVE, vars)).data.saveAnnouncement;
  const old = await save({ title: '期中考試申請', publishedAt: '2026-03-15T16:30:00Z' }); // 台灣時間 3/16
  const future = await save({ title: '未來公告', publishedAt: '2099-01-01T00:00:00Z' });
  assert.equal(old.publishedAt, '2026-03-15T16:30:00.000Z');
  assert.equal(old.modifiedAt, old.createdAt);
  assert.match((await gql(SAVE, { title: 'x', publishedAt: 'not a date' })).errors[0].message, /時間/);

  const search = async (text, headers = {}) => (await gql(
    'query ($s: String) { announcements(search: $s, limit: 100) { title } }',
    { s: text },
    headers,
  )).data.announcements.map((row) => row.title);

  assert.deepEqual(await search('期中'), ['期中考試申請']);
  assert.deepEqual(await search('期中', auth), ['期中考試申請']);
  for (const date of ['2026-03-16', '2026/3/16', '115/3/16', '115年3月16日', '115-03', '3/16', '3月', '2026']) {
    assert.ok((await search(date)).includes('期中考試申請'), date);
  }
  assert.ok(!(await search('3/15')).includes('期中考試申請'), '要用台灣時區比對');
  assert.deepEqual(await search('%'), []);
  assert.deepEqual(await search("'; DROP TABLE announcements; --"), []);

  // 未到發布時間：公開查不到，登入可以
  assert.deepEqual(await search('未來'), []);
  assert.deepEqual(await search('未來', auth), ['未來公告']);
  const byId = 'query ($id: ID!) { announcement(id: $id) { id } }';
  assert.equal((await gql(byId, { id: future.id }, {})).data.announcement, null);
  assert.equal((await gql(byId, { id: future.id }, auth)).data.announcement.id, future.id);

  // 編輯時可改發布時間；不傳就不變
  const moved = await save({ id: old.id, title: '期中考試申請', publishedAt: '2026-05-01T00:00:00Z' });
  assert.equal(moved.publishedAt, '2026-05-01T00:00:00.000Z');
  assert.ok(moved.modifiedAt > moved.createdAt);
  assert.equal((await save({ id: old.id, title: '期中考試申請' })).publishedAt, moved.publishedAt);

  await gql(`mutation { deleteAnnouncement(id: ${old.id}) }`);
  await gql(`mutation { deleteAnnouncement(id: ${future.id}) }`);
});

test('album CRUD: event date, ordering, search and deleting removes its photos and files', async () => {
  const count = uploadsCount();
  const album = (await gql(SAVE_ALBUM, { name: '  110(1)校外參訪  ', eventDate: '2026-03-16' })).data.saveAlbum;
  assert.equal(album.name, '110(1)校外參訪');
  assert.equal(album.eventDate, '2026-03-16');
  assert.equal(album.photoCount, 0);
  assert.equal(album.coverUrl, null);
  assert.equal(album.modifiedAt, album.createdAt);
  assert.match((await gql(SAVE_ALBUM, { name: '   ' })).errors[0].message, /相簿名稱/);
  assert.match((await gql(SAVE_ALBUM, { id: '99999', name: 'a' })).errors[0].message, /找不到/);

  const search = async (text, headers = {}) => (await gql(
    'query ($s: String) { albums(search: $s) { name } }',
    { s: text },
    headers,
  )).data.albums.map((row) => row.name);

  // 空相簿不公開列出
  assert.deepEqual(await search('校外參訪'), []);
  assert.deepEqual(await search('校外參訪', auth), ['110(1)校外參訪']);

  const first = (await uploadJson(UPLOAD_PHOTO, { alt: 'a', albumId: album.id }, PNG, 'a.png')).data.uploadPhoto;
  const second = (await uploadJson(UPLOAD_PHOTO, { alt: 'b', albumId: album.id }, PNG, 'b.png')).data.uploadPhoto;
  assert.deepEqual(await search('校外參訪'), ['110(1)校外參訪']);
  assert.deepEqual(await search('115/3/16'), ['110(1)校外參訪']);

  const query = 'query ($id: ID!) { album(id: $id) { photoCount coverUrl } photos(albumId: $id) { id } }';
  const detail = (await gql(query, { id: album.id })).data;
  assert.equal(detail.album.photoCount, 2);
  assert.equal(detail.album.coverUrl, second.url);
  assert.deepEqual(detail.photos.map((row) => row.id), [second.id, first.id]);

  // 依活動日期由新到舊排列，和建立順序無關
  const older = await gql(SAVE_ALBUM, { name: '更早的活動', eventDate: '2020-01-02' });
  const newer = await gql(SAVE_ALBUM, { name: '更新的活動', eventDate: '2030-01-02' });
  const names = (await gql('{ albums(limit: 100) { name } }')).data.albums.map((row) => row.name);
  assert.ok(names.indexOf('更新的活動') < names.indexOf('110(1)校外參訪'));
  assert.ok(names.indexOf('110(1)校外參訪') < names.indexOf('更早的活動'));
  for (const { data: { saveAlbum: { id } } } of [older, newer]) {
    await gql('mutation ($id: ID!) { deleteAlbum(id: $id) }', { id });
  }

  // 編輯時可改活動日期；不傳就不變。日期未來的相簿照樣公開
  const moved = (await gql(SAVE_ALBUM, { id: album.id, name: '110(1)校外參訪', eventDate: '2099-01-01' })).data.saveAlbum;
  assert.equal(moved.eventDate, '2099-01-01');
  assert.ok(moved.modifiedAt > moved.createdAt);
  assert.equal((await gql(SAVE_ALBUM, { id: album.id, name: '110(1)校外參訪' })).data.saveAlbum.eventDate, '2099-01-01');
  assert.match((await gql(SAVE_ALBUM, { id: album.id, name: 'a', eventDate: 'x' })).errors[0].message, /格式/);
  const anonymous = (await gql(query, { id: album.id }, {})).data;
  assert.equal(anonymous.album.photoCount, 2);
  assert.equal(anonymous.photos.length, 2);
  assert.deepEqual(await search('校外參訪'), ['110(1)校外參訪']);
  assert.ok((await gql('{ albums { publishedAt } }')).errors, 'publishedAt is gone');

  assert.equal((await gql('mutation ($id: ID!) { deleteAlbum(id: $id) }', { id: album.id })).data.deleteAlbum, true);
  assert.equal((await gql('mutation ($id: ID!) { deleteAlbum(id: $id) }', { id: album.id })).data.deleteAlbum, false);
  assert.equal(uploadsCount(), count);
  assert.equal((await fetch(app.base + first.url)).status, 404);
  assert.equal((await fetch(app.base + second.originalUrl)).status, 404);
});

test('content images are uploaded for Markdown and removed when no longer referenced', async () => {
  const UPLOAD = 'mutation ($file: File!) { uploadContentImage(file: $file) { url name } }';
  const image = (await uploadJson(UPLOAD, {}, PNG, '活動 照片.png')).data.uploadContentImage;
  assert.equal(image.name, '活動 照片');
  assert.match(image.url, /^\/files\/display\/[0-9a-f-]{36}\.webp$/);
  assert.equal((await fetch(app.base + image.url)).status, 200);
  assert.equal((await upload(UPLOAD, {}, PNG, 'a.png', {})).status, 401);

  // 內文圖片存在 photos 但不屬於相簿：相簿的修改與刪除都碰不到
  const { id } = await app.db.prepare('SELECT id FROM photos WHERE album_id IS NULL ORDER BY id DESC LIMIT 1').get();
  const album = await newAlbum('內文圖片');
  const UPDATE = 'mutation ($id: ID!, $albumId: ID!) { updatePhoto(id: $id, alt: "x", albumId: $albumId) { id } }';
  assert.match((await gql(UPDATE, { id: String(id), albumId: album.id })).errors[0].message, /找不到/);
  assert.equal((await gql('mutation ($id: ID!) { deletePhoto(id: $id) }', { id: String(id) })).data.deletePhoto, false);
  assert.deepEqual((await gql('query ($id: ID!) { photos(albumId: $id) { id } }', { id: album.id })).data.photos, []);
  assert.equal((await fetch(app.base + image.url)).status, 200);
  await gql('mutation ($id: ID!) { deleteAlbum(id: $id) }', { id: album.id });

  const saved = (await gql(SAVE_ANNOUNCEMENT, { title: 't', content: `![圖](${image.url})` })).data.saveAnnouncement;
  assert.ok(saved.html.includes(`<img src="${image.url}"`));

  const age = () => app.db.prepare("UPDATE photos SET created_at = now() - interval '2 days' WHERE album_id IS NULL").run();
  const sweep = () => uploadJson(UPLOAD, {}, PNG, 'trigger.png');

  // 仍被公告引用：不會被清除
  await age();
  await sweep();
  assert.equal((await fetch(app.base + image.url)).status, 200);

  // 改由頁面引用時也不會被清除
  await gql(SAVE_PAGE, { slug: 'uses-image', title: 'p', format: 'MARKDOWN', content: `![圖](${image.url})` });
  await gql(`mutation { deleteAnnouncement(id: ${saved.id}) }`);
  await sweep();
  assert.equal((await fetch(app.base + image.url)).status, 200);

  // 沒有內容引用，而且超過緩衝期：下次上傳時清除
  await gql('mutation { deletePage(slug: "uses-image") }');
  await age();
  await sweep();
  assert.equal((await fetch(app.base + image.url)).status, 404);

  // 剛上傳、還沒存進內容的圖片有緩衝期
  const fresh = (await uploadJson(UPLOAD, {}, PNG, 'b.png')).data.uploadContentImage;
  await sweep();
  assert.equal((await fetch(app.base + fresh.url)).status, 200);
  await app.db.prepare('DELETE FROM photos WHERE album_id IS NULL').run();
  await resetNavigation();
});

test('documents can be edited', async () => {
  const doc = (await uploadJson(UPLOAD_DOCUMENT, { title: '舊標題' }, 'x', 'a.pdf')).data.uploadDocument;
  const UPDATE = 'mutation ($id: ID!, $title: String!, $category: String) { updateDocument(id: $id, title: $title, category: $category) { title category } }';
  assert.deepEqual((await gql(UPDATE, { id: doc.id, title: ' 新標題 ', category: '112' })).data.updateDocument, { title: '新標題', category: '112' });
  assert.match((await gql(UPDATE, { id: '99999', title: 'x' })).errors[0].message, /找不到/);
  await gql(`mutation { deleteDocument(id: ${doc.id}) }`);
});

test('documents can be recategorized and deleted in bulk', async () => {
  const upload = async (name) => (await uploadJson(UPLOAD_DOCUMENT, { title: name }, name, `${name}.pdf`)).data.uploadDocument;
  const docs = [await upload('a'), await upload('b'), await upload('c')];
  const ids = docs.map((doc) => doc.id);
  const before = uploadsCount();

  const SET = 'mutation ($ids: [ID!]!, $category: String) { setDocumentsCategory(ids: $ids, category: $category) }';
  assert.equal((await gql(SET, { ids: [ids[0], ids[1], '99999'], category: ' 115學年度第一學期 ' })).data.setDocumentsCategory, 2);
  const categories = async () => Object.fromEntries((await gql('{ documents(limit: 100) { id category } }')).data.documents
    .filter((doc) => ids.includes(doc.id)).map((doc) => [doc.id, doc.category]));
  assert.deepEqual(await categories(), { [ids[0]]: '115學年度第一學期', [ids[1]]: '115學年度第一學期', [ids[2]]: null });
  assert.equal((await gql(SET, { ids: [ids[0]], category: null })).data.setDocumentsCategory, 1);
  assert.equal((await categories())[ids[0]], null);
  assert.match((await gql(SET, { ids, category: 'x'.repeat(101) })).errors[0].message, /category/);
  assert.match((await gql(SET, { ids: ['abc'] })).errors[0].message, /資料格式/);

  const DELETE = 'mutation ($ids: [ID!]!) { deleteDocuments(ids: $ids) }';
  assert.equal((await gql(DELETE, { ids: [] })).data.deleteDocuments, 0);
  assert.equal((await gql(DELETE, { ids: [ids[0], ids[1], '99999'] })).data.deleteDocuments, 2);
  assert.equal(uploadsCount(), before - 2);
  assert.deepEqual(Object.keys(await categories()), [ids[2]]);
  await gql(DELETE, { ids: [ids[2]] });
});

test('seed content creates pages and documents once and never overwrites', async () => {
  const storage = createStorage({ db: app.db, dataDir: app.dataDir });
  const seedDir = fileURLToPath(new URL('../seed', import.meta.url));
  await seedContent({ db: app.db, storage, seedDir });

  const pages = (await gql('{ pages { slug title html } }')).data.pages;
  const slugs = pages.map((page) => page.slug);
  for (const slug of ['about', 'services', 'members', 'regulations', 'map']) assert.ok(slugs.includes(slug), slug);
  const map = pages.find((page) => page.slug === 'map');
  assert.match(map.html, /<img src="\/files\/display\/[0-9a-f-]{36}\.webp"/);
  const image = /src="([^"]+)"/.exec(map.html)[1];
  assert.equal((await fetch(app.base + image)).status, 200);
  assert.ok(pages.find((page) => page.slug === 'regulations').html.includes('https://law.moj.gov.tw/'));

  const documents = (await gql('{ documents(limit: 100) { title category url } }')).data.documents;
  assert.equal(documents.length, 7);
  assert.equal(documents[0].title, [...documents.map((d) => d.title)].sort()[0]);
  assert.equal(documents[0].category, '111學年度第一學期');

  const { navigation } = (await gql(NAVIGATION)).data;
  assert.deepEqual(slugsOf(navigation.utility), ['HOME', 'map', 'DOCUMENTS']);
  assert.deepEqual(slugsOf(navigation.main), ['about', 'services', 'ANNOUNCEMENTS', 'members', 'regulations', 'PHOTOS']);
  await saveNavigation({ utility: [{ page: 'about' }], main: [] });

  await gql(SAVE_PAGE, { slug: 'about', title: '改過', format: 'MARKDOWN', content: '改過' });
  const count = uploadsCount();
  await seedContent({ db: app.db, storage, seedDir });
  assert.equal(uploadsCount(), count);
  assert.equal((await gql('{ page(slug: "about") { title } }')).data.page.title, '改過');
  assert.equal((await gql('{ documents(limit: 100) { id } }')).data.documents.length, 7);
  assert.deepEqual(slugsOf((await gql(NAVIGATION)).data.navigation.utility), ['about'], 'a navigation with pages is kept');

  for (const { slug } of pages) await gql('mutation ($s: String!) { deletePage(slug: $s) }', { s: slug });
  for (const { id } of (await gql('{ documents(limit: 100) { id } }')).data.documents) await gql(`mutation { deleteDocument(id: ${id}) }`);
  await app.db.prepare('DELETE FROM photos WHERE album_id IS NULL').run();
});

test('oversized bodies are rejected', async () => {
  const res = await post(app.base, 'x'.repeat(5 * 1024 * 1024), {}, auth);
  assert.equal(res.status, 413);
});

test('cross-origin POSTs are blocked unless allowed', async () => {
  assert.equal((await post(app.base, '{ me { username } }', {}, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(app.base, '{ me { username } }', {}, { Origin: app.base })).status, 200);

  const cors = await start({ allowedOrigins: ['https://site.example'] });
  try {
    const allowed = await post(cors.base, '{ me { username } }', {}, { Origin: 'https://site.example' });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://site.example');
    assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
    assert.equal((await post(cors.base, '{ me { username } }', {}, { Origin: 'https://evil.example' })).status, 403);
  } finally {
    await cors.stop();
  }
});

test('production disables GraphiQL and uses Secure cookies', async () => {
  const prod = await start({ production: true });
  try {
    const page = await fetch(`${prod.base}/graphql`, { headers: { Accept: 'text/html' } });
    assert.ok(!(await page.text()).includes('GraphiQL'));
    assert.match((await login(USER.username, USER.password, prod.base)).setCookie, /; Secure/);
  } finally {
    await prod.stop();
  }
});

test('create-user creates a user and can reset a forgotten password', async () => {
  const database = await createDatabase();
  const run = (password) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/scripts/create-user.js', 'cli.user'], {
      env: { ...process.env, DATABASE_URL: database.url },
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout }));
    child.stdin.end(`${password}\n`);
  });
  const db = await openDb(database.url);
  try {
    assert.equal((await run('short')).status, 1);
    assert.equal((await run('first-password-123')).status, 0);
    assert.ok(!(await run('second-password-123')).stdout.includes('second-password-123'));
    assert.deepEqual(await db.prepare('SELECT username FROM users').all(), [{ username: 'cli.user' }]);
  } finally {
    await db.close();
    await dropDatabase(database.name);
  }
});

/** 對另一個網站實例送出請求 */
function siteClient(site, headers) {
  return {
    gql: async (query, variables) => (await post(site.base, query, variables, headers)).json(),
    async upload(query, variables, file, filename) {
      const form = new FormData();
      form.set('operations', JSON.stringify({ query, variables: { ...variables, file: null } }));
      form.set('map', JSON.stringify({ 0: ['variables.file'] }));
      form.set('0', new Blob([file]), filename);
      return (await fetch(`${site.base}/graphql`, { method: 'POST', headers, body: form })).json();
    },
    download: async (path) => Buffer.from(await (await fetch(`${site.base}${path}`, { headers })).arrayBuffer()),
  };
}

test('site data exports to a file that replaces another site\'s content', async () => {
  const source = await start();
  const target = await start();
  try {
    const sourceAuth = (await login(USER.username, USER.password, source.base)).headers;
    const targetAuth = (await login(USER.username, USER.password, target.base)).headers;
    const from = siteClient(source, sourceAuth);
    const to = siteClient(target, targetAuth);

    await from.gql(SAVE_PAGE, { slug: 'about', title: '簡介', content: '# 你好', format: 'MARKDOWN' });
    await from.gql('mutation { saveNavigation(input: { utility: [{ service: HOME }], main: [{ page: "about" }] }) { main { page { slug } } } }');
    const announcement = (await from.gql(SAVE_ANNOUNCEMENT, { title: '公告', content: '內容' })).data.saveAnnouncement;
    const album = (await from.gql(SAVE_ALBUM, { name: '110(1)參訪', eventDate: '2021-10-01' })).data.saveAlbum;
    const photo = (await from.upload(UPLOAD_PHOTO, { alt: '合照', albumId: album.id }, PNG, 'a.png')).data.uploadPhoto;
    const document = (await from.upload(UPLOAD_DOCUMENT, { title: '申請表', category: '其他' }, 'document body', 'a.pdf')).data.uploadDocument;
    const { url: logoUrl } = (await from.upload('mutation ($file: File!) { uploadContentImage(file: $file) { url } }', {}, PNG, 'logo.png')).data.uploadContentImage;
    const config = (await from.gql(`{ siteConfig { ${CONFIG_FIELDS} } }`)).data.siteConfig;
    await from.gql(SAVE_CONFIG, { input: { ...config, siteTitle: '匯出的網站', logoUrl } });

    // 匯入後這些內容要消失，檔案也要刪除
    await to.gql(SAVE_PAGE, { slug: 'old', title: '舊頁面', content: 'x', format: 'MARKDOWN' });
    await to.upload(UPLOAD_DOCUMENT, { title: '舊文件' }, 'old', 'old.pdf');

    const exported = await fetch(`${source.base}/site-data`, { headers: sourceAuth });
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get('content-disposition'), /^attachment; filename="resroom-\d{4}-\d{2}-\d{2}\.tar"$/);
    const archive = Buffer.from(await exported.arrayBuffer());
    assert.equal(archive.length, Number(exported.headers.get('content-length')));
    assert.equal(archive.length % 512, 0);

    const imported = await fetch(`${target.base}/site-data`, { method: 'POST', headers: targetAuth, body: archive });
    assert.equal(imported.status, 200);
    assert.deepEqual(await imported.json(), {
      counts: { pages: 1, announcements: 1, albums: 1, photos: 2, documents: 1 },
      missingFiles: 0,
    });

    assert.deepEqual((await to.gql('{ pages { slug title } }')).data.pages, [{ slug: 'about', title: '簡介' }]);
    assert.deepEqual((await to.gql('{ navigation { main { page { slug } } } }')).data.navigation.main, [{ page: { slug: 'about' } }]);
    assert.equal((await to.gql(`{ siteConfig { siteTitle logoUrl } }`)).data.siteConfig.siteTitle, '匯出的網站');
    assert.equal((await to.gql(`query ($id: ID!) { announcement(id: $id) { title } }`, { id: announcement.id })).data.announcement.title, '公告');
    const documents = (await to.gql('{ documents { id title url } }')).data.documents;
    assert.deepEqual(documents, [{ id: document.id, title: '申請表', url: document.url }]);
    assert.equal((await to.download(document.url)).toString(), 'document body');
    assert.deepEqual(await to.download(photo.originalUrl), PNG);
    assert.equal((await fetch(`${target.base}${logoUrl}`)).status, 200); // 壓縮版重新產生
    // 只剩匯入的照片與文件（另有 2 張照片的壓縮版在 display）
    assert.equal(readdirSync(join(target.dataDir, 'uploads')).length, 3);

    // 帳號不受影響；之後新增的資料接著原本的 id 編號
    assert.equal((await to.gql('{ me { username } }')).data.me.username, USER.username);
    const next = (await to.gql(SAVE_ANNOUNCEMENT, { title: '新公告', content: 'x' })).data.saveAnnouncement;
    assert.ok(Number(next.id) > Number(announcement.id));

    // 再匯入同一份資料，結果不變
    const again = await fetch(`${target.base}/site-data`, { method: 'POST', headers: targetAuth, body: archive });
    assert.equal(again.status, 200);
    assert.equal((await to.gql('{ announcements { title } }')).data.announcements.length, 1);
    assert.deepEqual(await to.download(photo.originalUrl), PNG);
  } finally {
    await source.stop();
    await target.stop();
  }
});

test('site data needs every content permission and rejects other files', async () => {
  assert.equal((await fetch(`${app.base}/site-data`)).status, 401);
  const partial = await loginWith('partial.editor', ['MANAGE_PAGES', 'MANAGE_SITE_CONFIG']);
  assert.equal((await fetch(`${app.base}/site-data`, { headers: partial })).status, 403);
  assert.equal((await fetch(`${app.base}/site-data`, { method: 'POST', headers: partial, body: 'x' })).status, 403);

  const crossOrigin = await fetch(`${app.base}/site-data`, { method: 'POST', headers: { ...auth, Origin: 'https://evil.example' }, body: 'x' });
  assert.equal(crossOrigin.status, 403);

  const pagesBefore = (await gql('{ pages { slug } }')).data.pages;
  const garbage = await fetch(`${app.base}/site-data`, { method: 'POST', headers: auth, body: Buffer.alloc(2048, 1) });
  assert.equal(garbage.status, 400);
  assert.match(await garbage.text(), /損毀|網站資料/);

  // 格式正確但檔名想跳出上傳資料夾
  const { tarHeader, tarPadding, TAR_END } = await import('../src/lib/tar.js');
  const json = Buffer.from(JSON.stringify({
    format: 'ncue-resroom-site-data',
    version: 1,
    tables: { photos: [{ id: 1, stored_name: '../../evil.png', alt: 'x' }] },
  }));
  const evil = Buffer.concat([tarHeader('data.json', json.length), json, tarPadding(json.length), TAR_END]);
  const rejected = await fetch(`${app.base}/site-data`, { method: 'POST', headers: auth, body: evil });
  assert.equal(rejected.status, 400);
  assert.equal(await rejected.text(), '網站資料裡有不正確的檔名');

  assert.deepEqual((await gql('{ pages { slug } }')).data.pages, pagesBefore);
  assert.ok(!readdirSync(join(app.dataDir, 'uploads')).some((name) => name.startsWith('.import-')));
});
