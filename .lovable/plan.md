

# خطة: إضافة أدوات ذكاء اصطناعي تعمل بدون سيرفر

## الفكرة
إضافة 3 أدوات جديدة تعمل مباشرة من المتصفح بدون الحاجة للسيرفر الخلفي (FastAPI):
1. **جلب معلومات Vimeo** — عبر Vimeo oEmbed API (مجاني)
2. **نسخ الفيديو لنص** — عبر AssemblyAI API
3. **إزالة خلفية صورة** — عبر Remove.bg API

هذه الأدوات تُضاف بجانب أداة `executeVideoCommand` الحالية، فعندما يطلب المستخدم "معلومات عن فيديو Vimeo" أو "انسخ الفيديو" يتم التنفيذ مباشرة من المتصفح.

## التغييرات

### 1. إنشاء `src/lib/tools.ts`
ملف يحتوي على الأدوات الثلاث:
- `tool_get_vimeo_info(video_url)` — يستدعي `vimeo.com/api/oembed.json`
- `tool_transcribe(video_url)` — يرسل للـ AssemblyAI مع polling حتى الاكتمال
- `tool_remove_background(image_url)` — يرسل للـ Remove.bg ويعيد base64
- `toolHandlers` map لربط اسم الأداة بالدالة

**ملاحظة أمنية**: مفاتيح AssemblyAI و Remove.bg ستُخزن كـ secrets في Edge Function بدلاً من `VITE_` env vars لتجنب تسريبها في المتصفح. أداة Vimeo لا تحتاج مفتاح.

### 2. تحديث Edge Function `chat/index.ts`
- إضافة 3 أدوات جديدة لمصفوفة `tools`:
  - `get_vimeo_info` (video_url)
  - `transcribe_video` (video_url)  
  - `remove_background` (image_url)
- تحديث System Prompt ليعرف الـ AI متى يستخدم كل أداة
- عند رد AI بـ tool_call لهذه الأدوات، يُرجعها للواجهة مثل `executeVideoCommand`

### 3. تحديث `AIChatPanel.tsx`
- استيراد `toolHandlers` من `src/lib/tools.ts`
- في `handleToolCalls`: إضافة فرع لمعالجة الأدوات الجديدة
  - إذا كان اسم الأداة في `toolHandlers` → تنفيذها مباشرة في المتصفح
  - إذا كان `executeVideoCommand` → إرسال للسيرفر كالمعتاد
- عرض مؤشر "جارٍ التنفيذ..." أثناء العمل
- عرض النتيجة كرسالة `ai` أو `execution_result`

### 4. إعداد المفاتيح
- أداة Vimeo: لا تحتاج مفتاح (مجانية)
- AssemblyAI و Remove.bg: سيتم تنفيذهما عبر edge function proxy جديدة لحماية المفاتيح، أو مباشرة من المتصفح إذا وفّر المستخدم المفاتيح في الإعدادات

```text
مسار التنفيذ:
User → "معلومات عن vimeo.com/123" → Edge Function → AI يستدعي get_vimeo_info
→ يعود للواجهة → تنفيذ مباشر في المتصفح → عرض النتيجة
```

## الملفات المتأثرة
| الملف | التعديل |
|---|---|
| `src/lib/tools.ts` | ملف جديد — 3 أدوات |
| `supabase/functions/chat/index.ts` | إضافة 3 tools جديدة للـ AI |
| `src/components/editor/AIChatPanel.tsx` | معالجة الأدوات الجديدة client-side |

