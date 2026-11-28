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
