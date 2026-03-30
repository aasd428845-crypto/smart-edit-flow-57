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

  const secrets = {
    lovable_ai: !!Deno.env.get("LOVABLE_API_KEY"),
    vimeo: !!Deno.env.get("VIMEO_ACCESS_TOKEN"),
    anthropic: !!Deno.env.get("VITE_ANTHROPIC_API_KEY"),
    openai: !!Deno.env.get("VITE_OPENAI_API_KEY"),
    deepseek: !!Deno.env.get("VITE_DEEPSEEK_API_KEY"),
  };

  const allConfigured = Object.values(secrets).every(Boolean);

  return new Response(
    JSON.stringify({
      status: allConfigured ? "healthy" : "partial",
      api_keys: secrets,
      missing_libraries: [],
      assets: { intro: false, outro: false, logo: false, music: false },
      recommendations: !secrets.lovable_ai
        ? [{ priority: "high", title: "Lovable AI", action: "مفتاح LOVABLE_API_KEY غير مكوّن" }]
        : [],
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
