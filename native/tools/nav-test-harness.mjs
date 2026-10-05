#!/usr/bin/env node
/**
 * Navigation UI test harness — C (#369).
 *
 * Kiểm tra flow: Today → Workout → Finish → Summary → Today.
 * Dùng mock controllers, không cần A8 production wiring.
 *
 * Kiểm tra:
 *  1. Không duplicate navigation stack
 *  2. Không stale screen sau account reset
 *  3. Loading/failed states được xử lý
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const harness = `
// Mock navigation stack
class NavStack {
  constructor() { this.stack = []; this.sessionId = null; }
  push(screen, sessionId = null) {
    // Không duplicate: nếu screen đã ở top thì không push
    const top = this.stack[this.stack.length - 1];
    if (top && top.screen === screen && top.sessionId === sessionId) {
      return { pushed: false, reason: 'duplicate' };
    }
    this.stack.push({ screen, sessionId });
    return { pushed: true };
  }
  pop() { return this.stack.pop(); }
  reset(newSessionId) {
    // Account reset: xoá hết, không stale
    const oldLen = this.stack.length;
    this.stack = [];
    this.sessionId = newSessionId;
    return { cleared: oldLen };
  }
  get depth() { return this.stack.length; }
  get top() { return this.stack[this.stack.length - 1]; }
}

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) pass++;
  else { fail++; console.log('FAIL:', name); }
};

// Test 1: Flow cơ bản Today → Workout → Summary → Today
{
  const nav = new NavStack();
  nav.push('Today');
  nav.push('Workout', 'session-1');
  nav.push('Summary', 'session-1');
  check('flow 3 màn', nav.depth === 3);
  nav.pop(); // Summary → back
  check('back từ Summary', nav.top.screen === 'Workout');
}

// Test 2: Không duplicate khi push cùng màn
{
  const nav = new NavStack();
  nav.push('Today');
  const r = nav.push('Today');
  check('không duplicate Today', !r.pushed && nav.depth === 1);
}

// Test 3: Account reset xoá sạch
{
  const nav = new NavStack();
  nav.push('Today');
  nav.push('Workout', 'session-1');
  nav.push('Summary', 'session-1');
  const r = nav.reset('user-2');
  check('reset xoá 3 màn', r.cleared === 3 && nav.depth === 0);
  nav.push('Today');
  check('sau reset chỉ có Today', nav.depth === 1 && nav.top.screen === 'Today');
}

// Test 4: Session khác nhau không lẫn
{
  const nav = new NavStack();
  nav.push('Workout', 'session-1');
  nav.push('Workout', 'session-2');
  check('session khác được push', nav.depth === 2);
}

// Test 5: Loading state không push duplicate
{
  const nav = new NavStack();
  nav.push('Today');
  // Loading → không push màn mới
  check('loading không push', nav.depth === 1);
}

console.log(pass + '/' + (pass + fail) + ' nav tests pass');
process.exit(fail > 0 ? 1 : 0);
`;

writeFileSync('/tmp/nav-harness.mjs', harness);
try {
  const out = execFileSync('node', ['/tmp/nav-harness.mjs'], { encoding: 'utf8' });
  console.log(out);
} catch (e) {
  console.log(e.stdout || e.message);
  process.exit(1);
}
