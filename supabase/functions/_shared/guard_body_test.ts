import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { readJsonBody } from "./guard.ts";

/**
 * `readJsonBody` (Master Audit 28/11, SEC-19): an unparseable body must be a
 * 400 BEFORE `aiGate`, never `{}` that spends a quota call.
 */

const post = (body?: string) => new Request("http://x/fn", { method: "POST", body });

Deno.test("a JSON object comes back as the object", async () => {
  assertEquals(await readJsonBody(post('{"lang":"en","date":"2026-11-28"}')), { lang: "en", date: "2026-11-28" });
});

Deno.test("an empty body means the defaults: {}", async () => {
  assertEquals(await readJsonBody(post()), {});
  assertEquals(await readJsonBody(post("")), {});
  assertEquals(await readJsonBody(post("  \n")), {});
});

for (const bad of ["{not json", "[1,2]", "42", '"text"', "null", "true", "{\"a\":1"]) {
  Deno.test(`unparseable or not an object (${JSON.stringify(bad)}): 400 invalid_json`, async () => {
    const out = await readJsonBody(post(bad));
    if (!(out instanceof Response)) throw new Error(`expected a 400, got ${JSON.stringify(out)}`);
    assertEquals(out.status, 400);
    assertEquals(await out.json(), { error: "invalid_json" });
  });
}

/* ── readJsonCapped (AUD-82): the ceiling must hold BEFORE the body is buffered ── */
import { readJsonCapped } from "./guard.ts";

function chunked(parts: string[], onPull?: () => void): Request {
  const enc = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      onPull?.();
      if (i < parts.length) c.enqueue(enc.encode(parts[i++]));
      else c.close();
    },
  });
  // No content-length: a chunked upload gives none.
  return new Request("http://x/fn", { method: "POST", body: stream, duplex: "half" } as RequestInit);
}

Deno.test("readJsonCapped: a body under the ceiling parses", async () => {
  const out = await readJsonCapped(new Request("http://x", { method: "POST", body: '{"signedPayload":"abc"}' }), 1024);
  assertEquals(out instanceof Response ? out.status : out.value, { signedPayload: "abc" });
});

Deno.test("readJsonCapped: declared content-length over the ceiling → 413, nothing read", async () => {
  let read = false;
  const req = {
    headers: new Headers({ "content-length": String(10 * 1024 * 1024) }),
    body: { getReader() { read = true; throw new Error("must not read"); } },
    json() { read = true; throw new Error("must not read"); },
  } as unknown as Request;
  const out = await readJsonCapped(req, 1024);
  if (!(out instanceof Response)) throw new Error("expected 413");
  assertEquals(out.status, 413);
  assertEquals(read, false);
});

Deno.test("readJsonCapped: chunked body with no length stops reading past the ceiling → 413", async () => {
  let pulls = 0;
  const big = "x".repeat(600);
  const parts = ['{"p":"', ...Array(100).fill(big), '"}'];
  const out = await readJsonCapped(chunked(parts, () => pulls++), 1024);
  if (!(out instanceof Response)) throw new Error("expected 413");
  assertEquals(out.status, 413);
  // 1024 bytes is passed within the first 3 chunks; it must not drain all 102.
  if (pulls > 5) throw new Error(`kept reading after the ceiling: ${pulls} pulls`);
});

Deno.test("readJsonCapped: exactly at the ceiling is accepted", async () => {
  const s = JSON.stringify({ p: "y".repeat(1000) });
  const out = await readJsonCapped(new Request("http://x", { method: "POST", body: s }), s.length);
  assertEquals(out instanceof Response, false);
});

Deno.test("readJsonCapped: not JSON / empty → 400", async () => {
  for (const b of ["{nope", ""]) {
    const out = await readJsonCapped(new Request("http://x", { method: "POST", body: b }), 1024);
    if (!(out instanceof Response)) throw new Error(`expected 400 for ${JSON.stringify(b)}`);
    assertEquals(out.status, 400);
  }
});

Deno.test("readJsonCapped: a request with no stream (Node harness) falls back to json()", async () => {
  const req = { headers: new Headers(), body: null, json: async () => ({ a: 1 }) } as unknown as Request;
  const out = await readJsonCapped(req, 1024);
  assertEquals(out instanceof Response ? out.status : out.value, { a: 1 });
});
