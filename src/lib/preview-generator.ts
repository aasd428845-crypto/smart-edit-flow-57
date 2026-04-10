import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let previewFfmpeg: FFmpeg | null = null;
let previewLoaded = false;

async function getPreviewFFmpeg(): Promise<FFmpeg> {
  if (previewFfmpeg && previewLoaded) return previewFfmpeg;
  previewFfmpeg = new FFmpeg();
  previewFfmpeg.on('log', ({ message }) => console.log('[Preview FFmpeg]', message));

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await previewFfmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  previewLoaded = true;
  return previewFfmpeg;
}

/**
 * Generate a low-resolution preview from the processed video blob URL.
 * Scales down to 480p and uses fast encoding for quick generation.
 */
export async function generatePreview(
  videoSource: string,
  onProgress?: (percent: number) => void,
): Promise<{ previewUrl: string; success: boolean; error?: string }> {
  try {
    const ff = await getPreviewFFmpeg();

    // Write input
    const inputName = 'preview_input.mp4';
    const outputName = 'preview_output.mp4';

    const res = await fetch(videoSource);
    const buf = await res.arrayBuffer();
    await ff.writeFile(inputName, new Uint8Array(buf));

    // Track progress
    let duration = 0;
    ff.on('log', ({ message }) => {
      // Parse duration from FFmpeg output
      const durMatch = message.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      if (durMatch) {
        duration = parseFloat(durMatch[1]) * 3600 + parseFloat(durMatch[2]) * 60 + parseFloat(durMatch[3]);
      }
      // Parse current time
      const timeMatch = message.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch && duration > 0) {
        const current = parseFloat(timeMatch[1]) * 3600 + parseFloat(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
        onProgress?.(Math.min(Math.round((current / duration) * 100), 99));
      }
    });

    // Generate low-res preview: scale to 480p, fast preset
    await ff.exec([
      '-i', inputName,
      '-vf', 'scale=-2:480',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      outputName,
    ]);

    onProgress?.(100);

    const data = await ff.readFile(outputName);
    const uint8 = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
    const blob = new Blob([uint8.buffer as ArrayBuffer], { type: 'video/mp4' });
    const previewUrl = URL.createObjectURL(blob);

    // Cleanup
    try {
      await ff.deleteFile(inputName);
      await ff.deleteFile(outputName);
    } catch { /* ignore */ }

    return { previewUrl, success: true };
  } catch (err: any) {
    console.error('[Preview Generator Error]', err);
    return { previewUrl: '', success: false, error: err.message };
  }
}
