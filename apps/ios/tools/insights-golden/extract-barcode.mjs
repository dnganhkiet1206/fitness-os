#!/usr/bin/env node
/**
 * Trích NGUYÊN VĂN `lookupBarcode` của `app/scan-barcode.tsx` @ fac9ac2 ra
 * `lib/barcode-lookup.ts` cho `build.sh` biên dịch. Tệp gốc kéo theo
 * expo-camera / React Native nên không biên dịch nguyên được. Chỉ cắt theo
 * dòng đánh dấu — không sửa một ký tự nào của thân hàm.
 *
 *   node extract-barcode.mjs < scan-barcode.tsx > lib/barcode-lookup.ts
 */
import { readFileSync } from 'node:fs';

const src = readFileSync(0, 'utf8').split('\n');
const a = src.findIndex((l) => /^async function lookupBarcode\(/.test(l));
const b = src.findIndex((l, i) => i > a && /^}$/.test(l));
if (a < 0 || b < 0) throw new Error('không thấy lookupBarcode');
process.stdout.write([...src.slice(a, b + 1), 'export { lookupBarcode };'].join('\n') + '\n');
