import { useRef, useState, useCallback } from 'react';
import { Upload, Film, Play, Pause, Volume2, Maximize, FolderOpen, Link, Loader2 } from 'lucide-react';
import { useEditorStore, getLocalApiUrl } from '@/store/editorStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { UploadProgress } from './UploadProgress';

type SourceTab = 'upload' | 'local' | 'url';

let activeUpload: XMLHttpRequest | null = null;

export const VideoPreview = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    videoUrl, setVideoFile, setVideoUrl, setVideoDuration, setVideoSource,
    currentTime, setCurrentTime, isPlaying, setIsPlaying,
    setProjectId, isUploading, setIsUploading, addMessage, videoDuration,
    setUploadProgress, setUploadSpeed, setUploadEta, setUploadStatus, uploadStatus,
  } = useEditorStore();

  const [isDragOver, setIsDragOver] = useState(false);
  const [sourceTab, setSourceTab] = useState<SourceTab>('upload');
  const [localPath, setLocalPath] = useState('');
  const [urlInput, setUrlInput] = useState('');

  const createProject = async () => {
    const { data, error } = await supabase
      .from('projects')
      .insert({ status: 'pending' })
      .select()
      .single();
    if (error) {
      toast.error('فشل إنشاء المشروع');
      return null;
    }
    setProjectId(data.id);
    return data.id;
  };

  const uploadToLocalServer = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);

      const xhr = new XMLHttpRequest();
      activeUpload = xhr;
      xhr.open('POST', getLocalApiUrl('/api/upload'));

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.url) resolve(data.url);
            else reject(new Error('استجابة غير صالحة من السيرفر'));
          } catch {
            reject(new Error('استجابة غير صالحة من السيرفر'));
          }
        } else {
          reject(new Error(`فشل الرفع (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error('فشل الاتصال بالسيرفر المحلي'));
      xhr.ontimeout = () => reject(new Error('انتهت مهلة الرفع'));

      xhr.send(form);
    });
  };

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('video/')) {
      toast.error('الملف يجب أن يكون فيديو (mp4, mov)');
      return;
    }

    setVideoFile(file);
    const localUrl = URL.createObjectURL(file);
    setVideoUrl(localUrl);
    setVideoSource(localUrl, 'blob');

    const pid = await createProject();
    if (!pid) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadSpeed(0);
    setUploadEta(0);
    setUploadStatus('uploading');
    addMessage({ type: 'status', text: '⬆️ جارٍ رفع الفيديو إلى السيرفر المحلي...' });

    try {
      const uploadedUrl = await uploadToLocalServer(file);
      setVideoUrl(uploadedUrl);
      setVideoSource(uploadedUrl, 'remote');
      setUploadStatus('completed');
      setIsUploading(false);
      addMessage({ type: 'ai', text: '✅ تم رفع الفيديو إلى السيرفر المحلي! يمكنك الآن كتابة أمر المونتاج.' });
      toast.success('تم رفع الفيديو بنجاح');
    } catch (err: any) {
      setUploadStatus('failed');
      setIsUploading(false);
      addMessage({ type: 'error', text: `❌ فشل الرفع: ${err?.message || 'خطأ غير معروف'}. سيتم العمل على الفيديو محلياً في المتصفح.` });
      toast.error('فشل الرفع — سيتم العمل على الفيديو محلياً');
    } finally {
      activeUpload = null;
    }
  }, []);

  const handlePause = () => {
    activeUpload?.abort();
    activeUpload = null;
    setUploadStatus('paused');
    toast.info('⏸️ تم إيقاف الرفع مؤقتاً');
  };

  const handleResume = () => {
    setUploadStatus('uploading');
    toast.info('🔄 سيتم إعادة المحاولة');
  };

  const handleCancel = () => {
    activeUpload?.abort();
    activeUpload = null;
    setIsUploading(false);
    setUploadStatus('cancelled');
    setUploadProgress(0);
    toast.info('تم إلغاء الرفع');
  };

  const handleLocalPath = async () => {
    if (!localPath.trim()) return;
    setVideoSource(localPath, 'local');
    await createProject();
    toast.success('✅ تم تسجيل المسار المحلي');
    addMessage({ type: 'ai', text: `✅ ملف محلي مسجّل: ${localPath}` });
  };

  const handleUrlSubmit = async () => {
    if (!urlInput.trim()) return;
    setVideoSource(urlInput, 'remote');
    setVideoUrl(urlInput);
    await createProject();
    toast.success('✅ تم تحميل الرابط');
    addMessage({ type: 'ai', text: `✅ تم ربط الفيديو: ${urlInput}` });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

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

  const showUploadZone = !videoUrl;
  const showProgress = isUploading || (uploadStatus !== 'idle' && uploadStatus !== 'completed');

  if (showUploadZone) {
    const tabs: { id: SourceTab; label: string; icon: React.ReactNode }[] = [
      { id: 'upload', label: 'رفع ملف', icon: <Upload size={16} /> },
      { id: 'url', label: 'رابط URL', icon: <Link size={16} /> },
      { id: 'local', label: 'مسار محلي', icon: <FolderOpen size={16} /> },
    ];

    return (
      <div
        className={`flex flex-col items-center justify-center h-full bg-card border border-border transition-all ${isDragOver ? 'border-primary border-2 border-dashed' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <Film size={56} className="text-gold-dim mb-4" />
        <p className="text-foreground text-lg mb-1 font-bold">ارفع فيديو لبدء المونتاج</p>
        <p className="text-muted-foreground text-sm mb-5">اسحب وأفلت أو اختر مصدراً</p>

        <div className="flex gap-2 mb-4">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setSourceTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-all ${
                sourceTab === t.id ? 'gold-gradient text-primary-foreground font-bold' : 'bg-muted text-muted-foreground border border-border hover:border-gold-dim'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {sourceTab === 'upload' && !showProgress && (
          <label className="px-6 py-2.5 rounded-lg gold-gradient text-primary-foreground font-bold cursor-pointer hover:opacity-90 transition-all">
            <Upload size={16} className="inline ml-2" />
            ارفع فيديو
            <input type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </label>
        )}

        {sourceTab === 'local' && (
          <div className="flex gap-2 w-80">
            <input value={localPath} onChange={e => setLocalPath(e.target.value)} placeholder="/path/to/video.mp4" className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring text-left dir-ltr" dir="ltr" />
            <button onClick={handleLocalPath} className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold text-sm">تحقق</button>
          </div>
        )}

        {sourceTab === 'url' && (
          <div className="flex gap-2 w-80">
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://example.com/video.mp4" className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring text-left" dir="ltr" />
            <button onClick={handleUrlSubmit} className="px-4 py-2 rounded-lg gold-gradient text-primary-foreground font-bold text-sm">تحميل</button>
          </div>
        )}

        {showProgress && (
          <UploadProgress onPause={handlePause} onResume={handleResume} onCancel={handleCancel} />
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full bg-black group">
      <div className="absolute top-3 left-3 z-10 bg-destructive/80 text-foreground px-2 py-0.5 rounded text-xs font-mono">
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

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-3">
        <button onClick={togglePlay} className="text-foreground hover:text-primary transition-colors">
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <span className="text-foreground text-xs font-mono">{formatTime(currentTime)} / {formatTime(videoDuration)}</span>
        <input type="range" min={0} max={videoDuration || 100} value={currentTime} onChange={(e) => { const t = parseFloat(e.target.value); setCurrentTime(t); if (videoRef.current) videoRef.current.currentTime = t; }} className="flex-1 h-1 accent-primary" />
        <button className="text-foreground hover:text-primary transition-colors"><Volume2 size={16} /></button>
        <button onClick={() => videoRef.current?.requestFullscreen()} className="text-foreground hover:text-primary transition-colors"><Maximize size={16} /></button>
      </div>

      <div className="absolute top-3 right-3 z-10 bg-card/80 backdrop-blur px-3 py-1 rounded text-xs text-muted-foreground">
        ⏱️ المدة: {formatTime(videoDuration)}
      </div>

      {showProgress && (
        <div className="absolute bottom-16 left-4 right-4 z-10">
          <UploadProgress onPause={handlePause} onResume={handleResume} onCancel={handleCancel} />
        </div>
      )}
    </div>
  );
};
