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

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 8787;
const UPLOAD_DIR = path.join(__dirname, 'storage', 'uploads');
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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
            ],
            description: 'The video editing action to perform',
          },
          params: {
            type: 'object',
            description:
              'Parameters for the action, e.g. {start: 0, end: 30} for trim, {factor: 2} for speed',
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
];

const systemPrompt = (project_context) => `أنت "مونتاجي AI" — مساعد ذكي متخصص في مونتاج الفيديو باللغة العربية.

قواعد صارمة:
- عندما يطلب المستخدم أي عملية مونتاج (قص، تسريع، عكس، تنقية صوت، تصحيح ألوان، ترجمة، مونتاج، معلومات، إلخ)، يجب أن تستدعي أداة executeVideoCommand فوراً.
- عندما يطلب المستخدم تفريغ أو نسخ فيديو لنص، استدعِ أداة transcribe_video مع رابط الفيديو النشط.
- عندما يطلب المستخدم إزالة خلفية صورة، استدعِ أداة remove_background.
- لا تشرح كيفية القص أو المونتاج. لا تعطِ تعليمات نصية. فقط نفّذ الأداة.
- إذا كان الطلب محادثة عادية أو سؤال لا يتعلق بتحرير فيديو، أجب نصياً بشكل مختصر.

الأدوات المتاحة:
- executeVideoCommand: عمليات المونتاج (trim, denoise, speed, reverse, color_grade, add_subtitles, montage, info, transcribe, rotate)
- transcribe_video: تفريغ الكلام لنص
- remove_background: إزالة خلفية صورة

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

async function chatCompletion({ model, messages, tools: fnTools }) {
  const gw = gatewayConfig();
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

// Fallback model chain — free models are rate-limited, so we try others on 429/404.
const FALLBACK_MODELS = (process.env.FALLBACK_MODELS || '')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

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
          return res.json({ tool_calls: toolCalls });
        }

        return res.json({ reply: choice?.message?.content || 'لم أتمكن من الرد' });
      } catch (e) {
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
  if (!res.ok) throw new Error(`فشل تنزيل الفيديو: ${res.status}`);
  const ext = (url.split('?')[0].split('.').pop() || 'mp4').slice(0, 6);
  const tmp = path.join(os.tmpdir(), `montaji_${Date.now()}.${ext}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(tmp, buf);
  return tmp;
}

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
