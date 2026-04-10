import { Pause, Play, X, RefreshCw, Upload } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useEditorStore, type UploadStatusType } from '@/store/editorStore';

const formatSpeed = (bytesPerSec: number) => {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
};

const formatEta = (seconds: number) => {
  if (seconds <= 0 || !isFinite(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const statusLabel: Record<UploadStatusType, string> = {
  idle: '',
  uploading: '⬆️ جارٍ الرفع...',
  paused: '⏸️ متوقف مؤقتاً',
  retrying: '🔄 جارٍ إعادة المحاولة...',
  completed: '✅ تم الرفع بنجاح!',
  failed: '❌ فشل الرفع',
  cancelled: '🚫 تم الإلغاء',
};

interface UploadProgressProps {
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

export const UploadProgress = ({ onPause, onResume, onCancel }: UploadProgressProps) => {
  const { uploadProgress, uploadSpeed, uploadEta, uploadStatus } = useEditorStore();

  if (uploadStatus === 'idle' || uploadStatus === 'completed') return null;

  return (
    <div className="w-full max-w-md mx-auto mt-4 bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{statusLabel[uploadStatus]}</span>
        <span className="text-xs text-muted-foreground font-mono">{uploadProgress}%</span>
      </div>

      <Progress value={uploadProgress} className="h-2.5" />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>⚡ {formatSpeed(uploadSpeed)}</span>
        <span>⏱️ {formatEta(uploadEta)}</span>
      </div>

      <div className="flex justify-center gap-3">
        {uploadStatus === 'uploading' && (
          <button onClick={onPause} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-sm text-foreground transition-colors">
            <Pause size={14} /> إيقاف
          </button>
        )}
        {uploadStatus === 'paused' && (
          <button onClick={onResume} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg gold-gradient text-primary-foreground text-sm font-bold transition-opacity hover:opacity-90">
            <Play size={14} /> استئناف
          </button>
        )}
        {(uploadStatus === 'uploading' || uploadStatus === 'paused' || uploadStatus === 'retrying') && (
          <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/20 hover:bg-destructive/30 text-destructive text-sm transition-colors">
            <X size={14} /> إلغاء
          </button>
        )}
      </div>
    </div>
  );
};
