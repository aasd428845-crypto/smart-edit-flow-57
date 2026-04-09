import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let loaded = false;

export type FFmpegAction =  'trim' | 'speed' | 'reverse' | 'denoise' | 'color_grade' | 'montage' | 'info' | 'add_subtitles' | 'transcribe' | 'rotate';
export interface ProcessResult {
  success: boolean;
  outputUrl?: string;
  message: string;
  info?: Record<string, string>;
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && loaded) return ffmpeg;

  ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  loaded = true;
  return ffmpeg;
}

async function writeInput(ff: FFmpeg, videoSource: string): Promise<string> {
  const inputName = 'input.mp4';
  
  if (videoSource.startsWith('blob:')) {
    const res = await fetch(videoSource);
    const buf = await res.arrayBuffer();
    await ff.writeFile(inputName, new Uint8Array(buf));
  } else {
    const data = await fetchFile(videoSource);
    await ff.writeFile(inputName, data);
  }

  return inputName;
}

async function readOutput(ff: FFmpeg, outputName: string): Promise<string> {
  const data = await ff.readFile(outputName);
  const uint8 = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
  const blob = new Blob([uint8.buffer as ArrayBuffer], { type: 'video/mp4' });
  return URL.createObjectURL(blob);
}

export async function processVideo(
  action: FFmpegAction,
  videoSource: string,
  params: Record<string, any> = {},
): Promise<ProcessResult> {
  try {
    const ff = await getFFmpeg();
    const inputName = await writeInput(ff, videoSource);
    const outputName = 'output.mp4';

    let args: string[] = [];

    switch (action) {
      case 'trim': {
        const start = params.start ?? 0;
        const end = params.end ?? 30;
        args = ['-i', inputName, '-ss', String(start), '-to', String(end), '-c', 'copy', outputName];
        break;
      }

      case 'speed': {
        const factor = params.factor ?? 2;
        const vFilter = `setpts=${(1 / factor).toFixed(4)}*PTS`;
        const aFilter = `atempo=${Math.min(Math.max(factor, 0.5), 2.0)}`;
        args = ['-i', inputName, '-filter:v', vFilter, '-filter:a', aFilter, outputName];
        break;
      }

      case 'reverse': {
        args = ['-i', inputName, '-vf', 'reverse', '-af', 'areverse', outputName];
        break;
      }

      case 'denoise': {
        args = ['-i', inputName, '-af', 'afftdn=nf=-25', '-c:v', 'copy', outputName];
        break;
      }

      case 'color_grade': {
        const style = params.style || 'warm';
        let eq = 'eq=brightness=0.06:contrast=1.1:saturation=1.3';
        if (style === 'cinematic') eq = 'eq=brightness=-0.05:contrast=1.2:saturation=0.9';
        if (style === 'cold') eq = 'eq=brightness=0.02:contrast=1.1:saturation=0.8';
        args = ['-i', inputName, '-vf', eq, '-c:a', 'copy', outputName];
        break;
      }

      case 'montage': {
        // Full montage: color grade + denoise audio
        args = [
          '-i', inputName,
          '-vf', 'eq=brightness=0.04:contrast=1.15:saturation=1.2',
          '-af', 'afftdn=nf=-20,acompressor=threshold=-20dB:ratio=4',
          outputName,
        ];
        break;
      }

      case 'info': {
        // Run a short probe-like pass
        try {
          args = ['-i', inputName, '-f', 'null', '-'];
          await ff.exec(args);
        } catch {
          // ffmpeg returns non-zero for -f null, that's expected
        }
        return {
          success: true,
          message: '📊 تم تحليل الفيديو. راجع وحدة التحكم للتفاصيل.',
        };
      }

      case 'add_subtitles':
      case 'transcribe': {
        return {
          success: false,
          message: `⚠️ إجراء "${action}" يحتاج إلى معالجة سحابية (Cloud) وهي غير متوفرة محلياً حالياً.`,
        };
      }

      case 'rotate': {
        const degrees = params.degrees || 90;
        let vf = 'transpose=1'; // default 90 clockwise
        if (degrees === 180) vf = 'transpose=2,transpose=2';
        if (degrees === 270 || degrees === -90) vf = 'transpose=2';
        args = ['-i', inputName, '-vf', vf, '-c:a', 'copy', outputName];
        break;
      }

      default:
        return { success: false, message: `❌ إجراء غير معروف: ${action}` };
    }

    await ff.exec(args);
    const outputUrl = await readOutput(ff, outputName);

    // Cleanup
    try {
      await ff.deleteFile(inputName);
      await ff.deleteFile(outputName);
    } catch { /* ignore cleanup errors */ }

    return {
      success: true,
      outputUrl,
      message: `✅ تم تنفيذ "${action}" بنجاح`,
    };
  } catch (err: any) {
    console.error('[FFmpeg Error]', err);
    return {
      success: false,
      message: `❌ خطأ في معالجة الفيديو: ${err?.message || 'غير معروف'}`,
    };
  }
}
