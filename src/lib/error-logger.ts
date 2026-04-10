/**
 * Error Logger — centralized error tracking with context
 */

export interface AppError {
  id: string;
  timestamp: Date;
  context: string;
  message: string;
  code?: string;
  retryable: boolean;
  details?: Record<string, any>;
}

const errorLog: AppError[] = [];
const MAX_LOG_SIZE = 100;

export function logError(
  context: string,
  error: Error | string,
  opts: { code?: string; retryable?: boolean; details?: Record<string, any> } = {},
): AppError {
  const entry: AppError = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    context,
    message: typeof error === 'string' ? error : error.message,
    code: opts.code,
    retryable: opts.retryable ?? false,
    details: opts.details,
  };

  errorLog.push(entry);
  if (errorLog.length > MAX_LOG_SIZE) errorLog.shift();

  console.error(`[${context}]`, entry.message, opts.details || '');
  return entry;
}

export function getErrorLog(): readonly AppError[] {
  return errorLog;
}

export function clearErrorLog() {
  errorLog.length = 0;
}

/** Classify error for user-friendly messages */
export function classifyError(error: Error | string): { type: string; userMessage: string; retryable: boolean } {
  const msg = typeof error === 'string' ? error : error.message;

  if (!navigator.onLine || msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) {
    return { type: 'network', userMessage: '⚠️ انقطع الاتصال بالإنترنت. سيتم إعادة المحاولة تلقائياً.', retryable: true };
  }
  if (msg.includes('413') || msg.includes('too large') || msg.includes('payload')) {
    return { type: 'file_too_large', userMessage: '⚠️ الملف كبير جداً. جرّب ملفاً أصغر.', retryable: false };
  }
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized')) {
    return { type: 'auth', userMessage: '⚠️ خطأ في الصلاحيات. تحقق من إعدادات الحساب.', retryable: false };
  }
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many')) {
    return { type: 'rate_limit', userMessage: '⚠️ طلبات كثيرة. انتظر قليلاً ثم حاول مجدداً.', retryable: true };
  }
  if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
    return { type: 'server', userMessage: '⚠️ خطأ في الخادم. جارٍ إعادة المحاولة...', retryable: true };
  }
  if (msg.includes('CORS') || msg.includes('cors')) {
    return { type: 'cors', userMessage: '⚠️ مشكلة في إعدادات CORS. تواصل مع الدعم.', retryable: false };
  }
  if (msg.includes('credit') || msg.includes('billing') || msg.includes('insufficient')) {
    return { type: 'billing', userMessage: '⚠️ رصيد غير كافٍ. راجع حسابك.', retryable: false };
  }

  return { type: 'unknown', userMessage: `❌ خطأ: ${msg}`, retryable: false };
}
