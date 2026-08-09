/**
 * Video Processing Service — orchestrates FFmpeg operations
 * Separates processing logic from UI components
 */

import { processVideo, type FFmpegAction, type ProcessResult } from './ffmpeg-processor';
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
  onProgress?: (p: number) => void;
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

  callbacks.onMessage('status', `⏳ جارٍ تنفيذ "${action}" عبر محرك المعالجة...`);

  try {
    // Step 1: Process video (server-side job with real progress)
    update({ status: 'processing', progress: 5 });
    const result = await processVideo(action, videoSource, params, (p) => {
      // Map server progress (0-100) into the processing stage (5-55)
      update({ status: 'processing', progress: 5 + Math.round(Math.min(100, Math.max(0, p)) * 0.5) });
      callbacks.onProgress?.(p);
    });

    if (!result.success) {
      update({ status: 'failed', error: result.message });
      callbacks.onMessage('error', result.message);
      logError('ProcessingService', result.message, { code: 'PROCESSING_FAILED', details: { action, params } });
      return job;
    }

    // Actions without an output file (e.g. info) — complete with the message directly
    if (!result.outputUrl) {
      update({ status: 'completed', progress: 100, result });
      callbacks.onMessage('ai', result.message, { action });
      return job;
    }

    update({ status: 'generating_preview', progress: 60, fullQualityUrl: result.outputUrl, result });

    // Step 2: Server-side 480p preview (fast, same engine). Never fatal —
    // if it fails (e.g. audio-only output), fall back to the full result.
    callbacks.onMessage('status', '🔄 جارٍ إنشاء معاينة سريعة...');
    try {
      const preview = await processVideo('preview', result.outputUrl, {}, (p) => {
        update({ progress: 60 + Math.round(Math.min(100, Math.max(0, p)) * 0.35) });
      });
      if (preview.success && preview.outputUrl) {
        update({ status: 'completed', progress: 100, previewUrl: preview.outputUrl });
        callbacks.onMessage('execution_result', `${result.message}\n\n👁️ تم إنشاء معاينة — راجع النتيجة قبل التصدير.`, {
          outputUrl: result.outputUrl,
          action,
        });
      } else {
        update({ status: 'completed', progress: 100, previewUrl: result.outputUrl });
        callbacks.onMessage('execution_result', result.message, { outputUrl: result.outputUrl, action });
      }
    } catch {
      update({ status: 'completed', progress: 100, previewUrl: result.outputUrl });
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
