import { useRef, useState } from 'react';
import { Play, Pause, Download, Upload, Check, RotateCcw, Maximize, X, Loader2, ExternalLink } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useEditorStore } from '@/store/editorStore';
import { downloadVideo, uploadToVimeo, type ExportStatus } from '@/lib/export-service';
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
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle');
  const [exportProgress, setExportProgress] = useState(0);
  const [vimeoLink, setVimeoLink] = useState<string | null>(null);
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

  const isExporting = exportStatus === 'downloading' || exportStatus === 'uploading' || exportStatus === 'preparing';

  const handleDownload = () => {
    downloadVideo(fullQualityUrl, {
      onProgress: setExportProgress,
      onStatusChange: setExportStatus,
      onSuccess: () => {
        toast.success('✅ تم تحميل الفيديو بنجاح');
        addMessage({ type: 'ai', text: '✅ تم تحميل الفيديو إلى جهازك بنجاح!' });
      },
      onError: (err) => {
        toast.error(err);
        addMessage({ type: 'error', text: err });
      },
    });
  };

  const handleUploadToVimeo = () => {
    uploadToVimeo(fullQualityUrl, projectId, {
      onProgress: setExportProgress,
      onStatusChange: setExportStatus,
      onSuccess: ({ url }) => {
        setVimeoLink(url || null);
        toast.success('✅ تم الرفع إلى Vimeo بنجاح!');
        addMessage({ type: 'ai', text: `✅ تم رفع الفيديو إلى Vimeo!\n🔗 الرابط: ${url}` });
      },
      onError: (err) => {
        toast.error(err);
        addMessage({ type: 'error', text: err });
      },
    });
  };

  const statusLabel: Record<ExportStatus, string> = {
    idle: '',
    preparing: '⏳ جارٍ التجهيز...',
    downloading: '⬇️ جارٍ التحميل...',
    uploading: '⬆️ جارٍ الرفع إلى Vimeo...',
    completed: '✅ تم بنجاح!',
    failed: '❌ فشلت العملية',
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur flex flex-col safe-area-all">
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
          playsInline
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
      {isExporting && (
        <div className="px-4 py-3 border-t border-border bg-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-foreground flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-primary" />
              {statusLabel[exportStatus]}
            </span>
            <span className="text-xs text-muted-foreground font-mono">{exportProgress}%</span>
          </div>
          <Progress value={exportProgress} className="h-2" />
        </div>
      )}

      {/* Vimeo link result */}
      {vimeoLink && (
        <div className="px-4 py-3 bg-accent/10 border-t border-border flex items-center justify-between">
          <span className="text-sm text-foreground flex items-center gap-2">
            🔗 <span className="font-mono text-xs truncate max-w-[200px]">{vimeoLink}</span>
          </span>
          <a href={vimeoLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary text-sm hover:underline">
            فتح <ExternalLink size={14} />
          </a>
        </div>
      )}

      {/* Action buttons */}
      <div className="p-4 border-t border-border space-y-3 safe-area-bottom">
        {/* Approve / Reject */}
        <div className="flex gap-2">
          <button onClick={onApprove} disabled={isExporting} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl gold-gradient text-primary-foreground font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50">
            <Check size={18} /> موافق — صدّر النهائي
          </button>
          <button onClick={onReject} disabled={isExporting} className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-muted border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 text-sm transition-all disabled:opacity-50">
            <RotateCcw size={16} /> تعديل
          </button>
        </div>

        {/* Export options */}
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            disabled={isExporting}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary border border-border text-foreground text-sm font-medium hover:bg-muted transition-all disabled:opacity-50"
          >
            <Download size={16} /> تحميل إلى الجهاز
          </button>
          <button
            onClick={handleUploadToVimeo}
            disabled={isExporting}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
          >
            <Upload size={16} /> رفع إلى Vimeo
          </button>
        </div>
      </div>
    </div>
  );
};
