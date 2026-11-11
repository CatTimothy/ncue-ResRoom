import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_NAVIGATION, moveNavLink, NAV_LINKS, navMenus, navPaths } from './navigation.js';

test('沒有設定時用預設的排列，所有固定連結都在上面', () => {
  const menus = navMenus(null);
  assert.deepEqual(navPaths(menus), DEFAULT_NAVIGATION);
  assert.deepEqual(menus.utility[0], { to: '/', label: '首頁' });
  assert.equal(menus.utility.length + menus.main.length, Object.keys(NAV_LINKS).length);
});

test('依儲存的排列顯示，自訂頁面用頁面標題', () => {
  const pages = [{ slug: 'a', title: '頁面 A' }];
  const menus = navMenus({ utility: ['/pages/a', '/'], main: ['/photos'] }, pages);
  assert.deepEqual(menus.utility, [{ to: '/pages/a', label: '頁面 A' }, { to: '/', label: '首頁' }]);
  assert.equal(menus.main[0].to, '/photos');
});

test('內建頁面不會以自訂頁面再出現一次，和其他功能同名的自訂頁面照常出現', () => {
  const menus = navMenus(null, [{ slug: 'about', title: '資源教室簡介' }, { slug: 'photos', title: '照片' }]);
  assert.ok(!menus.main.some((link) => link.to === '/pages/about'));
  assert.ok(menus.main.some((link) => link.to === '/pages/photos'));
});

test('已刪除的頁面拿掉，沒排過的連結接在主選單後面，重複的只留第一個', () => {
  const pages = [{ slug: 'new', title: '新頁面' }];
  const menus = navMenus({ utility: ['/', '/pages/gone', '/'], main: ['/'] }, pages);
  assert.deepEqual(menus.utility.map((link) => link.to), ['/']);
  assert.ok(!menus.main.some((link) => link.to === '/'));
  assert.equal(menus.main.at(-1).to, '/pages/new');
  assert.equal(menus.main.length, Object.keys(NAV_LINKS).length);
});

test('移動連結：同一列換位置，或換到另一列', () => {
  const navigation = { utility: ['/', '/map'], main: ['/about', '/photos'] };
  assert.deepEqual(moveNavLink(navigation, '/', 'utility', 1), { utility: ['/map', '/'], main: ['/about', '/photos'] });
  assert.deepEqual(moveNavLink(navigation, '/map', 'main', 1), { utility: ['/'], main: ['/about', '/map', '/photos'] });
  assert.deepEqual(moveNavLink(navigation, '/about', 'utility', 99), { utility: ['/', '/map', '/about'], main: ['/photos'] });
  assert.deepEqual(moveNavLink(navigation, '/photos', 'main', -1), { utility: ['/', '/map'], main: ['/photos', '/about'] });
  assert.deepEqual(navigation.utility, ['/', '/map'], '不改動原本的排列');
});
