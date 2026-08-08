-- ============================================================
-- Montaji AI - Complete database setup (run all at once)
-- Apply this in the Supabase SQL Editor of your NEW project.
-- ============================================================

-- 1) projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_url TEXT,
  user_command TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'transcribing', 'cutting', 'translating', 'completed', 'error')),
  output_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all read" ON public.projects FOR SELECT USING (true);
CREATE POLICY "Allow all insert" ON public.projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update" ON public.projects FOR UPDATE USING (true);
CREATE POLICY "Allow all delete" ON public.projects FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) extra projects columns
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS user_email text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS transcript text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS template_id text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS content_type text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS duration_seconds float;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS error text;

-- 3) notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  message text NOT NULL,
  level text DEFAULT 'info',
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all read notifications" ON public.notifications FOR SELECT TO public USING (true);
CREATE POLICY "Allow all insert notifications" ON public.notifications FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow all update notifications" ON public.notifications FOR UPDATE TO public USING (true);
CREATE POLICY "Allow all delete notifications" ON public.notifications FOR DELETE TO public USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 4) videos storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read videos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update videos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete videos" ON storage.objects;

CREATE POLICY "Anyone can upload videos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'videos');
CREATE POLICY "Anyone can read videos" ON storage.objects FOR SELECT USING (bucket_id = 'videos');
CREATE POLICY "Anyone can update videos" ON storage.objects FOR UPDATE USING (bucket_id = 'videos');
CREATE POLICY "Anyone can delete videos" ON storage.objects FOR DELETE USING (bucket_id = 'videos');

-- Note: Storage CORS must also be set in Dashboard > Storage > Settings:
-- Origin: *, Methods: GET/POST/PUT/DELETE/OPTIONS, Headers: *
