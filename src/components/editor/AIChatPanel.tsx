import { useRef, useState, useEffect } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import { useEditorStore, statusMessages } from '@/store/editorStore';
import { supabase } from '@/integrations/supabase/client';

const quickSuggestions = [
  'نظّف الصوت',
  'أضف ترجمة',
  'أزل الخلفية',
  'تحسين الألوان',
];

export const AIChatPanel = () => {
  const { messages, addMessage, projectId, videoUrl, currentTime, selectedTemplate, contentType, setProjectStatus } = useEditorStore();
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to project status changes
  useEffect(() => {
    if (!projectId) return;
    setIsConnected(true);

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

  const sendCommand = async (command: string) => {
    if (!command.trim() || !projectId || !videoUrl) return;
    addMessage({ type: 'user', text: command });
    setInput('');

    try {
      const response = await fetch('http://localhost:8000/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url: videoUrl,
          command,
          current_time: currentTime,
          project_id: projectId,
          template_id: selectedTemplate?.id || null,
          content_type: contentType || null,
        }),
      });
      if (!response.ok) throw new Error('فشل الاتصال');
      addMessage({ type: 'ai', text: 'بدأت المعالجة...', status: 'processing' });
    } catch {
      addMessage({ type: 'error', text: 'فشل الاتصال بخادم المعالجة' });
    }
  };

  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <span className="font-bold text-foreground">المساعد الذكي</span>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs">
          <span className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-muted-foreground'}`} />
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
                    ? 'bg-danger/20 border border-danger/30 text-red-300'
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
      </div>

      {/* Quick suggestions */}
      {messages.length <= 2 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {quickSuggestions.map((s) => (
            <button
              key={s}
              onClick={() => sendCommand(s)}
              className="px-3 py-1 rounded-full bg-muted text-xs text-secondary-foreground hover:bg-gold-dim/30 hover:text-primary transition-all border border-border"
            >
              {s}
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
          onKeyDown={(e) => e.key === 'Enter' && sendCommand(input)}
          placeholder="اكتب أمراً..."
          className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={() => sendCommand(input)}
          disabled={!input.trim()}
          className="text-primary hover:text-gold-light transition-colors disabled:text-muted-foreground"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};
