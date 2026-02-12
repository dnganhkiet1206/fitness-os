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
      food: `Analyze the food image and identify all food items visible.
For each food item, estimate realistic macronutrients based on typical serving sizes.`,
      barcode: `This image contains a product barcode or QR code. Try to identify the product from any visible text, brand name, or packaging around the barcode.
If you can identify the product, provide its nutritional information per serving.
If you cannot identify the product from the barcode alone, analyze any visible food packaging or labels in the image.`,
      label: `This image contains a food nutrition label / facts panel. Read the nutrition information from the label carefully.
Extract the exact values shown on the label for calories, protein, carbs, fat, and fiber per serving.
Also identify the serving size in grams. Use the exact values from the label, do not estimate.`,
    };

    const systemPrompt = `You are a nutrition analysis AI. ${modeInstructions[mode || 'food'] || modeInstructions.food}

You MUST respond by calling the "analyze_food" function with the results.

Guidelines:
- Be specific about food names (e.g. "Grilled chicken breast" not just "chicken")
- Estimate serving size in grams based on visual appearance
- Use standard nutritional databases values for accuracy
- If multiple items are visible, list each separately
- If no food is detected, return an empty items array
- Language for food names: ${lang === "vi" ? "Vietnamese" : "English"}`;

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
                  text: "Analyze this food image. Identify each food item and estimate its macronutrients per serving.",
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
                  "Return identified food items with estimated macronutrients",
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
                            description: "Name of the food item",
                          },
                          serving_g: {
                            type: "number",
                            description: "Estimated serving size in grams",
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
