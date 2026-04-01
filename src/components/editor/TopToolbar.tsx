import { useState } from 'react';
import { Scissors, RotateCw, Type, Image, LayoutTemplate, Save, Settings, Shield, Sparkles, Menu, X } from 'lucide-react';
import { useEditorStore, getEdgeFunctionUrl, getLocalBackendUrl, defaultTemplates } from '@/store/editorStore';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';

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
  const isMobile = useIsMobile();
  const {
    contentType, setContentType, videoSource, projectId, currentTime,
    selectedTemplate, isProcessing, setIsProcessing, addMessage,
    cinematicMode, setCinematicMode, sourceType, selectedAgent,
  } = useEditorStore();

  const [menuOpen, setMenuOpen] = useState(false);
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
      // Try local backend first
      const res = await fetch(`${getLocalBackendUrl()}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          video_source: videoSource,
          project_id: projectId || crypto.randomUUID(),
          current_time: currentTime,
          content_type: contentType || 'default',
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        addMessage({
          type: 'execution_result', text: data.message, action: data.action,
          outputUrl: data.output_url, diffLog: data.diff_log,
          nextSteps: data.next_steps, missingAssets: data.missing_assets,
        });
        toast.success(`✅ ${data.action} - تم!`);
      } else {
        addMessage({ type: 'ai', text: data.message || 'تم إرسال الأمر', status: 'processing' });
      }
    } catch {
      // Fallback to cloud
      try {
        const res = await fetch(getEdgeFunctionUrl('chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: command, agent: selectedAgent,
            conversation_history: [],
            project_context: { video_source: videoSource, source_type: sourceType, current_time: currentTime, project_id: projectId, template_id: selectedTemplate?.id, content_type: contentType, cinematic: cinematicMode },
          }),
        });
        const data = await res.json();
        addMessage({ type: 'ai', text: `✅ ${data.reply || 'تم إرسال الأمر'}`, status: 'processing' });
      } catch {
        addMessage({ type: 'error', text: '⚠️ فشل الاتصال بالخادم' });
      }
    } finally {
      setIsProcessing(false);
      setMenuOpen(false);
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

  const toolButtons = (
    <>
      <button onClick={() => { setCutModal(true); setMenuOpen(false); }} className="flex items-center gap-2 px-4 py-3 md:px-3 md:py-1.5 rounded-lg bg-card border border-border text-secondary-foreground hover:border-gold-dim hover:text-gold-light transition-all text-sm w-full md:w-auto">
        <Scissors size={18} />
        <span>قص</span>
      </button>

      <div className="relative w-full md:w-auto">
        <button onClick={() => setRotateOpen(!rotateOpen)} className="flex items-center gap-2 px-4 py-3 md:px-3 md:py-1.5 rounded-lg bg-card border border-border text-secondary-foreground hover:border-gold-dim hover:text-gold-light transition-all text-sm w-full md:w-auto">
          <RotateCw size={18} />
          <span>تدوير</span>
        </button>
        {rotateOpen && (
          <div className="absolute top-full mt-1 right-0 bg-card border border-border rounded-lg shadow-lg z-50 py-1 min-w-[120px]">
            {[90, 180, 270].map(deg => (
              <button key={deg} onClick={() => handleRotate(deg)} className="w-full px-4 py-3 md:py-2 text-sm text-foreground hover:bg-muted text-right">{deg}°</button>
            ))}
          </div>
        )}
      </div>

      <button onClick={() => { setTextModal(true); setMenuOpen(false); }} className="flex items-center gap-2 px-4 py-3 md:px-3 md:py-1.5 rounded-lg bg-card border border-border text-secondary-foreground hover:border-gold-dim hover:text-gold-light transition-all text-sm w-full md:w-auto">
        <Type size={18} />
        <span>نص</span>
      </button>

      <button
        onClick={() => { setCinematicMode(!cinematicMode); setMenuOpen(false); }}
        className={`flex items-center gap-2 px-4 py-3 md:px-3 md:py-1.5 rounded-lg border text-sm transition-all w-full md:w-auto ${
          cinematicMode ? 'gold-gradient text-primary-foreground font-bold border-transparent gold-glow' : 'bg-card border-border text-secondary-foreground hover:border-gold-dim'
        }`}
      >
        <Sparkles size={18} />
        <span>سينمائي</span>
      </button>

      <select
        value={contentType || ''}
        onChange={(e) => { setContentType(e.target.value || null); setMenuOpen(false); }}
        className="px-4 py-3 md:px-3 md:py-1.5 rounded-lg bg-card border border-border text-secondary-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring w-full md:w-auto"
      >
        <option value="">نوع المحتوى</option>
        {contentTypes.map((ct) => (
          <option key={ct.value} value={ct.value}>{ct.label}</option>
        ))}
      </select>
    </>
  );

  return (
    <>
      <div className="h-14 flex items-center justify-between px-3 md:px-4 bg-secondary border-b border-gold-dim/30">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎬</span>
          <span className="font-bold text-primary text-lg">مونتاجي</span>
        </div>

        {/* Desktop tools */}
        {!isMobile && (
          <div className="flex items-center gap-1">
            {toolButtons}
          </div>
        )}

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {isMobile && (
            <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 rounded-lg bg-card border border-border text-secondary-foreground">
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          )}
          <button onClick={() => navigate('/settings')} className="p-2 rounded-lg bg-card border border-border text-secondary-foreground hover:border-gold-dim hover:text-gold-light transition-all">
            <Settings size={18} />
          </button>
          {isAdmin && !isMobile && (
            <button onClick={() => navigate('/admin')} className="p-2 rounded-lg bg-card border border-border text-secondary-foreground hover:border-gold-dim hover:text-gold-light transition-all">
              <Shield size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {isMobile && menuOpen && (
        <div className="absolute top-14 left-0 right-0 z-50 bg-card border-b border-border p-3 space-y-2 shadow-lg animate-fade-in-up">
          {toolButtons}
        </div>
      )}

      {/* Cut Modal */}
      {cutModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setCutModal(false)}>
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-foreground font-bold text-lg">✂️ قص الفيديو</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">من (ثواني)</label>
                <input type="number" value={cutFrom} onChange={e => setCutFrom(e.target.value)} className="w-full bg-muted rounded-lg px-3 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder="0" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">إلى (ثواني)</label>
                <input type="number" value={cutTo} onChange={e => setCutTo(e.target.value)} className="w-full bg-muted rounded-lg px-3 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder="30" />
              </div>
            </div>
            <button onClick={handleCut} className="w-full py-3 rounded-lg gold-gradient text-primary-foreground font-bold text-sm">تنفيذ القص</button>
          </div>
        </div>
      )}

      {/* Text Modal */}
      {textModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setTextModal(false)}>
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-foreground font-bold text-lg">📝 إضافة نص</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">النص</label>
                <input type="text" value={textContent} onChange={e => setTextContent(e.target.value)} className="w-full bg-muted rounded-lg px-3 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder="أدخل النص هنا..." />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">عند الثانية</label>
                <input type="number" value={textTime} onChange={e => setTextTime(e.target.value)} className="w-full bg-muted rounded-lg px-3 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder={currentTime.toFixed(1)} />
              </div>
            </div>
            <button onClick={handleText} className="w-full py-3 rounded-lg gold-gradient text-primary-foreground font-bold text-sm">إضافة النص</button>
          </div>
        </div>
      )}
    </>
  );
};
