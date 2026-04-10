

# المرحلة 1: نظام الرفع المتقدم مع TUS Protocol

## ملخص
تحويل نظام الرفع الحالي (الذي يرسل الملف كاملاً عبر Edge Function) إلى نظام متقدم يدعم:
- رفع مباشر من العميل إلى Vimeo عبر TUS (استئناف + ملفات كبيرة)
- شريط تقدم حقيقي مع سرعة الرفع والوقت المتبقي
- إيقاف/استئناف/إلغاء
- Fallback تلقائي إلى Supabase Storage

## المعمارية

```text
Client (tus-js-client)
  │
  ├─► Edge Function: create-vimeo-ticket (POST)
  │     → يطلب upload_link من Vimeo API
  │     → يرجع {upload_link, video_uri} للعميل
  │
  └─► Vimeo TUS endpoint (PATCH مباشر)
        → العميل يرفع مباشرة بدون وسيط
        → شريط تقدم حقيقي
        → استئناف تلقائي عند انقطاع الشبكة
```

## التغييرات المطلوبة

### 1. تثبيت `tus-js-client`
```
npm install tus-js-client
```

### 2. Edge Function جديدة: `create-vimeo-ticket`
- تستقبل `{ file_size, project_id, file_name }`
- تطلب upload ticket من Vimeo API (TUS approach)
- ترجع `{ upload_link, video_uri, video_url }` فقط — بدون رفع الملف
- أخف وأسرع من الدالة الحالية التي ترفع الملف كاملاً عبر Edge Function

### 3. مكتبة `src/lib/upload-manager.ts` (ملف جديد)
كلاس `UploadManager` يغلّف `tus-js-client`:
- `startUpload(file, uploadLink)` — يبدأ الرفع المباشر إلى Vimeo
- `pause()` / `resume()` / `cancel()`
- Events: `onProgress(percent, speed, eta)`, `onSuccess()`, `onError()`
- Retry تلقائي (3 محاولات) مع backoff

### 4. مكوّن `src/components/editor/UploadProgress.tsx` (ملف جديد)
- شريط تقدم بألوان التطبيق (ذهبي)
- نسبة مئوية + سرعة الرفع + الوقت المتبقي
- أزرار: إيقاف مؤقت ⏸️ | استئناف ▶️ | إلغاء ❌
- رسائل حالة: "جارٍ الرفع..." / "متوقف" / "جارٍ إعادة المحاولة..."

### 5. تحديث `VideoPreview.tsx`
- استبدال `handleFile` الحالي بالمنطق الجديد:
  1. إنشاء مشروع في DB
  2. استدعاء `create-vimeo-ticket` للحصول على `upload_link`
  3. بدء الرفع المباشر عبر `UploadManager`
  4. عرض `UploadProgress` أثناء الرفع
  5. Fallback إلى Supabase Storage عند فشل Vimeo

### 6. تحديث `editorStore.ts`
- إضافة حالات الرفع: `uploadProgress`, `uploadSpeed`, `uploadEta`, `uploadStatus`

### الملفات المتأثرة
| الملف | النوع |
|---|---|
| `supabase/functions/create-vimeo-ticket/index.ts` | جديد |
| `src/lib/upload-manager.ts` | جديد |
| `src/components/editor/UploadProgress.tsx` | جديد |
| `src/components/editor/VideoPreview.tsx` | تعديل |
| `src/store/editorStore.ts` | تعديل |
| `package.json` | إضافة tus-js-client |

