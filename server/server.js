import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { processAction, listTemplates, probe } from './processor.js';
import { transcribeWithWhisper, ttsToWav, dubVideo, buildSRT, WHISPER_READY } from './speech.js';
import crypto from 'crypto';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 8787;
const UPLOAD_DIR = path.join(__dirname, 'storage', 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'storage', 'outputs');
const CACHE_DIR = path.join(__dirname, 'storage', 'cache');
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_BASE = process.env.OPENROUTER_BASE || 'https://openrouter.ai/api/v1';
const OMNIROUTE_API_KEY = process.env.OMNIROUTE_API_KEY || '';
const OMNIROUTE_BASE = process.env.OMNIROUTE_BASE || 'http://localhost:20128/v1';
const AI_PROVIDER = process.env.AI_PROVIDER || 'openrouter';

const agentToModel = {
  claude: process.env.MODEL_CLAUDE || 'google/gemma-4-31b-it:free',
  gpt4: process.env.MODEL_GPT4 || 'openai/gpt-oss-20b:free',
  gemini: process.env.MODEL_GEMINI || 'google/gemma-4-31b-it:free',
  deepseek: process.env.MODEL_DEEPSEEK || 'openai/gpt-oss-20b:free',
};

const DUB_VOICE = process.env.DUB_VOICE || 'ar-EG-SalmaNeural';
const LANG_NAMES = { ar: 'العربية', en: 'الإنجليزية', fr: 'الفرنسية', es: 'الإسبانية', de: 'الألمانية', tr: 'التركية', ru: 'الروسية', zh: 'الصينية' };

const tools = [
  {
    type: 'function',
    function: {
      name: 'executeVideoCommand',
      description:
        'Execute a video editing command on the user\'s video. Use this tool whenever the user asks for any video editing operation like trimming, denoising, speed change, color grading, adding subtitles, reversing, montage, getting info, or transcription. Do NOT explain what to do — call this tool directly.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'trim', 'denoise', 'speed', 'reverse', 'color_grade',
              'add_subtitles', 'montage', 'info', 'transcribe', 'rotate',
              'extract_audio', 'remove_audio', 'replace_audio', 'add_text',
              'remove_text', 'change_aspect', 'add_watermark', 'merge_videos', 'compress',
              'apply_template', 'slideshow',
            ],
            description: 'The video editing action to perform',
          },
          params: {
            type: 'object',
            description:
              'Parameters for the action. Examples: trim {start:0,end:30}; speed {factor:2}; color_grade {style:"golden"}; rotate {degrees:90}; add_subtitles {subtitles:[{start:0,end:5,text:"..."}]}; add_text {text:"العنوان",position:"center"}; remove_text {preset:"bottom"} أو remove_text {regions:[{x,y,w,h}]} حيث القيم كسور 0-1 من الأبعاد، method:"blur"|"delogo"|"box"؛ change_aspect {aspect:"9:16"}; extract_audio {}; remove_audio {}; replace_audio {audio_url:"...",loop_audio:true}; add_watermark {image_url:"...",position:"bottom-right"}; merge_videos {video2_url:"...",transition:"fade"}; compress {quality:"medium"}; apply_template {template_id:"youtube_video"}; slideshow {images:[...],aspect:"16:9",duration_per_image:3}',
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transcribe_video',
      description:
        'Transcribe speech from a video to text using AI. Use when the user asks to convert video audio to text, transcribe, or \'فرّغ الكلام\'.',
      parameters: {
        type: 'object',
        properties: {
          video_url: {
            type: 'string',
            description: 'URL of the video to transcribe',
          },
        },
        required: ['video_url'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_background',
      description:
        'Remove the background from an image. Use when the user asks to remove background, isolate subject, or \'أزل الخلفية\'.',
      parameters: {
        type: 'object',
        properties: {
          image_url: {
            type: 'string',
            description: 'URL of the image to process',
          },
        },
        required: ['image_url'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'translate_subtitles',
      description:
        'Transcribe a video, translate the speech and produce Arabic (or other language) subtitles. Use when the user asks to translate a video, add translated subtitles, ترجمة الفيديو, اكتب ترجمات, ترجم الكلام, or \'حول الفيديو لترجمة عربية\'.',
      parameters: {
        type: 'object',
        properties: {
          video_url: {
            type: 'string',
            description: 'URL of the video to translate',
          },
          target_lang: {
            type: 'string',
            description: 'Target language code (ar, en, fr, es, de, tr, ru). Default: ar',
          },
          mode: {
            type: 'string',
            enum: ['srt', 'burn'],
            description: 'srt = downloadable subtitle file; burn = subtitles baked into the video',
          },
        },
        required: ['video_url'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'dub_video',
      description:
        'Dub a video: transcribe it, translate the speech, and replace/overlay the audio with a spoken Arabic (or other language) voice via AI speech synthesis. Use when the user asks to dub, دبلجة, صوّت الفيديو, or \'حول الفيديو إلى دبلجة عربية\'.',
      parameters: {
        type: 'object',
        properties: {
          video_url: {
            type: 'string',
            description: 'URL of the video to dub',
          },
          target_lang: {
            type: 'string',
            description: 'Target language code (ar, en, fr, es, de, tr, ru). Default: ar',
          },
          voice: {
            type: 'string',
            enum: ['ar-EG-SalmaNeural', 'ar-EG-ShakirNeural', 'ar-SA-ZariyahNeural', 'ar-SA-HamedNeural', 'en-US-JennyNeural', 'en-US-GuyNeural'],
            description: 'TTS voice to use',
          },
          keep_original: {
            type: 'number',
            description: 'Original audio volume kept as background (0-1). Default 0.15',
          },
          remove_original: {
            type: 'boolean',
            description: 'Set true to completely remove the original audio track (mutually exclusive with keep_original). Default false',
          },
          music_url: {
            type: 'string',
            description: 'Optional background music URL to mix under the dub at low volume',
          },
          music_volume: {
            type: 'number',
            description: 'Background music volume 0-1 (default 0.2)',
          },
        },
          required: ['video_url'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_video',
      description:
        'Analyze the visual content of a video (describe scenes, subjects, visible text, colors, people, setting, and overall topic) using AI vision on extracted frames. Use when the user asks "what is in the video", "حلل الفيديو", "شاهد الفيديو", "ماذا يظهر في الفيديو", "وصف الفيديو", or wants a visual description/analysis of the clip.',
      parameters: {
        type: 'object',
        properties: {
          video_url: {
            type: 'string',
            description: 'URL of the video to analyze',
          },
          question: {
            type: 'string',
            description: 'Optional specific question about the video content (e.g. "هل توجد نصوص ظاهرة؟")',
          },
        },
        required: ['video_url'],
        additionalProperties: false,
      },
    },
  },
];

const systemPrompt = (project_context) => `أنت "مونتاجي AI" — مساعد ذكي متخصص في مونتاج الفيديو باللغة العربية.

قواعد صارمة:
- عندما يطلب المستخدم أي عملية مونتاج (قص، تسريع، عكس، تنقية صوت، تصحيح ألوان، ترجمة، مونتاج، معلومات، إزالة صوت، استخراج صوت، إضافة صوت، نص، ترجمات، مسح/إزالة/حذف نصوص أو عناوين، تغيير مقاس، شعار مائي، دمج، ضغط، قالب، سلايدات، إلخ)، يجب أن تستدعي أداة executeVideoCommand فوراً دون أي تحليل أو سؤال مسبق.
- عندما يطلب المستخدم مسح أو إخفاء أو حذف النصوص أو العناوين أو الترجمات المدمجة في الفيديو (مثل "امسح النصوص" أو "ازل النص من الفيديو" أو "حذف العنوان")، استدعِ executeVideoCommand فوراً بـ action:"remove_text" مع params {preset:"bottom"|"top"|"center"|"full"} أو {regions:[{x,y,w,h}]} وmethod:"blur"|"delogo"|"box" (الافتراضي blur). لا تستدعِ analyze_video أبداً لهذا الغرض.
- عندما يطلب المستخدم تفريغ أو نسخ فيديو لنص، استدعِ أداة transcribe_video مع رابط الفيديو النشط.
- عندما يطلب المستخدم ترجمة فيديو أو إضافة ترجمات مترجمة (عربية أو غيرها)، استدعِ أداة translate_subtitles مع رابط الفيديو النشط. إن طلب ترجمات مدمجة في الفيديو استخدم mode:"burn"، وإن طلب ملف ترجمات استخدم mode:"srt".
- عندما يطلب المستخدم دبلجة الفيديو أو التحدث بصوت عربي بدلاً من الصوت الأصلي، استدعِ أداة dub_video مع رابط الفيديو النشط. إن حدد المستخدم الخيارات (إزالة الصوت الأصلي، إضافة موسيقى، اللغة، الصوت) نفّذها مباشرة في معاملات الأداة دون سؤال.
- عند طلب الدبلجة أو الترجمة دون تحديد الخيارات، اسأل سؤالاً واحداً مختصراً وانتظر رد المستخدم قبل استدعاء الأداة: بالنسبة للدبلجة اسأل "هل أزيل الصوت الأصلي أم أبقيه خافتاً؟ وهل أضيف موسيقى خلفية؟" وبالنسبة للترجمة اسأل "هل أحرق الترجمة في الفيديو أم أرسل ملف SRT؟ وما اللغة؟". لا تستدعِ الأداة قبل إجابة المستخدم.
- عندما يسأل المستخدم عن محتوى الفيديو أو يطلب رؤيته أو وصفه أو تحليله (مثل "ماذا يظهر في الفيديو؟" أو "حلل الفيديو" أو "شاهد الفيديو")، استدعِ أداة analyze_video مع رابط الفيديو النشط. مهم: analyze_video مخصصة فقط للإجابة عن أسئلة "ماذا يظهر؟" في الفيديو — لا تستخدمها أبداً لتنفيذ أي تعديل أو مونتاج (مثل مسح نصوص)، ولا تستخدمها قبل تنفيذ عملية مونتاج.
- عندما يطلب المستخدم إزالة خلفية صورة، استدعِ أداة remove_background.
- لا تشرح كيفية القص أو المونتاج. لا تعطِ تعليمات نصية. فقط نفّذ الأداة.
- إذا كان الطلب محادثة عادية أو سؤال لا يتعلق بتحرير فيديو، أجب نصياً بشكل مختصر.

إجراءات executeVideoCommand:
- trim: قص {start, end}
- speed: تغيير السرعة {factor}
- reverse: عكس
- denoise: تنقية الصوت
- color_grade: تصحيح ألوان {style: warm|cinematic|cold|golden|vintage|b_w}
- montage: مونتاج كامل
- rotate: تدوير {degrees}
- info: معلومات الفيديو
- extract_audio: استخراج الصوت كـ MP3
- remove_audio: إزالة الصوت كلياً
- replace_audio: استبدال/إضافة صوت {audio_url, loop_audio}
- add_subtitles: ترجمات مدمجة {subtitles:[{start,end,text}]} أو {srt:"..."}
- add_text: نص على الفيديو {text, position, color}
- remove_text: مسح/إخفاء النصوص المدمجة من الفيديو {preset:"bottom"|"top"|"center"|"full"} أو {regions:[{x,y,w,h}]} بقيم كسور 0-1 من الأبعاد، وmethod:"blur"|"delogo"|"box" (الافتراضي blur). استخدمه فوراً عندما يطلب المستخدم مسح أو إخفاء أو حذف نصوص أو عناوين أو ترجمات مدمجة في الفيديو.
- change_aspect: تغيير المقاس {aspect: "9:16"|"16:9"|"1:1", fit}
- add_watermark: شعار مائي {image_url, position, scale}
- merge_videos: دمج فيديوهات {video2_url, transition}
- compress: ضغط {quality: low|medium|high}
- apply_template: تطبيق قالب {template_id, text} — القوالب: youtube_video, short_reels, story_square, cinematic_film, wedding_golden, retro_black_white, title_overlay
- slideshow: سلايدات صور {images:[...], aspect, duration_per_image}

${project_context?.cinematic ? '- الوضع السينمائي مفعّل: استخدم أسلوب سينمائي متقدم' : ''}
${project_context?.template_id ? `- القالب المختار: ${project_context.template_id}` : ''}
${project_context?.content_type ? `- نوع المحتوى: ${project_context.content_type}` : ''}
${project_context?.video_source ? `- الفيديو النشط: ${project_context.video_source}` : '- لا يوجد فيديو نشط حالياً'}

أجب دائماً بالعربية بأسلوب احترافي ومختصر.`;

function gatewayConfig() {
  if (AI_PROVIDER === 'omniroute') {
    return {
      base: OMNIROUTE_BASE,
      key: OMNIROUTE_API_KEY,
      extraHeaders: {},
      label: 'OmniRoute',
      whisperModel: process.env.WHISPER_MODEL || 'openai/whisper-large-v3-turbo',
    };
  }
  if (AI_PROVIDER === 'openrouter') {
    return {
      base: OPENROUTER_BASE,
      key: OPENROUTER_API_KEY,
      extraHeaders: {
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:8080',
        'X-Title': 'Montaji AI',
      },
      label: 'OpenRouter',
      whisperModel: process.env.WHISPER_MODEL || 'openai/whisper-large-v3-turbo',
    };
  }
  return {
    base: process.env.OPENAI_BASE || 'https://api.openai.com/v1',
    key: process.env.OPENAI_API_KEY || '',
    extraHeaders: {},
    label: 'OpenAI',
    whisperModel: 'whisper-1',
  };
}

async function chatCompletion({ model, messages, tools: fnTools, preferredBase, preferredKey, preferredHeaders, preferredLabel }) {
  const gw = preferredBase
    ? { base: preferredBase, key: preferredKey, extraHeaders: preferredHeaders || {}, label: preferredLabel || 'AI' }
    : gatewayConfig();
  const headers = {
    Authorization: `Bearer ${gw.key}`,
    'Content-Type': 'application/json',
    ...gw.extraHeaders,
  };
  const res = await fetch(`${gw.base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, tools: fnTools, stream: false }),
  });
  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`AI gateway error: ${res.status} ${errText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// If OmniRoute is unreachable (network error), transparently fall back to OpenRouter.
function gatewayFallback() {
  if (AI_PROVIDER === 'omniroute') {
    return {
      base: OPENROUTER_BASE,
      key: OPENROUTER_API_KEY,
      headers: {
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:8080',
        'X-Title': 'Montaji AI',
      },
      label: 'OpenRouter (احتياط)',
    };
  }
  return null;
}

// Fallback model chain — free models are rate-limited, so we try others on 429/404.
const FALLBACK_MODELS = (process.env.FALLBACK_MODELS || '')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

function parseTranslatedJSON(content) {
  const text = String(content || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const m = text.match(/\[[\s\S]*\]/);
  try {
    const arr = JSON.parse(m ? m[0] : text);
    if (Array.isArray(arr) && arr.length) return arr;
  } catch {}
  return null;
}

// Translate whisper segments to targetLang via the active gateway (with OmniRoute→OpenRouter fallback).
async function translateSegmentsLLM(segments, targetLang) {
  const langName = LANG_NAMES[targetLang] || targetLang;
  const numbered = segments.map((s, i) => `${i + 1}\t${s.text}`).join('\n');
  const messages = [
    { role: 'system', content: 'أنت مترجم محترف دقيق. لا تخرج إلا JSON صالحاً فقط دون أي نص آخر.' },
    {
      role: 'user',
      content: `ترجم كل مقطع في القائمة التالية إلى ${langName}. أعد قائمة JSON بصيغة: [{"index":1,"text":"الترجمة"},{"index":2,"text":"الترجمة"},...] بنفس عدد العناصر وبنفس الترتيب تماماً. لا تحذف أو تدمج أو تضيف أي عنصر.\n${numbered}`,
    },
  ];
  const model = process.env.TRANSLATE_MODEL || agentToModel.gemini;
  const modelChain = [model, ...FALLBACK_MODELS.filter((m) => m !== model)];
  let lastError = null;

  for (const m of modelChain) {
    try {
      const data = await chatCompletion({ model: m, messages });
      const parsed = parseTranslatedJSON(data.choices?.[0]?.message?.content || '');
      if (parsed) return parsed;
      lastError = new Error('تنسيق الترجمة غير صالح من النموذج');
    } catch (e) {
      const fb = gatewayFallback();
      if (fb && fb.key && (e.cause?.code === 'ECONNREFUSED' || e.cause?.code === 'ECONNRESET' || e.cause?.code === 'ENOTFOUND' || e.message?.includes('fetch failed'))) {
        try {
          const fbModel = m === 'auto/smart'
            ? (process.env.FALLBACK_OPENROUTER_MODEL || 'openai/gpt-oss-20b:free')
            : m;
          const data = await chatCompletion({ model: fbModel, messages, preferredBase: fb.base, preferredKey: fb.key, preferredHeaders: fb.headers, preferredLabel: fb.label });
          const parsed = parseTranslatedJSON(data.choices?.[0]?.message?.content || '');
          if (parsed) return parsed;
        } catch (e2) {
          lastError = e2;
          break;
        }
      }
      lastError = e;
      if (e.status !== 429 && e.status !== 404 && e.status !== 503 && e.status !== 402) break;
    }
  }
  throw lastError || new Error('فشلت الترجمة');
}

async function applySegmentsTranslation(segments, targetLang, sourceLang) {
  const lang = String(targetLang || 'ar').toLowerCase();
  const src = String(sourceLang || '').toLowerCase();
  if (!lang || lang === 'auto' || lang === 'none' || lang === src || lang === 'original') {
    return segments;
  }
  const translated = await translateSegmentsLLM(segments, lang);
  const byIndex = new Map(translated.map((t) => [Number(t.index), String(t.text || '')]));
  return segments.map((s, i) => ({ ...s, text: byIndex.get(i + 1) || byIndex.get(i) || s.text }));
}

function moveToOutputs(srcPath, label) {
  const ext = srcPath.split('.').pop();
  const fname = `${Date.now()}_${label}.${ext}`;
  const dest = path.join(OUTPUT_DIR, fname);
  fs.renameSync(srcPath, dest);
  return { fname, output_url: `${PUBLIC_URL}/outputs/${fname}` };
}

app.get('/api/health', (req, res) => {
  const gw = gatewayConfig();
  res.json({
    status: 'ok',
    name: 'montaji-local-server',
    version: '1.0.0',
    ai_provider: AI_PROVIDER,
    ai_configured: !!gw.key,
    uploads_dir: UPLOAD_DIR,
    storage_usage_mb: Math.round((fs.readdirSync(UPLOAD_DIR).reduce((sum, f) => {
      try { return sum + fs.statSync(path.join(UPLOAD_DIR, f)).size; } catch { return sum; }
    }, 0) / (1024 * 1024)) * 100) / 100,
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, agent, conversation_history, project_context } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    const model = agentToModel[agent] || agentToModel.gemini;
    const messages = [
      { role: 'system', content: systemPrompt(project_context) },
      ...(conversation_history || []).slice(-10),
      { role: 'user', content: message },
    ];

    // Try primary model, then fallback chain
    const modelChain = [model, ...FALLBACK_MODELS.filter((m) => m !== model)];
    let lastError = null;

    for (const m of modelChain) {
      try {
        const data = await chatCompletion({ model: m, messages, tools });
        const choice = data.choices?.[0];

        if (choice?.message?.tool_calls?.length) {
          const toolCalls = choice.message.tool_calls.map((tc) => ({
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments || '{}'),
          }));
          return res.json({ tool_calls: toolCalls, gateway: 'primary' });
        }

        return res.json({ reply: choice?.message?.content || 'لم أتمكن من الرد', gateway: 'primary' });
      } catch (e) {
        // Network failure against the local gateway (OmniRoute down) → transparent fallback
        const fb = gatewayFallback();
        if (fb && fb.key && (e.cause?.code === 'ECONNREFUSED' || e.cause?.code === 'ECONNRESET' || e.cause?.code === 'ENOTFOUND' || e.message?.includes('fetch failed'))) {
          try {
            const fbModel = m === 'auto/smart'
              ? (process.env.FALLBACK_OPENROUTER_MODEL || 'openai/gpt-oss-20b:free')
              : m;
            const data = await chatCompletion({ model: fbModel, messages, tools, preferredBase: fb.base, preferredKey: fb.key, preferredHeaders: fb.headers, preferredLabel: fb.label });
            const choice = data.choices?.[0];
            if (choice?.message?.tool_calls?.length) {
              const toolCalls = choice.message.tool_calls.map((tc) => ({
                name: tc.function.name,
                arguments: JSON.parse(tc.function.arguments || '{}'),
              }));
              return res.json({ tool_calls: toolCalls, gateway: 'fallback' });
            }
            return res.json({ reply: choice?.message?.content || 'لم أتمكن من الرد', gateway: 'fallback' });
          } catch (e2) {
            lastError = e2;
            break;
          }
        }
        lastError = e;
        if (e.status !== 429 && e.status !== 404 && e.status !== 503 && e.status !== 402) {
          break;
        }
      }
    }

    throw lastError || new Error('AI request failed');
  } catch (e) {
    console.error('chat error:', e);
    const status = e.status || 500;
    if (status === 429) {
      return res.status(429).json({ error: 'تم تجاوز حد الطلبات، يرجى المحاولة لاحقاً' });
    }
    if (status === 402) {
      return res.status(402).json({ error: 'رصيد غير كافٍ، يرجى شحن الحساب' });
    }
    return res.status(status).json({ error: e.message || 'خطأ غير معروف' });
  }
});

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.\-\u0600-\u06FF]+/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 2048) * 1024 * 1024 },
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'file is required' });
    }
    const url = `${PUBLIC_URL}/uploads/${req.file.filename}`;
    res.json({
      success: true,
      url,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'upload failed' });
  }
});

app.use('/uploads', express.static(UPLOAD_DIR, {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
  },
}));

async function downloadToTemp(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`فشل تنزيل الملف: ${res.status}`);
  const ext = (url.split('?')[0].split('.').pop() || 'mp4').slice(0, 6);
  const tmp = path.join(os.tmpdir(), `montaji_${Date.now()}.${ext}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(tmp, buf);
  return tmp;
}

// Download a media URL to a persistent cache dir (reused across requests).
async function downloadToCache(url) {
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  const ext = (url.split('?')[0].split('.').pop() || 'bin').toLowerCase().slice(0, 6);
  const dest = path.join(CACHE_DIR, `${hash}.${ext}`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`فشل تنزيل الملف: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return dest;
}

app.get('/api/templates', (req, res) => {
  res.json({ success: true, templates: listTemplates() });
});

// ---- Async processing jobs with real progress ----
const jobs = new Map();
const jobOrder = [];
let runningJob = null;

function createJob(body) {
  const id = crypto.randomUUID();
  const job = { id, body, status: 'queued', progress: 0, action: null, error: null, output_url: null, info: null, created: Date.now() };
  jobs.set(id, job);
  return job;
}

async function runProcessJob(job, body) {
  let outputPath = null;
  const cleanup = [];
  try {
    const { action, video_url, audio_url, image_url, video2_url, images = [], params = {} } = body || {};
    job.action = action;
    job.status = 'processing';
    job.progress = 1;

    const files = {};
    if (video_url) { files.videoPath = await downloadToCache(video_url); cleanup.push(files.videoPath); }
    if (audio_url) { files.audioPath = await downloadToCache(audio_url); cleanup.push(files.audioPath); }
    if (image_url) { files.imagePath = await downloadToCache(image_url); cleanup.push(files.imagePath); }
    if (video2_url) { files.video2Path = await downloadToCache(video2_url); cleanup.push(files.video2Path); }
    if (images.length) {
      files.imagePaths = [];
      for (const img of images) {
        const p = await downloadToCache(img);
        files.imagePaths.push(p);
        cleanup.push(p);
      }
    }

    let duration = 0;
    if (files.videoPath) {
      try { duration = (await probe(files.videoPath)).duration || 0; } catch {}
    }
    job.progress = 5;

    const result = await processAction(action, files, params, {
      duration,
      onProgress: (p) => { job.progress = Math.round(5 + p * 0.93); },
    });

    if (result.outputPath) {
      const ext = result.outputPath.split('.').pop();
      const fname = `${Date.now()}_${action}.${ext}`;
      outputPath = path.join(OUTPUT_DIR, fname);
      fs.renameSync(result.outputPath, outputPath);
      cleanup.push(outputPath);
      job.output_url = `${PUBLIC_URL}/outputs/${fname}`;
      job.info = result.info || null;
      job.progress = 100;
      job.status = 'completed';
    } else {
      job.status = 'completed';
      job.progress = 100;
      job.info = result.info || null;
    }
  } catch (e) {
    console.error('process job error:', e);
    job.status = 'failed';
    job.error = e.message || 'فشلت المعالجة';
  } finally {
    // Keep cache files, clean up temp/output files that are not the returned output
    for (const p of cleanup) {
      if (p && p !== outputPath && !p.includes(CACHE_DIR)) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
  }
}

// Run jobs one at a time (avoids CPU thrash and races on the progress hook)
async function pumpJobs() {
  while (jobOrder.length && !runningJob) {
    const id = jobOrder.shift();
    const job = jobs.get(id);
    if (!job) continue;
    runningJob = job;
    try { await runProcessJob(job, job.body); } finally { runningJob = null; }
  }
}

app.post('/api/process', (req, res) => {
  try {
    const body = req.body || {};
    if (!body.action) return res.status(400).json({ error: 'action is required' });
    const job = createJob(body);
    jobOrder.push(job.id);
    pumpJobs();
    res.json({ success: true, job_id: job.id, status: job.status, action: body.action });
  } catch (e) {
    console.error('process create error:', e);
    res.status(500).json({ error: e.message || 'فشل إنشاء المهمة' });
  }
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    action: job.action,
    output_url: job.output_url,
    info: job.info,
    error: job.error,
  });
});

// Import a file directly from a local path on the server machine (instant for huge raw footage).
app.post('/api/import-local', (req, res) => {
  try {
    const { path: filePath } = req.body || {};
    if (!filePath || typeof filePath !== 'string') return res.status(400).json({ error: 'path is required' });
    const resolved = path.resolve(String(filePath).trim());
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return res.status(400).json({ error: 'الملف غير موجود على هذا الجهاز' });
    }
    const ext = (resolved.split('.').pop() || 'mp4').toLowerCase().replace(/[^\w]/g, '');
    const allowed = ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'mpg', 'mpeg', 'wmv', 'flv', 'ts'];
    if (!allowed.includes(ext)) {
      return res.status(400).json({ error: `امتداد غير مدعوم: .${ext}` });
    }
    const base = path.basename(resolved).replace(/[^\w.\-\u0600-\u06FF]+/g, '_');
    const fname = `${Date.now()}_${base}`;
    const dest = path.join(UPLOAD_DIR, fname);
    fs.copyFileSync(resolved, dest);
    res.json({
      success: true,
      url: `${PUBLIC_URL}/uploads/${fname}`,
      filename: fname,
      size: fs.statSync(dest).size,
    });
  } catch (e) {
    console.error('import-local error:', e);
    res.status(500).json({ error: e.message || 'فشل استيراد الملف' });
  }
});

const VISION_MODELS = (process.env.VISION_MODELS || 'google/gemini-3.1-flash-lite:free,google/gemini-3.1-flash-lite,google/gemini-2.5-flash-lite')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('انتهت مهلة استدعاء نموذج الرؤية')), ms)),
  ]);
}

app.post('/api/analyze-video', async (req, res) => {
  const tmpFiles = [];
  try {
    const { video_url, question } = req.body || {};
    if (!video_url) return res.status(400).json({ error: 'video_url is required' });

    const videoPath = await downloadToCache(video_url);
    let dur = 0;
    try { dur = (await probe(videoPath)).duration || 0; } catch {}
    if (!dur || dur <= 0) dur = 10;

    const cuts = [0.05, 0.25, 0.5, 0.75, 0.95].map((f) => Math.min(Math.max(0, dur - 0.1), f * dur));
    const frames = [];
    for (let i = 0; i < cuts.length; i++) {
      const out = path.join(os.tmpdir(), `montaji_frame_${Date.now()}_${i}.jpg`);
      tmpFiles.push(out);
      try {
        await execFileAsync('ffmpeg', ['-y', '-ss', String(cuts[i]), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '6', out], { timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
        if (fs.existsSync(out) && fs.statSync(out).size > 0) {
          frames.push(`data:image/jpeg;base64,${fs.readFileSync(out).toString('base64')}`);
        }
      } catch {}
    }
    if (!frames.length) throw new Error('تعذر استخراج لقطات من الفيديو');

    const textPrompt = question && String(question).trim()
      ? `حلل الفيديو من اللقطات التالية وأجب عن هذا السؤال بالعربية بإيجاز: ${String(question).trim()}`
      : 'حلل هذا الفيديو من اللقطات المستخرجة: صف بالعربية ما يظهر (الأشخاص، المشاهد، النصوص الظاهرة، الألوان، الإعداد، الموضوع العام). كن موجزاً ومنظماً.';
    const content = [{ type: 'text', text: textPrompt }];
    for (const f of frames) content.push({ type: 'image_url', image_url: { url: f } });

    let lastError = null;
    for (const model of VISION_MODELS) {
      try {
        const data = await withTimeout(chatCompletion({ model, messages: [{ role: 'user', content }] }), 25000);
        const text = data.choices?.[0]?.message?.content || '';
        if (text.trim()) return res.json({ success: true, analysis: text, frames: frames.length });
      } catch (e) {
        lastError = e;
        const fb = gatewayFallback();
        if (fb && fb.key && (e.cause?.code === 'ECONNREFUSED' || e.cause?.code === 'ECONNRESET' || e.cause?.code === 'ENOTFOUND' || e.message?.includes('fetch failed'))) {
          try {
            const fbData = await withTimeout(chatCompletion({ model, messages: [{ role: 'user', content }], preferredBase: fb.base, preferredKey: fb.key, preferredHeaders: fb.headers, preferredLabel: fb.label }), 25000);
            const fbText = fbData.choices?.[0]?.message?.content || '';
            if (fbText.trim()) return res.json({ success: true, analysis: fbText, frames: frames.length, gateway: 'fallback' });
          } catch (e2) { lastError = e2; }
        }
        if (e.status !== 429 && e.status !== 404 && e.status !== 503 && e.status !== 402 && e.status !== 400) break;
      }
    }
    throw lastError || new Error('فشل تحليل الفيديو');
  } catch (e) {
    console.error('analyze-video error:', e);
    res.status(500).json({ error: e.message || 'فشل تحليل الفيديو' });
  } finally {
    for (const p of tmpFiles) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
});

app.use('/outputs', express.static(OUTPUT_DIR, {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
  },
}));

app.post('/api/transcribe', async (req, res) => {
  let videoPath = null;
  let audioPath = null;
  try {
    const { video_url } = req.body || {};
    if (!video_url) {
      return res.status(400).json({ error: 'video_url is required' });
    }

    videoPath = await downloadToTemp(video_url);
    audioPath = path.join(os.tmpdir(), `montaji_audio_${Date.now()}.mp3`);

    await execFileAsync('ffmpeg', [
      '-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', audioPath,
    ], { timeout: 180000, maxBuffer: 1024 * 1024 * 1024 });

    const audioBase64 = fs.readFileSync(audioPath).toString('base64');

    const gw = gatewayConfig();
    if (!gw.key) {
      throw new Error(`مفتاح ${gw.label} غير مهيأ. أضفه إلى server/.env`);
    }

    const tRes = await fetch(`${gw.base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gw.key}`,
        'Content-Type': 'application/json',
        ...gw.extraHeaders,
      },
      body: JSON.stringify({
        model: gw.whisperModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'قم بتفريغ الكلام في هذا التسجيل الصوتي إلى نص عربي. أعد النص فقط دون أي مقدمة.' },
              { type: 'input_audio', input_audio: { data: audioBase64, format: 'mp3' } },
            ],
          },
        ],
      }),
    });

    if (!tRes.ok) {
      const errText = await tRes.text();
      throw new Error(`whisper error: ${tRes.status} ${errText}`);
    }

    const tData = await tRes.json();
    res.json({ success: true, text: tData.choices?.[0]?.message?.content || '', language: 'ar' });
  } catch (e) {
    console.error('transcribe error:', e);
    res.status(500).json({ error: e.message || 'فشل التفريغ' });
  } finally {
    for (const p of [videoPath, audioPath]) {
      if (p) { try { fs.unlinkSync(p); } catch {} }
    }
  }
});

app.post('/api/subtitles', async (req, res) => {
  let videoPath = null;
  let outputPath = null;
  try {
    const { video_url, mode = 'srt', target_lang = 'ar', source_language, min_gap = 0.15, max_len = 4 } = req.body || {};
    if (!video_url) return res.status(400).json({ error: 'video_url is required' });
    if (!WHISPER_READY) return res.status(500).json({ error: 'Whisper غير مهيأ على الخادم' });

    videoPath = await downloadToCache(video_url);
    const { language, segments } = await transcribeWithWhisper(videoPath, { language: source_language });

    // Merge tiny gaps between segments so subtitles don't flicker.
    const merged = [];
    for (const s of segments) {
      const prev = merged[merged.length - 1];
      if (prev && s.start - prev.end < Number(min_gap) && s.end - s.start <= Number(max_len)) {
        prev.end = Math.max(prev.end, s.end);
        prev.text = `${prev.text} ${s.text}`.trim();
      } else {
        merged.push({ ...s });
      }
    }

    const translated = await applySegmentsTranslation(merged, target_lang, language);
    const srt = buildSRT(translated);

    if (mode === 'burn') {
      const result = await processAction('add_subtitles', { videoPath }, { subtitles: translated });
      const moved = moveToOutputs(result.outputPath, 'subtitled');
      outputPath = moved.fname;
      return res.json({
        success: true, mode, language, target_lang,
        segments: translated,
        srt,
        video_url: moved.output_url,
        filename: moved.fname,
      });
    }

    const srtFile = path.join(OUTPUT_DIR, `${Date.now()}_subtitles.srt`);
    fs.writeFileSync(srtFile, srt, 'utf8');
    outputPath = path.basename(srtFile);
    return res.json({
      success: true, mode, language, target_lang,
      segments: translated,
      srt,
      subtitle_url: `${PUBLIC_URL}/outputs/${path.basename(srtFile)}`,
    });
  } catch (e) {
    console.error('subtitles error:', e);
    return res.status(500).json({ error: e.message || 'فشلت معالجة الترجمة' });
  }
});

app.post('/api/dub', async (req, res) => {
  let videoPath = null;
  let outputPath = null;
  const tracks = [];
  try {
    const {
      video_url, target_lang = 'ar', voice = DUB_VOICE,
      source_language, keep_original = 0.15, min_gap = 0.15, max_len = 4,
      remove_original, music_url, music_volume,
    } = req.body || {};
    if (!video_url) return res.status(400).json({ error: 'video_url is required' });
    if (!WHISPER_READY) return res.status(500).json({ error: 'Whisper غير مهيأ على الخادم' });

    videoPath = await downloadToCache(video_url);
    const { language, segments } = await transcribeWithWhisper(videoPath, { language: source_language });

    const merged = [];
    for (const s of segments) {
      const prev = merged[merged.length - 1];
      if (prev && s.start - prev.end < Number(min_gap) && s.end - s.start <= Number(max_len)) {
        prev.end = Math.max(prev.end, s.end);
        prev.text = `${prev.text} ${s.text}`.trim();
      } else {
        merged.push({ ...s });
      }
    }

    const translated = await applySegmentsTranslation(merged, target_lang, language);
    const ttsTmp = path.join(os.tmpdir(), `montaji_dub_${Date.now()}_${Math.round(Math.random() * 1e9)}`);
    fs.mkdirSync(ttsTmp, { recursive: true });
    for (let i = 0; i < translated.length; i++) {
      const seg = translated[i];
      if (!seg.text.trim()) continue;
      const wav = path.join(ttsTmp, `seg_${i}.wav`);
      await ttsToWav(seg.text, voice, wav);
      tracks.push({ start: seg.start, path: wav });
    }
    if (!tracks.length) throw new Error('لم يُولَّد أي صوت (نص فارغ؟)');

    const dubOpts = { keepOriginal: remove_original ? 0 : Number(keep_original) };
    if (music_url && typeof music_url === 'string' && music_url.trim()) {
      const musicPath = await downloadToCache(music_url.trim(), 'music');
      dubOpts.musicPath = musicPath;
      if (music_volume != null) dubOpts.musicVolume = Number(music_volume);
    }
    const dubOut = path.join(ttsTmp, 'dubbed.mp4');
    await dubVideo(videoPath, tracks, dubOut, dubOpts);
    const moved = moveToOutputs(dubOut, 'dubbed');
    outputPath = moved.fname;

    return res.json({
      success: true, language, target_lang, voice,
      segments: translated,
      video_url: moved.output_url,
      filename: moved.fname,
    });
  } catch (e) {
    console.error('dub error:', e);
    return res.status(500).json({ error: e.message || 'فشلت الدبلجة' });
  } finally {
    for (const t of tracks) { try { fs.unlinkSync(t.path); } catch {} }
  }
});

app.post('/api/remove-bg', async (req, res) => {
  const { image_url } = req.body || {};
  if (!image_url) {
    return res.status(400).json({ error: 'image_url is required' });
  }
  res.json({
    success: true,
    message: 'خدمة إزالة الخلفية غير مفعّلة محلياً بعد — تم إرجاع الصورة الأصلية.',
    output_url: image_url,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  const gw = gatewayConfig();
  console.log(`Montaji local server running on http://localhost:${PORT}`);
  console.log(`  Uploads dir: ${UPLOAD_DIR}`);
  console.log(`  AI provider: ${AI_PROVIDER} (${gw.label}) — ${gw.key ? 'configured' : 'MISSING KEY'}`);
});
