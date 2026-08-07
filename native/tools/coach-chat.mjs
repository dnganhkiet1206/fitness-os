/**
 * That there is one conversation, not two.
 *
 * ── the bug this exists to prevent ──
 *
 * The coach's chat was `useState` inside `ai-coach.tsx`. That was correct while
 * the coach had one home. It has two now: the Health Assistant's ask bar takes
 * text directly, and `/ai-coach` is still a route the dashboard links to.
 *
 * Two copies of that state would be two conversations. You would ask something
 * on the assistant tab, open the coach from the dashboard, and find an empty
 * chat — with what you actually said still sitting on the other screen. Nothing
 * throws. Nothing looks wrong in a diff. It looks exactly like the app forgot
 * what you told it, which is the worst thing an assistant can appear to do.
 *
 * Regressing it is one `useState` away, and the wrong version is the one that
 * reads more naturally at the call site.
 *
 * ── what is checked ──
 *
 * 1. the provider is mounted, above the router, inside the auth + query context
 * 2. both screens read the conversation from the hook
 * 3. neither screen keeps its own copy of messages, loading, or the convo id
 * 4. what each screen *does* own is local: the draft, the scroll, the focus
 * 5. the streaming request is built in exactly one place
 * 6. the two transcripts agree about what a bubble looks like
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SCREENS = ['src/app/(tabs)/assistant.tsx', 'src/app/ai-coach.tsx'];
const HOOK = 'src/hooks/use-coach-chat.tsx';

const problems = [];

// ── 1: mounted, and in the right place ──
const layout = strip(read('src/app/_layout.tsx'));
if (!/<CoachChatProvider>/.test(layout)) {
  problems.push('_layout: chưa gắn <CoachChatProvider> — useCoachChat sẽ ném lỗi ngay khi mở app');
} else {
  /* Below `AuthProvider` and the query client, both of which it reads, and
     around the router so both screens are inside it. `Gate` renders the
     `<Stack>`, so wrapping `Gate` is what puts every route underneath. */
  const provider = layout.indexOf('<CoachChatProvider>');
  const gate = layout.indexOf('<Gate />');
  const close = layout.indexOf('</CoachChatProvider>');
  if (!(provider < gate && gate < close)) {
    problems.push('_layout: <CoachChatProvider> không bọc <Gate /> — các route nằm ngoài nó');
  }
  /*
    Inside `AuthProvider`, which it reads the session from.

    Written first as "does `<AuthProvider>` appear before `<CoachChatProvider>`
    in the file", and that failed on correct code: the two live in different
    functions. `RootLayout` renders `<AuthProvider><LockedApp /></AuthProvider>`
    and `LockedApp` is declared *above* it, so the nesting is real at runtime
    and inverted in the text. Textual order is not containment as soon as there
    is more than one component in a file.

    So it follows the actual hop: `AuthProvider` must contain `<LockedApp />`,
    and `LockedApp` must contain the provider.
  */
  const authBlock = layout.match(/<AuthProvider>([\s\S]*?)<\/AuthProvider>/)?.[1] ?? '';
  const lockedApp = layout.match(/function LockedApp\(\)[\s\S]*?\n}/)?.[0] ?? '';
  if (!authBlock.includes('<LockedApp />')) {
    problems.push('_layout: <AuthProvider> không còn bọc <LockedApp /> — chuỗi provider đã đổi, kiểm lại tay');
  } else if (!lockedApp.includes('<CoachChatProvider>')) {
    problems.push('_layout: <CoachChatProvider> nằm ngoài <AuthProvider> — nó đọc session và sẽ không thấy gì');
  }
}

/*
  ── 2 + 3: the screens are views, not owners ──

  Named state, rather than "does the file contain useState". Both screens
  legitimately hold local state — the draft in the box, whether the history
  panel is open — so a blanket ban would be wrong and would be removed by the
  first person who needed a boolean. What may not live in a screen is the
  conversation.
*/
const OWNED_BY_HOOK = [
  ['messages', /useState<\s*Msg\[\]\s*>|useState<[^>]*Msg[^>]*>\s*\(\s*\[/],
  ['isLoading', /const \[\s*isLoading\s*,/],
  ['conversationId', /const \[\s*conversationId\s*,|convoIdRef/],
];
function ownershipProblems(files) {
  const bad = [];
  for (const [file, src] of files) {
    const code = strip(src);
    if (!/useCoachChat\(\)/.test(code)) {
      bad.push(`${file}: không đọc cuộc trò chuyện từ useCoachChat() — màn này đang giữ chat riêng`);
    }
    for (const [what, re] of OWNED_BY_HOOK) {
      if (re.test(code)) {
        bad.push(
          `${file}: tự giữ "${what}" — thứ đó thuộc về use-coach-chat. ` +
            'Hai bản sao là hai cuộc trò chuyện, và người dùng sẽ thấy app quên mất câu mình vừa hỏi.',
        );
      }
    }
  }
  return bad;
}
problems.push(...ownershipProblems(SCREENS.map((f) => [f, read(f)])));

// ── 4: and they do keep what is theirs ──
for (const file of SCREENS) {
  const code = strip(read(file));
  for (const [what, re] of [
    ['ô nhập', /const \[input, setInput\] = useState/],
    ['vị trí cuộn', /scrollRef/],
  ]) {
    if (!re.test(code)) problems.push(`${file}: không còn giữ ${what} — thứ đó là của riêng từng màn`);
  }
}

/*
  ── 5: one request, one place ──

  The streaming call cannot go through `supabase.functions.invoke`, so it is
  hand-built — which is exactly the kind of code that gets copied when a second
  screen needs it. The copy then drifts: a different error path, a different
  context window, a key read from somewhere else. That last one already cost
  this project a bug where the coach alone answered 401 on a fresh clone.
*/
const hook = read(HOOK);
for (const [what, needle] of [
  ['expoFetch', 'expoFetch('],
  ['SEND_WINDOW', 'SEND_WINDOW'],
  ['ai_messages', "from('ai_messages')"],
  ['ai_conversations insert', "from('ai_conversations')"],
]) {
  if (!hook.includes(needle)) problems.push(`use-coach-chat: mất "${what}" — logic đã đi đâu mất`);
  for (const file of SCREENS) {
    const code = strip(read(file));
    // the history panel legitimately reads and deletes conversations
    if (what === 'ai_conversations insert') continue;
    if (code.includes(needle)) {
      problems.push(`${file}: dựng lại "${what}" — request phải chỉ có một chỗ, xem use-coach-chat`);
    }
  }
}

/*
  ── 6: one conversation should look like one conversation ──

  The two transcripts are written out separately — they sit in different
  layouts and neither is worth a shared component yet. But a bubble that changes
  shape when you open the full view says the two screens are different chats,
  which is the same lie the state duplication would have told, in pixels.
*/
const SHARED_LOOK = ['maxWidth: \'78%\'', 'borderRadius: 14', 'rgba(180,92,255,0.16)', 'colors.glassMuted'];
for (const file of SCREENS) {
  const src = read(file);
  for (const token of SHARED_LOOK) {
    if (!src.includes(token)) {
      problems.push(`${file}: bong bóng thiếu "${token}" — hai màn phải vẽ cùng một cuộc trò chuyện giống nhau`);
    }
  }
}

/*
  ── 7: every place that takes a health question says what the answers are not ──

  The disclaimer used to live on the coach's composer, which was the only place
  you could ask anything. The chat then moved onto the assistant page and the
  line did not come with it — leaving a screen that takes health questions with
  nothing saying the replies are not a diagnosis.

  That is not a styling slip. It is the one sentence on these screens that is
  there for a reason outside the product, and it is attached to the composer by
  meaning rather than by layout, so any future move of the composer can drop it
  again in exactly the same way.
*/
for (const file of SCREENS) {
  const src = read(file);
  if (!/chẩn đoán/.test(src) || !/does not diagnose/.test(src)) {
    problems.push(
      `${file}: nhận câu hỏi sức khoẻ nhưng không có dòng miễn trừ — ` +
        'màn nào có ô hỏi thì màn đó phải nói rõ câu trả lời không phải chẩn đoán, cả hai ngôn ngữ',
    );
  }
}

/**
 * The self-test.
 *
 * The ownership rule is the one worth proving, because it is the rule that
 * would have caught the bug. It gets a screen that reads the hook *and* keeps
 * its own messages — the shape a half-finished refactor leaves behind, and the
 * one a blanket "no useState" rule would miss for the wrong reason.
 */
const BROKEN = `
  const { send } = useCoachChat();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
`;
const GOOD = `
  const { messages, isLoading, send } = useCoachChat();
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
`;
const caught = ownershipProblems([['x.tsx', BROKEN]]);
const quiet = ownershipProblems([['x.tsx', GOOD]]);
if (caught.length < 2 || quiet.length > 0) {
  console.log(
    `tự kiểm tra hỏng — bản hỏng bị bắt ${caught.length}/2 lỗi, bản đúng bị bắt nhầm ${quiet.length}`,
  );
  process.exit(2);
}

if (problems.length) {
  console.log('trò chuyện coach sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  `trò chuyện coach OK — một provider bọc router trong AuthProvider, ${SCREENS.length} màn đều đọc từ hook ` +
    'và không màn nào giữ messages/isLoading/convoId; request streaming chỉ dựng một chỗ; hai bong bóng cùng số đo',
);
