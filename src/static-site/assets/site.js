// 靜態網站的互動：主題切換、窄螢幕的選單、照片燈箱。不依賴任何套件，直接開啟 HTML 檔也能用
(() => {
  const root = document.documentElement;
  const store = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 儲存空間被封鎖時，只是下次開啟時不記得
    }
  };

  // 主題：和網站一樣記在 resroom-theme；開頁時的套用寫在每頁的 <head>
  const themeButton = document.querySelector('[data-theme-toggle]');
  const renderTheme = () => {
    const dark = root.dataset.theme === 'dark';
    themeButton.setAttribute('aria-pressed', String(dark));
    themeButton.title = dark ? '切換成淺色模式' : '切換成深色模式';
    themeButton.querySelector('[data-icon="sun"]').hidden = !dark;
    themeButton.querySelector('[data-icon="moon"]').hidden = dark;
  };
  themeButton?.addEventListener('click', () => {
    const mode = root.dataset.theme === 'dark' ? 'light' : 'dark';
    store('resroom-theme', mode);
    window.applySiteTheme(mode);
    renderTheme();
  });
  if (themeButton) renderTheme();

  // 窄螢幕的選單
  const menuButton = document.querySelector('.menu-toggle');
  const menus = document.getElementById('site-menus');
  const setMenu = (open) => {
    menus.classList.toggle('is-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.querySelector('path').setAttribute('d', open ? 'M6 6l12 12M18 6 6 18' : 'M4 7h16M4 12h16M4 17h16');
  };
  menuButton?.addEventListener('click', () => setMenu(!menus.classList.contains('is-open')));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menus?.classList.contains('is-open')) setMenu(false);
  });

  // 照片燈箱：同一組照片（.photo-grid）可以用上一張、下一張切換
  const dialog = document.querySelector('.lightbox');
  if (!dialog) return;
  const image = dialog.querySelector('.lightbox__image');
  const text = dialog.querySelector('.lightbox__text');
  const count = dialog.querySelector('.lightbox__count');
  const download = dialog.querySelector('a[download]');
  let photos = [];
  let index = 0;

  const show = () => {
    const button = photos[index];
    image.src = button.dataset.src;
    image.alt = button.dataset.alt;
    text.textContent = button.dataset.alt;
    count.textContent = `第 ${index + 1} 張，共 ${photos.length} 張`;
    download.href = button.dataset.src;
    dialog.querySelectorAll('[data-step]').forEach((step) => { step.disabled = photos.length < 2; });
  };
  const step = (delta) => {
    index = (index + delta + photos.length) % photos.length;
    show();
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.photo-grid__open');
    if (!button) return;
    photos = [...button.closest('.photo-grid').querySelectorAll('.photo-grid__open')];
    index = photos.indexOf(button);
    show();
    dialog.showModal();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
    const delta = event.target.closest('[data-step]')?.dataset.step;
    if (delta) step(Number(delta));
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  });
})();
