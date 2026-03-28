import { useRef, useState, useCallback } from 'react';
import { Upload, Film, Play, Pause, Volume2, Maximize } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const VideoPreview = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    videoUrl, videoFile, setVideoFile, setVideoUrl, setVideoDuration,
    currentTime, setCurrentTime, isPlaying, setIsPlaying,
    projectId, setProjectId, isUploading, setIsUploading, addMessage,
  } = useEditorStore();

  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('video/')) {
      toast.error('الملف يجب أن يكون فيديو (mp4, mov)');
      return;
    }
    setVideoFile(file);
    const localUrl = URL.createObjectURL(file);
    setVideoUrl(localUrl);

    // Create project in DB
    const { data, error } = await supabase
      .from('projects')
      .insert({ status: 'pending' })
      .select()
      .single();

    if (error) {
      toast.error('فشل إنشاء المشروع');
      return;
    }
    setProjectId(data.id);

    // Upload to Vimeo via edge function
    setIsUploading(true);
    addMessage({ type: 'status', text: '⬆️ جارٍ رفع الفيديو إلى Vimeo...' });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('project_id', data.id);

      const res = await supabase.functions.invoke('upload-to-vimeo', { body: formData });

      if (res.error) throw new Error(res.error.message);

      setVideoUrl(res.data.video_url);
      addMessage({ type: 'ai', text: '✅ تم رفع الفيديو بنجاح! يمكنك الآن كتابة أمر المونتاج.' });
      toast.success('تم رفع الفيديو بنجاح');
    } catch (err: any) {
      addMessage({ type: 'error', text: `فشل رفع الفيديو: ${err.message}` });
      toast.error('فشل رفع الفيديو');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (!videoUrl || videoUrl.startsWith('https://vimeo.com')) {
    // Show upload zone
    return (
      <div
        className={`flex flex-col items-center justify-center h-full bg-black border border-border rounded-none transition-all ${isDragOver ? 'border-primary border-2 border-dashed' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <Film size={64} className="text-gold-dim mb-4" />
        <p className="text-foreground text-lg mb-2">ارفع فيديو لبدء المونتاج</p>
        <p className="text-muted-foreground text-sm mb-6">اسحب وأفلت أو اضغط للاختيار</p>
        <div className="flex gap-3">
          <label className="px-6 py-2.5 rounded-lg gold-gradient text-primary-foreground font-bold cursor-pointer hover:opacity-90 transition-all">
            <Upload size={16} className="inline ml-2" />
            ارفع فيديو
            <input
              type="file"
              accept="video/mp4,video/quicktime"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        </div>
        {isUploading && (
          <div className="mt-6 flex items-center gap-2 text-primary">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>جارٍ الرفع...</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full bg-black group">
      {/* Current time badge */}
      <div className="absolute top-3 left-3 z-10 bg-danger/80 text-foreground px-2 py-0.5 rounded text-xs font-mono">
        🔴 {formatTime(currentTime)}
      </div>

      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-full object-contain"
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Controls overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-3">
        <button onClick={togglePlay} className="text-foreground hover:text-primary transition-colors">
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <span className="text-foreground text-xs font-mono">
          {formatTime(currentTime)} / {formatTime(useEditorStore.getState().videoDuration)}
        </span>
        <input
          type="range"
          min={0}
          max={useEditorStore.getState().videoDuration || 100}
          value={currentTime}
          onChange={(e) => {
            const t = parseFloat(e.target.value);
            setCurrentTime(t);
            if (videoRef.current) videoRef.current.currentTime = t;
          }}
          className="flex-1 h-1 accent-primary"
        />
        <button className="text-foreground hover:text-primary transition-colors">
          <Volume2 size={16} />
        </button>
        <button
          onClick={() => videoRef.current?.requestFullscreen()}
          className="text-foreground hover:text-primary transition-colors"
        >
          <Maximize size={16} />
        </button>
      </div>
    </div>
  );
};
