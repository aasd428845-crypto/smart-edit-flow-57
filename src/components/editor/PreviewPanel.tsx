import { useRef, useState } from 'react';
import { Play, Pause, Download, Upload, Check, RotateCcw, Maximize, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useEditorStore } from '@/store/editorStore';
import { UploadManager } from '@/lib/upload-manager';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PreviewPanelProps {
  previewUrl: string;
  fullQualityUrl: string;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
}

export const PreviewPanel = ({ previewUrl, fullQualityUrl, onApprove, onReject, onClose }: PreviewPanelProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [exportMode, setExportMode] = useState<'idle' | 'downloading' | 'uploading' | 'done'>('idle');
  const [exportProgress, setExportProgress] = useState(0);
  const { projectId, addMessage } = useEditorStore();

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.pause();
    else videoRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const handleDownload = async () => {
    setExportMode('downloading');
    setExportProgress(0);
    try {
      const res = await fetch(fullQualityUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `montaji_export_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportProgress(100);
      setExportMode('done');
      toast.success('✅ تم تحميل الفيديو بنجاح');
      addMessage({ type: 'ai', text: '✅ تم تحميل الفيديو إلى جهازك بنجاح!' });
    } catch (err: any) {
      toast.error('فشل التحميل');
      setExportMode('idle');
    }
  };

  const handleUploadToVimeo = async () => {
    setExportMode('uploading');
    setExportProgress(0);

    try {
      // Fetch the full quality video as a File
      const res = await fetch(fullQualityUrl);
      const blob = await res.blob();
      const file = new File([blob], `montaji_${Date.now()}.mp4`, { type: 'video/mp4' });

      // Get TUS ticket from Vimeo
      const { data, error } = await supabase.functions.invoke('create-vimeo-ticket', {
        body: { file_size: file.size, project_id: projectId || 'export', file_name: file.name },
      });

      if (error || !data?.upload_link) {
        throw new Error('فشل الحصول على رابط الرفع من Vimeo');
      }

      const manager = new UploadManager(
        {
          onProgress: (p) => setExportProgress(p.percent),
          onSuccess: (videoUrl) => {
            setExportMode('done');
            setExportProgress(100);
            toast.success('✅ تم الرفع إلى Vimeo بنجاح!');
            addMessage({ type: 'ai', text: `✅ تم رفع الفيديو إلى Vimeo!\n🔗 الرابط: ${videoUrl}` });
          },
          onError: (err) => {
            toast.error('فشل الرفع إلى Vimeo');
            setExportMode('idle');
          },
          onStatusChange: () => {},
        },
        data.video_url,
      );

      manager.startUpload(file, data.upload_link);
    } catch (err: any) {
      toast.error(err.message || 'فشل الرفع');
      setExportMode('idle');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-foreground font-bold text-base flex items-center gap-2">
          👁️ معاينة النتيجة
        </h2>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Video preview */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden group">
        <div className="absolute top-3 left-3 z-10 bg-accent/80 text-accent-foreground px-2 py-0.5 rounded text-xs font-bold">
          معاينة 480p
        </div>

        <video
          ref={videoRef}
          src={previewUrl}
          className="max-w-full max-h-full object-contain"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => setIsPlaying(false)}
        />

        {/* Controls overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-3">
          <button onClick={togglePlay} className="text-foreground hover:text-primary transition-colors">
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <span className="text-foreground text-xs font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
          <input
            type="range" min={0} max={duration || 100} value={currentTime}
            onChange={(e) => { const t = parseFloat(e.target.value); setCurrentTime(t); if (videoRef.current) videoRef.current.currentTime = t; }}
            className="flex-1 h-1 accent-primary"
          />
          <button onClick={() => videoRef.current?.requestFullscreen()} className="text-foreground hover:text-primary transition-colors">
            <Maximize size={16} />
          </button>
        </div>
      </div>

      {/* Export progress */}
      {exportMode !== 'idle' && exportMode !== 'done' && (
        <div className="px-4 py-2">
          <Progress value={exportProgress} className="h-2" />
          <p className="text-xs text-muted-foreground text-center mt-1">
            {exportMode === 'downloading' ? 'جارٍ التحميل...' : 'جارٍ الرفع إلى Vimeo...'}
            {' '}{exportProgress}%
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="p-4 border-t border-border space-y-3">
        {/* Approve / Reject */}
        <div className="flex gap-2">
          <button onClick={onApprove} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl gold-gradient text-primary-foreground font-bold text-sm hover:opacity-90 transition-all">
            <Check size={18} /> ✅ موافق — صدّر النسخة النهائية
          </button>
          <button onClick={onReject} className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-muted border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 text-sm transition-all">
            <RotateCcw size={16} /> تعديل
          </button>
        </div>

        {/* Export options */}
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            disabled={exportMode === 'downloading' || exportMode === 'uploading'}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm font-medium hover:bg-muted transition-all disabled:opacity-50"
          >
            <Download size={16} /> تحميل إلى الجهاز
          </button>
          <button
            onClick={handleUploadToVimeo}
            disabled={exportMode === 'downloading' || exportMode === 'uploading'}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[hsl(var(--accent))] text-accent-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
          >
            <Upload size={16} /> رفع إلى Vimeo
          </button>
        </div>
      </div>
    </div>
  );
};
