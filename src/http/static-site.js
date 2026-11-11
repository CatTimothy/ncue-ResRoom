import { pipeline, Readable } from 'node:stream';
import { GraphQLError } from 'graphql';
import { createZip } from '../lib/zip.js';
import { buildStaticSite } from '../static-site/index.js';
import { authorize } from './authorize.js';
import { reply, today } from './site-data.js';

/** GET 下載整個網站的靜態 HTML（ZIP） */
export const STATIC_SITE_PATH = '/static-site';

export function createStaticSiteHandler({ db, storage, sessions, publicDir }) {
  let building = false;

  return async function handleStaticSite(req, res) {
    if (req.method !== 'GET') return reply(res, 405, 'Method not allowed', { Allow: 'GET' });
    const allowed = await authorize({
      sessions, req, res, reply, permissions: ['MANAGE_SITE_CONFIG'], message: '下載靜態網站需要網站設定的權限',
    });
    if (!allowed) return undefined;
    // 要讀取所有照片計算檢查碼，同時只做一次
    if (building) return reply(res, 409, '正在產生靜態網站，請稍後再試');
    building = true;
    let zip;
    try {
      zip = await createZip(await buildStaticSite({ db, storage, publicDir }));
    } catch (error) {
      if (!(error instanceof GraphQLError)) console.error(error);
      return reply(res, error instanceof GraphQLError ? 400 : 500, error instanceof GraphQLError ? error.message : '產生靜態網站時發生錯誤');
    } finally {
      building = false;
    }
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': zip.length,
      'Content-Disposition': `attachment; filename="static-site-${today()}.zip"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    pipeline(Readable.from(zip.stream()), res, (error) => {
      if (error && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.error(error);
    });
    return undefined;
  };
}
