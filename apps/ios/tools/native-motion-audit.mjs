#!/usr/bin/env node
/**
 * Reduce Motion audit — C (#386).
 *
 * Kiểm tra animations có tôn trọng Reduce Motion không:
 *  1. .animation() không điều kiện — nên check reduceMotion
 *  2. withAnimation không điều kiện
 *
 * Chạy: node apps/ios/tools/native-motion-audit.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const SCAN_DIRS = ['apps/ios/ASCND', 'apps/ios/Packages'];

let issues = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.swift')) scanFile(p);
  }
}

function scanFile(path) {
  const src = readFileSync(path, 'utf8');
  const lines = src.split('\n');
  const rel = relative(ROOT, path);

  lines.forEach((line, i) => {
    const n = i + 1;
    if (line.trim().startsWith('//')) return;

    // .animation() — kiểm tra có điều kiện reduceMotion không
    if (/\.animation\(/.test(line)) {
      const ctx = lines.slice(Math.max(0, i - 5), i + 1).join('\n');
      if (!/reduceMotion/i.test(ctx)) {
        issues.push(`${rel}:${n}: .animation() không check Reduce Motion`);
      }
    }

    // withAnimation
    if (/withAnimation/.test(line)) {
      const ctx = lines.slice(Math.max(0, i - 5), i + 1).join('\n');
      if (!/reduceMotion/i.test(ctx)) {
        issues.push(`${rel}:${n}: withAnimation không check Reduce Motion`);
      }
    }
  });
}

for (const d of SCAN_DIRS) {
  try { walk(join(ROOT, d)); } catch {}
}

if (issues.length > 0) {
  console.log('FAIL — motion:');
  issues.forEach(i => console.log(' ', i));
  process.exit(1);
}
console.log('native-motion-audit: XANH');
