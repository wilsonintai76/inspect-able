import { Hono } from 'hono';
import { cache } from 'hono/cache';
import { Bindings, Variables } from '../types';

const media = new Hono<{ Bindings: Bindings, Variables: Variables }>();

// GET /api/media/:key - Get image from R2
// R2 supplies a native httpEtag; we also add Cache-Control for browser + CDN caching.
media.get('/:key', async (c) => {
  const key = c.req.param('key');
  const object = await c.env.MEDIA.get(key);

  if (!object) {
    return c.notFound();
  }

  const headers = new Headers();
  if (object && 'writeHttpMetadata' in object) {
    (object as any).writeHttpMetadata(headers);
  }
  if (object && 'httpEtag' in object) {
    headers.set('etag', (object as any).httpEtag);
  }
  // Images are immutable by name (timestamp-prefixed) — cache aggressively.
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  return c.body((object as any).body, 200, Object.fromEntries(headers.entries()));
});

// POST /api/media/upload - Upload KEW-PA 11 PDF to R2 (kewpa/ folder)
media.post('/upload', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'] as File;

  if (!file) {
    return c.json({ error: 'No file uploaded' }, 400);
  }

  const key = `kewpa/${Date.now()}-${file.name}`;
  await c.env.MEDIA.put(key, file.stream() as any, {
    httpMetadata: { contentType: file.type },
  });

  return c.json({ key, url: `/api/media/${key}` });
});

// KV Settings Example — cache at the edge for 60 s (admin settings rarely change)
media.get('/settings/:key', cache({ cacheName: 'settings', cacheControl: 'public, max-age=60, s-maxage=60' }), async (c) => {
  const key = c.req.param('key');
  const value = await c.env.SETTINGS.get(key);
  return c.json({ [key]: value });
});

media.post('/settings/:key', async (c) => {
  const key = c.req.param('key');
  const { value } = await c.req.json();
  await c.env.SETTINGS.put(key, value);
  return c.json({ success: true });
});

// GET /api/media/archives - List archived reports
media.get('/archives/list', async (c) => {
  const list = await c.env.MEDIA.list({ prefix: 'reports/' });
  const items = list.objects.map(obj => ({
    key: obj.key,
    uploaded: obj.uploaded,
    size: obj.size,
    url: `/api/media/${obj.key.replace(/\//g, '%2F')}` // Handle slashes in key for URL
  }));
  return c.json({ items });
});

// POST /api/media/archive - Archive a report to R2
media.post('/archive', async (c) => {
  const { html, filename, type = 'StrategicMemo' } = await c.req.json();
  
  if (!html) {
    return c.json({ error: 'No content to archive' }, 400);
  }

  if (!c.env.MEDIA) {
    console.error("R2 MEDIA binding missing");
    return c.json({ error: 'Storage service unavailable (Binding missing)' }, 503);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeFilename = filename?.replace(/[^a-z0-9.]/gi, '_') || `${type}_${timestamp}.html`;
  const key = `reports/${safeFilename}`;

  await c.env.MEDIA.put(key, html, {
    httpMetadata: { contentType: 'text/html' },
  });

  return c.json({ success: true, key, url: `/api/media/${key.replace(/\//g, '%2F')}` });
});

export const mediaRoutes = media;
