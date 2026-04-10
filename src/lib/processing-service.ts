/**
 * Video Processing Service — orchestrates FFmpeg operations
 * Separates processing logic from UI components
 */

import { processVideo, type FFmpegAction, type ProcessResult } from './ffmpeg-processor';
import { generatePreview } from './preview-generator';
import { logError, classifyError } from './error-logger';
import { retryWithBackoff } from './network-utils';

export type ProcessingStatus = 'idle' | 'processing' | 'generating_preview' | 'completed' | 'failed';

export interface ProcessingJob {
  id: string;
  action: FFmpegAction;
  params: Record<string, any>;
  status: ProcessingStatus;
  progress: number;
  result?: ProcessResult;
  previewUrl?: string;
  fullQualityUrl?: string;
  error?: string;
  createdAt: Date;
}

export interface ProcessingCallbacks {
  onStatusChange: (job: ProcessingJob) => void;
  onMessage: (type: 'status' | 'ai' | 'error' | 'execution_result', text: string, extra?: Record<string, any>) => void;
}

// In-memory job queue
const jobQueue: ProcessingJob[] = [];

export function getJobs(): readonly ProcessingJob[] {
  return jobQueue;
}

/**
 * Execute a video processing job with preview generation
 */
export async function executeJob(
  action: FFmpegAction,
  videoSource: string,
  params: Record<string, any>,
  callbacks: ProcessingCallbacks,
): Promise<ProcessingJob> {
  const job: ProcessingJob = {
    id: crypto.randomUUID(),
    action,
    params,
    status: 'processing',
    progress: 0,
    createdAt: new Date(),
  };

  jobQueue.push(job);
  if (jobQueue.length > 20) jobQueue.shift(); // cap queue size

  const update = (patch: Partial<ProcessingJob>) => {
    Object.assign(job, patch);
    callbacks.onStatusChange(job);
  };

  callbacks.onMessage('status', `⏳ جارٍ تنفيذ "${action}" محلياً في المتصفح...`);

  try {
    // Step 1: Process video
    update({ status: 'processing', progress: 10 });
    const result = await processVideo(action, videoSource, params);

    if (!result.success || !result.outputUrl) {
      update({ status: 'failed', error: result.message });
      callbacks.onMessage('error', result.message);
      logError('ProcessingService', result.message, { code: 'PROCESSING_FAILED', details: { action, params } });
      return job;
    }

    update({ status: 'generating_preview', progress: 60, fullQualityUrl: result.outputUrl, result });

    // Step 2: Generate preview
    callbacks.onMessage('status', '🔄 جارٍ إنشاء معاينة سريعة...');
    const preview = await generatePreview(result.outputUrl, (p) => {
      update({ progress: 60 + Math.round(p * 0.35) });
    });

    if (preview.success) {
      update({ status: 'completed', progress: 100, previewUrl: preview.previewUrl });
      callbacks.onMessage('execution_result', `${result.message}\n\n👁️ تم إنشاء معاينة — راجع النتيجة قبل التصدير.`, {
        outputUrl: result.outputUrl,
        action,
      });
    } else {
      // Fallback: no preview, still successful
      update({ status: 'completed', progress: 100 });
      callbacks.onMessage('execution_result', result.message, { outputUrl: result.outputUrl, action });
    }

    return job;
  } catch (err: any) {
    const classified = classifyError(err);
    update({ status: 'failed', error: classified.userMessage });
    callbacks.onMessage('error', classified.userMessage);
    logError('ProcessingService', err, { code: classified.type, retryable: classified.retryable, details: { action } });
    return job;
  }
}
