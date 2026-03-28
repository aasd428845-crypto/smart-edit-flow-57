import { Scissors, RotateCw, Palette, Type, Image, LayoutTemplate, Save } from 'lucide-react';
import { useEditorStore, defaultTemplates } from '@/store/editorStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const contentTypes = [
  { value: 'conference', label: 'مؤتمر' },
  { value: 'ad', label: 'إعلان' },
  { value: 'wedding', label: 'زفاف' },
  { value: 'social_media', label: 'تيك توك' },
  { value: 'documentary', label: 'وثائقي' },
];

export const TopToolbar = () => {
  const {
    contentType, setContentType, videoUrl, projectId, currentTime,
    selectedTemplate, isProcessing, setIsProcessing, addMessage, setProjectStatus,
  } = useEditorStore();

  const handleExecute = async () => {
    if (!projectId || !videoUrl) {
      toast.error('يجب رفع فيديو أولاً');
      return;
    }
    setIsProcessing(true);
    addMessage({ type: 'ai', text: 'بدأت المعالجة...', status: 'processing' });

    try {
      const response = await fetch('http://localhost:8000/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url: videoUrl,
          command: 'full_pipeline',
          current_time: currentTime,
          project_id: projectId,
          template_id: selectedTemplate?.id || null,
          content_type: contentType || null,
        }),
      });
      if (!response.ok) throw new Error('فشل الاتصال بالخادم');
      toast.success('تم إرسال طلب المعالجة');
    } catch (err: any) {
      addMessage({ type: 'error', text: `خطأ: ${err.message}` });
      toast.error('فشل الاتصال بخادم المعالجة');
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-14 flex items-center justify-between px-4 bg-secondary border-b border-gold-dim/30">
      {/* Right: Logo */}
      <div className="flex items-center gap-2">
        <span className="text-primary font-bold text-lg animate-gold-pulse">✦</span>
        <span className="font-bold text-foreground text-lg">مونتاجي الذكي</span>
      </div>

      {/* Center: Tools */}
      <div className="flex items-center gap-1">
        {[
          { icon: Scissors, label: 'قص' },
          { icon: RotateCw, label: 'تدوير' },
          { icon: Palette, label: 'ألوان' },
          { icon: Type, label: 'نص' },
          { icon: Image, label: 'شعار' },
          { icon: LayoutTemplate, label: 'قالب' },
        ].map(({ icon: Icon, label }) => (
          <button
            key={label}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-secondary-foreground hover:border-gold-dim hover:text-gold-light transition-all text-sm"
          >
            <Icon size={16} />
            <span className="hidden lg:inline">{label}</span>
          </button>
        ))}

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

        {/* Execute */}
        <button
          onClick={handleExecute}
          disabled={isProcessing || !videoUrl}
          className="px-5 py-2 rounded-lg gold-gradient text-primary-foreground font-bold text-sm gold-glow hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isProcessing ? 'جارٍ المعالجة...' : 'تنفيذ المونتاج ●'}
        </button>
      </div>

      {/* Left: Save */}
      <button className="p-2 rounded-lg bg-card border border-border text-secondary-foreground hover:border-gold-dim hover:text-gold-light transition-all">
        <Save size={18} />
      </button>
    </div>
  );
};
