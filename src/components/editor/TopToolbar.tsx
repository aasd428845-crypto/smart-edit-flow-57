import { useState } from 'react';
import { Scissors, RotateCw, Type, Image, LayoutTemplate, Save, Settings, Shield, Sparkles } from 'lucide-react';
import { useEditorStore, getEdgeFunctionUrl, defaultTemplates } from '@/store/editorStore';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const contentTypes = [
  { value: 'conference', label: 'مؤتمر' },
  { value: 'ad', label: 'إعلان' },
  { value: 'wedding', label: 'زفاف' },
  { value: 'social_media', label: 'تيك توك' },
  { value: 'documentary', label: 'وثائقي' },
  { value: 'default', label: 'عام' },
];

export const TopToolbar = () => {
  const navigate = useNavigate();
  const {
    contentType, setContentType, videoSource, projectId, currentTime,
    selectedTemplate, isProcessing, setIsProcessing, addMessage,
    cinematicMode, setCinematicMode, sourceType,
  } = useEditorStore();

  const [cutModal, setCutModal] = useState(false);
  const [cutFrom, setCutFrom] = useState('');
  const [cutTo, setCutTo] = useState('');
  const [rotateOpen, setRotateOpen] = useState(false);
  const [textModal, setTextModal] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [textTime, setTextTime] = useState('');

  const isAdmin = localStorage.getItem('isAdmin') === 'true';

  const sendCommand = async (command: string) => {
    if (!videoSource) {
      toast.error('ارفع فيديو أولاً!');
      return;
    }
    setIsProcessing(true);
    addMessage({ type: 'user', text: command });

    try {
      const res = await fetch(`${getBackendUrl()}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_source: videoSource,
          source_type: sourceType,
          command,
          current_time: currentTime,
          project_id: projectId || crypto.randomUUID(),
          template_id: selectedTemplate?.id || null,
          content_type: contentType || 'default',
          cinematic: cinematicMode,
        }),
      });
      if (!res.ok) throw new Error('فشل الاتصال بالخادم');
      const data = await res.json();
      addMessage({ type: 'ai', text: `✅ ${data.message || 'تم إرسال الأمر'}`, status: 'processing' });
      toast.success('تم إرسال الأمر');
    } catch (err: any) {
      addMessage({ type: 'error', text: `⚠️ السيرفر المحلي غير متاح. تأكد من تشغيل: uvicorn main:app` });
      toast.error('فشل الاتصال بالسيرفر المحلي');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCut = () => {
    if (cutFrom && cutTo) {
      sendCommand(`قص من ${cutFrom} إلى ${cutTo}`);
      setCutModal(false);
      setCutFrom('');
      setCutTo('');
    }
  };

  const handleRotate = (deg: number) => {
    sendCommand(`تدوير ${deg} درجة`);
    setRotateOpen(false);
  };

  const handleText = () => {
    if (textContent) {
      sendCommand(`أضف نص "${textContent}" عند الثانية ${textTime || currentTime.toFixed(1)}`);
      setTextModal(false);
      setTextContent('');
      setTextTime('');
    }
  };

  const handleLogoUpload = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('asset_type', 'logo');
    try {
      await fetch(`${getBackendUrl()}/upload_asset`, { method: 'POST', body: form });
      toast.success('✅ تم رفع الشعار');
    } catch {
      toast.error('فشل رفع الشعار');
    }
  };

  return (
    <>
      <div className="h-14 flex items-center justify-between px-4 bg-secondary border-b border-gold-dim/30">
        {/* Right: Logo */}
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎬</span>
          <span className="font-bold text-primary text-lg">مونتاجي</span>
        </div>

        {/* Center: Tools */}
        <div className="flex items-center gap-1">
          {/* Cut */}
          <button onClick={() => setCutModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-secondary-foreground hover:border-gold-dim hover:text-gold-light transition-all text-sm">
            <Scissors size={16} />
            <span className="hidden lg:inline">قص</span>
          </button>

          {/* Rotate */}
          <div className="relative">
            <button onClick={() => setRotateOpen(!rotateOpen)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-secondary-foreground hover:border-gold-dim hover:text-gold-light transition-all text-sm">
              <RotateCw size={16} />
              <span className="hidden lg:inline">تدوير</span>
            </button>
            {rotateOpen && (
              <div className="absolute top-full mt-1 right-0 bg-card border border-border rounded-lg shadow-lg z-50 py-1 min-w-[120px]">
                {[90, 180, 270].map(deg => (
                  <button key={deg} onClick={() => handleRotate(deg)} className="w-full px-4 py-2 text-sm text-foreground hover:bg-muted text-right">{deg}°</button>
                ))}
              </div>
            )}
          </div>

          {/* Text */}
          <button onClick={() => setTextModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-secondary-foreground hover:border-gold-dim hover:text-gold-light transition-all text-sm">
            <Type size={16} />
            <span className="hidden lg:inline">نص</span>
          </button>

          {/* Logo */}
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-secondary-foreground hover:border-gold-dim hover:text-gold-light transition-all text-sm cursor-pointer">
            <Image size={16} />
            <span className="hidden lg:inline">شعار</span>
            <input type="file" accept=".png,.jpg,.svg" className="hidden" onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
          </label>

          {/* Template toggle */}
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-secondary-foreground hover:border-gold-dim hover:text-gold-light transition-all text-sm">
            <LayoutTemplate size={16} />
            <span className="hidden lg:inline">قالب</span>
          </button>

          <div className="w-px h-6 bg-border mx-2" />

          {/* Cinematic toggle */}
          <button
            onClick={() => setCinematicMode(!cinematicMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all ${
              cinematicMode
                ? 'gold-gradient text-primary-foreground font-bold border-transparent gold-glow'
                : 'bg-card border-border text-secondary-foreground hover:border-gold-dim'
            }`}
          >
            <Sparkles size={16} />
            <span className="hidden lg:inline">سينمائي</span>
          </button>

          <div className="w-px h-6 bg-border mx-2" />

          {/* Content Type */}
          <select
            value={contentType || ''}
            onChange={(e) => setContentType(e.target.value || null)}
            className="px-3 py-1.5 rounded-lg bg-card border border-border text-secondary-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">نوع المحتوى</option>
            {contentTypes.map((ct) => (
              <option key={ct.value} value={ct.value}>{ct.label}</option>
            ))}
          </select>
        </div>

        {/* Left: Settings + Admin + Save */}
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/settings')} className="p-2 rounded-lg bg-card border border-border text-secondary-foreground hover:border-gold-dim hover:text-gold-light transition-all" title="إعدادات">
            <Settings size={18} />
          </button>
          {isAdmin && (
            <button onClick={() => navigate('/admin')} className="p-2 rounded-lg bg-card border border-border text-secondary-foreground hover:border-gold-dim hover:text-gold-light transition-all" title="لوحة المشرف">
              <Shield size={18} />
            </button>
          )}
          <button className="p-2 rounded-lg bg-card border border-border text-secondary-foreground hover:border-gold-dim hover:text-gold-light transition-all" title="حفظ">
            <Save size={18} />
          </button>
        </div>
      </div>

      {/* Cut Modal */}
      {cutModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setCutModal(false)}>
          <div className="bg-card border border-border rounded-xl p-6 w-80 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-foreground font-bold text-lg">✂️ قص الفيديو</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">من (ثواني)</label>
                <input type="number" value={cutFrom} onChange={e => setCutFrom(e.target.value)} className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder="0" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">إلى (ثواني)</label>
                <input type="number" value={cutTo} onChange={e => setCutTo(e.target.value)} className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder="30" />
              </div>
            </div>
            <button onClick={handleCut} className="w-full py-2.5 rounded-lg gold-gradient text-primary-foreground font-bold text-sm">تنفيذ القص</button>
          </div>
        </div>
      )}

      {/* Text Modal */}
      {textModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setTextModal(false)}>
          <div className="bg-card border border-border rounded-xl p-6 w-80 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-foreground font-bold text-lg">📝 إضافة نص</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">النص</label>
                <input type="text" value={textContent} onChange={e => setTextContent(e.target.value)} className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder="أدخل النص هنا..." />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">عند الثانية</label>
                <input type="number" value={textTime} onChange={e => setTextTime(e.target.value)} className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder={currentTime.toFixed(1)} />
              </div>
            </div>
            <button onClick={handleText} className="w-full py-2.5 rounded-lg gold-gradient text-primary-foreground font-bold text-sm">إضافة النص</button>
          </div>
        </div>
      )}
    </>
  );
};