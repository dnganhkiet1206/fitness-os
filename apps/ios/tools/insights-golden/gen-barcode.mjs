#!/usr/bin/env node
/**
 * Golden cho tra mã vạch (#527, `scan-barcode`) — `lookupBarcode` của
 * `app/scan-barcode.tsx` @ fac9ac2, BIÊN DỊCH (trích nguyên văn qua
 * `extract-barcode.mjs`), chạy với `fetch` giả trả từng sản phẩm Open Food
 * Facts dựng sẵn. Ghim: URL gọi, `status` / `product` thiếu → null, HTTP lỗi →
 * null, khẩu phần (serving_quantity → product_quantity → 100, chuỗi số),
 * `Math.round` theo khẩu phần, `energy-kcal_100g` → `energy-kcal` → 0, tên
 * theo ngôn ngữ (vi chỉ khi `lang === 'vi'`), rơi về mã.
 *
 *   ./build.sh && node gen-barcode.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/barcode-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let reply;
let called = null;
globalThis.fetch = async (url) => {
  called = url;
  return { ok: reply.ok, json: async () => reply.body };
};
const { lookupBarcode } = require('./out/barcode-lookup.js');

const products = [
  { status: 1, product: { product_name: 'Greek yogurt', serving_quantity: 170, nutriments: { 'energy-kcal_100g': 97, proteins_100g: 9, carbohydrates_100g: 3.98, fat_100g: 5, fiber_100g: 0 } } },
  { status: 1, product: { product_name: 'Sữa tươi', product_name_vi: 'Sữa tươi Vinamilk', product_name_en: 'Fresh milk', serving_quantity: '180', nutriments: { 'energy-kcal_100g': 63.5, proteins_100g: 3.15, carbohydrates_100g: 4.85, fat_100g: 3.25 } } },
  { status: 1, product: { product_name_en: 'Oat bar', product_quantity: 40, nutriments: { 'energy-kcal': 410, proteins_100g: 8.75, carbohydrates_100g: 62.5, fat_100g: 13.75, fiber_100g: 6.25 } } },
  { status: 1, product: { nutriments: { proteins_100g: 2.5 } } },
  { status: 1, product: { product_name: '', product_name_en: 'Water', nutriments: {} } },
  { status: 1, product: { product_name: 'Chips', serving_quantity: 0, product_quantity: '150', nutriments: { 'energy-kcal_100g': 536.7, fat_100g: 34.5, carbohydrates_100g: 53.5, proteins_100g: 6.5, fiber_100g: 4.5 } } },
  { status: 1, product: { product_name: 'Half', serving_quantity: 50, nutriments: { 'energy-kcal_100g': 1, proteins_100g: 1, carbohydrates_100g: 3, fat_100g: 5, fiber_100g: 7 } } },
  { status: 1, product: { product_name: 'No nutriments', serving_quantity: 30 } },
  { status: 1, product: { product_name_vi: 'Chỉ có tên Việt', nutriments: { 'energy-kcal_100g': 250 } } },
  { status: 0, product: { product_name: 'Not found flag' } },
  { status: 1 },
  { status_verbose: 'product not found' },
];

const cases = [];
for (const lang of ['vi', 'en', 'es']) {
  for (const [i, body] of products.entries()) {
    reply = { ok: true, body };
    called = null;
    const code = String(8930000000000 + i);
    const result = await lookupBarcode(code, lang);
    cases.push({ code, lang, ok: true, body, url: called, result });
  }
}
reply = { ok: false, body: products[0] };
const result = await lookupBarcode('0000000000001', 'en');
cases.push({ code: '0000000000001', lang: 'en', ok: false, body: products[0], url: called, result });

process.stdout.write(JSON.stringify({ source: 'native/src/app/scan-barcode.tsx@fac9ac2 lookupBarcode', cases }, null, 1) + '\n');
