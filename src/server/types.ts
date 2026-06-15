import { D1Database, R2Bucket, KVNamespace, Fetcher } from '@cloudflare/workers-types';

export type Bindings = {
  DB: D1Database;
  BACKUP: R2Bucket;
  MEDIA: R2Bucket;
  SETTINGS: KVNamespace;
  AI: any;
  JWT_SECRET: string;
  ALLOWED_DOMAIN: string;
  ASSETS: Fetcher;
  // Google OAuth (set via `wrangler secret put`)
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  // Canonical origin used in OAuth redirect_uri and post-login redirects
  APP_URL: string;
  // Centralised auth subdomain — used as the OAuth redirect_uri host
  AUTH_URL: string;
  // Resend API key for transactional emails (set via `wrangler secret put RESEND_API_KEY`)
  RESEND_API_KEY?: string;
};

export type Variables = {
  user?: {
    id: string;
    email: string;
    role: string;
    roles: string[];      // Populated from D1 users table
    departmentId: string | null; // Populated from D1 users table
    qualifications?: string[];
    [key: string]: any;
  };
};

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
