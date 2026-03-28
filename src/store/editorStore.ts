import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  type: 'user' | 'ai' | 'status' | 'error';
  text: string;
  timestamp: Date;
  status?: 'processing' | 'completed' | 'failed';
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
  videoDuration: number;
  currentTime: number;
  isPlaying: boolean;
  projectId: string | null;
  projectStatus: string | null;
  selectedTemplate: TemplateCard | null;
  contentType: string | null;
  messages: ChatMessage[];
  isProcessing: boolean;
  isUploading: boolean;

  setVideoUrl: (url: string | null) => void;
  setVideoFile: (file: File | null) => void;
  setVideoDuration: (d: number) => void;
  setCurrentTime: (t: number) => void;
  setIsPlaying: (p: boolean) => void;
  setProjectId: (id: string | null) => void;
  setProjectStatus: (s: string | null) => void;
  setSelectedTemplate: (t: TemplateCard | null) => void;
  setContentType: (c: string | null) => void;
  setIsProcessing: (p: boolean) => void;
  setIsUploading: (u: boolean) => void;
  addMessage: (m: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  videoUrl: null,
  videoFile: null,
  videoDuration: 0,
  currentTime: 0,
  isPlaying: false,
  projectId: null,
  projectStatus: null,
  selectedTemplate: null,
  contentType: null,
  messages: [
    {
      id: 'welcome',
      type: 'ai',
      text: 'مرحباً! ارفع فيديو وأخبرني ماذا تريد أن أفعل.',
      timestamp: new Date(),
    },
  ],
  isProcessing: false,
  isUploading: false,

  setVideoUrl: (url) => set({ videoUrl: url }),
  setVideoFile: (file) => set({ videoFile: file }),
  setVideoDuration: (d) => set({ videoDuration: d }),
  setCurrentTime: (t) => set({ currentTime: t }),
  setIsPlaying: (p) => set({ isPlaying: p }),
  setProjectId: (id) => set({ projectId: id }),
  setProjectStatus: (s) => set({ projectStatus: s }),
  setSelectedTemplate: (t) => set({ selectedTemplate: t, contentType: t?.contentType || null }),
  setContentType: (c) => set({ contentType: c }),
  setIsProcessing: (p) => set({ isProcessing: p }),
  setIsUploading: (u) => set({ isUploading: u }),
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
          text: 'مرحباً! ارفع فيديو وأخبرني ماذا تريد أن أفعل.',
          timestamp: new Date(),
        },
      ],
    }),
}));

export const defaultTemplates: TemplateCard[] = [
  { id: 'conference_001', name: 'مؤتمرات', nameEn: 'Conference', contentType: 'conference', color: '#1a3a5a', icon: '🎤', description: 'مناسب للمؤتمرات والندوات' },
  { id: 'wedding_001', name: 'أفراح', nameEn: 'Wedding', contentType: 'wedding', color: '#3a2a1a', icon: '💍', description: 'ألوان دافئة رومانسية' },
  { id: 'ad_001', name: 'إعلانات', nameEn: 'Advertisement', contentType: 'ad', color: '#2a1a3a', icon: '📣', description: 'حيوي ولافت للنظر' },
  { id: 'corporate_001', name: 'شركات', nameEn: 'Corporate', contentType: 'corporate', color: '#1a2a1a', icon: '🏢', description: 'احترافي ورسمي' },
  { id: 'tiktok_001', name: 'تيك توك', nameEn: 'TikTok', contentType: 'social_media', color: '#2a1a2a', icon: '🎵', description: 'عمودي وسريع الإيقاع' },
  { id: 'documentary_001', name: 'وثائقي', nameEn: 'Documentary', contentType: 'documentary', color: '#1a1a1a', icon: '🎥', description: 'سينمائي وعميق' },
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
