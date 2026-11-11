// 網站資料檔案的共用格式。資料夾結構見 README 的「網站資料的輸出與匯入」，seed/ 也是同樣的格式

/** 內文引用圖片與文件的寫法：{{image:<images/ 底下的路徑>}}、{{document:<documents/ 底下的路徑>}} */
export const PLACEHOLDER = /\{\{(image|document):([^}]+)\}\}/g;

/**
 * 檔案開頭的 front matter：
 * ---
 * title: "資源教室簡介"
 * ---
 * 值是 JSON，手寫時也可以直接寫文字（title: 資源教室簡介）
 */
export function parseFrontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return { data: {}, body: text };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z][\w-]*)\s*:\s?(.*)$/.exec(line);
    if (!field) continue;
    const raw = field[2].trim();
    try {
      data[field[1]] = JSON.parse(raw);
    } catch {
      data[field[1]] = raw;
    }
  }
  return { data, body: text.slice(match[0].length).replace(/^\r?\n/, '') };
}

export function stringifyFrontMatter(data, body) {
  const lines = Object.entries(data)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join('\n')}\n---\n\n${body}`;
}

/** 可以當作檔名或資料夾名稱的文字：去掉 Windows 不允許的字元 */
export function safeName(name, fallback = 'file') {
  const cleaned = String(name ?? '')
    .replace(/[\/:*?"<>|\p{Cc}]/gu, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 150);
  return cleaned || fallback;
}

/** 讀出文字檔：UTF-8，去掉 BOM */
export const textOf = (bytes) => bytes.toString('utf8').replace(/^﻿/, '');
