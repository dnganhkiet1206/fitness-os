/**
 * That no string is rendered outside a `<Text>`.
 *
 * ── the bug ──
 *
 *     Text strings must be rendered within a <Text> component.
 *
 * React Native throws this at runtime, and the stack it prints contains no
 * frame from this app — only `ReactFabric`, `LogBox`, `renderWithHooks`. It
 * names neither the file nor the component. On a screen that renders a list,
 * it does not even name the screen.
 *
 * The one that prompted this tool was in `nutrition.tsx`, and it was mine.
 * Converting ~196 press sites to `PressScale` rewrote multi-line opening tags,
 * and one fixup left this behind:
 *
 *     }}>              <GlassCard style={styles.planCard}>
 *
 * Fourteen spaces between the `>` that closes the opening tag and the `<` that
 * begins the next one. It is invisible in review, it is invisible in a diff,
 * and `tsc` is perfectly happy with it — a text node is a legal child.
 *
 * ── why the eye and the regex both miss it ──
 *
 * JSX does not treat all whitespace alike. Whitespace containing a newline is
 * discarded; whitespace *between two tags on one line* is a real string child.
 * So the identical-looking
 *
 *     }}>
 *       <GlassCard>
 *
 * is fine and the one above is a crash, and the only difference is a character
 * you cannot see. Three separate regex scans over this repo missed it: two
 * required the line to *begin* with the tag, and the third could not tell a
 * generic `useState<Foo>` or an arrow `=>` from a JSX tag.
 *
 * Which is the argument for not writing a fourth. Babel already parses this
 * file — it has to, to build the app — so ask it. `@babel/parser` is in the
 * tree as a dependency of the bundler.
 *
 * ── the trimming rule is copied, not approximated ──
 *
 * `clean()` below is Babel's own `cleanJSXElementLiteralChild`, line for line.
 * Anything less than that is a guess about which whitespace survives, and a
 * guess is what produced the bug.
 *
 * ── the allowlist is derived, not typed ──
 *
 * `<Text>` may hold a string; so may `<ThemedText>`, because it passes its
 * children to a `<Text>`; so may `<TabButton>`, because it passes them to
 * `<ThemedText>`. A hand-written list of those three names would be correct
 * today and quietly wrong the day one of them stops wrapping its children —
 * the tool would go silent on a real crash. That is the exact failure this
 * project has hit before: a sibling satisfying a rule on behalf of something
 * broken.
 *
 * So the set is computed to a fixpoint from the primitives outward, and a
 * component earns its place by actually rendering `{children}` inside
 * something already in the set.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(pathToFileURL(path.join(NATIVE, 'package.json')));
const { parse } = require('@babel/parser');

/**
 * The only things that hold a string without a component in between.
 *
 * `Text` and `Animated.Text` are React Native's; `SvgText` and `TSpan` are
 * `react-native-svg`'s, which render into a completely different tree and are
 * not subject to this rule at all.
 */
const PRIMITIVES = new Set(['Text', 'Animated.Text', 'SvgText', 'TSpan', 'TextInput']);

/** Babel's `cleanJSXElementLiteralChild`. Copied so the answer is not a guess. */
function clean(value) {
  const lines = value.split(/\r\n|\n|\r/);
  let lastNonEmptyLine = 0;
  for (let i = 0; i < lines.length; i++) if (lines[i].match(/[^ \t]/)) lastNonEmptyLine = i;
  let str = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isFirstLine = i === 0;
    const isLastLine = i === lines.length - 1;
    const isLastNonEmptyLine = i === lastNonEmptyLine;
    let t = line.replace(/\t/g, ' ');
    if (!isFirstLine) t = t.replace(/^ +/, '');
    if (!isLastLine) t = t.replace(/ +$/, '');
    if (t) {
      if (!isLastNonEmptyLine) t += ' ';
      str += t;
    }
  }
  return str;
}

const tagName = (n) =>
  !n
    ? '?'
    : n.type === 'JSXIdentifier'
      ? n.name
      : n.type === 'JSXMemberExpression'
        ? `${tagName(n.object)}.${tagName(n.property)}`
        : '?';

const parseFile = (abs) =>
  parse(readFileSync(abs, 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] });

/** Every JSXElement in a tree, with the tag it sits inside. */
function* elements(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const c of node) yield* elements(c);
    return;
  }
  if (node.type === 'JSXElement') yield node;
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
    yield* elements(node[k]);
  }
}

/* ── the file list is the working tree, not the index ──

   Plain `git ls-files` lists what git has been told about, and that is wrong in
   both directions for a rule that reads the app as it is on disk. A file
   deleted but not yet staged is still *on* the list, and reading it threw a raw
   ENOENT with no step name attached. A file just written and not yet added is
   *missing from* it, so every rule here quietly skipped brand-new code — which
   is the worse half: a new component is exactly the thing most likely to carry
   the mistake, and the suite said "tất cả đều xanh" without having opened it.

   `--others --exclude-standard` adds untracked files while still honouring
   .gitignore, and `existsSync` drops index entries with no file behind them. */
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src/**/*.tsx'], { cwd: NATIVE, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => existsSync(path.join(NATIVE, f)));

const asts = new Map();
const problems = [];
for (const f of files) {
  try {
    asts.set(f, parseFile(path.join(NATIVE, f)));
  } catch (e) {
    /* A file the bundler cannot parse is a build failure, not a text-node
       problem — but staying silent about it would mean this tool reports a
       clean sweep over a file it never read. */
    problems.push(`${f}: không parse được — ${e.message.split('\n')[0]}`);
  }
}

/*
  ── 1: which components may hold a string ──

  Every capitalised function in the app, with the names its props arrive under.
  Both are needed, because children reach the inner `<Text>` by two different
  routes and a rule that knows only one of them is worse than no rule at all —
  it produces a confident allowlist with a hole in it.
*/
function components(ast) {
  const out = [];
  const paramNames = (fn) => {
    const p = fn.params?.[0];
    if (!p) return [];
    if (p.type === 'Identifier') return [p.name]; // (props) => …
    if (p.type === 'ObjectPattern') {
      /* ({ children, ...rest }) — only the rest element carries children on
         through a spread; a named `children` is handled by the other route. */
      return p.properties
        .filter((x) => x.type === 'RestElement' && x.argument.type === 'Identifier')
        .map((x) => x.argument.name);
    }
    return [];
  };
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const c of node) visit(c);
      return;
    }
    if (node.type === 'FunctionDeclaration' && node.id && /^[A-Z]/.test(node.id.name)) {
      out.push({ name: node.id.name, props: paramNames(node), body: node.body });
    } else if (
      node.type === 'VariableDeclarator' &&
      node.id?.type === 'Identifier' &&
      /^[A-Z]/.test(node.id.name) &&
      (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression')
    ) {
      out.push({ name: node.id.name, props: paramNames(node.init), body: node.init.body });
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
      visit(node[k]);
    }
  };
  visit(ast.program.body);
  return out;
}

const ALL = [...asts.values()].flatMap(components);

/**
 * Does this element pass its own children on?
 *
 * Two routes, and `ThemedText` is why both are here. It renders
 *
 *     <Text style={[…]} {...rest} />
 *
 * — self-closing, no `{children}` anywhere. Children arrive through the rest
 * spread. A first version of this tool understood only the explicit-child
 * route, declared `ThemedText` an ordinary component, and would have reported
 * every string inside one as a crash. The self-test caught it; review had not.
 */
const forwardsChildren = (el, props) =>
  el.children.some(
    (c) =>
      c.type === 'JSXExpressionContainer' &&
      c.expression.type === 'Identifier' &&
      c.expression.name === 'children',
  ) ||
  el.openingElement.attributes.some(
    (a) =>
      a.type === 'JSXSpreadAttribute' &&
      a.argument.type === 'Identifier' &&
      props.includes(a.argument.name),
  );

/* Grow from the primitives outward until the set stops changing. A component
   earns its place by rendering something already in the set and handing it the
   children it was given. */
const textish = new Set(PRIMITIVES);
for (let changed = true; changed; ) {
  changed = false;
  for (const c of ALL) {
    if (textish.has(c.name)) continue;
    for (const el of elements(c.body)) {
      if (!textish.has(tagName(el.openingElement.name))) continue;
      if (!forwardsChildren(el, c.props)) continue;
      textish.add(c.name);
      changed = true;
      break;
    }
  }
}

/*
  ── the one thing the set cannot see ──

  It is keyed by name across the whole app, not per module. Two components are
  called `MicroTitle`, in different files, and today both wrap their children in
  a `<Text>`. The day one of them stops, the other's name would keep it on the
  allowlist and this tool would go quiet about a real crash — the exact shape of
  failure this project has been bitten by more than once.

  Resolving imports properly would fix it. Reporting the ambiguity costs four
  lines and fails loudly instead of silently, which is the property that
  matters.
*/
{
  const byName = new Map();
  for (const c of ALL) (byName.get(c.name) ?? byName.set(c.name, []).get(c.name)).push(c);
  for (const [name, defs] of byName) {
    if (!textish.has(name) || defs.length < 2) continue;
    const own = defs.filter((c) =>
      [...elements(c.body)].some(
        (el) => textish.has(tagName(el.openingElement.name)) && forwardsChildren(el, c.props),
      ),
    );
    if (own.length !== defs.length) {
      problems.push(
        `<${name}> có ${defs.length} định nghĩa nhưng chỉ ${own.length} bọc children trong <Text> — ` +
          'danh sách cho phép tra theo tên nên cái không bọc sẽ được tha oan',
      );
    }
  }
}

/*
  ── 2: strings rendered where no Text can catch them ──

  Two shapes, both exact:

    - a JSXText child that survives Babel's trimming
    - `{cond && 'literal'}`, which renders the literal when the guard passes

  Deliberately *not* flagged: `{name}` where `name` is a variable. Whether that
  is a string is a type question, and `tsc` is the tool for type questions —
  guessing here is how a checker earns a reputation for crying wolf and stops
  being read.
*/
function scan(ast, f) {
  const found = [];
  for (const el of elements(ast.program.body ?? ast)) {
    const tag = tagName(el.openingElement.name);
    if (textish.has(tag)) continue;

    for (const c of el.children) {
      if (c.type === 'JSXText') {
        const s = clean(c.value);
        if (!s) continue;
        const what = /^\s+$/.test(s)
          ? `${s.length} khoảng trắng giữa hai thẻ cùng dòng`
          : `chuỗi ${JSON.stringify(s.slice(0, 40))}`;
        found.push(`${f}:${c.loc.start.line} — ${what}, nằm trực tiếp trong <${tag}>`);
      } else if (
        c.type === 'JSXExpressionContainer' &&
        c.expression.type === 'LogicalExpression' &&
        c.expression.operator === '&&' &&
        c.expression.right.type === 'StringLiteral'
      ) {
        found.push(
          `${f}:${c.loc.start.line} — {… && ${JSON.stringify(c.expression.right.value)}} ` +
            `trong <${tag}>: khi điều kiện đúng thì chuỗi được render trần`,
        );
      }
    }
  }
  return found;
}

for (const [f, ast] of asts) problems.push(...scan(ast, f));

/**
 * The self-test.
 *
 * Both halves have to be proven, and the second is the one that matters. A
 * tool that flags every JSXText would "catch" the bug and also condemn all 204
 * legitimate strings in this app — it would be turned off within a day. So it
 * must catch the crash *and* stay quiet about a string inside a `<Text>`, and
 * quiet about one inside a component that forwards to a `<Text>`, since the
 * derived allowlist is the part most likely to be silently wrong.
 */
const on = (src) => scan(parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] }), 'x');

const SELF = [
  [
    /* The real thing, character for character out of `nutrition.tsx` before it
       was fixed. Testing `clean()` in isolation would prove the helper works
       and prove nothing about whether this file would have caught the bug it
       was written for. */
    'đúng đoạn code đã gây lỗi — bị bắt',
    () =>
      on(
        'const A = () => (\n' +
          '  <PressScale\n' +
          '    accessibilityRole="button"\n' +
          '    onPress={() => {\n' +
          "      router.push('/x');\n" +
          '    }}>              <GlassCard style={styles.planCard}>\n' +
          '      <Icon icon={ChevronRight} />\n' +
          '    </GlassCard>\n' +
          '  </PressScale>\n' +
          ');\n',
      ).length === 1,
  ],
  [
    /* The same tree with the newline restored — identical to the eye, and the
       whole point of the rule is that it can tell them apart. */
    'cùng cây đó nhưng xuống dòng đúng — không báo oan',
    () =>
      on(
        'const A = () => (\n' +
          '  <PressScale\n' +
          '    onPress={() => {\n' +
          "      router.push('/x');\n" +
          '    }}>\n' +
          '    <GlassCard style={styles.planCard}>\n' +
          '      <Icon icon={ChevronRight} />\n' +
          '    </GlassCard>\n' +
          '  </PressScale>\n' +
          ');\n',
      ).length === 0,
  ],
  [
    'chữ thật ngoài Text — bị bắt',
    () => on('const A = () => <View>Xem tất cả</View>;').length === 1,
  ],
  [
    /* A tool that flagged every string would "catch" the bug and also condemn
       all 204 legitimate ones in this app. It would be switched off inside a
       day, which is the same as not existing. */
    'chữ trong Text — im lặng',
    () => on('const A = () => <View><Text>Xem tất cả</Text></View>;').length === 0,
  ],
  [
    'chữ trong thành phần chuyển tiếp children — im lặng',
    () => on('const A = () => <View><ThemedText>ASCND</ThemedText></View>;').length === 0,
  ],
  [
    "{cond && 'chuỗi'} ngoài Text — bị bắt",
    () => on("const A = () => <View>{ok && 'xong'}</View>;").length === 1,
  ],
  [
    'thành phần chuyển tiếp children tới Text — được nhận vào danh sách',
    () => textish.has('ThemedText') && textish.has('TabButton'),
  ],
  [
    'thành phần thường — không lọt vào danh sách',
    () => !textish.has('View') && !textish.has('GlassCard') && !textish.has('PressScale'),
  ],
];
const missed = SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — ${missed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('có chuỗi render ngoài <Text>:\n');
  for (const p of problems) console.log(`  ${p}`);
  console.log(
    '\nRN sẽ ném "Text strings must be rendered within a <Text> component."\n' +
      'lúc chạy, và stack trace không có dòng nào của app.',
  );
  process.exit(1);
}

console.log(
  `chuỗi ngoài <Text>: không có — ${files.length} file, ` +
    `${textish.size} thẻ được phép chứa chữ (${[...textish].sort().join(', ')})`,
);
