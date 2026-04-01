import { useRef, useState, useEffect } from 'react';
import { Send, Paperclip, Activity, ChevronDown } from 'lucide-react';
import { useEditorStore, statusMessages, getEdgeFunctionUrl, getLocalBackendUrl } from '@/store/editorStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageBubble } from './MessageBubble';

const aiAgents = [
  { id: 'claude', label: 'Claude (Anthropic)', icon: '🟣' },
  { id: 'gpt4', label: 'GPT-4 (OpenAI)', icon: '🟢' },
  { id: 'gemini', label: 'Gemini (Google)', icon: '🔵' },
  { id: 'deepseek', label: 'DeepSeek', icon: '🟠' },
];

const quickSuggestions = [
  { label: '✂️ قص من 0 إلى 30', message: 'قص من الثانية 0 إلى 30' },
  { label: '🔊 نقّي الصوت', message: 'نقّي الصوت' },
  { label: '🎞️ شرائط سينمائية', message: 'أضف شرائط سينمائية' },
  { label: '🎨 ألوان ذهبية', message: 'صحح الألوان بأسلوب ذهبي للأعراس' },
  { label: '🚀 سرّع مرتين', message: 'سرّع الفيديو مرتين' },
  { label: '📝 فرّغ الكلام', message: 'فرّغ الكلام لنص عربي' },
  { label: '💾 صدّر 1080p', message: 'صدّر بجودة 1080p' },
  { label: '📊 معلومات الفيديو', message: 'معلومات عن الفيديو' },
  { label: '🎵 موسيقى خلفية', message: 'أضف موسيقى خلفية' },
  { label: '🔄 اعكس الفيديو', message: 'اعكس الفيديو' },
];

export const AIChatPanel = () => {
  const {
    messages, addMessage, projectId, videoSource, sourceType,
    currentTime, selectedTemplate, contentType, setProjectStatus,
    cinematicMode, selectedAgent, setSelectedAgent, setVideoSource,
  } = useEditorStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [localConnected, setLocalConnected] = useState(false);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Check backend connectivity on mount
  useEffect(() => {
    // Check edge function
    fetch(getEdgeFunctionUrl('system-check'))
      .then(res => { if (res.ok) setIsConnected(true); })
      .catch(() => setIsConnected(false));

    // Check local backend
    fetch(`${getLocalBackendUrl()}/system/check`)
      .then(res => { if (res.ok) setLocalConnected(true); })
      .catch(() => setLocalConnected(false));
  }, []);

  // Subscribe to project status changes
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`project-${projectId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'projects',
        filter: `id=eq.${projectId}`,
      }, (payload: any) => {
        const newStatus = payload.new.status;
        setProjectStatus(newStatus);
        const msg = statusMessages[newStatus];
        if (msg) addMessage({ type: 'status', text: msg });
        if (newStatus === 'completed' && payload.new.output_url) {
          addMessage({
            type: 'execution_result', text: '✅ اكتمل المونتاج!',
            outputUrl: payload.new.output_url, status: 'completed',
          });
        }
        if (newStatus === 'failed') {
          addMessage({ type: 'error', text: `❌ فشلت المعالجة: ${payload.new.error || 'خطأ غير معروف'}` });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handlePreviewVideo = (url: string) => {
    setVideoSource(url, 'remote');
    toast.success('▶️ تم تحميل الفيديو في المشغل');
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    addMessage({ type: 'user', text });
    setInput('');
    setIsLoading(true);

    try {
      // Path 1: If video exists AND local backend is available → try /command first
      if (videoSource && localConnected) {
        try {
          const cmdRes = await fetch(`${getLocalBackendUrl()}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              command: text,
              video_source: videoSource,
              project_id: projectId || 'default',
              current_time: currentTime,
              content_type: contentType || 'default',
            }),
          });
          const cmdData = await cmdRes.json();

          if (cmdData.status === 'success') {
            addMessage({
              type: 'execution_result',
              text: cmdData.message,
              action: cmdData.action,
              outputUrl: cmdData.output_url,
              diffLog: cmdData.diff_log,
              nextSteps: cmdData.next_steps,
              missingAssets: cmdData.missing_assets,
            });
            if (cmdData.output_url) {
              setVideoSource(cmdData.output_url, 'remote');
              toast.success(`✅ ${cmdData.action} - تم!`);
            }
            return;
          }

          if (cmdData.status === 'clarification_needed') {
            addMessage({ type: 'clarification', text: cmdData.question });
            return;
          }

          if (cmdData.status === 'needs_video') {
            addMessage({ type: 'ai', text: cmdData.message });
            toast.warning('⚠️ هذا الأمر يحتاج فيديو.');
            return;
          }

          if (cmdData.status === 'error') {
            addMessage({
              type: 'error',
              text: cmdData.message || 'فشل تنفيذ الأمر',
              missingAssets: cmdData.missing_assets,
              nextSteps: cmdData.next_steps,
            });
            return;
          }
        } catch {
          // Local backend not available, fall through to cloud chat
          setLocalConnected(false);
        }
      }

      // Path 2: Cloud AI chat (edge function)
      const res = await fetch(getEdgeFunctionUrl('chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          agent: selectedAgent,
          conversation_history: messages.slice(-10).map(m => ({
            role: m.type === 'user' ? 'user' : 'assistant',
            content: m.text,
          })),
          project_context: {
            video_source: videoSource,
            source_type: sourceType,
            project_id: projectId,
            current_time: currentTime,
            template_id: selectedTemplate?.id || null,
            content_type: contentType,
            cinematic: cinematicMode,
          },
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const errMsg = data.detail || data.error || data.message || '';
        if (typeof errMsg === 'string' && (errMsg.includes('credit') || errMsg.includes('billing') || errMsg.includes('insufficient'))) {
          addMessage({ type: 'error', text: `⚠️ رصيد غير كافٍ. يرجى شحن حسابك.\n\n${errMsg}` });
        } else {
          addMessage({ type: 'error', text: `⚠️ خطأ: ${errMsg || res.statusText}` });
        }
        return;
      }

      addMessage({ type: 'ai', text: data.reply || 'تم' });
      if (data.needs_video && !videoSource) {
        toast.warning('⚠️ هذا الأمر يحتاج فيديو. ارفع فيديو أولاً.');
      }
    } catch (err: any) {
      if (err?.name === 'TypeError' && err?.message?.includes('fetch')) {
        addMessage({ type: 'error', text: '⚠️ فشل الاتصال. تحقق من اتصالك بالإنترنت.' });
      } else {
        addMessage({ type: 'error', text: `⚠️ خطأ: ${err?.message || 'غير معروف'}` });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const checkSystem = async () => {
    addMessage({ type: 'user', text: '🔍 فحص المنصة...' });
    try {
      // Check cloud
      const cloudRes = await fetch(getEdgeFunctionUrl('system-check'));
      const cloudOk = cloudRes.ok;
      setIsConnected(cloudOk);

      // Check local
      let localOk = false;
      let localData: any = null;
      try {
        const localRes = await fetch(`${getLocalBackendUrl()}/system/check`);
        localOk = localRes.ok;
        if (localOk) localData = await localRes.json();
        setLocalConnected(localOk);
      } catch { setLocalConnected(false); }

      let summary = `🖥️ حالة المنصة:
☁️ Cloud AI: ${cloudOk ? '✅ متصل' : '❌ غير متصل'}
🏠 سيرفر محلي: ${localOk ? '✅ متصل' : '❌ غير متصل'}`;

      if (localData) {
        if (localData.missing_libraries?.length) {
          summary += `\n\n📦 مكتبات ناقصة:\n${localData.missing_libraries.map((m: any) => `• ${m.name}: \`${m.install_cmd}\``).join('\n')}`;
        }
        if (localData.assets) {
          summary += `\n\n📁 الأصول:\n${Object.entries(localData.assets).map(([k, v]) => `• ${k}: ${v ? '✅' : '❌'}`).join('\n')}`;
        }
        if (localData.recommendations?.length) {
          summary += `\n\n💡 التوصيات:\n${localData.recommendations.map((r: any) => `• [${r.priority}] ${r.title}: ${r.action}`).join('\n')}`;
        }
      }

      addMessage({ type: 'ai', text: summary });
    } catch (err: any) {
      addMessage({ type: 'error', text: `⚠️ خطأ في الفحص: ${err?.message || 'غير معروف'}` });
    }
  };

  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <span className="font-bold text-foreground">مونتاجي AI</span>
          </div>
          <button
            onClick={checkSystem}
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-muted text-xs text-muted-foreground hover:text-primary border border-border hover:border-gold-dim transition-all"
          >
            <Activity size={12} />
            فحص المنصة
          </button>
        </div>

        {/* Agent Selector */}
        <div className="relative mt-2">
          <button
            onClick={() => setShowAgentMenu(!showAgentMenu)}
            className="flex items-center justify-between w-full px-3 py-1.5 rounded-lg bg-muted border border-border hover:border-gold-dim text-xs text-foreground transition-all"
          >
            <span className="flex items-center gap-2">
              <span>{aiAgents.find(a => a.id === selectedAgent)?.icon}</span>
              <span>اختر الوكيل: {aiAgents.find(a => a.id === selectedAgent)?.label}</span>
            </span>
            <ChevronDown size={14} className={`text-muted-foreground transition-transform ${showAgentMenu ? 'rotate-180' : ''}`} />
          </button>
          {showAgentMenu && (
            <div className="absolute z-20 top-full mt-1 w-full bg-card border border-border rounded-lg shadow-lg overflow-hidden">
              {aiAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => { setSelectedAgent(agent.id); setShowAgentMenu(false); }}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-right hover:bg-muted transition-colors ${selectedAgent === agent.id ? 'bg-muted text-primary font-bold' : 'text-foreground'}`}
                >
                  <span>{agent.icon}</span>
                  <span>{agent.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 mt-2 text-xs">
          <span className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success' : 'bg-muted-foreground'}`} />
            ☁️ {isConnected ? 'متصل' : 'غير متصل'}
          </span>
          <span className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${localConnected ? 'bg-success' : 'bg-muted-foreground'}`} />
            🏠 {localConnected ? 'محلي' : 'لا سيرفر'}
          </span>
          <span className="text-muted-foreground">
            {projectId ? 'مشروع نشط' : 'لا يوجد مشروع'}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            onSendMessage={sendMessage}
            onPreviewVideo={handlePreviewVideo}
          />
        ))}
        {isLoading && (
          <div className="ml-0 mr-auto max-w-[85%] animate-fade-in-up">
            <div className="bg-secondary text-foreground p-3 rounded-lg text-sm">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick suggestions */}
      {messages.length <= 2 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {quickSuggestions.map((s) => (
            <button
              key={s.label}
              onClick={() => sendMessage(s.message)}
              className="px-3 py-1 rounded-full bg-muted text-xs text-secondary-foreground hover:bg-gold-dim/30 hover:text-primary transition-all border border-border"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-border flex items-center gap-2">
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <Paperclip size={18} />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
          placeholder="اكتب أمراً مثل: قص من 10 إلى 30..."
          className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isLoading}
          className="text-primary hover:text-gold-light transition-colors disabled:text-muted-foreground"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};
