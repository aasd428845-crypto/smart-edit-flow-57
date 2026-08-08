import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { getLocalApiUrl } from '@/store/editorStore';

let ffmpeg: FFmpeg | null = null;
let loaded = false;

export type FFmpegAction =
  | 'trim' | 'speed' | 'reverse' | 'denoise' | 'color_grade' | 'montage' | 'info' | 'add_subtitles' | 'transcribe' | 'rotate'
  | 'extract_audio' | 'remove_audio' | 'replace_audio' | 'add_text'
  | 'change_aspect' | 'add_watermark' | 'merge_videos' | 'compress'
  | 'apply_template' | 'slideshow';
export interface ProcessResult {
  success: boolean;
  outputUrl?: string;
  message: string;
  info?: Record<string, any>;
}

// Actions that can fall back to in-browser FFmpeg.wasm if the server is unreachable
const WASM_SUPPORTED: FFmpegAction[] = ['trim', 'speed', 'reverse', 'denoise', 'color_grade', 'montage', 'info', 'rotate'];

// Upload a blob URL to the local server so it can be processed by server-side FFmpeg.
async function ensureServerUrl(source: string): Promise<string> {
  if (source.startsWith('http://localhost:8787') || source.startsWith('http://127.0.0.1')) return source;
  const res = await fetch(source);
  const blob = await res.blob();
  const fd = new FormData();
  fd.append('file', blob, 'video.mp4');
  const up = await fetch(getLocalApiUrl('/api/upload'), { method: 'POST', body: fd });
  const data = await up.json();
  if (!up.ok || !data.url) throw new Error(data.error || 'فشل رفع الفيديو إلى محرك المعالجة');
  return data.url;
}

function formatInfo(info: any): string {
  if (!info) return '';
  const lines = [
    `• **المدة:** ${Number(info.duration || 0).toFixed(1)} ثانية`,
    `• **الأبعاد:** ${info.width}×${info.height}`,
    `• **المعدل:** ${info.fps || '?'} إطار/ثانية`,
    `• **ترميز الفيديو:** ${info.video_codec || '?'}`,
    info.audio_codec ? `• **ترميز الصوت:** ${info.audio_codec}` : '• **بدون صوت**',
    info.bitrate ? `• **معدل البت:** ${(info.bitrate / 1000).toFixed(0)} kbps` : '',
    `• **الحجم:** ${((info.size || 0) / 1024).toFixed(1)} KB`,
  ];
  return lines.filter(Boolean).join('\n');
}

export async function processVideo(
  action: FFmpegAction,
  videoSource: string,
  params: Record<string, any> = {},
): Promise<ProcessResult> {
  // Primary path: server-side FFmpeg engine (full feature set: Arabic text, subtitles,
  // audio replace, aspect change, watermarks, merging, templates, slideshows...)
  try {
    const video_url = await ensureServerUrl(videoSource);
    const body: Record<string, any> = {
      action,
      video_url,
      audio_url: params.audio_url,
      image_url: params.image_url,
      video2_url: params.video2_url,
      images: params.images,
      params,
    };
    const res = await fetch(getLocalApiUrl('/api/process'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || `فشلت المعالجة (${res.status})`);

    if (action === 'info') {
      return { success: true, message: `📊 معلومات الفيديو:\n\n${formatInfo(data.info)}`, info: data.info };
    }
    return { success: true, outputUrl: data.output_url, message: `✅ تم تنفيذ "${action}" بنجاح`, info: data.info };
  } catch (err: any) {
    // Fallback: in-browser FFmpeg.wasm for the basic set of actions
    if (WASM_SUPPORTED.includes(action)) {
      return processVideoWasm(action, videoSource, params);
    }
    return { success: false, message: `❌ فشلت معالجة "${action}": ${err?.message || 'غير معروف'}` };
  }
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
  
  try {
    if (videoSource.startsWith('blob:')) {
      const res = await fetch(videoSource);
      const buf = await res.arrayBuffer();
      await ff.writeFile(inputName, new Uint8Array(buf));
    } else {
      // For remote URLs, use fetch with cors mode explicitly
      // fetchFile sometimes fails with CORS on certain environments
      const response = await fetch(videoSource, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      await ff.writeFile(inputName, new Uint8Array(arrayBuffer));
    }
  } catch (err: any) {
    console.error('Error writing input to FFmpeg:', err);
    throw new Error(`فشل في تحميل الفيديو للمعالجة: ${err.message}. تأكد من إعدادات CORS في السيرفر المحلي.`);
  }

  return inputName;
}

async function readOutput(ff: FFmpeg, outputName: string): Promise<string> {
  const data = await ff.readFile(outputName);
  const uint8 = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
  const blob = new Blob([uint8.buffer as ArrayBuffer], { type: 'video/mp4' });
  return URL.createObjectURL(blob);
}

export async function processVideoWasm(
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
        if (style === 'golden') eq = 'eq=brightness=0.08:contrast=1.15:saturation=1.35:gamma=1.05';
        if (style === 'vintage') eq = 'eq=brightness=0.02:contrast=0.95:saturation=0.7';
        if (style === 'b_w') eq = 'hue=s=0,eq=contrast=1.15';
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
          message: `⚠️ إجراء "${action}" يحتاج إلى محرك المعالجة السيرفري (غير متصل حالياً).`,
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
      message: `✅ تم تنفيذ "${action}" بنجاح (في المتصفح)`,
    };
  } catch (err: any) {
    console.error('[FFmpeg Error]', err);
    return {
      success: false,
      message: `❌ خطأ في معالجة الفيديو: ${err?.message || 'غير معروف'}`,
    };
  }
}
