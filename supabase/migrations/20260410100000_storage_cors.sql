-- ملاحظة: في Supabase، يتم ضبط CORS لـ Storage عادةً عبر لوحة التحكم (Dashboard) أو عبر API الإعدادات.
-- هذا الملف هو توثيق للإعدادات المطلوبة التي يجب أن تكون مفعّلة في Supabase:
-- Origin: *
-- Headers: *
-- Methods: GET, POST, PUT, DELETE, OPTIONS
-- Max Age: 3600

-- يمكن محاولة تفعيلها برمجياً لبعض النسخ من Supabase (إذا كان النظام يدعم ذلك عبر SQL):
-- ولكن الطريقة الأضمن هي عبر لوحة تحكم Supabase في قسم Storage -> Settings -> CORS.

-- سأقوم أيضاً بتحديث سياسات الوصول لضمان الشفافية الكاملة:
DROP POLICY IF EXISTS "Anyone can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read videos" ON storage.objects;

CREATE POLICY "Anyone can upload videos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'videos');
CREATE POLICY "Anyone can read videos" ON storage.objects FOR SELECT USING (bucket_id = 'videos');
CREATE POLICY "Anyone can update videos" ON storage.objects FOR UPDATE USING (bucket_id = 'videos');
CREATE POLICY "Anyone can delete videos" ON storage.objects FOR DELETE USING (bucket_id = 'videos');
