import { useState } from 'react';
import { TopToolbar } from '@/components/editor/TopToolbar';
import { VideoPreview } from '@/components/editor/VideoPreview';
import { AIChatPanel } from '@/components/editor/AIChatPanel';
import { Timeline } from '@/components/editor/Timeline';
import { TemplateGallery } from '@/components/editor/TemplateGallery';
import { PreviewPanel } from '@/components/editor/PreviewPanel';
import { useIsMobile } from '@/hooks/use-mobile';
import { useEditorStore } from '@/store/editorStore';
import { MessageSquare, Film, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';

type MobileTab = 'chat' | 'video' | 'templates';

const Index = () => {
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const { showPreview, previewUrl, fullQualityUrl, setShowPreview, setPreviewUrl, addMessage } = useEditorStore();

  const handleApprove = () => {
    toast.success('✅ تمت الموافقة — يمكنك الآن التصدير');
    addMessage({ type: 'ai', text: '✅ تمت الموافقة على المعاينة! استخدم أزرار التحميل أو الرفع للتصدير.' });
  };

  const handleReject = () => {
    setShowPreview(false);
    setPreviewUrl(null);
    toast.info('🔄 يمكنك طلب تعديلات إضافية من الدردشة');
    addMessage({ type: 'ai', text: '🔄 تم رفض المعاينة. اكتب التعديلات المطلوبة وسأنفذها فوراً!' });
  };

  const handleClosePreview = () => {
    setShowPreview(false);
  };

  if (isMobile) {
    return (
      <>
      {showPreview && previewUrl && fullQualityUrl && (
        <PreviewPanel previewUrl={previewUrl} fullQualityUrl={fullQualityUrl} onApprove={handleApprove} onReject={handleReject} onClose={handleClosePreview} />
      )}
      <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">
        {/* Compact toolbar */}
        <TopToolbar />

        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          {mobileTab === 'chat' && <AIChatPanel />}
          {mobileTab === 'video' && (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-hidden">
                <VideoPreview />
              </div>
              <Timeline />
            </div>
          )}
          {mobileTab === 'templates' && (
            <div className="h-full overflow-y-auto">
              <TemplateGallery />
            </div>
          )}
        </div>

        {/* Bottom tab bar */}
        <div className="flex items-center border-t border-border bg-secondary safe-area-bottom">
          {([
            { id: 'chat' as MobileTab, icon: MessageSquare, label: 'الدردشة' },
            { id: 'video' as MobileTab, icon: Film, label: 'الفيديو' },
            { id: 'templates' as MobileTab, icon: LayoutGrid, label: 'القوالب' },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
                mobileTab === tab.id ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <tab.icon size={22} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      {showPreview && previewUrl && fullQualityUrl && (
        <PreviewPanel previewUrl={previewUrl} fullQualityUrl={fullQualityUrl} onApprove={handleApprove} onReject={handleReject} onClose={handleClosePreview} />
      )}
      <div className="h-screen grid grid-rows-[56px_1fr_120px_180px] grid-cols-[1fr_380px] bg-background overflow-hidden">
        <div className="col-span-2">
          <TopToolbar />
        </div>
        <div className="overflow-hidden">
          <VideoPreview />
        </div>
        <div className="row-span-2 overflow-hidden">
          <AIChatPanel />
        </div>
        <div>
          <Timeline />
        </div>
        <div className="col-span-2">
          <TemplateGallery />
        </div>
      </div>
    </>
  );
};

export default Index;
