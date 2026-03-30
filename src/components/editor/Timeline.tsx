import { useEditorStore, getEdgeFunctionUrl } from '@/store/editorStore';
import { toast } from 'sonner';
import { Music, Film, FileText, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { useRef } from 'react';

export const Timeline = () => {
  const {
    currentTime, setCurrentTime, videoDuration, isPlaying, setIsPlaying,
    videoSource, sourceType, projectId, selectedTemplate, contentType,
    cinematicMode, isProcessing, setIsProcessing, addMessage,
  } = useEditorStore();
  const trackRef = useRef<HTMLDivElement>(null);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || videoDuration <= 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = rect.right - e.clientX;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    setCurrentTime(ratio * videoDuration);
  };

  const executeMontage = async () => {
    if (!videoSource) {
      toast.error('ارفع فيديو أولاً!');
      return;
    }
    setIsProcessing(true);
    addMessage({ type: 'user', text: cinematicMode ? '🎥 مونتاج سينمائي' : '🎬 مونتاج كامل' });

    try {
      const res = await fetch(getEdgeFunctionUrl('chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: cinematicMode ? 'مونتاج سينمائي كامل' : 'مونتاج كامل',
          agent: 'gemini',
          conversation_history: [],
          project_context: {
            video_source: videoSource,
            source_type: sourceType,
            current_time: currentTime,
            project_id: projectId || crypto.randomUUID(),
            template_id: selectedTemplate?.id || null,
            content_type: contentType || 'default',
            cinematic: cinematicMode,
          },
        }),
      });
      if (!res.ok) throw new Error('فشل الاتصال');
      const data = await res.json();
      addMessage({ type: 'ai', text: `✅ ${data.reply || data.message || 'تم إرسال طلب المعالجة'}`, status: 'processing' });
      toast.success('تم إرسال طلب المعالجة');
    } catch {
      addMessage({ type: 'error', text: '⚠️ السيرفر المحلي غير متاح. تأكد من تشغيل: uvicorn main:app' });
      toast.error('فشل الاتصال بالسيرفر المحلي');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-[120px] bg-secondary border-t border-border px-4 py-2 flex flex-col">
      {/* Tracks */}
      <div ref={trackRef} onClick={handleSeek} className="flex-1 relative cursor-pointer space-y-1">
        <div className="absolute top-0 bottom-0 w-0.5 bg-destructive z-10 transition-all" style={{ right: `${progress}%` }}>
          <div className="w-2 h-2 bg-destructive rounded-full -translate-x-[3px] -translate-y-1" />
        </div>
        <div className="flex items-center gap-2 h-5">
          <Music size={12} className="text-muted-foreground shrink-0" />
          <div className="flex-1 h-full bg-processing/50 rounded-sm" />
        </div>
        <div className="flex items-center gap-2 h-5">
          <Film size={12} className="text-muted-foreground shrink-0" />
          <div className="flex-1 h-full bg-gold-dim/50 rounded-sm" />
        </div>
        <div className="flex items-center gap-2 h-5">
          <FileText size={12} className="text-muted-foreground shrink-0" />
          <div className="flex-1 h-full flex gap-2">
            <div className="w-1/4 h-full bg-success/30 rounded-sm" />
            <div className="w-1/6 h-full bg-success/30 rounded-sm" />
          </div>
        </div>
      </div>

      {/* Controls + Execute */}
      <div className="flex items-center gap-3 mt-1">
        <button className="text-muted-foreground hover:text-foreground transition-colors"><SkipForward size={14} /></button>
        <button onClick={() => setIsPlaying(!isPlaying)} className="text-foreground hover:text-primary transition-colors">
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className="text-muted-foreground hover:text-foreground transition-colors"><SkipBack size={14} /></button>
        <span className="text-xs text-muted-foreground font-mono">⏱️ {formatTime(currentTime)} / {formatTime(videoDuration)}</span>

        <div className="mr-auto">
          <button
            onClick={executeMontage}
            disabled={isProcessing || !videoSource}
            className="px-6 py-1.5 rounded-lg gold-gradient text-primary-foreground font-bold text-sm gold-glow hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isProcessing ? '⏳ جاري المعالجة...' : cinematicMode ? '🎥 مونتاج سينمائي' : '🎬 تنفيذ المونتاج'}
          </button>
        </div>
      </div>
    </div>
  );
};