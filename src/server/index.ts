import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { requestId } from 'hono/request-id';
import { timing } from 'hono/timing';
import { dbRoutes } from './routes/db';
import { aiRoutes } from './routes/ai';
import { mediaRoutes } from './routes/media';
import { computeRoutes } from './routes/compute';
import { authRoutes } from './routes/auth';
import { publicRoutes } from './routes/public';
import { Bindings, Variables } from './types';
import { authMiddleware } from './middleware/auth';
import { domainGuard } from './middleware/domainGuard';
import { backupD1ToR2, cleanupOldBackups } from './services/backupService';
import { unassignExpiredAuditors } from './services/auditMaintenanceService';
import { sendPreDateReminderEmail, sendSupervisorApprovalEmail } from './services/emailService';

// The API app (mounted on /api)
const app = new Hono<{ Bindings: Bindings, Variables: Variables }>();

// ─── Global Middleware ───────────────────────────────────────────────────────
app.use('*', requestId());
app.use('*', logger());
app.use('*', timing());
app.use('*', secureHeaders());
app.use('*', cors({
  origin: (origin) => {
    const allowed = [
      'https://auth.inspect-able.com',
      'https://www.inspect-able.com',
      'https://mobile.inspect-able.com',
      'https://kiosk.inspect-able.com',
      'https://inspect-able.com',
      'https://inspect-able.pages.dev',
      'http://localhost:5173',
      'http://localhost:3000',
    ];
    return allowed.includes(origin) ? origin : null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposeHeaders: ['X-Request-Id', 'Server-Timing'],
  credentials: true,
  maxAge: 600,
}));
// ────────────────────────────────────────────────────────────────────────────

// ─── Global Error Handlers ───────────────────────────────────────────────────
app.onError((err, c) => {
  const requestIdVal = c.get('requestId' as any);
  console.error(`[Error] requestId=${requestIdVal}`, err);
  return c.json({ success: false, error: err.message }, 500);
});

app.notFound((c) => c.json({ success: false, error: 'Route not found' }, 404));
// ────────────────────────────────────────────────────────────────────────────

// Public routes (no auth required)
app.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

// Digital Asset Links — required for Android Trusted Web Activity verification
app.get('/.well-known/assetlinks.json', (c) => {
  return c.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.inspectable.auditmobile',
      sha256_cert_fingerprints: [
        '97:8A:04:F5:7C:E8:18:C2:7E:A9:BC:D9:10:31:E8:A1:7F:8F:E5:4D:1D:6D:8B:61:58:8C:36:24:05:77:50:B6'
      ]
    }
  }]);
});

// ─── Performance Indexes (applied once per cold start, idempotent) ──────────
app.use('*', async (c, next) => {
  try {
    const db = c.env.DB;
    // Audit schedules indexes
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_schedules_date ON audit_schedules(date)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_schedules_status ON audit_schedules(status)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_schedules_location ON audit_schedules(location_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_schedules_department ON audit_schedules(department_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_schedules_phase ON audit_schedules(phase_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_schedules_auditor1 ON audit_schedules(auditor1_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_schedules_auditor2 ON audit_schedules(auditor2_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_schedules_supervisor ON audit_schedules(supervisor_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_schedules_loc_status ON audit_schedules(location_id, status)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_schedules_date_status ON audit_schedules(date, status)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_schedules_dept_status ON audit_schedules(department_id, status)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_schedules_auditor1_date ON audit_schedules(auditor1_id, date)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_schedules_auditor2_date ON audit_schedules(auditor2_id, date)`);
    // Locations indexes
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_locations_department ON locations(department_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_locations_status ON locations(status)`);
    // Users indexes
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_users_cert_expiry ON users(certification_expiry)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)`);
  } catch (_) { /* indexes may already exist, safe to ignore */ }
  await next();
});
// ────────────────────────────────────────────────────────────────────────────

// Protected routes — auth → domain guard applied in order
app.use('/db/*', authMiddleware, domainGuard);
app.use('/ai/*', authMiddleware, domainGuard);
app.use('/compute/*', authMiddleware, domainGuard);

const routes = app
  .route('/db', dbRoutes)
  .route('/ai', aiRoutes)
  .route('/media', mediaRoutes)
  .route('/compute', computeRoutes)
  .route('/auth', authRoutes)
  .route('/public', publicRoutes);

// ─── Subdomain Routing (Main Entry Point) ────────────────────────────────────
const baseApp = new Hono<{ Bindings: Bindings, Variables: Variables }>();

baseApp.get('/', async (c) => {
  const host = c.req.header('host') || '';
  const isMobile = host.startsWith('mobile.');
  const isKiosk = host.startsWith('kiosk.');
  
  // Serve the appropriate HTML file from ASSETS
  const filename = isMobile ? 'mobile.html' : (isKiosk ? 'kiosk.html' : 'index.html');
  const asset = await c.env.ASSETS.fetch(new URL(`/${filename}`, c.req.url).toString());
  
  if (asset.ok) return asset as any;
  return c.text('Not Found', 404);
});

/**
 * GET /login
 * Standalone identity-gateway login page served on auth.inspect-able.com.
 * Reads ?returnTo= (validated), shows email/password form + Google Sign-In.
 * On success the SPA JS redirects to returnTo so the SSO cookie is carried.
 */
baseApp.get('/login', async (c) => {
  const appUrl   = c.env.APP_URL  || 'https://www.inspect-able.com';
  const rawReturn = c.req.query('returnTo') || appUrl;

  // Validate returnTo — only allow trusted inspect-able.com domains
  let safeReturn = appUrl;
  try {
    const u = new URL(rawReturn);
    if (
      u.hostname === 'inspect-able.com' ||
      u.hostname.endsWith('.inspect-able.com') ||
      u.hostname === 'localhost'
    ) {
      safeReturn = rawReturn;
    }
  } catch { /* malformed URL — use fallback */ }

  const encodedReturn = encodeURIComponent(safeReturn);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign In — Inspect-able</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: #0f172a; font-family: system-ui, sans-serif; color: #e2e8f0;
    }
    .card {
      background: #1e293b; border: 1px solid #334155; border-radius: 12px;
      padding: 2rem; width: 100%; max-width: 400px; box-shadow: 0 25px 50px -12px rgba(0,0,0,.5);
    }
    .logo { text-align: center; margin-bottom: 1.5rem; }
    .logo h1 { font-size: 1.5rem; font-weight: 700; color: #f8fafc; }
    .logo p  { font-size: .875rem; color: #94a3b8; margin-top: .25rem; }
    label { display: block; font-size: .75rem; font-weight: 600; color: #94a3b8;
            text-transform: uppercase; letter-spacing: .05em; margin-bottom: .375rem; }
    input[type=email], input[type=password] {
      width: 100%; padding: .625rem .75rem; background: #0f172a; border: 1px solid #475569;
      border-radius: 8px; color: #f1f5f9; font-size: .9375rem; outline: none;
      transition: border-color .15s;
    }
    input:focus { border-color: #6366f1; }
    .field { margin-bottom: 1rem; }
    .btn-primary {
      width: 100%; padding: .75rem; background: #6366f1; color: #fff; border: none;
      border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer;
      transition: background .15s;
    }
    .btn-primary:hover { background: #4f46e5; }
    .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
    .divider { display: flex; align-items: center; gap: .75rem; margin: 1.25rem 0; color: #475569; font-size: .8125rem; }
    .divider::before, .divider::after { content: ''; flex: 1; border-top: 1px solid #334155; }
    .btn-google {
      display: flex; align-items: center; justify-content: center; gap: .75rem;
      width: 100%; padding: .7rem; background: #fff; color: #3c4043; border: none;
      border-radius: 8px; font-size: .9375rem; font-weight: 500; cursor: pointer;
      text-decoration: none; transition: background .15s;
    }
    .btn-google:hover { background: #f1f5f9; }
    .error {
      background: #450a0a; border: 1px solid #7f1d1d; border-radius: 8px;
      padding: .625rem .875rem; font-size: .875rem; color: #fca5a5; margin-bottom: 1rem;
      display: none;
    }
    .error.visible { display: block; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <h1>Inspect-able</h1>
      <p>Asset Inspection Scheduling &amp; Management System</p>
    </div>
    <div id="error" class="error"></div>
    <form id="loginForm">
      <div class="field">
        <label for="email">Email</label>
        <input id="email" type="email" autocomplete="username email" required placeholder="you@poliku.edu.my" />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" type="password" autocomplete="current-password" required />
      </div>
      <button id="submitBtn" class="btn-primary" type="submit">Sign in</button>
    </form>
    <div class="divider">or</div>
    <a class="btn-google" href="/api/auth/google?returnTo=${encodedReturn}">
      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
      </svg>
      Sign in with Google Workspace
    </a>
    <p style="text-align:center;font-size:.75rem;color:#64748b;margin-top:-.25rem">@poliku.edu.my institutional accounts only</p>
  </div>
  <script>
    const RETURN_TO = ${JSON.stringify(safeReturn)};
    const form   = document.getElementById('loginForm');
    const errBox = document.getElementById('error');
    const btn    = document.getElementById('submitBtn');

    function showError(msg) {
      errBox.textContent = msg;
      errBox.classList.add('visible');
    }

    // Check for auth errors coming back from Google OAuth
    const params = new URLSearchParams(location.search);
    const authErr = params.get('auth_error');
    if (authErr) showError('Google sign-in failed: ' + authErr.replace(/_/g, ' '));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.classList.remove('visible');
      btn.disabled = true;
      btn.textContent = 'Signing in\u2026';
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: document.getElementById('email').value.trim(),
            password: document.getElementById('password').value,
          }),
        });
        const data = await res.json();
        if (data.success) {
          // Cookie is set by the server response; redirect to the app.
          window.location.href = RETURN_TO;
        } else {
          showError(data.message || 'Sign-in failed. Please try again.');
          btn.disabled = false;
          btn.textContent = 'Sign in';
        }
      } catch {
        showError('Network error. Please check your connection.');
        btn.disabled = false;
        btn.textContent = 'Sign in';
      }
    });
  </script>
</body>
</html>`;

  return c.html(html);
});

// Mount the API app on /api
baseApp.route('/api', app);

// Fallback to ASSETS for everything else (JS, CSS, images, etc.)
baseApp.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw as any) as any;
});

export type AppType = typeof routes;

export default {
  fetch: baseApp.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    if (event.cron === '0 2 * * *') {
      // ── Daily Backup ──────────────────────────────────────────────────
      console.log('[Cron] Starting D1 → R2 backup...');
      ctx.waitUntil(
        backupD1ToR2({ db: env.DB, bucket: env.BACKUP }).then((result) => {
          console.log(`[Cron] Backup complete: ${result.tablesSync} tables, ${result.rowsSync} rows → R2 key: ${result.key}`);
          if (result.errors.length > 0) {
            console.error('[Cron] Backup errors:', result.errors.join('; '));
          }
        }).catch((err) => {
          console.error('[Cron] Backup failed:', err);
        })
      );

      // ── Daily Cert Expiry Cleanup ─────────────────────────────────────
      console.log('[Cron] Starting cert expiry cleanup...');
      const today = new Date().toISOString().split('T')[0];
      ctx.waitUntil(
        unassignExpiredAuditors(env.DB, today).then(() => {
          console.log('[Cron] Cert expiry cleanup complete');
        }).catch((err) => {
          console.error('[Cron] Cert cleanup failed:', err);
        })
      );

      // ── Daily Backup Retention Cleanup (keep last 30 days) ────────────
      console.log('[Cron] Starting backup retention cleanup...');
      ctx.waitUntil(
        cleanupOldBackups(env.BACKUP, 30).then((result) => {
          console.log(`[Cron] Backup cleanup: ${result.deleted} deleted, ${result.kept} kept`);
        }).catch((err) => {
          console.error('[Cron] Backup cleanup failed:', err);
        })
      );

      // ── Pre-Date Reminder: 2 days before scheduled audits ────────────
      if (env.RESEND_API_KEY) {
        console.log('[Cron] Checking for pre-date reminders...');
        ctx.waitUntil(
          (async () => {
            try {
              const twoDaysFromNow = new Date();
              twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
              const targetDate = twoDaysFromNow.toISOString().split('T')[0];

              const pending = await env.DB.prepare(
                `SELECT a.id, a.date, a.supervisor_id, a.location_id, a.department_id
                 FROM audit_schedules a
                 WHERE a.status = 'In Progress' AND a.date = ?`
              ).bind(targetDate).all<{ id: string; date: string; supervisor_id: string | null; location_id: string | null; department_id: string | null }>();

              for (const audit of pending.results || []) {
                // Check if a pre-date reminder was already sent for this audit
                const existingReminder = await env.DB.prepare(
                  `SELECT id FROM system_activities
                   WHERE json_extract(metadata, '$.auditId') = ?
                   AND json_extract(metadata, '$.category') = 'pre_date_reminder'
                   LIMIT 1`
                ).bind(audit.id).first();

                if (existingReminder) continue;

                const supervisorIds = (audit.supervisor_id || '').split(',').map((s: string) => s.trim()).filter(Boolean);
                for (const sid of supervisorIds) {
                  const user = await env.DB.prepare('SELECT name, email FROM users WHERE id = ?').bind(sid).first<{ name: string; email: string }>();
                  if (!user?.email) continue;

                  const loc = audit.location_id
                    ? await env.DB.prepare('SELECT name FROM locations WHERE id = ?').bind(audit.location_id).first<{ name: string }>()
                    : null;
                  const dept = audit.department_id
                    ? await env.DB.prepare('SELECT name FROM departments WHERE id = ?').bind(audit.department_id).first<{ name: string }>()
                    : null;

                  await sendPreDateReminderEmail(
                    env.RESEND_API_KEY!,
                    user.email,
                    user.name,
                    loc?.name ?? 'Unknown Location',
                    dept?.name ?? 'Unknown Department',
                    audit.date,
                    env.APP_URL,
                  );

                  // Log the reminder activity
                  await env.DB.prepare(
                    `INSERT INTO system_activities (id, user_id, type, message, metadata, created_at)
                     VALUES (?, ?, ?, ?, ?, ?)`
                  ).bind(
                    crypto.randomUUID(),
                    'system',
                    'PRE_DATE_REMINDER',
                    `Automatic pre-date reminder sent to ${user.name} for audit ${audit.id}`,
                    JSON.stringify({ auditId: audit.id, category: 'pre_date_reminder', supervisorName: user.name, mode: 'automatic' }),
                    new Date().toISOString(),
                  ).run();

                  console.log(`[Cron] Pre-date reminder sent to ${user.email} for audit ${audit.id} (date: ${audit.date})`);
                }
              }
              console.log(`[Cron] Pre-date reminders complete`);
            } catch (err) {
              console.error('[Cron] Pre-date reminder check failed:', err);
            }
          })()
        );
      }
    }
  },
};
