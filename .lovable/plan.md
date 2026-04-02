

# خطة: تحويل الشات لمحرك تنفيذ تلقائي مع Tool Calling

## الفكرة
عندما يطلب المستخدم عملية مونتاج عبر Cloud AI (Path 3)، سيقوم الذكاء الاصطناعي باستدعاء أداة `executeVideoCommand` تلقائياً بدلاً من الرد بنص فقط. الواجهة تنفذ الأمر على السيرفر وتعرض الفيديو الناتج مباشرة.

## التغييرات

### 1. تحديث Edge Function (`supabase/functions/chat/index.ts`)

- إضافة `tools` definition لأداة `executeVideoCommand` تقبل: `action`, `video_source`, `params`
- تحديث System Prompt ليوجه الـ AI لاستخدام الأداة عند طلب مونتاج بدلاً من الشرح النصي
- عند رد الـ AI بـ `tool_calls`، إرجاعها للواجهة مع الـ `arguments` بدون تنفيذها (لأن Edge Function لا تصل لسيرفرك)
- عند رد عادي (بدون tool_calls)، إرجاع `reply` كالمعتاد

```text
مسار التنفيذ:
User → Edge Function → AI (مع tools) → tool_call → يُعاد للواجهة
→ الواجهة تُرسل POST إلى السيرفر /command → تعرض النتيجة
```

الـ actions المدعومة: `trim`, `denoise`, `speed`, `reverse`, `color_grade`, `add_subtitles`, `montage`, `info`, `transcribe`

### 2. تحديث الواجهة (`src/components/editor/AIChatPanel.tsx`)

- إضافة دالة `executeVideoCommand(action, videoSource, params)` ترسل POST إلى `${getLocalBackendUrl()}/command`
- تعديل Path 3 (Cloud AI): عند استلام `tool_calls` في الرد، تنفيذ الأداة تلقائياً على السيرفر
- عرض النتيجة كـ `execution_result` مع `outputUrl` و`diffLog`
- تحميل الفيديو الناتج في المشغل تلقائياً
- إذا لم يوجد فيديو نشط والـ AI طلب أداة تحتاج فيديو، إظهار تنبيه

**ملاحظة**: Path 1 (إرسال مباشر للسيرفر عند وجود فيديو) يبقى كما هو كمسار سريع. المسار الجديد يُفعّل فقط عندما يمر الطلب عبر Cloud AI.

### تنسيق JSON المُرسل للسيرفر

```json
{
  "action": "trim",
  "video_source": "https://...",
  "params": { "start": 0, "end": 30 },
  "project_id": "default",
  "content_type": "wedding"
}
```

## الملفات المتأثرة
| الملف | التعديل |
|---|---|
| `supabase/functions/chat/index.ts` | إضافة tools + معالجة tool_calls |
| `src/components/editor/AIChatPanel.tsx` | إضافة `executeVideoCommand` + معالجة tool_calls من Cloud AI |

