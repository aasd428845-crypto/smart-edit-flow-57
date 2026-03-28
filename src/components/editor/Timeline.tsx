import { useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Music, Film, FileText } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';

export const Timeline = () => {
  const { currentTime, setCurrentTime, videoDuration, isPlaying, setIsPlaying } = useEditorStore();
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
    // RTL: right is start
    const clickX = rect.right - e.clientX;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    setCurrentTime(ratio * videoDuration);
  };

  const timeMarkers = [];
  if (videoDuration > 0) {
    const step = Math.max(30, Math.floor(videoDuration / 6));
    for (let t = 0; t <= videoDuration; t += step) {
      timeMarkers.push(t);
    }
  }

  return (
    <div className="h-[120px] bg-secondary border-t border-border px-4 py-2 flex flex-col">
      {/* Time markers */}
      <div className="flex justify-between text-[10px] text-muted-foreground mb-1 font-mono">
        {timeMarkers.map((t) => (
          <span key={t}>{formatTime(t)}</span>
        ))}
      </div>

      {/* Tracks */}
      <div
        ref={trackRef}
        onClick={handleSeek}
        className="flex-1 relative cursor-pointer space-y-1"
      >
        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 transition-all"
          style={{ right: `${progress}%` }}
        >
          <div className="w-2 h-2 bg-red-500 rounded-full -translate-x-[3px] -translate-y-1" />
        </div>

        {/* Audio track */}
        <div className="flex items-center gap-2 h-6">
          <Music size={12} className="text-muted-foreground shrink-0" />
          <div className="flex-1 h-full bg-processing/50 rounded-sm" />
        </div>
        {/* Video track */}
        <div className="flex items-center gap-2 h-6">
          <Film size={12} className="text-muted-foreground shrink-0" />
          <div className="flex-1 h-full bg-gold-dim/50 rounded-sm" />
        </div>
        {/* Text track */}
        <div className="flex items-center gap-2 h-6">
          <FileText size={12} className="text-muted-foreground shrink-0" />
          <div className="flex-1 h-full flex gap-2">
            <div className="w-1/4 h-full bg-success/30 rounded-sm" />
            <div className="w-1/6 h-full bg-success/30 rounded-sm" />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mt-1">
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <SkipForward size={14} />
        </button>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="text-foreground hover:text-primary transition-colors"
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <SkipBack size={14} />
        </button>
        <span className="text-xs text-muted-foreground font-mono mr-auto">
          ⏱️ {formatTime(currentTime)} / {formatTime(videoDuration)}
        </span>
      </div>
    </div>
  );
};
