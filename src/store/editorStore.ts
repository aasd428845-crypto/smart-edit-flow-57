import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  type: 'user' | 'ai' | 'status' | 'error' | 'execution_result' | 'clarification';
  text: string;
  timestamp: Date;
  status?: 'processing' | 'completed' | 'failed';
  outputUrl?: string;
  diffLog?: string[];
  nextSteps?: string[];
  missingAssets?: string[];
  action?: string;
}

export interface TemplateCard {
  id: string;
  name: string;
  nameEn: string;
  contentType: string;
  color: string;
  icon: string;
  description: string;
  isPopular?: boolean;
}

interface EditorState {
  videoUrl: string | null;
  videoFile: File | null;
  videoSource: string | null;
  sourceType: 'blob' | 'local' | 'remote' | null;
  videoDuration: number;
  currentTime: number;
  isPlaying: boolean;
  projectId: string | null;
  projectStatus: string | null;
  selectedTemplate: TemplateCard | null;
  contentType: string | null;
  cinematicMode: boolean;
  messages: ChatMessage[];
  isProcessing: boolean;
  isUploading: boolean;
  selectedAgent: string;

  setVideoUrl: (url: string | null) => void;
  setVideoFile: (file: File | null) => void;
  setVideoSource: (src: string | null, type: 'blob' | 'local' | 'remote' | null) => void;
  setVideoDuration: (d: number) => void;
  setCurrentTime: (t: number) => void;
  setIsPlaying: (p: boolean) => void;
  setProjectId: (id: string | null) => void;
  setProjectStatus: (s: string | null) => void;
  setSelectedTemplate: (t: TemplateCard | null) => void;
  setContentType: (c: string | null) => void;
  setCinematicMode: (c: boolean) => void;
  setIsProcessing: (p: boolean) => void;
  setIsUploading: (u: boolean) => void;
  setSelectedAgent: (a: string) => void;
  addMessage: (m: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export const getEdgeFunctionUrl = (fn: string) => `${SUPABASE_URL}/functions/v1/${fn}`;

// Local backend URL for FFmpeg command execution
export const getLocalBackendUrl = () => {
  const saved = localStorage.getItem('local_backend_url');
  return saved || 'http://127.0.0.1:8000';
};

export const useEditorStore = create<EditorState>((set) => ({
  videoUrl: null,
  videoFile: null,
  videoSource: null,
  sourceType: null,
  videoDuration: 0,
  currentTime: 0,
  isPlaying: false,
  projectId: null,
  projectStatus: null,
  selectedTemplate: null,
  contentType: null,
  cinematicMode: false,
  selectedAgent: 'claude',
  messages: [
    {
      id: 'welcome',
      type: 'ai',
      text: 'مرحباً! أنا مونتاجي AI. يمكنني مساعدتك في المونتاج حتى بدون رفع فيديو. اسألني أي شيء! 🎬',
      timestamp: new Date(),
    },
  ],
  isProcessing: false,
  isUploading: false,

  setVideoUrl: (url) => set({ videoUrl: url }),
  setVideoFile: (file) => set({ videoFile: file }),
  setVideoSource: (src, type) => set({ videoSource: src, sourceType: type }),
  setVideoDuration: (d) => set({ videoDuration: d }),
  setCurrentTime: (t) => set({ currentTime: t }),
  setIsPlaying: (p) => set({ isPlaying: p }),
  setProjectId: (id) => set({ projectId: id }),
  setProjectStatus: (s) => set({ projectStatus: s }),
  setSelectedTemplate: (t) => set({ selectedTemplate: t, contentType: t?.contentType || null }),
  setContentType: (c) => set({ contentType: c }),
  setCinematicMode: (c) => set({ cinematicMode: c }),
  setIsProcessing: (p) => set({ isProcessing: p }),
  setIsUploading: (u) => set({ isUploading: u }),
  setSelectedAgent: (a) => set({ selectedAgent: a }),
  addMessage: (m) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { ...m, id: crypto.randomUUID(), timestamp: new Date() },
      ],
    })),
  clearMessages: () =>
    set({
      messages: [
        {
          id: 'welcome',
          type: 'ai',
          text: 'مرحباً! أنا مونتاجي AI. يمكنني مساعدتك في المونتاج حتى بدون رفع فيديو. اسألني أي شيء! 🎬',
          timestamp: new Date(),
        },
      ],
    }),
}));

export const defaultTemplates: TemplateCard[] = [
  { id: 'conference_001', name: 'مؤتمرات', nameEn: 'Conference', contentType: 'conference', color: '#1a3a5c', icon: '🎙️', description: 'مناسب للمؤتمرات والندوات' },
  { id: 'wedding_001', name: 'زفاف ذهبي', nameEn: 'Wedding', contentType: 'wedding', color: '#3a2a0a', icon: '💍', description: 'ألوان دافئة رومانسية' },
  { id: 'ad_001', name: 'إعلان نيون', nameEn: 'Advertisement', contentType: 'ad', color: '#1a0a2a', icon: '📢', description: 'حيوي ولافت للنظر' },
  { id: 'tiktok_001', name: 'تيك توك', nameEn: 'TikTok', contentType: 'social_media', color: '#0a1a1a', icon: '🎵', description: 'عمودي وسريع الإيقاع' },
  { id: 'cinema_001', name: 'سينمائي', nameEn: 'Cinematic', contentType: 'default', color: '#1a1a1a', icon: '🎞️', description: 'مونتاج سينمائي احترافي', isPopular: true },
  { id: 'documentary_001', name: 'وثائقي', nameEn: 'Documentary', contentType: 'documentary', color: '#0a1a0a', icon: '🎥', description: 'سينمائي وعميق' },
];

export const statusMessages: Record<string, string> = {
  queued: '⏳ في قائمة الانتظار...',
  downloading: '⬇️ جارٍ تنزيل الفيديو...',
  transcribing: '🎙️ جارٍ تفريغ النص...',
  denoising: '🔇 جارٍ تنقية الصوت...',
  cutting: '✂️ جارٍ القص...',
  adding_intro_outro: '🎬 إضافة مقدمة وخاتمة...',
  adding_lower_thirds: '📝 إضافة أسماء المتحدثين...',
  adding_subtitles: '💬 إضافة الترجمة النصية...',
  applying_template: '🎨 تطبيق القالب...',
  translating: '🌐 جارٍ الترجمة...',
  completed: '✅ اكتمل المونتاج! جاهز للتحميل.',
  failed: '❌ حدث خطأ. تحقق من التفاصيل.',
};