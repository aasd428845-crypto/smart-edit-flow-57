import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Upload, TestTube } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = 'http://localhost:8000';

interface APISettings {
  vimeoAccessToken: string;
  openaiKey: string;
  geminiKey: string;
  backendUrl: string;
}

const assetTypes = [
  { type: 'logo', label: 'شعار الشركة', accept: '.png,.svg', maxSizeMB: 5 },
  { type: 'intro', label: 'فيديو المقدمة', accept: '.mp4,.mov', maxSizeMB: 50 },
  { type: 'outro', label: 'فيديو الخاتمة', accept: '.mp4,.mov', maxSizeMB: 50 },
  { type: 'background_music', label: 'موسيقى خلفية', accept: '.mp3,.wav,.aac', maxSizeMB: 20 },
  { type: 'sound_effect', label: 'مؤثرات صوتية', accept: '.mp3,.wav', maxSizeMB: 10 },
];

const Settings = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'api' | 'assets' | 'appearance'>('api');
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});

  const [settings, setSettings] = useState<APISettings>(() => {
    try {
      const saved = localStorage.getItem('montaji_settings');
      return saved ? JSON.parse(atob(saved)) : { vimeoAccessToken: '', openaiKey: '', geminiKey: '', backendUrl: BACKEND_URL };
    } catch {
      return { vimeoAccessToken: '', openaiKey: '', geminiKey: '', backendUrl: BACKEND_URL };
    }
  });

  const saveSettings = () => {
    localStorage.setItem('montaji_settings', btoa(JSON.stringify(settings)));
    toast.success('تم حفظ الإعدادات');
  };

  const testConnection = async (key: string) => {
    toast.loading('جارٍ الاختبار...', { id: 'test' });
    try {
      if (key === 'backendUrl') {
        await fetch(settings.backendUrl + '/health');
        toast.success('الاتصال ناجح!', { id: 'test' });
      } else {
        toast.success('المفتاح محفوظ (الاختبار غير متاح)', { id: 'test' });
      }
    } catch {
      toast.error('فشل الاتصال', { id: 'test' });
    }
  };

  const uploadAsset = async (file: File, assetType: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('asset_type', assetType);
    try {
      await fetch(`${settings.backendUrl}/upload-asset`, { method: 'POST', body: formData });
      toast.success('تم رفع الملف بنجاح');
    } catch {
      toast.error('فشل رفع الملف');
    }
  };

  const tabs = [
    { id: 'api' as const, label: '🔑 مفاتيح API' },
    { id: 'assets' as const, label: '📁 الأصول' },
    { id: 'appearance' as const, label: '🎨 المظهر' },
  ];

  const apiFields = [
    { key: 'vimeoAccessToken', label: 'Vimeo Access Token', hint: 'احصل على المفتاح من vimeo.com/settings' },
    { key: 'openaiKey', label: 'OpenAI API Key', hint: 'من platform.openai.com' },
    { key: 'geminiKey', label: 'Gemini API Key', hint: 'من ai.google.dev' },
    { key: 'backendUrl', label: 'عنوان الخادم', hint: 'افتراضي: http://localhost:8000' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="h-14 flex items-center justify-between px-6 bg-secondary border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-lg">⚙️</span>
          <span className="font-bold text-foreground text-lg">الإعدادات</span>
        </div>
        <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight size={16} />
          العودة للمحرر
        </button>
      </div>

      <div className="max-w-3xl mx-auto py-8 px-6">
        <div className="flex gap-2 mb-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm transition-all ${activeTab === t.id ? 'gold-gradient text-primary-foreground font-bold' : 'bg-card text-muted-foreground border border-border hover:border-gold-dim'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'api' && (
          <div className="space-y-4">
            {apiFields.map((field) => (
              <div key={field.key} className="bg-card border border-border rounded-xl p-4">
                <label className="text-sm font-bold text-foreground block mb-2">{field.label}</label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type={showTokens[field.key] ? 'text' : 'password'}
                      value={(settings as any)[field.key]}
                      onChange={(e) => setSettings({ ...settings, [field.key]: e.target.value })}
                      className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground pr-10 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <button
                      onClick={() => setShowTokens({ ...showTokens, [field.key]: !showTokens[field.key] })}
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showTokens[field.key] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <button
                    onClick={() => testConnection(field.key)}
                    className="px-3 py-2 rounded-lg bg-muted text-muted-foreground hover:text-primary border border-border hover:border-gold-dim text-sm transition-all"
                  >
                    <TestTube size={14} />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">💡 {field.hint}</p>
              </div>
            ))}
            <button onClick={saveSettings} className="w-full py-2.5 rounded-lg gold-gradient text-primary-foreground font-bold text-sm">
              حفظ الإعدادات
            </button>
          </div>
        )}

        {activeTab === 'assets' && (
          <div className="space-y-4">
            {assetTypes.map((asset) => (
              <div key={asset.type} className="bg-card border border-border rounded-xl p-4">
                <label className="text-sm font-bold text-foreground block mb-2">{asset.label}</label>
                <label className="flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-border hover:border-gold-dim cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-all">
                  <Upload size={16} />
                  اختر ملف (حد {asset.maxSizeMB}MB)
                  <input
                    type="file"
                    accept={asset.accept}
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadAsset(e.target.files[0], asset.type)}
                  />
                </label>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="bg-card border border-border rounded-xl p-6">
            <p className="text-muted-foreground text-sm">إعدادات المظهر ستكون متاحة قريباً.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
