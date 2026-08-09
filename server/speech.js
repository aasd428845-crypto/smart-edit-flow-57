import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { probe } from './processor.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const TMP = os.tmpdir();

export const WHISPER_DIR =
  process.env.WHISPER_DIR || path.join(__dirname, 'whisper');
export const WHISPER_CLI = process.env.WHISPER_CLI_PATH || path.join(WHISPER_DIR, 'whisper-cli.exe');
export const WHISPER_MODEL = process.env.WHISPER_MODEL_PATH || path.join(WHISPER_DIR, 'ggml-base.bin');
export const WHISPER_READY = fs.existsSync(WHISPER_CLI) && fs.existsSync(WHISPER_MODEL);

export async function extractAudioWav(videoPath, outPath, { sampleRate = 16000 } = {}) {
  await execFileAsync(FFMPEG, [
    '-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', String(sampleRate),
    '-f', 'wav', '-acodec', 'pcm_s16le', outPath,
  ], { timeout: 300000, maxBuffer: 1024 * 1024 * 1024 });
}

export async function transcribeWithWhisper(videoPath, { language, threads = 4 } = {}) {
  if (!WHISPER_READY) {
    throw new Error('Whisper غير مهيأ. تأكد من وجود whisper-cli.exe و ggml-base.bin داخل server/whisper/');
  }
  const wavPath = path.join(TMP, `montaji_wav_${Date.now()}_${Math.round(Math.random() * 1e9)}.wav`);
  const outPrefix = path.join(TMP, `montaji_wt_${Date.now()}_${Math.round(Math.random() * 1e9)}`);
  try {
    await extractAudioWav(videoPath, wavPath);
    const args = [
      '-m', WHISPER_MODEL,
      '-f', wavPath,
      '-t', String(threads),
      '-oj', '-of', outPrefix,
      '--print-progress', 'false',
    ];
    if (language) args.push('-l', language);
    await execFileAsync(WHISPER_CLI, args, { timeout: 900000, maxBuffer: 1024 * 1024 * 1024 });

    const jsonPath = `${outPrefix}.json`;
    if (!fs.existsSync(jsonPath)) {
      throw new Error('Whisper لم ينتج ملف JSON');
    }
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const raw = data?.result?.transcription || data?.transcription || [];
    const segments = raw.map((s) => ({
      start: Number(s?.offsets?.from ?? 0) / 1000,
      end: Number(s?.offsets?.to ?? 0) / 1000,
      text: String(s?.text || '').trim(),
    })).filter((s) => s.text && s.end > s.start);
    return { language: data?.result?.language || language || 'unknown', segments };
  } finally {
    for (const p of [wavPath, `${outPrefix}.json`, `${outPrefix}.srt`, `${outPrefix}.txt`]) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
}

export function formatSrtTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.round(((s % 60) - secs) * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(secs)},${String(ms).padStart(3, '0')}`;
}

export function buildSRT(segments) {
  return (segments || []).map((s, i) =>
    `${i + 1}\n${formatSrtTime(s.start)} --> ${formatSrtTime(s.end)}\n${(s.text || '').trim()}\n`
  ).join('\n');
}

export async function ttsToWav(text, voice, outPath) {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS);
    const tmpDir = path.join(TMP, `montaji_tts_${Date.now()}_${Math.round(Math.random() * 1e9)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const { audioFilePath } = await tts.toFile(tmpDir, text);
    await execFileAsync(FFMPEG, [
      '-y', '-i', audioFilePath, '-ac', '1', '-ar', '44100',
      '-c:a', 'pcm_s16le', outPath,
    ], { timeout: 120000, maxBuffer: 1024 * 1024 * 1024 });
    return outPath;
  } finally {
    tts.close();
  }
}

// Mix voice segments over the video at their subtitle start times.
// tracks: [{ start (seconds), path (wav) }]
export async function dubVideo(videoPath, tracks, outputPath, { keepOriginal = 0.15, musicPath, musicVolume = 0.2 } = {}) {
  if (!tracks?.length) throw new Error('لا توجد مقاطع صوتية للدمج');
  const inputs = ['-y', '-i', videoPath];
  for (const t of tracks) inputs.push('-i', t.path);
  if (musicPath) inputs.push('-i', musicPath);

  const info = await probe(videoPath);
  const filterParts = [];
  const mixInputs = [];
  let voiceIdx = 1;

  if (info.has_audio && Number(keepOriginal) > 0) {
    filterParts.push(`[0:a]volume=${Number(keepOriginal)}[orig]`);
    mixInputs.push('[orig]');
  }

  for (const t of tracks) {
    const delayMs = Math.round(Math.max(0, Number(t.start) * 1000));
    filterParts.push(`[${voiceIdx}:a]adelay=${delayMs}:all=1[v${voiceIdx}]`);
    mixInputs.push(`[v${voiceIdx}]`);
    voiceIdx++;
  }

  if (musicPath) {
    const musicIdx = voiceIdx;
    filterParts.push(`[${musicIdx}:a]volume=${Number(musicVolume)},aloop=loop=-1:size=2e9[music]`);
    mixInputs.push('[music]');
  }

  let mixFilter;
  if (mixInputs.length === 1) {
    const label = mixInputs[0].replace(/^\[|\]$/g, '');
    mixFilter = `[${label}]alimiter=limit=0.98[aout]`;
  } else {
    mixFilter = `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest:normalize=0,alimiter=limit=0.98[aout]`;
  }

  const args = [
    ...inputs,
    '-filter_complex', [...filterParts, mixFilter].join(';'),
    '-map', '0:v:0', '-c:v', 'copy',
    '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart', outputPath,
  ];
  await execFileAsync(FFMPEG, args, { timeout: 900000, maxBuffer: 1024 * 1024 * 1024 });
  return outputPath;
}

export async function videoDuration(videoPath) {
  const info = await probe(videoPath);
  return info.duration || 0;
}
