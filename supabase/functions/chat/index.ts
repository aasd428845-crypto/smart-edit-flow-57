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

const tools = [
  {
    type: "function",
    function: {
      name: "executeVideoCommand",
      description:
        "Execute a video editing command on the user's video. Use this tool whenever the user asks for any video editing operation like trimming, denoising, speed change, color grading, adding subtitles, reversing, montage, getting info, or transcription. Do NOT explain what to do — call this tool directly.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: [
              "trim",
              "denoise",
              "speed",
              "reverse",
              "color_grade",
              "add_subtitles",
              "montage",
              "info",
              "transcribe",
            ],
            description: "The video editing action to perform",
          },
          params: {
            type: "object",
            description:
              "Parameters for the action, e.g. {start: 0, end: 30} for trim, {factor: 2} for speed",
          },
        },
        required: ["action"],
        additionalProperties: false,
      },
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, agent, conversation_history, project_context } =
      await req.json();

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "message is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const model = agentToModel[agent] || "google/gemini-3-flash-preview";

    const systemPrompt = `أنت "مونتاجي AI" — مساعد ذكي متخصص في مونتاج الفيديو باللغة العربية.

قواعد صارمة:
- عندما يطلب المستخدم أي عملية مونتاج (قص، تسريع، عكس، تنقية صوت، تصحيح ألوان، ترجمة، مونتاج، معلومات، إلخ)، يجب أن تستدعي أداة executeVideoCommand فوراً.
- لا تشرح كيفية القص أو المونتاج. لا تعطِ تعليمات نصية. فقط نفّذ الأداة.
- إذا كان الطلب محادثة عادية أو سؤال لا يتعلق بتحرير فيديو، أجب نصياً بشكل مختصر.

الأدوات المتاحة:
- trim: قص الفيديو (params: start, end بالثواني)
- denoise: تنقية الصوت
- speed: تغيير السرعة (params: factor)
- reverse: عكس الفيديو
- color_grade: تصحيح الألوان (params: style مثل "golden", "cinematic", "vintage")
- add_subtitles: إضافة ترجمة
- montage: مونتاج كامل
- info: معلومات عن الفيديو
- transcribe: تفريغ الكلام لنص

${project_context?.cinematic ? "- الوضع السينمائي مفعّل: استخدم أسلوب سينمائي متقدم" : ""}
${project_context?.template_id ? `- القالب المختار: ${project_context.template_id}` : ""}
${project_context?.content_type ? `- نوع المحتوى: ${project_context.content_type}` : ""}
${project_context?.video_source ? `- الفيديو النشط: ${project_context.video_source}` : "- لا يوجد فيديو نشط حالياً"}

أجب دائماً بالعربية بأسلوب احترافي ومختصر.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(conversation_history || []).slice(-10),
      { role: "user", content: message },
    ];

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages, tools, stream: false }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: "تم تجاوز حد الطلبات، يرجى المحاولة لاحقاً",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "رصيد غير كافٍ، يرجى شحن الحساب" }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: `خطأ من بوابة AI: ${response.status}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    // Check if AI returned tool calls
    if (choice?.message?.tool_calls?.length) {
      const toolCalls = choice.message.tool_calls.map((tc: any) => ({
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || "{}"),
      }));
      return new Response(
        JSON.stringify({ tool_calls: toolCalls }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Regular text reply
    const reply =
      choice?.message?.content || "لم أتمكن من الرد";

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "خطأ غير معروف",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
