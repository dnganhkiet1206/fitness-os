#!/usr/bin/env node
/**
 * Interaction state gate — C (#316).
 *
 * Kiểm tra các components có đủ states:
 *  1. Button: có xử lý disabled (opacity hoặc .disabled)
 *  2. Touch target ≥44pt (đã có trong swift-a11y.mjs, ở đây verify lại)
 *  3. Accessibility label còn nguyên
 *
 * Chạy: node apps/ios/tools/native-interaction-states.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const DS_DIR = join(ROOT, 'apps/ios/Packages/ASCNDKit/Sources/ASCNDDesignSystem');

let issues = [];

function scanFile(path) {
  const src = readFileSync(path, 'utf8');
  const rel = relative(ROOT, path);
  const name = path.split('/').pop();

  // Chỉ check DS components (Button, Card, etc.)
  if (!name.startsWith('DS')) return;

  // 1. Button phải xử lý disabled
  if (name.includes('Button')) {
    if (!src.includes('isEnabled') && !src.includes('.disabled')) {
      issues.push(`${rel}: Button không xử lý disabled state`);
    }
    // Pressed state
    if (!src.includes('isPressed') && !src.includes('ButtonStyle')) {
      issues.push(`${rel}: Button không có pressed state`);
    }
  }

  // 2. Touch target — mọi Button phải có minHeight ≥44
  //    (DSButton đã có 48pt nội bộ nên bỏ qua)
  if (name.includes('Button') || src.includes('struct DS')) {
    const hasRawButton = /(?<!DS)Button\s*\(/.test(src);
    const hasMinHeight = /minHeight:\s*4[4-9]|minHeight:\s*[5-9]\d/.test(src);
    if (hasRawButton && !hasMinHeight && !name.includes('DSButton')) {
      issues.push(`${rel}: có Button nhưng không thấy minHeight ≥44`);
    }
  }

  // 3. Accessibility label (hoặc combine children)
  if (src.includes('struct DS') && src.includes('Button(')) {
    if (!src.includes('accessibilityLabel') && !src.includes('accessibilityElement')) {
      issues.push(`${rel}: thiếu accessibilityLabel`);
    }
  }
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.swift')) scanFile(p);
  }
}

// Thư mục không tồn tại = FAIL (không nuốt lỗi rồi báo xanh giả).
if (!existsSync(DS_DIR)) {
  console.log(`FAIL — interaction states: không tìm thấy thư mục ${relative(ROOT, DS_DIR)}`);
  process.exit(1);
}
walk(DS_DIR);

if (issues.length > 0) {
  console.log('FAIL — interaction states:');
  issues.forEach(i => console.log(' ', i));
  process.exit(1);
}
console.log('native-interaction-states: XANH');
