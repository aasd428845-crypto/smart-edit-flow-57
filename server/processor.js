import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

// Segoe UI ships with Windows and includes Arabic glyphs. Fall back to Arial.
const ARABIC_FONT =
  process.env.ARABIC_FONT ||
  (fs.existsSync('C:/Windows/Fonts/segoeui.ttf') ? 'C:/Windows/Fonts/segoeui.ttf'
    : fs.existsSync('C:/Windows/Fonts/arial.ttf') ? 'C:/Windows/Fonts/arial.ttf' : null);

const FONT_NAME = process.env.ARABIC_FONT_NAME || 'Segoe UI';

const TMP = os.tmpdir();

async function run(args) {
  await execFileAsync(FFMPEG, args, { timeout: 900000, maxBuffer: 1024 * 1024 * 1024 });
}

export async function probe(file) {
  const { stdout } = await execFileAsync(FFPROBE, [
    '-v', 'quiet', '-print_format', 'json',
    '-show_format', '-show_streams', file,
  ], { timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
  const data = JSON.parse(stdout);
  const vs = data.streams.find((s) => s.codec_type === 'video');
  const as = data.streams.find((s) => s.codec_type === 'audio');
  return {
    duration: Number(data.format?.duration || vs?.duration || 0),
    width: vs?.width || 0,
    height: vs?.height || 0,
    fps: vs?.r_frame_rate ? evalRatio(vs.r_frame_rate) : 0,
    video_codec: vs?.codec_name || 'unknown',
    audio_codec: as?.codec_name || null,
    bitrate: Number(data.format?.bit_rate || 0),
    size: Number(data.format?.size || 0),
    format: data.format?.format_name || 'unknown',
    has_audio: !!as,
  };
}

function evalRatio(r) {
  if (!r || !r.includes('/')) return Number(r) || 0;
  const [a, b] = r.split('/').map(Number);
  return b ? Math.round((a / b) * 100) / 100 : a;
}

function escapeDrawtext(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '\\%');
}

function filterFontPath() {
  return ARABIC_FONT ? `fontfile='${ARABIC_FONT.replace(/:/g, '\\:')}'` : `font='${FONT_NAME}'`;
}

function secToAss(t) {
  const s = Math.max(0, Number(t) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor(((s % 60) - sec) * 100);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}.${String(cs).padStart(2, '0')}`;
}

async function writeAss(subtitles, width, height, outPath) {
  const style = `Style: Default,${FONT_NAME},${Math.round(height * 0.045)},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2.5,1,2,40,40,55,1`;
  const lines = (subtitles || []).map((s) => {
    const text = (s.text || '').replace(/\r?\n/g, '\\N').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
    return `Dialogue: 0,${secToAss(s.start)},${secToAss(s.end)},Default,,0,0,0,,${text}`;
  });
  const content = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${style}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.join('\n')}
`;
  fs.writeFileSync(outPath, content, 'utf8');
}

function tmpFile(ext, prefix = 'montaji_') {
  return path.join(TMP, `${prefix}${Date.now()}_${Math.round(Math.random() * 1e9)}.${ext}`);
}

const TEMPLATES_PATH = fileURLToPath(new URL('./templates.json', import.meta.url));
const TEMPLATES = JSON.parse(readFileSync(TEMPLATES_PATH, 'utf8'));

export function listTemplates() {
  return Object.entries(TEMPLATES).map(([id, t]) => ({ id, ...t }));
}

export async function processAction(action, files, params = {}) {
  const outExt = params.output_format || (action === 'extract_audio' ? 'mp3' : 'mp4');
  const output = tmpFile(outExt);
  const { videoPath, audioPath, imagePath, video2Path, imagePaths = [] } = files;

  switch (action) {
    case 'info': {
      if (!videoPath) throw new Error('video required');
      return { outputPath: null, info: await probe(videoPath), action: 'info' };
    }

    case 'trim': {
      if (!videoPath) throw new Error('video required');
      const start = Number(params.start ?? 0);
      const end = params.end != null ? Number(params.end) : null;
      const args = ['-y', '-ss', String(start), '-i', videoPath];
      if (end != null) args.push('-to', String(end));
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output);
      await run(args);
      break;
    }

    case 'speed': {
      if (!videoPath) throw new Error('video required');
      let factor = Number(params.factor ?? 2);
      if (!factor || factor <= 0) factor = 2;
      const vFilter = `setpts=${(1 / factor).toFixed(4)}*PTS`;
      const atempoFilters = [];
      let t = factor;
      while (t > 2) { atempoFilters.push('atempo=2.0'); t /= 2; }
      while (t < 0.5) { atempoFilters.push('atempo=0.5'); t *= 2; }
      atempoFilters.push(`atempo=${Math.min(Math.max(t, 0.5), 2).toFixed(4)}`);
      const aFilter = atempoFilters.join(',');
      await run(['-y', '-i', videoPath, '-filter:v', vFilter, '-filter:a', aFilter, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart', output]);
      break;
    }

    case 'reverse': {
      if (!videoPath) throw new Error('video required');
      await run(['-y', '-i', videoPath, '-vf', 'reverse', '-af', 'areverse', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart', output]);
      break;
    }

    case 'denoise': {
      if (!videoPath) throw new Error('video required');
      const audio = params.audio_only ? '-c:v' : '';
      const args = ['-y', '-i', videoPath];
      const vf = params.audio_only ? null : 'hqdn3d=4:3:6:4.5';
      if (vf) args.push('-vf', vf);
      args.push('-af', 'afftdn=nf=-25');
      args.push('-c:v', params.audio_only ? 'copy' : 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart', output);
      await run(args);
      break;
    }

    case 'color_grade': {
      if (!videoPath) throw new Error('video required');
      const style = params.style || 'warm';
      const eqMap = {
        warm: 'eq=brightness=0.06:contrast=1.1:saturation=1.3',
        cinematic: 'eq=brightness=-0.05:contrast=1.2:saturation=0.9',
        cold: 'eq=brightness=0.02:contrast=1.1:saturation=0.8',
        golden: 'eq=brightness=0.08:contrast=1.15:saturation=1.35:gamma=1.05,colorbalance=rm=0.08:bm=-0.05',
        vintage: 'eq=brightness=0.02:contrast=0.95:saturation=0.7,colorbalance=rm=0.1:gm=0.02:bm=-0.08',
        b_w: 'hue=s=0,eq=contrast=1.15',
      };
      const vf = eqMap[style] || eqMap.warm;
      await run(['-y', '-i', videoPath, '-vf', vf, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'copy', '-movflags', '+faststart', output]);
      break;
    }

    case 'rotate': {
      if (!videoPath) throw new Error('video required');
      const degrees = Number(params.degrees || 90);
      let vf;
      if (degrees === 180) vf = 'transpose=2,transpose=2';
      else if (degrees === 270 || degrees === -90) vf = 'transpose=2';
      else if (degrees === -270) vf = 'transpose=1';
      else vf = 'transpose=1';
      if (params.flip_h) vf += ',hflip';
      if (params.flip_v) vf += ',vflip';
      await run(['-y', '-i', videoPath, '-vf', vf, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'copy', '-movflags', '+faststart', output]);
      break;
    }

    case 'montage': {
      if (!videoPath) throw new Error('video required');
      await run([
        '-y', '-i', videoPath,
        '-vf', 'eq=brightness=0.04:contrast=1.15:saturation=1.2,vignette=PI/5',
        '-af', 'afftdn=nf=-20,acompressor=threshold=-20dB:ratio=4',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart', output,
      ]);
      break;
    }

    case 'extract_audio': {
      if (!videoPath) throw new Error('video required');
      await run(['-y', '-i', videoPath, '-vn', '-acodec', 'libmp3lame', '-q:a', params.quality || '2', output]);
      break;
    }

    case 'remove_audio': {
      if (!videoPath) throw new Error('video required');
      await run(['-y', '-i', videoPath, '-an', '-c:v', 'copy', '-movflags', '+faststart', output]);
      break;
    }

    case 'replace_audio': {
      if (!videoPath || !audioPath) throw new Error('video and audio required');
      const vInfo = await probe(videoPath);
      const args = ['-y', '-i', videoPath, '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0'];
      if (params.loop_audio) args.push('-stream_loop', '-1');
      args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', output);
      await run(args);
      break;
    }

    case 'add_subtitles': {
      if (!videoPath) throw new Error('video required');
      const subs = params.subtitles || [];
      if (!subs.length && params.srt) {
        const lines = String(params.srt).trim().split(/\r?\n/);
        let i = 0;
        let current = null;
        const parsed = [];
        while (i < lines.length) {
          const line = lines[i].trim();
          if (!current && /^\d+$/.test(line)) { current = { num: Number(line), start: null, end: null, text: [] }; }
          else if (current && current.start === null && line.includes('-->')) {
            const m = line.match(/(\d+:\d+:\d+[.,]\d+)\s*-->\s*(\d+:\d+:\d+[.,]\d+)/);
            if (m) { current.start = parseSrtTime(m[1]); current.end = parseSrtTime(m[2]); }
          }
          else if (current && current.start !== null && line === '') { parsed.push(current); current = null; }
          else if (current && current.start !== null) { current.text.push(line); }
          i++;
        }
        if (current) parsed.push(current);
        subs.push(...parsed.map((p) => ({ start: p.start, end: p.end, text: p.text.join(' ') })));
      }
      if (!subs.length) throw new Error('subtitles or srt required');
      const info = await probe(videoPath);
      const assPath = tmpFile('ass', 'montaji_subs_');
      await writeAss(subs, info.width || 1280, info.height || 720, assPath);
      const esc = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      await run(['-y', '-i', videoPath, '-vf', `subtitles='${esc}'`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'copy', '-movflags', '+faststart', output]);
      fs.unlinkSync(assPath);
      break;
    }

    case 'add_text': {
      if (!videoPath) throw new Error('video required');
      const text = params.text || 'نص';
      const size = Math.round((params.size || 72) * 0.72);
      const pos = params.position || 'center';
      let x = '(w-text_w)/2', y = '(h-text_h)/2';
      if (pos === 'top') { y = 'text_h*0.6'; }
      if (pos === 'bottom') { y = 'h-text_h-text_h*0.6'; }
      if (pos === 'top-right') { x = 'w-text_w-text_w*0.3'; y = 'text_h*0.6'; }
      if (pos === 'top-left') { x = 'text_w*0.3'; y = 'text_h*0.6'; }
      if (pos === 'bottom-right') { x = 'w-text_w-text_w*0.3'; y = 'h-text_h-text_h*0.6'; }
      if (pos === 'bottom-left') { x = 'text_w*0.3'; y = 'h-text_h-text_h*0.6'; }
      const ff = filterFontPath();
      const fontcolor = params.color || 'white';
      const box = params.box === false ? '' : 'box=1:boxcolor=black@0.35:boxborderw=12';
      const dt = `drawtext=${ff}:text='${escapeDrawtext(text)}':fontsize=${size}:fontcolor=${fontcolor}:${box}:x=${x}:y=${y}`;
      await run(['-y', '-i', videoPath, '-vf', dt, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'copy', '-movflags', '+faststart', output]);
      break;
    }

    case 'change_aspect': {
      if (!videoPath) throw new Error('video required');
      const aspect = params.aspect || '16:9';
      const info = await probe(videoPath);
      const [aw, ah] = aspect.split(':').map(Number);
      const targetW = params.width ? Number(params.width) : Math.round((info.width || 1920) / (info.width ? 1 : 1));
      const targetH = Math.round((targetW * ah) / aw);
      const fit = params.fit || 'crop';
      let vf;
      if (fit === 'contain') {
        vf = `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:color=black`;
      } else {
        vf = `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}`;
      }
      await run(['-y', '-i', videoPath, '-vf', vf, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'copy', '-movflags', '+faststart', output]);
      break;
    }

    case 'add_watermark': {
      if (!videoPath || !imagePath) throw new Error('video and watermark image required');
      const position = params.position || 'bottom-right';
      const margin = Number(params.margin ?? 16);
      const xMap = {
        'top-left': `${margin}`,
        'top-right': `main_w-overlay_w-${margin}`,
        'bottom-left': `${margin}`,
        'bottom-right': `main_w-overlay_w-${margin}`,
        center: `(main_w-overlay_w)/2`,
      };
      const yMap = {
        'top-left': `${margin}`,
        'top-right': `${margin}`,
        'bottom-left': `main_h-overlay_h-${margin}`,
        'bottom-right': `main_h-overlay_h-${margin}`,
        center: `(main_h-overlay_h)/2`,
      };
      const scale = params.scale ? `scale=${params.scale}:-1,` : '';
      const vf = `[1:v]${scale}format=rgba[wm];[0:v][wm]overlay=${xMap[position] || xMap['bottom-right']}:${yMap[position] || yMap['bottom-right']}`;
      await run(['-y', '-i', videoPath, '-i', imagePath, '-filter_complex', vf, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'copy', '-movflags', '+faststart', output]);
      break;
    }

    case 'merge_videos': {
      if (!videoPath || !video2Path) throw new Error('two videos required');
      const transition = params.transition || 'none';
      const i1 = await probe(videoPath);
      const i2 = await probe(video2Path);
      const hasA1 = !!i1.has_audio;
      const hasA2 = !!i2.has_audio;

      if (transition !== 'none') {
        const dur = params.transition_duration ?? 1;
        const offset = Math.max(0, i1.duration - dur);
        let fc = `[0:v][1:v]xfade=transition=${transition}:duration=${dur}:offset=${offset.toFixed(3)}[xv]`;
        const maps = ['-map', '[xv]'];
        if (hasA1 && hasA2) {
          fc += `;[0:a][1:a]acrossfade=d=${dur}[xa]`;
          maps.push('-map', '[xa]');
        } else if (hasA1) {
          fc += `;[0:a]anull[a0]`;
          maps.push('-map', '[a0]');
        } else if (hasA2) {
          fc += `;[1:a]anull[a1]`;
          maps.push('-map', '[a1]');
        }
        await run(['-y', '-i', videoPath, '-i', video2Path, '-filter_complex', fc, ...maps, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart', output]);
      } else {
        const concatInputs = `[0:v:0][1:v:0]`;
        const maps = ['-map', '[v]'];
        let fc = `${concatInputs}concat=n=2:v=1:a=0[v]`;
        if (hasA1 && hasA2) {
          fc = `[0:v:0][0:a:0][1:v:0][1:a:0]concat=n=2:v=1:a=1[v][a]`;
          maps.push('-map', '[a]');
        } else if (hasA1) {
          fc += `;[0:a:0]anull[a]`;
          maps.push('-map', '[a]');
        } else if (hasA2) {
          fc += `;[1:a:0]anull[a]`;
          maps.push('-map', '[a]');
        }
        await run(['-y', '-i', videoPath, '-i', video2Path, '-filter_complex', fc, ...maps, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart', output]);
      }
      break;
    }

    case 'compress': {
      if (!videoPath) throw new Error('video required');
      const quality = params.quality || 'medium';
      const crfMap = { low: '32', medium: '26', high: '20' };
      const crf = crfMap[quality] || '26';
      await run(['-y', '-i', videoPath, '-c:v', 'libx264', '-preset', params.preset || 'veryfast', '-crf', crf, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', output]);
      break;
    }

    case 'slideshow': {
      if (!imagePaths.length) throw new Error('images required');
      const aspect = params.aspect || '16:9';
      const [aw, ah] = aspect.split(':').map(Number);
      const w = params.width || 1280;
      const h = Math.round((w * ah) / aw);
      const per = Number(params.duration_per_image ?? 3);
      const fps = 30;
      const clips = [];
      const fades = [];
      let cur = 0;
      const videoArgs = ['-y'];
      for (let i = 0; i < imagePaths.length; i++) {
        videoArgs.push('-loop', '1', '-t', String(per), '-i', imagePaths[i]);
        const inFade = i > 0 ? `,fade=t=in:st=0:d=0.5` : '';
        const outFade = `,fade=t=out:st=${(per - 0.5).toFixed(2)}:d=0.5`;
        const label = `v${i}`;
        clips.push(`[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}${inFade}${outFade},setsar=1,format=yuv420p[${label}]`);
        if (i > 0) {
          fades.push(`[${clips.length - 1}]`);
        }
      }
      const concatInputs = clips.map((_, i) => `[v${i}]`).join('');
      const allVideo = `[v0][v1]concat=n=${imagePaths.length}:v=1:a=0[vout]`;
      const filter = clips.join(';') + ';' + allVideo;
      videoArgs.push('-filter_complex', filter, '-map', '[vout]', '-r', String(fps), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20');
      if (audioPath) {
        videoArgs.push('-i', audioPath, '-map', '1:a:0', '-c:a', 'aac', '-b:a', '192k', '-shortest');
      }
      videoArgs.push('-movflags', '+faststart', output);
      await run(videoArgs);
      break;
    }

    case 'apply_template': {
      if (!videoPath) throw new Error('video required');
      const template = TEMPLATES[params.template_id];
      if (!template) {
        throw new Error(`القالب "${params.template_id}" غير موجود. المتاح: ${Object.keys(TEMPLATES).join(', ')}`);
      }
      const info = await probe(videoPath);
      const filters = [];
      if (template.aspect) {
        const [aw, ah] = template.aspect.split(':').map(Number);
        const w = params.width ? Number(params.width) : Math.round(info.width || 1920);
        const h = Math.round((w * ah) / aw);
        filters.push(`scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`);
      }
      if (template.color_style) {
        const eqMap = {
          warm: 'eq=brightness=0.06:contrast=1.1:saturation=1.3',
          cinematic: 'eq=brightness=-0.05:contrast=1.2:saturation=0.9',
          cold: 'eq=brightness=0.02:contrast=1.1:saturation=0.8',
          golden: 'eq=brightness=0.08:contrast=1.15:saturation=1.35:gamma=1.05,colorbalance=rm=0.08:bm=-0.05',
          vintage: 'eq=brightness=0.02:contrast=0.95:saturation=0.7,colorbalance=rm=0.1:gm=0.02:bm=-0.08',
          b_w: 'hue=s=0,eq=contrast=1.15',
        };
        filters.push(eqMap[template.color_style] || eqMap.warm);
      }
      if (template.text || params.text) {
        const text = params.text || 'مونتاجي AI';
        const ff = filterFontPath();
        const size = Math.round((template.text?.size || 72) * 0.72);
        const pos = template.text?.position || 'center';
        let x = '(w-text_w)/2', y = '(h-text_h)/2';
        if (pos === 'bottom') y = 'h-text_h-text_h*0.6';
        filters.push(`drawtext=${ff}:text='${escapeDrawtext(text)}':fontsize=${size}:fontcolor=white:box=1:boxcolor=black@0.35:boxborderw=12:x=${x}:y=${y}`);
      }
      const vf = filters.join(',');
      const args = ['-y', '-i', videoPath];
      if (vf) args.push('-vf', vf);
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-c:a', 'copy', '-movflags', '+faststart', output);
      await run(args);
      break;
    }

    default:
      throw new Error(`إجراء غير معروف: ${action}`);
  }

  if (!fs.existsSync(output)) throw new Error(`فشل توليد الناتج للإجراء ${action}`);
  return { outputPath: output, action, info: videoPath ? await probe(output).catch(() => null) : null };
}

function parseSrtTime(t) {
  const n = t.replace(',', '.');
  const [h, m, s] = n.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}
