import * as tus from 'tus-js-client';

export type UploadStatus = 'idle' | 'uploading' | 'paused' | 'retrying' | 'completed' | 'failed' | 'cancelled';

export interface UploadProgress {
  percent: number;
  speed: number; // bytes per second
  eta: number; // seconds remaining
  bytesUploaded: number;
  bytesTotal: number;
}

export interface UploadManagerCallbacks {
  onProgress?: (progress: UploadProgress) => void;
  onSuccess?: (videoUrl: string) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: UploadStatus) => void;
}

export class UploadManager {
  private upload: tus.Upload | null = null;
  private status: UploadStatus = 'idle';
  private lastLoaded = 0;
  private lastTime = 0;
  private callbacks: UploadManagerCallbacks;
  private videoUrl: string;

  constructor(callbacks: UploadManagerCallbacks, videoUrl: string) {
    this.callbacks = callbacks;
    this.videoUrl = videoUrl;
  }

  private setStatus(s: UploadStatus) {
    this.status = s;
    this.callbacks.onStatusChange?.(s);
  }

  startUpload(file: File, uploadLink: string) {
    this.lastLoaded = 0;
    this.lastTime = Date.now();
    this.setStatus('uploading');

    this.upload = new tus.Upload(file, {
      uploadUrl: uploadLink,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      chunkSize: 5 * 1024 * 1024, // 5 MB chunks
      metadata: {
        filename: file.name,
        filetype: file.type,
      },
      onProgress: (bytesUploaded: number, bytesTotal: number) => {
        const now = Date.now();
        const elapsed = (now - this.lastTime) / 1000;
        const speed = elapsed > 0 ? (bytesUploaded - this.lastLoaded) / elapsed : 0;
        const remaining = bytesTotal - bytesUploaded;
        const eta = speed > 0 ? remaining / speed : 0;
        const percent = Math.round((bytesUploaded / bytesTotal) * 100);

        // Update reference points every 2 seconds for smoother speed calc
        if (elapsed >= 2) {
          this.lastLoaded = bytesUploaded;
          this.lastTime = now;
        }

        this.callbacks.onProgress?.({ percent, speed, eta, bytesUploaded, bytesTotal });
      },
      onSuccess: () => {
        this.setStatus('completed');
        this.callbacks.onSuccess?.(this.videoUrl);
      },
      onError: (error: Error) => {
        if (this.status === 'cancelled') return;
        console.error('TUS upload error:', error);
        this.setStatus('failed');
        this.callbacks.onError?.(error);
      },
      onShouldRetry: (err: Error) => {
        this.setStatus('retrying');
        return true; // always retry (within retryDelays)
      },
      onAfterResponse: (_req: unknown, res: { getStatus: () => number }) => {
        if (this.status === 'retrying') {
          this.setStatus('uploading');
        }
      },
    });

    this.upload.start();
  }

  pause() {
    if (this.upload && this.status === 'uploading') {
      this.upload.abort();
      this.setStatus('paused');
    }
  }

  resume() {
    if (this.upload && this.status === 'paused') {
      this.lastTime = Date.now();
      this.setStatus('uploading');
      this.upload.start();
    }
  }

  cancel() {
    if (this.upload) {
      this.setStatus('cancelled');
      this.upload.abort();
      this.upload = null;
    }
  }

  getStatus() {
    return this.status;
  }
}
