#!/usr/bin/env node
/**
 * Dữ liệu cảnh của Koa (#527, K1) — CHÍNH `components/ascnd/koa/koa-scene.ts`
 * @ fac9ac2 (bản export của công cụ thiết kế, đã biên dịch), ghi thành một
 * chuỗi JSON trong mã Swift để Core không cần tài nguyên đóng gói. Không sửa
 * dữ liệu: `NODES` và `KEYFRAMES` đi nguyên văn qua `JSON.stringify`.
 *
 *   node gen-koa-scene.mjs > ../../Packages/ASCNDKit/Sources/ASCNDCore/Koa/KoaSceneData.swift
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { NODES, KEYFRAMES } = require('./out/koa-scene.js');

const json = JSON.stringify({ nodes: NODES, keyframes: KEYFRAMES });
if (json.includes('"##')) throw new Error('chuỗi thô của Swift sẽ gãy');
process.stdout.write(`// SINH TỰ ĐỘNG — đừng sửa tay.
// Nguồn: native/src/components/ascnd/koa/koa-scene.ts @ fac9ac2.
// Sinh lại: tools/insights-golden/gen-koa-scene.mjs (sau build.sh).

extension KoaScene {
  static let json = ##"${json}"##
}
`);
