// Nạp mã RN @ fac9ac2 trong Node: dịch TS lúc nạp, '@/' → native/src (giải nén
// bằng `git archive`), giả react-native / svg / reanimated bằng `stubs/`.
const path = require('path');
const fs = require('fs');
const Module = require('module');
if (!process.env.KOA_DEPS) throw new Error('KOA_DEPS chưa đặt — xem gen.cjs');
const DEPS = path.join(path.resolve(process.env.KOA_DEPS), 'node_modules');
const ts = require(path.join(DEPS, 'typescript'));
const os = require('os');
const { execSync } = require('child_process');
const RN = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-rn-'));
const top = execSync("git rev-parse --show-toplevel", { cwd: __dirname }).toString().trim();
execSync(`git archive fac9ac2 native/src | tar -x -C ${RN}`, { cwd: top });
const SRC = path.join(RN, 'native', 'src');
const STUB = path.join(__dirname, 'stubs');

const alias = {
  react: path.join(DEPS, 'react'),
  'react/jsx-runtime': path.join(DEPS, 'react', 'jsx-runtime.js'),
  'react-dom/server': path.join(DEPS, 'react-dom', 'server.node.js'),
  'react-native': path.join(STUB, 'rn.js'),
  'react-native-svg': path.join(STUB, 'svg.js'),
  'react-native-reanimated': path.join(STUB, 'reanimated.js'),
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
  if (alias[req]) return origResolve.call(this, alias[req], parent, ...rest);
  if (req.startsWith('@/')) {
    const base = path.join(SRC, req.slice(2));
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx', '.js']) if (fs.existsSync(base + ext)) return base + ext;
  }
  if (/^(expo|@expo|lucide|@react-native|react-native-)/.test(req)) return path.join(STUB, 'any.js');
  return origResolve.call(this, req, parent, ...rest);
};
for (const ext of ['.ts', '.tsx']) {
  Module._extensions[ext] = function (m, filename) {
    const src = fs.readFileSync(filename, 'utf8');
    const out = ts.transpileModule(src, {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    m._compile(out, filename);
  };
}
module.exports = { SRC, DEPS };
