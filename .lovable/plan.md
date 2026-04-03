

# خطة: تفعيل النظام المتكامل للمونتاج الذكي

## ملخص
ربط كامل بين الواجهة والسيرفر الخلفي (FastAPI) مع دعم رفع مزدوج (Vimeo + Supabase Storage) وعرض نتائج الفيديو مباشرة في الدردشة.

## التغييرات المطلوبة

### 1. إنشاء حاوية تخزين `videos` في Supabase Storage
- إنشاء bucket اسمه `videos` مع سياسات RLS تسمح بالرفع والقراءة
- هذا يوفر بديلاً مباشراً عند فشل Vimeo

**Migration SQL:**
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true);
CREATE POLICY "Anyone can upload videos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'videos');
CREATE POLICY "Anyone can read videos" ON storage.objects FOR SELECT USING (bucket_id = 'videos');
```

### 2. تحديث `VideoPreview.tsx` — استراتيجية الرفع المزدوج
- عند فشل رفع Vimeo: رفع الملف تلقائياً إلى Supabase Storage (`videos` bucket)
- استخدام الرابط العام الناتج كـ `video_source`
- إظهار رسالة تنبيه تقترح "الرفع المباشر" كبديل

```text
المسار الجديد:
ملف → محاولة Vimeo → فشل؟ → رفع إلى Storage → رابط عام → video_source
```

### 3. تحديث `AIChatPanel.tsx` — تحسين منطق التنفيذ
- التأكد من إرسال `video_source` الصحيح (Vimeo URL أو Storage URL) في كل طلب `/command`
- إضافة عرض مشغل فيديو مدمج (`<video>`) داخل `MessageBubble` عند وجود `output_url`
- معالجة أخطاء السيرفر بشكل واضح مع اقتراحات

### 4. تحديث `MessageBubble.tsx` — مشغل فيديو مدمج
- عند وجود `outputUrl` في رسالة `execution_result`، عرض مشغل فيديو صغير مدمج في الرسالة
- الإبقاء على أزرار التحميل والمعاينة الحالية

```text
┌─────────────────────────┐
│ ⚡ [trim] تم القص       │
│ ┌─────────────────────┐ │
│ │   ▶ Video Player    │ │
│ └─────────────────────┘ │
│ [تحميل] [معاينة]       │
│ 📋 سجل التغييرات (3)   │
│ 💡 الخطوة التالية: ...  │
└─────────────────────────┘
```

### 5. تحديث Edge Function `chat/index.ts` — تمرير `video_source`
- التأكد من تمرير `video_source` في سياق المشروع للـ AI حتى يتمكن من تحليل الفيديو
- الـ AI يستخدم هذا الرابط في `tool_calls` تلقائياً

## الملفات المتأثرة
| الملف | التعديل |
|---|---|
| migration SQL | إنشاء bucket `videos` + RLS |
| `src/components/editor/VideoPreview.tsx` | Fallback إلى Storage عند فشل Vimeo |
| `src/components/editor/AIChatPanel.tsx` | ضمان إرسال video_source الصحيح |
| `src/components/editor/MessageBubble.tsx` | مشغل فيديو مدمج في الرسائل |
| `supabase/functions/chat/index.ts` | تمرير video_source للأداة |

