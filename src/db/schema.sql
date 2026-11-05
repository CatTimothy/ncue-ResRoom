-- 可重複執行；啟動時套用。只會建立不存在的物件，既有資料表只有下方註明的升級會修改。
-- CHECK 約束的名稱對應 src/db/errors.js 的錯誤訊息。

DO $$
BEGIN
  IF to_regtype('content_format') IS NULL THEN
    CREATE TYPE content_format AS ENUM ('HTML', 'MARKDOWN');
  END IF;
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
  title      TEXT NOT NULL,
  format     content_format NOT NULL,
  source     TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pages_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 100),
  CONSTRAINT pages_title_check CHECK (title ~ '\S' AND char_length(title) <= 200),
  CONSTRAINT pages_source_check CHECK (octet_length(source) <= 2097152)
);

CREATE TABLE IF NOT EXISTS announcements (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT announcements_title_check CHECK (title ~ '\S' AND char_length(title) <= 200),
  CONSTRAINT announcements_content_check CHECK (octet_length(content) <= 2097152)
);

-- 升級舊版 announcements：text 改名為 content，並新增 modified_at、published_at（舊資料沿用 created_at）
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'announcements' AND column_name = 'text'
  ) THEN
    ALTER TABLE announcements RENAME COLUMN text TO content;
    ALTER TABLE announcements RENAME CONSTRAINT announcements_text_check TO announcements_content_check;
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

CREATE TABLE IF NOT EXISTS photos (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stored_name TEXT NOT NULL UNIQUE,
  alt         TEXT NOT NULL,
  album_id    BIGINT NOT NULL REFERENCES albums (id) ON DELETE CASCADE,
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

DROP INDEX IF EXISTS photos_album_id_idx;
CREATE INDEX IF NOT EXISTS photos_album_id_id_idx ON photos (album_id, id DESC);
CREATE INDEX IF NOT EXISTS announcements_published_at_idx ON announcements (published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS albums_event_date_idx ON albums (event_date DESC, id DESC);

-- 公告與頁面內文使用的圖片；沒有內容引用時會被清除
CREATE TABLE IF NOT EXISTS content_images (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stored_name TEXT NOT NULL UNIQUE,
  filename    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE content_images DROP COLUMN IF EXISTS size;

CREATE TABLE IF NOT EXISTS documents (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stored_name TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  category    TEXT,
  filename    TEXT NOT NULL,
  size        INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT documents_stored_name_check CHECK (
    stored_name ~ '\.(pdf|doc|docx|odt|xls|xlsx|ods|ppt|pptx|odp|txt)$'
  ),
  CONSTRAINT documents_title_check CHECK (title ~ '\S' AND char_length(title) <= 200),
  CONSTRAINT documents_category_check CHECK (char_length(category) <= 100),
  CONSTRAINT documents_filename_check CHECK (char_length(filename) <= 255),
  CONSTRAINT documents_size_check CHECK (size BETWEEN 0 AND 20971520)
);

-- 每天（台灣時區）的訪問人數
CREATE TABLE IF NOT EXISTS daily_visits (
  day      DATE PRIMARY KEY,
  visitors INTEGER NOT NULL
);
