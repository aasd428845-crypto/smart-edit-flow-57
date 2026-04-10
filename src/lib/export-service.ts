/**
 * Export Service — handles video download and Vimeo upload
 * Centralized export logic with retry and error handling
 */

import { supabase } from '@/integrations/supabase/client';
import { UploadManager } from './upload-manager';
import { retryWithBackoff } from './network-utils';
import { logError, classifyError } from './error-logger';

export type ExportStatus = 'idle' | 'preparing' | 'downloading' | 'uploading' | 'completed' | 'failed';

export interface ExportCallbacks {
  onProgress: (percent: number) => void;
  onStatusChange: (status: ExportStatus) => void;
  onSuccess: (result: { type: 'download' | 'vimeo'; url?: string }) => void;
  onError: (error: string) => void;
}

/**
 * Download video to device with progress tracking via streaming
 */
export async function downloadVideo(videoUrl: string, callbacks: ExportCallbacks): Promise<void> {
  callbacks.onStatusChange('downloading');
  callbacks.onProgress(0);

  try {
    const res = await retryWithBackoff(() => fetch(videoUrl), {
      maxRetries: 3,
      onRetry: (attempt) => callbacks.onProgress(-1), // signal retry
    });

    const contentLength = Number(res.headers.get('Content-Length') || 0);
    const reader = res.body?.getReader();

    if (!reader) {
      // Fallback: no streaming
      const blob = await res.blob();
      triggerDownload(blob);
      callbacks.onProgress(100);
      callbacks.onStatusChange('completed');
      callbacks.onSuccess({ type: 'download' });
      return;
    }

    // Stream download with progress
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (contentLength > 0) {
        callbacks.onProgress(Math.round((received / contentLength) * 100));
      }
    }

    const blob = new Blob(chunks, { type: 'video/mp4' });
    triggerDownload(blob);
    callbacks.onProgress(100);
    callbacks.onStatusChange('completed');
    callbacks.onSuccess({ type: 'download' });
  } catch (err: any) {
    const classified = classifyError(err);
    logError('ExportService.download', err, { retryable: classified.retryable });
    callbacks.onStatusChange('failed');
    callbacks.onError(classified.userMessage);
  }
}

/**
 * Upload video to Vimeo via TUS with full progress tracking
 */
export async function uploadToVimeo(
  videoUrl: string,
  projectId: string | null,
  callbacks: ExportCallbacks,
): Promise<void> {
  callbacks.onStatusChange('preparing');
  callbacks.onProgress(0);

  try {
    // Step 1: Prepare file
    const res = await fetch(videoUrl);
    const blob = await res.blob();
    const file = new File([blob], `montaji_${Date.now()}.mp4`, { type: 'video/mp4' });

    // Step 2: Get TUS ticket with retry
    const ticketResult = await retryWithBackoff(
      async () => {
        const { data, error } = await supabase.functions.invoke('create-vimeo-ticket', {
          body: { file_size: file.size, project_id: projectId || 'export', file_name: file.name },
        });
        if (error || !data?.upload_link) throw new Error(error?.message || 'فشل الحصول على رابط الرفع');
        return data;
      },
      {
        maxRetries: 2,
        onRetry: (attempt, err) => {
          logError('ExportService.vimeoTicket', err, { code: 'TICKET_RETRY', details: { attempt } });
        },
      },
    );

    // Step 3: TUS upload
    callbacks.onStatusChange('uploading');

    return new Promise<void>((resolve, reject) => {
      const manager = new UploadManager(
        {
          onProgress: (p) => callbacks.onProgress(p.percent),
          onSuccess: (vimeoUrl) => {
            callbacks.onStatusChange('completed');
            callbacks.onProgress(100);
            callbacks.onSuccess({ type: 'vimeo', url: vimeoUrl });
            resolve();
          },
          onError: (err) => {
            const classified = classifyError(err);
            logError('ExportService.tusUpload', err, { retryable: classified.retryable });
            callbacks.onStatusChange('failed');
            callbacks.onError(classified.userMessage);
            reject(err);
          },
          onStatusChange: () => {},
        },
        ticketResult.video_url,
      );

      manager.startUpload(file, ticketResult.upload_link);
    });
  } catch (err: any) {
    const classified = classifyError(err);
    logError('ExportService.vimeo', err, { retryable: classified.retryable });
    callbacks.onStatusChange('failed');
    callbacks.onError(classified.userMessage);
  }
}

function triggerDownload(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `montaji_export_${Date.now()}.mp4`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
