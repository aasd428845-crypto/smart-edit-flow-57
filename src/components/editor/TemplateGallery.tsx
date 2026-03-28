import { useEditorStore, defaultTemplates } from '@/store/editorStore';
import { toast } from 'sonner';

export const TemplateGallery = () => {
  const { selectedTemplate, setSelectedTemplate } = useEditorStore();

  return (
    <div className="h-[180px] bg-secondary border-t border-gold-dim/30 px-4 py-3 overflow-x-auto">
      <div className="flex gap-3 h-full">
        {defaultTemplates.map((template) => {
          const isSelected = selectedTemplate?.id === template.id;
          return (
            <div
              key={template.id}
              className={`shrink-0 w-36 rounded-xl flex flex-col overflow-hidden cursor-pointer transition-all hover:scale-105 ${
                isSelected ? 'border-2 border-primary ring-1 ring-primary/30' : 'border border-border'
              }`}
              onClick={() => {
                setSelectedTemplate(isSelected ? null : template);
                if (!isSelected) toast.success(`تم اختيار قالب "${template.name}"`);
              }}
            >
              {/* Thumbnail */}
              <div
                className="flex-1 flex items-center justify-center text-3xl"
                style={{ backgroundColor: template.color }}
              >
                {template.icon}
              </div>
              {/* Info */}
              <div className="p-2 bg-card">
                <p className="text-xs font-bold text-foreground">{template.name}</p>
                <p className="text-[10px] text-muted-foreground">{template.nameEn}</p>
                {isSelected && (
                  <span className="text-[10px] text-primary font-bold">✓ مُطبَّق</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
