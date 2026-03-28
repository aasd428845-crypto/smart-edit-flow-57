import { TopToolbar } from '@/components/editor/TopToolbar';
import { VideoPreview } from '@/components/editor/VideoPreview';
import { AIChatPanel } from '@/components/editor/AIChatPanel';
import { Timeline } from '@/components/editor/Timeline';
import { TemplateGallery } from '@/components/editor/TemplateGallery';

const Index = () => {
  return (
    <div className="h-screen grid grid-rows-[56px_1fr_120px_180px] grid-cols-[1fr_380px] bg-background overflow-hidden">
      {/* Top Toolbar - spans full width */}
      <div className="col-span-2">
        <TopToolbar />
      </div>

      {/* Video Preview - left */}
      <div className="overflow-hidden">
        <VideoPreview />
      </div>

      {/* AI Chat Panel - right, spans rows 2+3 */}
      <div className="row-span-2 overflow-hidden">
        <AIChatPanel />
      </div>

      {/* Timeline - left only */}
      <div>
        <Timeline />
      </div>

      {/* Template Gallery - spans full width */}
      <div className="col-span-2">
        <TemplateGallery />
      </div>
    </div>
  );
};

export default Index;
