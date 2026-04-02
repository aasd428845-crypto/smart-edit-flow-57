

# خطة: تحديث رابط السيرفر + إصلاح خطأ Runtime

## المشكلة الحالية
1. **خطأ Runtime**: `Cannot read properties of null (reading 'useState')` — ناتج عن مشكلة في React hooks (ربما تعارض إصدارات أو import خاطئ)
2. **رابط السيرفر**: يحتاج تحديث العنوان الافتراضي إلى `https://laughing-umbrella-5g7x6699g5xjhpg49-8000.app.github.dev`
3. **التنفيذ التلقائي**: عند طلب مونتاج، يجب إرسال الأمر مباشرة إلى `/command` وعرض النتيجة فوراً

## التغييرات المطلوبة

### 1. إصلاح خطأ useState (الأولوية القصوى)
**الملف**: `src/hooks/use-mobile.tsx`
- تغيير `import * as React from "react"` إلى `import { useState, useEffect } from "react"` لتجنب تعارض React namespace

### 2. تحديث رابط السيرفر
**الملف**: `src/store/editorStore.ts`
- تغيير القيمة الافتراضية في `getLocalBackendUrl` من `http://127.0.0.1:8000` إلى `https://laughing-umbrella-5g7x6699g5xjhpg49-8000.app.github.dev`

### 3. تحديث فحص الاتصال
**الملف**: `src/components/editor/AIChatPanel.tsx`
- تحديث مسار فحص السيرفر من `/system/check` إلى `/system/check` (أو المسار الصحيح حسب السيرفر)
- التأكد من أن الطلبات تتعامل مع CORS بشكل صحيح (السيرفر الآن على domain مختلف)

### 4. عرض نتيجة الفيديو فوراً
**الملف**: `src/components/editor/AIChatPanel.tsx`
- المنطق الحالي في Path 1 يقوم بالفعل بإرسال الأمر إلى `/command` وعرض النتيجة — فقط يحتاج تفعيله مع الرابط الجديد
- عند استلام `output_url` من السيرفر، يتم تحميل الفيديو تلقائياً في المشغل وعرض رسالة نجاح

## الملفات المتأثرة
| الملف | التعديل |
|---|---|
| `src/hooks/use-mobile.tsx` | إصلاح import React |
| `src/store/editorStore.ts` | تحديث رابط السيرفر الافتراضي |
| `src/components/editor/AIChatPanel.tsx` | ضمان توافق CORS مع الرابط السحابي |

