import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Upload, TestTube, Key } from 'lucide-react';
import { toast } from 'sonner';
import { getEdgeFunctionUrl } from '@/store/editorStore';

interface APISettings {
  anthropicKey: string;
  vimeoToken: string;
  openaiKey: string;
  geminiKey: string;
  deepseekKey: string;
}

const assetTypes = [
  { type: 'logo', label: 'شعار الشركة (PNG)', accept: '.png,.jpg,.svg', maxSizeMB: 5 },
  { type: 'intro', label: 'مقدمة الفيديو (MP4)', accept: '.mp4,.mov', maxSizeMB: 50 },
  { type: 'outro', label: 'خاتمة الفيديو (MP4)', accept: '.mp4,.mov', maxSizeMB: 50 },
  { type: 'background_music', label: 'موسيقى خلفية (MP3)', accept: '.mp3,.wav,.aac', maxSizeMB: 20 },
];

const Settings = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'api' | 'assets' | 'admin'>('api');
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [isAdmin, setIsAdmin] = useState(localStorage.getItem('isAdmin') === 'true');

  const [settings, setSettings] = useState<APISettings>(() => {
    return {
      anthropicKey: localStorage.getItem('anthropic_key') || '',
      vimeoToken: localStorage.getItem('vimeo_token') || '',
      openaiKey: localStorage.getItem('openai_key') || '',
      geminiKey: localStorage.getItem('gemini_key') || '',
      deepseekKey: localStorage.getItem('deepseek_key') || '',
    };
  });

  const saveSettings = () => {
    localStorage.setItem('anthropic_key', settings.anthropicKey);
    localStorage.setItem('vimeo_token', settings.vimeoToken);
    localStorage.setItem('openai_key', settings.openaiKey);
    localStorage.setItem('gemini_key', settings.geminiKey);
    localStorage.setItem('deepseek_key', settings.deepseekKey);
    toast.success('✅ تم حفظ الإعدادات');
  };

  const testConnection = async () => {
    toast.loading('جارٍ الاختبار...', { id: 'test' });
    try {
      await fetch(getEdgeFunctionUrl('system-check'));
      toast.success('✅ الاتصال ناجح!', { id: 'test' });
    } catch {
      toast.error('❌ فشل الاتصال بالسيرفر المحلي', { id: 'test' });
    }
  };

  const uploadAsset = async (file: File, assetType: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('asset_type', assetType);
    try {
      const res = await fetch(`${getBackendUrl()}/upload_asset`, { method: 'POST', body: form });
      const data = await res.json();
      toast.success(`✅ تم رفع الملف (${data.size_mb || ''} MB)`);
    } catch {
      toast.error('فشل رفع الملف');
    }
  };

  const toggleAdmin = () => {
    const newVal = !isAdmin;
    if (newVal) {
      localStorage.setItem('isAdmin', 'true');
    } else {
      localStorage.removeItem('isAdmin');
    }
    setIsAdmin(newVal);
    toast.success(newVal ? '✅ تم تفعيل وضع المشرف' : 'تم إلغاء وضع المشرف');
  };

  const tabs = [
    { id: 'api' as const, label: '🔑 مفاتيح API' },
    { id: 'assets' as const, label: '📁 الأصول' },
    { id: 'admin' as const, label: '🔒 المشرف' },
  ];

  const apiFields = [
    { key: 'anthropicKey', label: 'Anthropic API Key', hint: 'للشات الذكي — من console.anthropic.com' },
    { key: 'vimeoToken', label: 'Vimeo Access Token', hint: 'من vimeo.com/settings' },
    { key: 'openaiKey', label: 'OpenAI API Key', hint: 'من platform.openai.com' },
    { key: 'geminiKey', label: 'Gemini API Key', hint: 'من ai.google.dev' },
    { key: 'deepseekKey', label: 'DeepSeek API Key', hint: 'من platform.deepseek.com' },
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
                </div>
                <p className="text-xs text-muted-foreground mt-1">💡 {field.hint}</p>
              </div>
            ))}

            {/* Test connection */}
            <div className="bg-card border border-border rounded-xl p-4">
              <label className="text-sm font-bold text-foreground block mb-2">اختبار اتصال السيرفر المحلي</label>
              <div className="flex gap-2 items-center">
                <span className="text-sm text-muted-foreground flex-1 font-mono">{getBackendUrl()}</span>
                <button onClick={testConnection} className="px-4 py-2 rounded-lg bg-muted text-muted-foreground hover:text-primary border border-border hover:border-gold-dim text-sm transition-all flex items-center gap-1">
                  <TestTube size={14} />
                  اختبار
                </button>
              </div>
            </div>

            <button onClick={saveSettings} className="w-full py-2.5 rounded-lg gold-gradient text-primary-foreground font-bold text-sm">
              💾 حفظ المفاتيح
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

        {activeTab === 'admin' && (
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h3 className="text-foreground font-bold text-lg">🔒 حساب المشرف</h3>
            <p className="text-muted-foreground text-sm">تفعيل وضع المشرف يتيح لك الوصول إلى لوحة الإدارة وعرض جميع المشاريع.</p>
            <button
              onClick={toggleAdmin}
              className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${
                isAdmin
                  ? 'bg-destructive text-destructive-foreground hover:opacity-90'
                  : 'gold-gradient text-primary-foreground hover:opacity-90'
              }`}
            >
              <Key size={16} className="inline ml-2" />
              {isAdmin ? 'إلغاء وضع المشرف' : '🔑 تفعيل وضع المشرف'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;