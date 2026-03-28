import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore, defaultTemplates } from '@/store/editorStore';
import { ArrowRight, Search } from 'lucide-react';
import { toast } from 'sonner';

const categories = [
  { value: 'all', label: 'الكل' },
  { value: 'conference', label: 'مؤتمرات' },
  { value: 'wedding', label: 'أفراح' },
  { value: 'ad', label: 'إعلانات' },
  { value: 'corporate', label: 'شركات' },
  { value: 'social_media', label: 'سوشيال' },
  { value: 'documentary', label: 'وثائقي' },
];

const TemplatesPage = () => {
  const navigate = useNavigate();
  const { setSelectedTemplate, setContentType, selectedTemplate } = useEditorStore();
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = defaultTemplates.filter((t) => {
    if (activeCategory !== 'all' && t.contentType !== activeCategory) return false;
    if (search && !t.name.includes(search) && !t.nameEn.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const applyTemplate = (template: typeof defaultTemplates[0]) => {
    setSelectedTemplate(template);
    setContentType(template.contentType);
    navigate('/');
    toast.success(`تم تطبيق قالب "${template.name}"`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-6 bg-secondary border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-lg">🎨</span>
          <span className="font-bold text-foreground text-lg">مكتبة القوالب</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث..."
              className="bg-card border border-border rounded-lg pr-8 pl-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-48"
            />
          </div>
          <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowRight size={16} />
            العودة للمحرر
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className="px-6 py-4 flex gap-2 border-b border-border">
        {categories.map((c) => (
          <button
            key={c.value}
            onClick={() => setActiveCategory(c.value)}
            className={`px-4 py-1.5 rounded-lg text-sm transition-all ${activeCategory === c.value ? 'gold-gradient text-primary-foreground font-bold' : 'bg-card text-muted-foreground border border-border hover:border-gold-dim'}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {filtered.map((template) => {
          const isActive = selectedTemplate?.id === template.id;
          return (
            <div
              key={template.id}
              className={`rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-[1.03] group ${isActive ? 'border-2 border-primary ring-2 ring-primary/20' : 'border border-border'}`}
              onClick={() => applyTemplate(template)}
            >
              <div className="aspect-video flex items-center justify-center text-5xl relative" style={{ backgroundColor: template.color }}>
                {template.icon}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 text-foreground text-sm font-bold transition-opacity">معاينة</span>
                </div>
              </div>
              <div className="p-3 bg-card">
                <p className="font-bold text-foreground text-sm">{template.name}</p>
                <p className="text-xs text-muted-foreground">{template.description}</p>
                {isActive && <p className="text-xs text-primary font-bold mt-1">✓ مُطبَّق حالياً</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TemplatesPage;
