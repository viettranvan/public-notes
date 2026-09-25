/**
 * Brightspace access token — CHỈ chạy phía Node (crawl / dev server).
 * Không import module này từ tree_viewer.html (token sẽ lộ qua Network tab).
 *
 * Cấu hình (theo thứ tự ưu tiên, không ghi đè biến đã có trong process.env):
 *   1. export BRIGHTSPACE_SERVICE_TOKEN_URL=...  (khuyến nghị — không nằm trong file track git)
 *   2. sit/.brightspace-crawl.env (gitignore)
 *   3. .env ở root repo (gitignore)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..');

/** @type {{ token: string|null, expiresAt: number }} */
const cache = { token: null, expiresAt: 0 };

let envFilesLoaded = false;

function applyEnvFileLines(text) {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}

async function ensureLocalEnvFiles() {
  if (envFilesLoaded) return;
  envFilesLoaded = true;
  const candidates = [
    path.join(__dirname, '..', '.brightspace-crawl.env'),
    path.join(REPO_ROOT, '.env'),
  ];
  for (const filePath of candidates) {
    try {
      applyEnvFileLines(await fs.readFile(filePath, 'utf8'));
    } catch {
      /* optional */
    }
  }
}

export function invalidateBrightspaceTokenCache() {
  cache.token = null;
  cache.expiresAt = 0;
}

function serviceTokenUrl() {
  return (process.env.BRIGHTSPACE_SERVICE_TOKEN_URL || '').trim();
}

/**
 * @param {{ forceRefresh?: boolean, refreshSkewSec?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function getBrightspaceAccessToken(opts = {}) {
  await ensureLocalEnvFiles();

  const skewMs = (opts.refreshSkewSec ?? 300) * 1000;
  const now = Date.now();

  if (!opts.forceRefresh && cache.token && cache.expiresAt - skewMs > now) {
    return cache.token;
  }

  const url = serviceTokenUrl();
  if (!url) {
    throw new Error(
      'Thiếu BRIGHTSPACE_SERVICE_TOKEN_URL. Set env (export) hoặc file local gitignore: '
      + 'sit/.brightspace-crawl.env hoặc .env — xem .env.example',
    );
  }

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Service token HTTP ${res.status}: ${bodyText.slice(0, 200)}`);
  }

  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new Error('Service token response không phải JSON');
  }

  const token = data.access_token;
  if (!token || typeof token !== 'string') {
    throw new Error('Service token response thiếu access_token');
  }

  const expiresIn = Number(data.expires_in) || 3600;
  cache.token = token;
  cache.expiresAt = now + expiresIn * 1000;

  return token;
}

/** Log-safe: không in JWT. */
export function describeTokenState() {
  if (!cache.token) return { cached: false };
  return {
    cached: true,
    expiresInSec: Math.max(0, Math.floor((cache.expiresAt - Date.now()) / 1000)),
  };
}
