import { useEditorStore, defaultTemplates } from '@/store/editorStore';
import { toast } from 'sonner';

export const TemplateGallery = () => {
  const { selectedTemplate, setSelectedTemplate } = useEditorStore();

  const selectTemplate = (template: typeof defaultTemplates[0]) => {
    const isSelected = selectedTemplate?.id === template.id;
    setSelectedTemplate(isSelected ? null : template);
    if (!isSelected) toast.success(`✅ تم تطبيق قالب "${template.name}"`);
  };

  return (
    <div className="h-[180px] bg-secondary border-t border-gold-dim/30 px-4 py-3 overflow-x-auto">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-bold text-foreground">🎨 القوالب</span>
        <span className="text-xs text-muted-foreground">({defaultTemplates.length})</span>
      </div>
      <div className="flex gap-3 h-[calc(100%-28px)]">
        {defaultTemplates.map((template) => {
          const isSelected = selectedTemplate?.id === template.id;
          return (
            <div
              key={template.id}
              className={`shrink-0 w-36 rounded-xl flex flex-col overflow-hidden cursor-pointer transition-all hover:scale-105 ${
                isSelected ? 'border-2 border-primary ring-1 ring-primary/30 gold-glow' : 'border border-border'
              }`}
              onClick={() => selectTemplate(template)}
            >
              <div className="flex-1 flex items-center justify-center text-3xl" style={{ backgroundColor: template.color }}>
                {template.icon}
              </div>
              <div className="p-2 bg-card">
                <p className="text-xs font-bold text-foreground">{template.name}</p>
                <p className="text-[10px] text-muted-foreground">{template.description}</p>
                {isSelected && <span className="text-[10px] text-primary font-bold">✓ محدد</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};