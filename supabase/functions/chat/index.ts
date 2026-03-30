import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const agentToModel: Record<string, string> = {
  claude: "google/gemini-2.5-pro",
  gpt4: "openai/gpt-5",
  gemini: "google/gemini-3-flash-preview",
  deepseek: "google/gemini-2.5-flash",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, agent, conversation_history, project_context } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const model = agentToModel[agent] || "google/gemini-3-flash-preview";

    const systemPrompt = `أنت "مونتاجي AI" — مساعد ذكي متخصص في مونتاج الفيديو باللغة العربية.
مهامك:
- تقديم نصائح المونتاج السينمائي والإبداعي
- تحليل سياق المشروع وتقديم توصيات
- المساعدة في اختيار القوالب والأنماط المناسبة
- الإجابة على أسئلة تتعلق بتحرير الفيديو والصوت
${project_context?.cinematic ? "- الوضع السينمائي مفعّل: قدم توصيات سينمائية متقدمة" : ""}
${project_context?.template_id ? `- القالب المختار: ${project_context.template_id}` : ""}
${project_context?.content_type ? `- نوع المحتوى: ${project_context.content_type}` : ""}
أجب دائماً بالعربية بأسلوب احترافي ومختصر.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(conversation_history || []).slice(-10),
      { role: "user", content: message },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, stream: false }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "تم تجاوز حد الطلبات، يرجى المحاولة لاحقاً" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "رصيد غير كافٍ، يرجى شحن الحساب" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: `خطأ من بوابة AI: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "لم أتمكن من الرد";

    return new Response(
      JSON.stringify({ reply }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "خطأ غير معروف" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
