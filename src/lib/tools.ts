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

// Map tool names to handlers
export const toolHandlers: Record<string, (args: any) => Promise<ToolResult>> = {
  transcribe_video: tool_transcribe,
  remove_background: tool_remove_background,
};
