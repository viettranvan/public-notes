#!/usr/bin/env node
/**
 * Dev helper: POST /crawl chạy script crawl Node (Brightspace) rồi copy JSON vào sit/assets/.
 *
 * Mặc định dùng my-app/SIT_CRAWL/crawl.js (Cluster/Programme/Semester/Course + mapping).
 * Bộ assets đầy đủ của tree_viewer (modules, offering-ancestors, …) cần script crawl-orgstructure riêng —
 * set env CRAWL_CMD tới script đó.
 *
 * Usage:
 *   node sit/dev-tree-sync-server.mjs --once
 *   node sit/dev-tree-sync-server.mjs          # optional HTTP server on PORT
 *
 * Xem sit/README.md
 *   PORT=9876
 *   CRAWL_CMD="node /path/to/crawl.js"
 *   ASSETS_DIR=/path/to/public-notes/sit/assets
 *   CRAWL_OUTPUT=/path/to/crawl/output
 *   Token: BRIGHTSPACE_SERVICE_TOKEN_URL (env hoặc .env / sit/.brightspace-crawl.env — gitignore)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  describeTokenState,
  getBrightspaceAccessToken,
} from './lib/brightspace-token.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_MODULE = path.join(__dirname, 'lib', 'brightspace-token.mjs');
const PORT = Number(process.env.PORT || 9876);
const ASSETS_DIR = process.env.ASSETS_DIR || path.join(__dirname, 'assets');
const DEFAULT_CRAWL = path.join(
  process.env.HOME || '',
  'Desktop/NodeJs/my-app/SIT_CRAWL/crawl.js',
);
const CRAWL_SCRIPT = process.env.CRAWL_CMD
  ? process.env.CRAWL_CMD.replace(/^node\s+/, '').split(/\s+/)[0]
  : DEFAULT_CRAWL;

/** File crawl output → tên trong sit/assets (subset từ SIT_CRAWL/crawl.js). */
const COPY_MAP = [
  ['clusterDump.json', 'clusterDump.json'],
  ['clusterDump.json', 'schools.json'],
  ['programmeDump.json', 'programmeDump.json'],
  ['programmeDump.json', 'programs.json'],
  ['semesterDump.json', 'semesters.json'],
  ['courseDump.json', 'course-offerings.json'],
  ['courseDump.json', 'courseDump.json'],
  ['map_cluster_programme.json', 'map_cluster_programme.json'],
  ['map_cluster_course.json', 'map_cluster_course.json'],
  ['map_programme_course.json', 'map_programme_course.json'],
  ['map_semester_course.json', 'map_semester_course.json'],
];

let crawlRunning = false;

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
  });
  res.end(JSON.stringify(body));
}

function runCrawlScript() {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(CRAWL_SCRIPT);
    const cwd = path.dirname(scriptPath);
    const childEnv = {
      ...process.env,
      /** Chỉ trỏ module Node — JWT lấy trong process con, không đặt access_token vào env (tránh lộ qua ps). */
      BRIGHTSPACE_TOKEN_MODULE: TOKEN_MODULE,
    };
    delete childEnv.BRIGHTSPACE_ACCESS_TOKEN;

    const child = spawn(process.execPath, [scriptPath], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: childEnv,
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    child.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`Crawl exit ${code}\n${out.slice(-2000)}`));
    });
  });
}

async function copyOutputsToAssets() {
  const outputDir =
    process.env.CRAWL_OUTPUT
    || path.join(path.dirname(path.resolve(CRAWL_SCRIPT)), 'output');
  const copied = [];
  for (const [srcName, destName] of COPY_MAP) {
    const src = path.join(outputDir, srcName);
    const dest = path.join(ASSETS_DIR, destName);
    try {
      await fs.access(src);
      await fs.copyFile(src, dest);
      copied.push(destName);
    } catch {
      // skip missing
    }
  }
  const metaPath = path.join(ASSETS_DIR, 'meta.json');
  try {
    let meta = {};
    try {
      meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    } catch {
      /* new meta */
    }
    meta.crawledAt = new Date().toISOString();
    meta.devTreeSync = { script: CRAWL_SCRIPT, outputDir };
    await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  } catch (err) {
    console.warn('meta.json update skipped:', err.message);
  }
  return { outputDir, copied: [...new Set(copied)] };
}

async function handleCrawl() {
  if (crawlRunning) {
    const err = new Error('Crawl đang chạy, thử lại sau.');
    err.status = 409;
    throw err;
  }
  crawlRunning = true;
  try {
    console.log(`\n🚀 Chạy crawl: ${CRAWL_SCRIPT}`);
    await getBrightspaceAccessToken();
    console.log('🔐 Service token OK, TTL ~', describeTokenState().expiresInSec, 's');
    await runCrawlScript();
    const copyResult = await copyOutputsToAssets();
    console.log('📁 Copied to assets:', copyResult.copied.join(', ') || '(none)');
    return { ok: true, ...copyResult };
  } finally {
    crawlRunning = false;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, {
      ok: true,
      crawlScript: CRAWL_SCRIPT,
      assetsDir: ASSETS_DIR,
      token: describeTokenState(),
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/crawl') {
    try {
      const result = await handleCrawl();
      json(res, 200, result);
    } catch (err) {
      json(res, err.status || 500, { ok: false, error: err.message });
    }
    return;
  }
  json(res, 404, { ok: false, error: 'Not found' });
});

if (process.argv.includes('--once')) {
  handleCrawl()
    .then((result) => {
      console.log('\n✅ Done:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌', err.message);
      process.exit(1);
    });
} else {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`SIT tree sync dev server http://127.0.0.1:${PORT}`);
    console.log(`  POST /crawl  — run ${CRAWL_SCRIPT}`);
    console.log(`  Assets → ${ASSETS_DIR}`);
    console.log('  Token → BRIGHTSPACE_SERVICE_TOKEN_URL (env / .env gitignore — xem sit/README.md)');
    console.log(`  One-shot: node sit/dev-tree-sync-server.mjs --once`);
  });
}
