import { aiKey, aiUrl, aiVisionModel, callAI } from "../_shared/ai.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { aiGate, corsHeaders, json, opaque, quotaExceeded, recordTokens, requireUser, tokensOf } from "../_shared/guard.ts";

/** Output ceiling — the reply is a small JSON object, never prose. */
const MAX_TOKENS = 1500;

/**
 * Largest image we will pay to look at, as base64 characters — about 4 MB of
 * base64, so a little under 3 MB of JPEG.
 *
 * Vision cost scales with the image, and the size used to be unchecked: only
 * "is it non-empty". The app sends `quality: 0.5` from the camera without a
 * resize, which is comfortably inside this; a caller who is not the app is
 * the reason the limit exists.
 */
const MAX_IMAGE_CHARS = 4_000_000;

/**
 * What a single food item may plausibly be.
 *
 * These are `lib/plausible.ts`'s `meal_kcal` and `macro_g` bounds, restated
 * because an edge function cannot import from the app. `tools/ai-coach.mjs`
 * asserts the two agree, so a change on either side that forgets the other
 * fails rather than drifts.
 */
const ITEM_MAX_KCAL = 10_000;
const ITEM_MAX_MACRO_G = 2_000;
/** A serving heavier than this is not one item on a plate. */
const ITEM_MAX_SERVING_G = 5_000;
/** More than this in one photo is not a meal being logged. */
const MAX_ITEMS = 20;

/**
 * A number the app is willing to treat as a measurement, or `null`.
 *
 * `Number(v)` alone is not the check it looks like: it turns `null`, `""` and
 * `[]` into a perfectly finite `0`, so a missing macro would have arrived in
 * the diary as a measured zero rather than as a reason to drop the item. Only
 * a number, or a string that is entirely a number, counts as one.
 */
function measured(v: unknown, max: number): number | null {
  const n =
    typeof v === "number" ? v
    : typeof v === "string" && v.trim() !== "" ? Number(v)
    : NaN;
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 10) / 10;
}

/**
 * The model's items, reduced to ones worth writing into somebody's diary.
 *
 * Exported so `tools/ai-coach.mjs` can run it directly: this is the boundary
 * between a model's guess and a number the rest of the app treats as fact, and
 * a boundary that is only asserted in a comment is one that stops holding.
 */
export function clampItems(raw: unknown): { items: unknown[] } {
  const items = Array.isArray((raw as { items?: unknown })?.items)
    ? ((raw as { items: unknown[] }).items)
    : [];
  const out: unknown[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const f = it as Record<string, unknown>;
    const food_name = typeof f.food_name === "string" ? f.food_name.trim().slice(0, 120) : "";
    if (!food_name) continue;
    const kcal = measured(f.kcal, ITEM_MAX_KCAL);
    if (kcal === null) continue;
    const protein_g = measured(f.protein_g, ITEM_MAX_MACRO_G);
    const carbs_g = measured(f.carbs_g, ITEM_MAX_MACRO_G);
    const fat_g = measured(f.fat_g, ITEM_MAX_MACRO_G);
    const fiber_g = measured(f.fiber_g, ITEM_MAX_MACRO_G);
    const serving_g = measured(f.serving_g, ITEM_MAX_SERVING_G);
    /* A macro that cannot be a measurement takes the item with it. Keeping the
       calories and dropping the protein would put an item in the diary whose
       macros do not describe it, which is worse than not having it. */
    if (protein_g === null || carbs_g === null || fat_g === null || fiber_g === null) continue;
    out.push({
      food_name,
      serving_g: serving_g ?? 0,
      kcal,
      protein_g,
      carbs_g,
      fat_g,
      fiber_g,
    });
    if (out.length >= MAX_ITEMS) break;
  }
  return { items: out };
}

const MODES = new Set(["food", "barcode", "label"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const caller = await requireUser(req);
    if (caller instanceof Response) return caller;
    const { supabase } = caller;

    /*
      Read and checked before the quota is spent.

      `claimCall` is an increment, not a reservation: it counts the request
      whether or not anything reaches the gateway. With it first, a request
      that never could have gone anywhere — no image, no messages, a body that
      is not JSON — still cost the caller one of their calls for the day, and a
      client retrying a request it had malformed could burn the whole
      allowance without a single model invocation.

      Whether a *provider* failure should refund a call is a genuine question
      and is left exactly as it was. This is the other case: nothing was spent,
      so nothing should be counted.
    */
    const body = await req.json();
    const image_base64 = typeof body?.image_base64 === "string" ? body.image_base64 : "";
    const lang = body?.lang === "en" ? "en" : "vi";
    const mode = MODES.has(body?.mode) ? (body.mode as string) : "food";

    if (!image_base64) return json({ error: "No image provided" }, 400);
    if (image_base64.length > MAX_IMAGE_CHARS) {
      return json({ error: "Ảnh quá lớn. Vui lòng chụp lại." }, 413);
    }

    const gate = await aiGate(supabase, "scan-food");
    if (gate === "denied") return quotaExceeded();

    const modeInstructions: Record<string, string> = {
      food: `You are a professional nutrition analyst with expertise in food & beverage identification.
Analyze the image and identify ALL food items AND beverages/drinks visible.

IMPORTANT recognition rules:
- Identify both solid foods AND liquid beverages (coffee, juice, smoothie, soda, milk tea, beer, wine, water with flavor, etc.)
- For beverages: estimate volume in ml, then convert to equivalent grams for serving_g
- For common drinks, use real nutritional data: e.g. Coca-Cola 330ml = 139 kcal, 35g carbs; black coffee ~5 kcal; orange juice 250ml = 112 kcal
- Estimate portion size from visual cues (plate size, cup size, utensils for scale)
- If you see a branded product, use the actual brand's nutritional data
- Differentiate between diet/zero versions and regular versions of drinks
- Consider cooking method impact on nutrition (fried vs steamed vs raw)
- For Vietnamese foods, use common Vietnamese serving sizes and preparations
- For mixed dishes (pho, bun bo, com tam), break down if clearly identifiable components are visible, or give total estimate`,

      barcode: `You are a product identification specialist. This image may contain a barcode, QR code, or product packaging.

CRITICAL barcode scanning rules:
- Look for ANY barcode (EAN-13, UPC-A, QR code, Code 128) in the image
- Read ALL visible text: brand name, product name, flavor, size/volume
- If you can identify the product, provide REAL nutritional data from the actual product
- Common products to recognize: Coca-Cola, Pepsi, Red Bull, Monster Energy, Starbucks drinks, Yakult, Vinamilk, TH True Milk, Aquafina, Lavie, Sting, Number 1, C2, Trà xanh 0 độ, Trà đào, etc.
- For alcoholic beverages: beer, wine, spirits - provide accurate calorie content
- If barcode is unreadable, analyze any visible packaging text/branding instead
- Include the volume/weight from packaging in the serving_g field
- If you absolutely cannot identify the product, return an empty items array - do NOT guess`,

      label: `You are an OCR specialist for nutrition facts panels.

CRITICAL label reading rules:
- Read the EXACT values from the nutrition label - do NOT estimate or round
- Find: Calories/Energy, Total Fat, Saturated Fat, Carbohydrates, Sugars, Protein, Fiber, Sodium
- Convert Energy from kJ to kcal if needed (1 kcal = 4.184 kJ)
- Identify the serving size exactly as stated (e.g. "per 100g", "per serving 30g", "per bottle 500ml")
- If label shows "per 100g" AND "per serving", prefer "per serving" for practical use
- For Vietnamese labels: "Năng lượng" = Energy, "Chất đạm" = Protein, "Chất béo" = Fat, "Carbohydrate" or "Tinh bột" = Carbs, "Chất xơ" = Fiber
- Use the product name visible on the label for food_name
- If values are listed as "<1g", use 0.5g as estimate`,
    };

    const systemPrompt = `${modeInstructions[mode || 'food'] || modeInstructions.food}

You MUST respond by calling the "analyze_food" function with the results.

Additional guidelines:
- Be specific about food/drink names (e.g. "Iced Caramel Latte" not just "coffee", "Phở bò tái" not just "pho")
- Use standard nutritional databases (USDA, local databases) for accuracy
- If multiple items are visible, list each separately
- If no food/drink is detected, return an empty items array
- Language for food names: ${lang === "vi" ? "Vietnamese" : "English"}
- ALWAYS include beverages/drinks - they count for nutrition tracking
${
  /*
    ── do not manufacture precision that is not there ──

    This guideline used to read "Round values to 1 decimal place for
    precision", for all three modes at once. In `label` mode that is right and
    it is what the panel says. In `food` mode it is a decimal place on a
    portion size guessed from a photograph, and a tenth of a gram on a number
    whose real uncertainty is a third of itself is not precision, it is a
    claim the picture cannot support.

    It also contradicted `label`'s own instruction to read the exact values,
    since a panel reading "0.5 g" would be reported as "0.5" either way but a
    panel reading "12.75 g" would be rounded away.
  */ ''
}${
  mode === 'label'
    ? '- Report values exactly as printed on the panel; do not round them'
    : mode === 'barcode'
      ? "- Report the product's published values as published; do not round them"
      : '- Report whole numbers. These are estimates from a photograph, and a decimal place on a guessed portion size claims a precision the image does not contain'
}`;

    const userPromptByMode: Record<string, string> = {
      food: "Analyze this image. Identify EVERY food item AND beverage visible. Provide accurate macronutrients per serving for each.",
      barcode: "Scan this image for barcodes or product packaging. Identify the product and provide its real nutritional information per serving.",
      label: "Read the nutrition facts label in this image. Extract the exact nutritional values shown.",
    };

    const response = await callAI(
      {
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${image_base64}` },
                },
                {
                  type: "text",
                  text: userPromptByMode[mode || 'food'] || userPromptByMode.food,
                },
              ],
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "analyze_food",
                description:
                  "Return identified food/beverage items with nutritional information",
                parameters: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          food_name: {
                            type: "string",
                            description: "Name of the food or beverage item",
                          },
                          serving_g: {
                            type: "number",
                            description: "Serving size in grams (for liquids, use ml equivalent in grams)",
                          },
                          kcal: {
                            type: "number",
                            description: "Calories per serving",
                          },
                          protein_g: {
                            type: "number",
                            description: "Protein in grams per serving",
                          },
                          carbs_g: {
                            type: "number",
                            description: "Carbohydrates in grams per serving",
                          },
                          fat_g: {
                            type: "number",
                            description: "Fat in grams per serving",
                          },
                          fiber_g: {
                            type: "number",
                            description: "Fiber in grams per serving",
                          },
                        },
                        required: [
                          "food_name",
                          "serving_g",
                          "kcal",
                          "protein_g",
                          "carbs_g",
                          "fat_g",
                          "fiber_g",
                        ],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["items"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "analyze_food" },
          },
          max_tokens: MAX_TOKENS,
      },
      { vision: true },
    );

    /* `null` nghĩa là KHÔNG CÓ nhà cung cấp nào được cấu hình — khác hẳn với
       "bên nào đó trả lỗi". Cổng cũ hỏi `if (!AI_KEY)`, và câu đó nay sai: thiếu
       khoá CHÍNH không còn nghĩa là thiếu AI, vì bên dự phòng có thể đã có. */
    if (!response) return opaque(new Error("no ai provider configured"), "ai_unavailable");

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    /* Ghi TOKEN, không ghi lượt. Hai lượt cùng loại chênh nhau hai bậc, nên
       lượt gọi chặn được lạm dụng còn token mới tính được tiền. */
    await recordTokens(supabase, "scan-food", tokensOf(data), gate === "overage");
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(
        JSON.stringify({ items: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /*
      The model's arguments, which are a suggestion until they are checked.

      A tool schema is something the gateway is *asked* for, not something it
      enforces, and this used to `JSON.parse` the arguments and hand them
      straight back. Everything downstream then treated them as measurements:
      `scan-food.tsx` rounds each field and nothing else, the items go into a
      meal, the meal is summed into `meal_entries`, and `recomputeDailyLog`
      turns that into `daily_logs.kcal` — which the calorie ring, the macro
      rings, the daily quests, the readiness score and `adaptiveTDEE`'s
      fourteen-day regression all read.

      So a vision model's bad guess on a dark photo became a fact about
      somebody's diet, permanently, with no gate anywhere on the path. The app
      already has that gate for numbers a person types — `lib/plausible.ts`,
      whose `meal_kcal` tops out at 10,000 per item and `macro_g` at 2,000 —
      and the one source that is not a person was the one source not passing
      through it.

      Implausible items are dropped rather than clamped. A clamped 10,000 kcal
      is still a wrong number wearing a plausible costume; a missing item is
      visibly missing, and the review screen this feeds is where somebody can
      add it by hand.
    */
    /*
      ── the one unusable reply that escaped as a 500 ──

      Every other shape this model can return already lands on `{items: []}`:
      no tool call, empty `choices`, items whose numbers are not measurements.
      Malformed *arguments* did not. `JSON.parse` threw, the outer catch turned
      it into a 500, and the body handed the caller the parser's own sentence:

          {"error":"Expected property name or '}' in JSON at position 1 …"}

      A model emitting not-quite-JSON in a tool call is an ordinary failure, not
      an exceptional one — and the quota was already spent, so the difference
      between "no food found, try another photo" and an opaque 500 is the
      difference between a person retaking the picture and a person thinking the
      app is broken.

      Parsed here rather than inside `clampItems`, which takes a value: keeping
      that function about *what the numbers are* is what lets `tools/ai-coach.mjs`
      drive it directly.
    */
    let args: unknown;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      console.error("scan-food: tool arguments were not JSON");
      return json({ items: [] });
    }
    const result = clampItems(args);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scan-food error:", e);
    return opaque(e, "ai_failed");
  }
});
