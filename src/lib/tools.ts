// Client-side AI tool handlers
// These execute directly in the browser or against the local server

import { getLocalApiUrl } from '@/store/editorStore';

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

// 1. Transcribe video — uses local server with ffmpeg + whisper
async function tool_transcribe(args: { video_url: string }): Promise<ToolResult> {
  try {
    const res = await fetch(getLocalApiUrl('/api/transcribe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_url: args.video_url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `خطأ (${res.status})`);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || 'فشل تفريغ الفيديو' };
  }
}

// 2. Remove background — uses local server
async function tool_remove_background(args: { image_url: string }): Promise<ToolResult> {
  try {
    const res = await fetch(getLocalApiUrl('/api/remove-bg'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: args.image_url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `خطأ (${res.status})`);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || 'فشل إزالة الخلفية' };
  }
}

// 3. Translate video — whisper + LLM translation + Arabic subtitles (or burn into video)
async function tool_translate_subtitles(args: { video_url: string; target_lang?: string; mode?: string }): Promise<ToolResult> {
  try {
    const res = await fetch(getLocalApiUrl('/api/subtitles'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_url: args.video_url,
        target_lang: args.target_lang || 'ar',
        mode: args.mode || 'srt',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `خطأ (${res.status})`);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || 'فشلت ترجمة الفيديو' };
  }
}

// 4. Dub video — whisper + LLM translation + Arabic TTS voice
async function tool_dub_video(args: { video_url: string; target_lang?: string; voice?: string; keep_original?: number }): Promise<ToolResult> {
  try {
    const res = await fetch(getLocalApiUrl('/api/dub'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_url: args.video_url,
        target_lang: args.target_lang || 'ar',
        voice: args.voice || 'ar-EG-SalmaNeural',
        keep_original: typeof args.keep_original === 'number' ? args.keep_original : 0.15,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `خطأ (${res.status})`);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || 'فشلت دبلجة الفيديو' };
  }
}

// Map tool names to handlers
export const toolHandlers: Record<string, (args: any) => Promise<ToolResult>> = {
  transcribe_video: tool_transcribe,
  remove_background: tool_remove_background,
  translate_subtitles: tool_translate_subtitles,
  dub_video: tool_dub_video,
};
