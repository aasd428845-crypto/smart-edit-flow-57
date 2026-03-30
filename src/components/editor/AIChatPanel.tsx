import { useRef, useState, useEffect } from 'react';
import { Send, Paperclip, Activity, ChevronDown } from 'lucide-react';
import { useEditorStore, statusMessages, getEdgeFunctionUrl } from '@/store/editorStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const aiAgents = [
  { id: 'claude', label: 'Claude (Anthropic)', icon: '🟣' },
  { id: 'gpt4', label: 'GPT-4 (OpenAI)', icon: '🟢' },
  { id: 'gemini', label: 'Gemini (Google)', icon: '🔵' },
  { id: 'deepseek', label: 'DeepSeek', icon: '🟠' },
];

const quickSuggestions = [
  { label: 'ما ينقص المنصة؟', message: 'ما ينقص المنصة؟' },
  { label: 'تحليل سينمائي', message: 'قم بتحليل الفيديو الحالي وأخبرني توصياتك للمونتاج السينمائي' },
  { label: 'مكتبات مفقودة؟', message: 'ما المكتبات الناقصة التي تمنعك من تنفيذ أوامري؟' },
  { label: 'نظّف الصوت', message: 'نظّف الصوت' },
];

export const AIChatPanel = () => {
  const {
    messages, addMessage, projectId, videoSource, sourceType,
    currentTime, selectedTemplate, contentType, setProjectStatus,
    cinematicMode, selectedAgent, setSelectedAgent,
  } = useEditorStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Check backend connectivity on mount
  useEffect(() => {
    fetch(getEdgeFunctionUrl('system-check'))
      .then(res => { if (res.ok) setIsConnected(true); })
      .catch(() => setIsConnected(false));
  }, []);

  // Subscribe to project status changes
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`project-${projectId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'projects',
        filter: `id=eq.${projectId}`,
      }, (payload: any) => {
        const newStatus = payload.new.status;
        setProjectStatus(newStatus);
        const msg = statusMessages[newStatus];
        if (msg) addMessage({ type: 'status', text: msg });

        if (newStatus === 'completed' && payload.new.output_url) {
          addMessage({
            type: 'ai',
            text: `✅ اكتمل المونتاج!\n📥 [تحميل الفيديو](${payload.new.output_url})`,
            status: 'completed',
          });
        }
        if (newStatus === 'failed') {
          addMessage({
            type: 'error',
            text: `❌ فشلت المعالجة: ${payload.new.error || 'خطأ غير معروف'}`,
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      setIsConnected(false);
    };
  }, [projectId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    addMessage({ type: 'user', text });
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch(getEdgeFunctionUrl('chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          agent: selectedAgent,
          conversation_history: messages.map(m => ({ role: m.type === 'user' ? 'user' : 'assistant', content: m.text })),
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
        // Check for Anthropic credit/billing errors
        const errMsg = data.detail || data.error || data.message || '';
        if (typeof errMsg === 'string' && (errMsg.toLowerCase().includes('credit') || errMsg.toLowerCase().includes('billing') || errMsg.toLowerCase().includes('insufficient') || errMsg.toLowerCase().includes('quota'))) {
          addMessage({ type: 'error', text: `⚠️ رصيد Anthropic غير كافٍ. يرجى شحن حسابك على console.anthropic.com\n\n${errMsg}` });
        } else {
          addMessage({ type: 'error', text: `⚠️ خطأ من السيرفر: ${errMsg || res.statusText}` });
        }
        return;
      }
      addMessage({ type: 'ai', text: data.reply || data.message || 'تم' });

      if (data.needs_video && !videoSource) {
        toast.warning('⚠️ هذا الأمر يحتاج فيديو. ارفع فيديو أولاً.');
      }
    } catch (err: any) {
      if (err?.name === 'TypeError' && err?.message?.includes('fetch')) {
        addMessage({ type: 'error', text: '⚠️ السيرفر المحلي غير متاح. تأكد من تشغيل: uvicorn main:app' });
      } else {
        addMessage({ type: 'error', text: `⚠️ خطأ غير متوقع: ${err?.message || 'غير معروف'}` });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const checkSystem = async () => {
    addMessage({ type: 'user', text: '🔍 فحص المنصة...' });
    try {
      const res = await fetch(getEdgeFunctionUrl('system-check'));
      const data = await res.json();
      setIsConnected(true);

      // Check for Anthropic credit issue specifically
      const anthropicStatus = data.api_keys?.anthropic;
      const creditWarning = (typeof anthropicStatus === 'string' && (anthropicStatus.toLowerCase().includes('credit') || anthropicStatus.toLowerCase().includes('insufficient')))
        ? '\n\n⚠️ تنبيه: رصيد Anthropic غير كافٍ. يرجى شحن الحساب.'
        : '';

      const summary = `🖥️ حالة المنصة: ${data.status === 'healthy' ? '✅ سليمة' : '⚠️ تحتاج تعديل'}

📦 المكتبات الناقصة: ${data.missing_libraries?.length || 0}
${data.missing_libraries?.map((m: any) => `• ${m.name}: \`${m.install_cmd}\``).join('\n') || 'لا شيء ناقص'}

📁 الأصول:
${Object.entries(data.assets || {}).map(([k, v]) => `• ${k}: ${v ? '✅' : '❌'}`).join('\n')}

💡 التوصيات:
${data.recommendations?.map((r: any) => `• [${r.priority}] ${r.title}: ${r.action}`).join('\n') || 'لا توصيات'}${creditWarning}`;
      addMessage({ type: 'ai', text: summary });
    } catch (err: any) {
      setIsConnected(false);
      if (err?.name === 'TypeError' && err?.message?.includes('fetch')) {
        addMessage({ type: 'error', text: '⚠️ السيرفر المحلي غير متاح. تأكد من تشغيل: uvicorn main:app' });
      } else {
        addMessage({ type: 'error', text: `⚠️ خطأ في فحص النظام: ${err?.message || 'غير معروف'}` });
      }
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
            {isConnected ? 'متصل' : 'غير متصل'}
          </span>
          <span className="text-muted-foreground">
            {projectId ? 'مشروع نشط' : 'لا يوجد مشروع'}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`animate-fade-in-up ${
              msg.type === 'user'
                ? 'mr-0 ml-auto max-w-[85%]'
                : msg.type === 'status'
                ? 'mx-auto text-center'
                : 'ml-0 mr-auto max-w-[85%]'
            }`}
          >
            {msg.type === 'status' ? (
              <span className="text-muted-foreground text-xs">{msg.text}</span>
            ) : (
              <div
                className={`p-3 rounded-lg text-sm ${
                  msg.type === 'user'
                    ? 'bg-muted border border-gold-dim/30 text-foreground'
                    : msg.type === 'error'
                    ? 'bg-destructive/20 border border-destructive/30 text-destructive'
                    : 'bg-secondary text-foreground'
                }`}
              >
                <span className="text-xs opacity-50 mb-1 block">
                  {msg.type === 'user' ? '👤' : msg.type === 'error' ? '⚠️' : '🤖'}
                </span>
                <p className="whitespace-pre-wrap">{msg.text}</p>
                {msg.status === 'processing' && (
                  <div className="flex gap-1 mt-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.15s]" />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.3s]" />
                  </div>
                )}
              </div>
            )}
          </div>
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
          placeholder="اكتب أمراً أو اسأل سؤالاً..."
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