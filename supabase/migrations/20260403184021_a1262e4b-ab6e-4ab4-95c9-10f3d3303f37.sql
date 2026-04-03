INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true);

CREATE POLICY "Anyone can upload videos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'videos');
CREATE POLICY "Anyone can read videos" ON storage.objects FOR SELECT USING (bucket_id = 'videos');