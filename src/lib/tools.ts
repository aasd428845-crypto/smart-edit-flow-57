// Client-side AI tool handlers
// These execute directly in the browser without needing the FastAPI backend

import { supabase } from '@/integrations/supabase/client';

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

// 1. Vimeo oEmbed info — no API key needed
async function tool_get_vimeo_info(args: { video_url: string }): Promise<ToolResult> {
  try {
    const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(args.video_url)}`);
    if (!res.ok) throw new Error(`Vimeo API error: ${res.status}`);
    const data = await res.json();
    return {
      success: true,
      data: {
        title: data.title,
        author: data.author_name,
        duration: data.duration,
        width: data.width,
        height: data.height,
        thumbnail: data.thumbnail_url,
        description: data.description || '',
        upload_date: data.upload_date || '',
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'فشل جلب معلومات Vimeo' };
  }
}

// 2. Transcribe video — uses edge function proxy to protect API key
async function tool_transcribe(args: { video_url: string }): Promise<ToolResult> {
  try {
    const { data, error } = await supabase.functions.invoke('transcribe-proxy', {
      body: { video_url: args.video_url },
    });
    if (error) throw error;
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || 'فشل تفريغ الفيديو' };
  }
}

// 3. Remove background — uses edge function proxy to protect API key
async function tool_remove_background(args: { image_url: string }): Promise<ToolResult> {
  try {
    const { data, error } = await supabase.functions.invoke('remove-bg-proxy', {
      body: { image_url: args.image_url },
    });
    if (error) throw error;
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || 'فشل إزالة الخلفية' };
  }
}

// Map tool names to handlers
export const toolHandlers: Record<string, (args: any) => Promise<ToolResult>> = {
  get_vimeo_info: tool_get_vimeo_info,
  transcribe_video: tool_transcribe,
  remove_background: tool_remove_background,
};
