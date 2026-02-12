import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Authentication check ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // --- End authentication check ---

    const { image_base64, lang, mode } = await req.json();
    if (!image_base64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

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
- Round values to 1 decimal place for precision`;

    const userPromptByMode: Record<string, string> = {
      food: "Analyze this image. Identify EVERY food item AND beverage visible. Provide accurate macronutrients per serving for each.",
      barcode: "Scan this image for barcodes or product packaging. Identify the product and provide its real nutritional information per serving.",
      label: "Read the nutrition facts label in this image. Extract the exact nutritional values shown.",
    };

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
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
        }),
      }
    );

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
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(
        JSON.stringify({ items: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scan-food error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
