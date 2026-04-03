import { ChatMessage } from '@/store/editorStore';
import { Download, Play, ChevronDown, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

interface MessageBubbleProps {
  msg: ChatMessage;
  onSendMessage: (text: string) => void;
  onPreviewVideo?: (url: string) => void;
}

export const MessageBubble = ({ msg, onSendMessage, onPreviewVideo }: MessageBubbleProps) => {
  const [showDiffLog, setShowDiffLog] = useState(false);

  if (msg.type === 'status') {
    return (
      <div className="mx-auto text-center animate-fade-in-up">
        <span className="text-muted-foreground text-xs">{msg.text}</span>
      </div>
    );
  }

  const isUser = msg.type === 'user';
  const isError = msg.type === 'error';
  const isExecution = msg.type === 'execution_result';
  const isClarification = msg.type === 'clarification';

  return (
    <div className={`animate-fade-in-up ${isUser ? 'mr-0 ml-auto max-w-[85%]' : 'ml-0 mr-auto max-w-[85%]'}`}>
      <div
        className={`p-3 rounded-lg text-sm ${
          isUser
            ? 'bg-muted border border-gold-dim/30 text-foreground'
            : isError
            ? 'bg-destructive/20 border border-destructive/30 text-destructive'
            : isExecution
            ? 'bg-secondary border border-primary/20 text-foreground'
            : isClarification
            ? 'bg-secondary border border-yellow-500/30 text-foreground'
            : 'bg-secondary text-foreground'
        }`}
      >
        {/* Header icon */}
        <span className="text-xs opacity-50 mb-1 block">
          {isUser ? '👤' : isError ? '⚠️' : isExecution ? '⚡' : isClarification ? '❓' : '🤖'}
          {msg.action && <span className="mr-1 text-primary font-mono">[{msg.action}]</span>}
        </span>

        {/* Main text */}
        <p className="whitespace-pre-wrap">{msg.text}</p>

        {/* Output URL - inline video player + download & preview */}
        {msg.outputUrl && (
          <div className="mt-2 p-2 bg-primary/10 rounded-lg border border-primary/20">
            {/* Inline video player */}
            <video
              src={msg.outputUrl}
              controls
              preload="metadata"
              className="w-full rounded-md mb-2 max-h-48 bg-black"
            />
            <div className="flex gap-2">
              <a
                href={msg.outputUrl}
                download
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs hover:opacity-90 transition-opacity"
              >
                <Download size={12} />
                تحميل
              </a>
              {onPreviewVideo && (
                <button
                  onClick={() => onPreviewVideo(msg.outputUrl!)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-primary text-primary text-xs hover:bg-primary/10 transition-colors"
                >
                  <Play size={12} />
                  معاينة كاملة
                </button>
              )}
            </div>
          </div>
        )}

        {/* Diff log */}
        {msg.diffLog && msg.diffLog.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowDiffLog(!showDiffLog)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown size={12} className={`transition-transform ${showDiffLog ? 'rotate-180' : ''}`} />
              📋 سجل التغييرات ({msg.diffLog.length})
            </button>
            {showDiffLog && (
              <ul className="mt-1 pr-4 text-xs text-muted-foreground space-y-0.5 list-disc">
                {msg.diffLog.map((log, i) => <li key={i}>{log}</li>)}
              </ul>
            )}
          </div>
        )}

        {/* Next steps */}
        {msg.nextSteps && msg.nextSteps.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground mb-1">💡 الخطوة التالية:</p>
            <div className="flex flex-wrap gap-1.5">
              {msg.nextSteps.map((step, i) => (
                <button
                  key={i}
                  onClick={() => onSendMessage(step)}
                  className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs border border-primary/20 hover:bg-primary/20 transition-colors"
                >
                  {step}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Missing assets */}
        {msg.missingAssets && msg.missingAssets.length > 0 && (
          <div className="mt-2 p-2 bg-destructive/10 rounded-md border border-destructive/20 text-xs">
            <div className="flex items-center gap-1 text-destructive mb-1">
              <AlertTriangle size={12} />
              أصول ناقصة:
            </div>
            <p className="text-destructive/80">{msg.missingAssets.join('، ')}</p>
            <a href="/settings" className="text-destructive underline text-xs">
              ← اذهب للإعدادات لرفعها
            </a>
          </div>
        )}

        {/* Processing indicator */}
        {msg.status === 'processing' && (
          <div className="flex gap-1 mt-2">
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.15s]" />
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:0.3s]" />
          </div>
        )}
      </div>
    </div>
  );
};
