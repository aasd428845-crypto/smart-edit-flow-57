import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Upload, Video, Settings, Play, Download, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ProjectStatus = "pending" | "processing" | "transcribing" | "cutting" | "translating" | "completed" | "error";

const statusLabels: Record<ProjectStatus, string> = {
  pending: "في الانتظار",
  processing: "جاري المعالجة...",
  transcribing: "جاري التفريغ...",
  cutting: "جاري القص...",
  translating: "جاري الترجمة...",
  completed: "انتهى ✅",
  error: "حدث خطأ ❌",
};

const statusProgress: Record<ProjectStatus, number> = {
  pending: 0,
  processing: 10,
  transcribing: 30,
  cutting: 55,
  translating: 80,
  completed: 100,
  error: 0,
};

const Index = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`project-${projectId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "projects", filter: `id=eq.${projectId}` },
        (payload) => {
          const newStatus = payload.new.status as ProjectStatus;
          setStatus(newStatus);
          if (payload.new.output_url) {
            setOutputUrl(payload.new.output_url);
          }
          if (newStatus === "completed") {
            toast.success("تم الانتهاء من المونتاج بنجاح!");
          } else if (newStatus === "error") {
            toast.error("حدث خطأ أثناء المعالجة");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.type === "video/mp4" || droppedFile.name.endsWith(".mov"))) {
      setFile(droppedFile);
    } else {
      toast.error("يرجى رفع ملف بصيغة MP4 أو MOV فقط");
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  }, []);

  const handleUploadToVimeo = async () => {
    if (!file) return;

    const token = localStorage.getItem("vimeo_access_token");
    if (!token) {
      toast.error("يرجى إدخال Vimeo Access Token في صفحة الإعدادات أولاً");
      return;
    }

    setIsUploading(true);
    try {
      // Create project in DB
      const { data: project, error: dbError } = await supabase
        .from("projects")
        .insert({ status: "pending" })
        .select()
        .single();

      if (dbError) throw dbError;
      setProjectId(project.id);

      // Upload to Vimeo via Edge Function
      const formData = new FormData();
      formData.append("file", file);
      formData.append("token", token);
      formData.append("project_id", project.id);

      const projectId_env = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(
        `https://${projectId_env}.supabase.co/functions/v1/upload-to-vimeo`,
        {
          method: "POST",
          body: formData,
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "فشل الرفع");

      setVideoUrl(result.video_url);
      toast.success("تم رفع الفيديو إلى Vimeo بنجاح!");
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء رفع الفيديو");
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleExecute = async () => {
    if (!videoUrl || !command.trim() || !projectId) return;

    setIsExecuting(true);
    setStatus("processing");

    try {
      // Update project with command
      await supabase
        .from("projects")
        .update({ video_url: videoUrl, user_command: command, status: "processing" })
        .eq("id", projectId);

      // Send to local server
      const response = await fetch("http://localhost:8000/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_url: videoUrl,
          command: command,
          project_id: projectId,
        }),
      });

      if (!response.ok) {
        throw new Error("فشل الاتصال بالخادم المحلي");
      }
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء تنفيذ المونتاج");
      setStatus("error");
    } finally {
      setIsExecuting(false);
    }
  };

  const resetAll = () => {
    setFile(null);
    setVideoUrl(null);
    setCommand("");
    setProjectId(null);
    setStatus(null);
    setOutputUrl(null);
    setIsExecuting(false);
    setIsUploading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Video className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">مونتاجي الذكي</h1>
              <p className="text-xs text-muted-foreground">للإستخدام الشخصي</p>
            </div>
          </div>
          <Link to="/settings">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <Settings className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-10 max-w-2xl space-y-8">
        {/* Step 1: Upload */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="p-5 border-b border-border bg-muted/30">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center font-bold">١</span>
                رفع الفيديو
              </h2>
            </div>
            <div className="p-6">
              {!file ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 ${
                    isDragging
                      ? "border-primary bg-primary/5 scale-[1.01]"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  }`}
                >
                  <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-foreground font-medium mb-1">اسحب الفيديو هنا أو اضغط للاختيار</p>
                  <p className="text-sm text-muted-foreground">يدعم ملفات MP4 و MOV</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp4,.mov,video/mp4,video/quicktime"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                    <Video className="w-8 h-8 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(file.size / (1024 * 1024)).toFixed(1)} ميجابايت
                      </p>
                    </div>
                    {!videoUrl && (
                      <Button variant="ghost" size="sm" onClick={() => setFile(null)} className="text-muted-foreground">
                        تغيير
                      </Button>
                    )}
                  </div>

                  {!videoUrl && (
                    <Button
                      onClick={handleUploadToVimeo}
                      disabled={isUploading}
                      className="w-full h-12 text-base font-semibold"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          جاري الرفع إلى Vimeo...
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5" />
                          رفع إلى Vimeo
                        </>
                      )}
                    </Button>
                  )}

                  {videoUrl && (
                    <div className="flex items-center gap-2 p-3 bg-success/10 rounded-lg text-sm">
                      <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                      <span className="text-success">تم الرفع بنجاح</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Command */}
        {videoUrl && (
          <Card className="overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <CardContent className="p-0">
              <div className="p-5 border-b border-border bg-muted/30">
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center font-bold">٢</span>
                  أمر المونتاج
                </h2>
              </div>
              <div className="p-6 space-y-4">
                <Textarea
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="اكتب أمر المونتاج هنا... مثال: قص الفيديو من الدقيقة 2 إلى 5 وأضف ترجمة عربية"
                  className="min-h-[140px] text-base resize-none"
                  dir="rtl"
                />
                <Button
                  onClick={handleExecute}
                  disabled={!command.trim() || isExecuting || status === "completed"}
                  className="w-full h-12 text-base font-semibold bg-accent hover:bg-accent/90 text-accent-foreground"
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      جاري الإرسال...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      تنفيذ المونتاج
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Progress */}
        {status && (
          <Card className="overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <CardContent className="p-0">
              <div className="p-5 border-b border-border bg-muted/30">
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center font-bold">٣</span>
                  حالة التقدم
                </h2>
              </div>
              <div className="p-6 space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{statusLabels[status]}</span>
                    <span className="text-muted-foreground">{statusProgress[status]}%</span>
                  </div>
                  <Progress value={statusProgress[status]} className="h-3" />
                </div>

                {/* Status Steps */}
                <div className="space-y-2">
                  {(["transcribing", "cutting", "translating", "completed"] as ProjectStatus[]).map((step) => {
                    const stepIndex = ["transcribing", "cutting", "translating", "completed"].indexOf(step);
                    const currentIndex = ["transcribing", "cutting", "translating", "completed"].indexOf(status);
                    const isDone = currentIndex > stepIndex || status === "completed";
                    const isCurrent = status === step;

                    return (
                      <div
                        key={step}
                        className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                          isCurrent ? "bg-primary/10" : isDone ? "bg-muted/50" : "opacity-40"
                        }`}
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                        ) : isCurrent ? (
                          <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-border" />
                        )}
                        <span className={`text-sm ${isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                          {statusLabels[step]}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {status === "error" && (
                  <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg text-sm">
                    <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                    <span className="text-destructive">حدث خطأ أثناء المعالجة. يرجى المحاولة مرة أخرى.</span>
                  </div>
                )}

                {status === "completed" && outputUrl && (
                  <a
                    href={outputUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full h-12 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold text-base transition-colors"
                  >
                    <Download className="w-5 h-5" />
                    تحميل الفيديو النهائي
                  </a>
                )}

                {(status === "completed" || status === "error") && (
                  <Button variant="outline" onClick={resetAll} className="w-full">
                    بدء مشروع جديد
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Index;
