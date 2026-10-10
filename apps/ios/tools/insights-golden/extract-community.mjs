#!/usr/bin/env node
/**
 * Trích NGUYÊN VĂN các khai báo thuần của `hooks/use-community.ts` @ fac9ac2
 * (file hook kéo theo supabase / React Query nên không biên dịch nguyên được)
 * ra `lib/community-readers.ts` cho `build.sh` biên dịch như mọi lib RN khác.
 * Chỉ cắt theo ngoặc — không sửa một ký tự nào của thân khai báo.
 *
 *   node extract-community.mjs < use-community.ts > lib/community-readers.ts
 */
import { readFileSync } from 'node:fs';

const src = readFileSync(0, 'utf8').split('\n');
const WANT = [
  /^export interface WorkoutExerciseLine\b/,
  /^export interface WorkoutPayload\b/,
  /^const num = /,
  /^export function readWorkoutPayload\(/,
  /^export interface ProgressMetric\b/,
  /^export interface ProgressPayload\b/,
  /^function readMetric\(/,
  /^export function readProgressPayload\(/,
  /^export const DISCOVER_KINDS = /,
  /^export type DiscoverKind = /,
  /^export function readDiscoverKinds\(/,
];
const out = [];
for (const re of WANT) {
  const start = src.findIndex((l) => re.test(l));
  if (start < 0) throw new Error(`không thấy ${re}`);
  let depth = 0;
  let end = start;
  for (let i = start; i < src.length; i++) {
    for (const ch of src[i]) {
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      if (ch === '}' || ch === ')' || ch === ']') depth--;
    }
    end = i;
    if (depth === 0 && (/[;}]\s*$/.test(src[i]))) break;
  }
  out.push(src.slice(start, end + 1).join('\n'));
}
process.stdout.write(out.join('\n\n') + '\n');
