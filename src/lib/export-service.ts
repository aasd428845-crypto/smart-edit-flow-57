/**
 * Export Service — handles video download and local server upload
 * Centralized export logic with retry and error handling
 */

import { getLocalApiUrl } from '@/store/editorStore';
import { retryWithBackoff } from './network-utils';
import { logError, classifyError } from './error-logger';

export type ExportStatus = 'idle' | 'preparing' | 'downloading' | 'uploading' | 'completed' | 'failed';

export interface ExportCallbacks {
  onProgress: (percent: number) => void;
  onStatusChange: (status: ExportStatus) => void;
  onSuccess: (result: { type: 'download' | 'server'; url?: string }) => void;
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

    const blob = new Blob(chunks as BlobPart[], { type: 'video/mp4' });
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
 * Upload video to the local server with full progress tracking
 */
export async function uploadToLocalServer(
  videoUrl: string,
  callbacks: ExportCallbacks,
): Promise<void> {
  callbacks.onStatusChange('preparing');
  callbacks.onProgress(0);

  try {
    // Step 1: Prepare file
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`فشل قراءة الفيديو (${res.status})`);
    const blob = await res.blob();
    const file = new File([blob], `montaji_${Date.now()}.mp4`, { type: 'video/mp4' });

    // Step 2: Upload to local server with XHR progress
    callbacks.onStatusChange('uploading');

    return new Promise<void>((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', getLocalApiUrl('/api/upload'));

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          callbacks.onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            callbacks.onStatusChange('completed');
            callbacks.onProgress(100);
            callbacks.onSuccess({ type: 'server', url: data.url });
            resolve();
          } catch (err) {
            const e = err as Error;
            logError('ExportService.localUpload', e, { retryable: false });
            callbacks.onStatusChange('failed');
            callbacks.onError('استجابة غير صالحة من السيرفر');
            reject(e);
          }
        } else {
          const e = new Error(`فشل الرفع (${xhr.status})`);
          logError('ExportService.localUpload', e, { retryable: false });
          callbacks.onStatusChange('failed');
          callbacks.onError(e.message);
          reject(e);
        }
      };

      xhr.onerror = () => {
        const e = new Error('فشل الاتصال بالسيرفر المحلي');
        logError('ExportService.localUpload', e, { retryable: false });
        callbacks.onStatusChange('failed');
        callbacks.onError(e.message);
        reject(e);
      };

      xhr.send(form);
    });
  } catch (err: any) {
    const classified = classifyError(err);
    logError('ExportService.localUpload', err, { retryable: classified.retryable });
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
