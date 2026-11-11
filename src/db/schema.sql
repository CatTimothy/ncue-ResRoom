-- 可重複執行；啟動時套用。只會建立不存在的物件，既有資料表只有下方註明的升級會修改。
-- CHECK 約束的名稱對應 src/db/errors.js 的錯誤訊息。

DO $$
BEGIN
  IF to_regtype('content_format') IS NULL THEN
    CREATE TYPE content_format AS ENUM ('HTML', 'MARKDOWN');
  END IF;
  IF to_regtype('theme_mode') IS NULL THEN
    CREATE TYPE theme_mode AS ENUM ('SYSTEM', 'LIGHT', 'DARK');
  END IF;
END $$;

-- 主題顏色只能有這幾個鍵，值是 #rrggbb；沒有的鍵使用 web/src/style.css 的預設值
CREATE OR REPLACE FUNCTION is_theme_colors(colors JSONB) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(colors) = 'object' AND NOT EXISTS (
    SELECT FROM jsonb_each(colors) AS c (key, value)
    WHERE c.key NOT IN ('background', 'surface', 'text', 'primary', 'accent')
      OR jsonb_typeof(c.value) <> 'string'
      OR c.value #>> '{}' !~ '^#[0-9a-f]{6}$'
  )
$$;

-- 頁首選單的排列：utility 與 main 兩列，各是不重複的連結路徑（例如 /about），最多 100 個
CREATE OR REPLACE FUNCTION is_navigation(nav JSONB) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(nav) = 'object'
    AND nav - 'utility' - 'main' = '{}'
    AND jsonb_typeof(nav -> 'utility') = 'array'
    AND jsonb_typeof(nav -> 'main') = 'array'
    AND (
      SELECT COALESCE(bool_and(
        jsonb_typeof(item) = 'string' AND item #>> '{}' ~ '^/[a-z0-9/-]*$' AND char_length(item #>> '{}') <= 200
      ), true) AND count(*) = count(DISTINCT item) AND count(*) <= 100
      FROM jsonb_array_elements((nav -> 'utility') || (nav -> 'main')) AS item
    )
$$;

-- 清單中每個物件的 field 都是符合 pattern 的文字，且不超過 max_length 字元
CREATE OR REPLACE FUNCTION all_match(items JSONB, field TEXT, pattern TEXT, max_length INT) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT NOT EXISTS (
    SELECT FROM jsonb_array_elements(items) AS item
    WHERE jsonb_typeof(item -> field) IS DISTINCT FROM 'string'
      OR item ->> field !~ pattern
      OR char_length(item ->> field) > max_length
  )
$$;

-- 去除頭尾的空白、換行與 tab（btrim 預設只去除空格）
CREATE OR REPLACE FUNCTION trim_text(value TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(value, E' \t\r\n')
$$;

-- 多個資料表共用的欄位限制。約束名稱是「型別名稱_check」，錯誤訊息在 src/db/errors.js
DO $$
BEGIN
  IF to_regtype('title_text') IS NULL THEN
    -- 型別的檢查在 trim_columns 之前執行，所以長度以去除頭尾空白後計算
    CREATE DOMAIN title_text AS TEXT CHECK (VALUE ~ '\S' AND char_length(trim_text(VALUE)) <= 200);
  END IF;
  IF to_regtype('content_text') IS NULL THEN
    CREATE DOMAIN content_text AS TEXT CHECK (octet_length(VALUE) <= 2097152);
  END IF;
  -- 上傳後的壓縮版圖片網址；NULL 表示使用網站內建的圖片
  IF to_regtype('image_path') IS NULL THEN
    CREATE DOMAIN image_path AS TEXT CHECK (VALUE ~ '^/files/display/[0-9a-f-]{36}\.webp$');
  END IF;
  IF to_regtype('theme_colors') IS NULL THEN
    CREATE DOMAIN theme_colors AS JSONB CHECK (is_theme_colors(VALUE));
  END IF;
END $$;

-- 寫入前去除參數所列欄位的頭尾空白，查詢就不用各自去除。內文（Markdown 的縮排有意義）不要列進來。
-- JSON 裡的文字（site_config.teachers）碰不到，由 src/graphql/site-config.js 的儲存語句處理
CREATE OR REPLACE FUNCTION trim_columns() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  row_json JSONB := to_jsonb(NEW);
  patch JSONB := '{}';
  col TEXT;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    patch := patch || jsonb_build_object(col, trim_text(row_json ->> col));
  END LOOP;
  NEW := jsonb_populate_record(NEW, patch);
  RETURN NEW;
END $$;

CREATE TABLE IF NOT EXISTS users (
  username      TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  CONSTRAINT users_username_check CHECK (username ~ '^[A-Za-z0-9._-]{3,50}$')
);

-- 權限清單，可用的值在 src/lib/permissions.js。升級舊帳號：原本就能做所有事，所以得到全部權限
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'permissions'
  ) THEN
    ALTER TABLE users ADD COLUMN permissions TEXT[] NOT NULL DEFAULT '{}';
    UPDATE users SET permissions = ARRAY[
      'MANAGE_ANNOUNCEMENTS', 'MANAGE_ALBUMS', 'MANAGE_DOCUMENTS', 'MANAGE_PAGES', 'MANAGE_SITE_CONFIG', 'MANAGE_USERS'
    ];
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash BYTEA PRIMARY KEY,
  username   TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS pages (
  slug       TEXT PRIMARY KEY,
  title      title_text NOT NULL,
  format     content_format NOT NULL,
  source     content_text NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pages_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 100)
);

CREATE TABLE IF NOT EXISTS announcements (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       title_text NOT NULL,
  content     content_text NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 升級舊版 announcements：text 改名為 content（長度限制由下方的 content_text 型別負責），並新增 modified_at、published_at（舊資料沿用 created_at）
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'announcements' AND column_name = 'text'
  ) THEN
    ALTER TABLE announcements RENAME COLUMN text TO content;
    ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_text_check;
  END IF;

  IF NOT EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'announcements' AND column_name = 'modified_at'
  ) THEN
    ALTER TABLE announcements ADD COLUMN modified_at TIMESTAMPTZ;
    UPDATE announcements SET modified_at = created_at;
    ALTER TABLE announcements
      ALTER COLUMN modified_at SET NOT NULL,
      ALTER COLUMN modified_at SET DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'announcements' AND column_name = 'published_at'
  ) THEN
    ALTER TABLE announcements ADD COLUMN published_at TIMESTAMPTZ;
    UPDATE announcements SET published_at = created_at;
    ALTER TABLE announcements
      ALTER COLUMN published_at SET NOT NULL,
      ALTER COLUMN published_at SET DEFAULT now();
  END IF;
END $$;

-- 公告資訊，欄位對應學校公告系統，方便之後同步；舊資料留空，瀏覽人次從 0 開始
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT ''
    CONSTRAINT announcements_unit_check CHECK (char_length(unit) <= 100),
  ADD COLUMN IF NOT EXISTS views INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deadline DATE,
  ADD COLUMN IF NOT EXISTS contact_person TEXT NOT NULL DEFAULT ''
    CONSTRAINT announcements_contact_person_check CHECK (char_length(contact_person) <= 100),
  ADD COLUMN IF NOT EXISTS extension TEXT NOT NULL DEFAULT ''
    CONSTRAINT announcements_extension_check CHECK (char_length(extension) <= 50);

CREATE TABLE IF NOT EXISTS albums (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_date   DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Taipei')::date,
  CONSTRAINT albums_name_check CHECK (name ~ '\S' AND char_length(name) <= 100)
);

-- 升級舊版 albums：發布時間改成活動日期，舊資料沿用發布當天（台灣時區）
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'albums' AND column_name = 'published_at'
  ) THEN
    ALTER TABLE albums ADD COLUMN IF NOT EXISTS event_date DATE;
    UPDATE albums SET event_date = (published_at AT TIME ZONE 'Asia/Taipei')::date;
    ALTER TABLE albums
      ALTER COLUMN event_date SET NOT NULL,
      ALTER COLUMN event_date SET DEFAULT (now() AT TIME ZONE 'Asia/Taipei')::date,
      DROP COLUMN published_at;
  END IF;
END $$;

-- album_id 是 NULL 的是公告、頁面內文與網站設定用的圖片（內文圖片），alt 存原始檔名；沒有內容引用時會被清除
CREATE TABLE IF NOT EXISTS photos (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stored_name TEXT NOT NULL UNIQUE,
  alt         TEXT NOT NULL,
  album_id    BIGINT REFERENCES albums (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  filename    TEXT,
  CONSTRAINT photos_alt_check CHECK (alt ~ '\S' AND char_length(alt) <= 500)
);

-- 升級舊版 photos：相簿從文字欄位改成獨立的資料表，移除大小欄位，並記錄原始檔名
ALTER TABLE photos ADD COLUMN IF NOT EXISTS filename TEXT;
ALTER TABLE photos DROP COLUMN IF EXISTS size;
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'photos' AND column_name = 'album'
  ) THEN
    ALTER TABLE photos ADD COLUMN album_id BIGINT REFERENCES albums (id) ON DELETE CASCADE;
    INSERT INTO albums (name, created_at, modified_at, event_date)
      SELECT COALESCE(NULLIF(btrim(album), ''), '未分類'), min(created_at), min(created_at), (min(created_at) AT TIME ZONE 'Asia/Taipei')::date
      FROM photos GROUP BY 1;
    UPDATE photos p SET album_id = a.id FROM albums a
      WHERE a.name = COALESCE(NULLIF(btrim(p.album), ''), '未分類');
    ALTER TABLE photos ALTER COLUMN album_id SET NOT NULL;
    ALTER TABLE photos DROP COLUMN album;
  END IF;
END $$;
ALTER TABLE photos ALTER COLUMN album_id DROP NOT NULL;

-- 升級舊版：內文圖片原本在獨立的 content_images 資料表，搬進 photos（album_id 為 NULL），說明沿用不含副檔名的原始檔名
DO $$
BEGIN
  IF to_regclass('content_images') IS NOT NULL THEN
    INSERT INTO photos (stored_name, alt, album_id, filename, created_at)
      SELECT stored_name, COALESCE(NULLIF(left(btrim(regexp_replace(filename, '\.[^.]*$', '')), 500), ''), 'image'), NULL, filename, created_at
      FROM content_images
      ON CONFLICT (stored_name) DO NOTHING;
    DROP TABLE content_images;
  END IF;
END $$;

DROP INDEX IF EXISTS photos_album_id_idx;
CREATE INDEX IF NOT EXISTS photos_album_id_id_idx ON photos (album_id, id DESC);
CREATE INDEX IF NOT EXISTS announcements_published_at_idx ON announcements (published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS albums_event_date_idx ON albums (event_date DESC, id DESC);

CREATE TABLE IF NOT EXISTS documents (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stored_name TEXT NOT NULL UNIQUE,
  title       title_text NOT NULL,
  category    TEXT,
  filename    TEXT NOT NULL,
  size        INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT documents_stored_name_check CHECK (
    stored_name ~ '\.(pdf|doc|docx|odt|xls|xlsx|ods|ppt|pptx|odp|txt)$'
  ),
  CONSTRAINT documents_category_check CHECK (char_length(category) <= 100),
  CONSTRAINT documents_filename_check CHECK (char_length(filename) <= 255),
  CONSTRAINT documents_size_check CHECK (size BETWEEN 0 AND 20971520)
);

-- 每天（台灣時區）的訪問人數
CREATE TABLE IF NOT EXISTS daily_visits (
  day      DATE PRIMARY KEY,
  visitors INTEGER NOT NULL
);

-- 舊版的 site_config 是一個設定一列（key、value），改成只有一列的資料表，欄位限制都寫在資料庫
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'site_config' AND column_name = 'key'
  ) THEN
    ALTER TABLE site_config RENAME TO site_config_legacy;
    ALTER INDEX site_config_pkey RENAME TO site_config_legacy_pkey;
  END IF;
END $$;

-- 全站共用的設定，只有一列。預設值是網站原本的內容；圖片是 NULL 時使用 web/public 的內建圖片
CREATE TABLE IF NOT EXISTS site_config (
  id            BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  site_title    TEXT NOT NULL DEFAULT '國立彰化師範大學資源教室',
  logo_text     TEXT NOT NULL DEFAULT '資源教室',
  favicon_url   image_path,
  logo_url      image_path,
  campus_url    image_path,
  campus_alt    TEXT NOT NULL DEFAULT '彰化師範大學校園：草坪後方的校舍與藍天白雲',
  hero_prefix   TEXT NOT NULL DEFAULT '國立彰化師範大學',
  hero_title    TEXT NOT NULL DEFAULT '資源教室',
  hero_text     TEXT NOT NULL DEFAULT '週一至週五 8:30～17:00 開放',
  footer_title  TEXT NOT NULL DEFAULT '聯絡資源教室',
  phone         TEXT NOT NULL DEFAULT '(04)7232105',
  extension     TEXT NOT NULL DEFAULT '轉 5552、5556、5557',
  hours         TEXT NOT NULL DEFAULT '週一至週五 8:30～17:00',
  teachers      JSONB NOT NULL DEFAULT '[{"name": "陳縈媺", "email": "chencc@cc.ncue.edu.tw", "extension": "5552"}, {"name": "何宜家", "email": "evea3@cc.ncue.edu.tw", "extension": "5557"}, {"name": "周佳慧", "email": "teresa172@cc.ncue.edu.tw", "extension": "5556"}, {"name": "何佳霖", "email": "annielinn@cc.ncue.edu.tw", "extension": "5556"}]',
  default_theme theme_mode NOT NULL DEFAULT 'SYSTEM',
  light_theme   theme_colors NOT NULL DEFAULT '{}',
  dark_theme    theme_colors NOT NULL DEFAULT '{}',
  CONSTRAINT site_config_site_title_check CHECK (site_title ~ '\S' AND char_length(site_title) <= 100),
  CONSTRAINT site_config_logo_text_check CHECK (char_length(logo_text) <= 50),
  CONSTRAINT site_config_campus_alt_check CHECK (campus_alt ~ '\S' AND char_length(campus_alt) <= 200),
  CONSTRAINT site_config_hero_prefix_check CHECK (char_length(hero_prefix) <= 50),
  CONSTRAINT site_config_hero_title_check CHECK (hero_title ~ '\S' AND char_length(hero_title) <= 50),
  CONSTRAINT site_config_hero_text_check CHECK (char_length(hero_text) <= 200),
  CONSTRAINT site_config_footer_title_check CHECK (footer_title ~ '\S' AND char_length(footer_title) <= 100),
  CONSTRAINT site_config_phone_check CHECK (phone ~ '^[0-9()+ -]*[0-9][0-9()+ -]*$' AND char_length(phone) <= 50),
  CONSTRAINT site_config_extension_check CHECK (char_length(extension) <= 100),
  CONSTRAINT site_config_hours_check CHECK (char_length(hours) <= 200),
  CONSTRAINT site_config_teachers_check CHECK (jsonb_typeof(teachers) = 'array' AND jsonb_array_length(teachers) <= 10),
  CONSTRAINT site_config_teacher_name_check CHECK (all_match(teachers, 'name', '\S', 100)),
  CONSTRAINT site_config_teacher_email_check CHECK (all_match(teachers, 'email', '^[^\s@]+@[^\s@]+$', 254)),
  CONSTRAINT site_config_teacher_extension_check CHECK (all_match(teachers, 'extension', '', 50))
);
INSERT INTO site_config DEFAULT VALUES ON CONFLICT DO NOTHING;

-- 預設的排列是網站原本的選單；沒有列出的頁面由網頁接在主選單後面
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS navigation JSONB NOT NULL
  DEFAULT '{"utility": ["/", "/map", "/documents"], "main": ["/about", "/services", "/announcements", "/members", "/regulations", "/photos"]}'
  CONSTRAINT site_config_navigation_check CHECK (is_navigation(navigation));

-- 頁尾的設定搬到新的資料表；版權名稱已改成固定值，不再保存
DO $$
BEGIN
  IF to_regclass('site_config_legacy') IS NOT NULL THEN
    UPDATE site_config SET
      footer_title = COALESCE((SELECT value #>> '{}' FROM site_config_legacy WHERE key = 'footer_title'), footer_title),
      phone = COALESCE((SELECT value #>> '{}' FROM site_config_legacy WHERE key = 'phone'), phone),
      extension = COALESCE((SELECT value #>> '{}' FROM site_config_legacy WHERE key = 'extension'), extension),
      hours = COALESCE((SELECT value #>> '{}' FROM site_config_legacy WHERE key = 'hours'), hours),
      teachers = COALESCE((SELECT value FROM site_config_legacy WHERE key = 'teachers'), teachers);
    DROP TABLE site_config_legacy;
  END IF;
END $$;

-- 舊資料庫的欄位改用共用的型別，原本各自的 CHECK 約束就不需要了
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('pages', 'title', 'title_text', 'pages_title_check'),
    ('pages', 'source', 'content_text', 'pages_source_check'),
    ('announcements', 'title', 'title_text', 'announcements_title_check'),
    ('announcements', 'content', 'content_text', 'announcements_content_check'),
    ('documents', 'title', 'title_text', 'documents_title_check')
  ) AS v (tbl, col, domain, old_check)
  LOOP
    IF EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = c.tbl AND column_name = c.col
        AND domain_name IS DISTINCT FROM c.domain
    ) THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I, ALTER COLUMN %I TYPE %I', c.tbl, c.old_check, c.col, c.domain);
    END IF;
  END LOOP;
END $$;

-- 所有可能引用上傳圖片的文字；清除沒人用的內文圖片時只看這裡（src/lib/storage.js）。新增會放圖片的欄位時加在這裡
CREATE OR REPLACE VIEW image_references (text) AS
  SELECT content FROM announcements
  UNION ALL SELECT source FROM pages
  UNION ALL SELECT concat_ws(' ', favicon_url, logo_url, campus_url) FROM site_config;

-- 寫入時去除頭尾空白的欄位。新增文字欄位時記得加在這裡。
-- 只在觸發程序不存在或欄位清單改變時重建，啟動時不用每次鎖住資料表
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('pages', ARRAY['title']),
    ('announcements', ARRAY['title', 'unit', 'contact_person', 'extension']),
    ('albums', ARRAY['name']),
    ('photos', ARRAY['alt']),
    ('documents', ARRAY['title', 'category']),
    ('site_config', ARRAY['site_title', 'logo_text', 'campus_alt', 'hero_prefix', 'hero_title', 'hero_text', 'footer_title', 'phone', 'extension', 'hours'])
  ) AS v (tbl, cols)
  LOOP
    -- tgargs 是以 \000 結尾的參數，encode 後就是「欄位\000欄位\000」
    CONTINUE WHEN EXISTS (
      SELECT FROM pg_trigger
      WHERE tgrelid = t.tbl::regclass AND tgname = t.tbl || '_trim'
        AND encode(tgargs, 'escape') = array_to_string(t.cols, '\000') || '\000'
    );
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t.tbl || '_trim', t.tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %s ON %I FOR EACH ROW EXECUTE FUNCTION trim_columns(%s)',
      t.tbl || '_trim',
      (SELECT string_agg(quote_ident(col), ', ') FROM unnest(t.cols) AS col),
      t.tbl,
      (SELECT string_agg(quote_literal(col), ', ') FROM unnest(t.cols) AS col)
    );
  END LOOP;
END $$;
