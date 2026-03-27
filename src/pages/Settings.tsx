import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Key, Save, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const Settings = () => {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("vimeo_access_token");
    if (saved) setToken(saved);
  }, []);

  const handleSave = () => {
    if (!token.trim()) {
      toast.error("يرجى إدخال التوكن");
      return;
    }
    localStorage.setItem("vimeo_access_token", token.trim());
    toast.success("تم حفظ التوكن بنجاح");
  };

  const handleClear = () => {
    localStorage.removeItem("vimeo_access_token");
    setToken("");
    toast.success("تم حذف التوكن");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-foreground">الإعدادات</h1>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 max-w-xl space-y-6">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="p-5 border-b border-border bg-muted/30">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                Vimeo Access Token
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                أدخل رمز الوصول الخاص بحسابك على Vimeo. يمكنك الحصول عليه من{" "}
                <a
                  href="https://developer.vimeo.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Vimeo Developer Portal
                </a>
              </p>
              <div className="relative">
                <Input
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="أدخل Vimeo Access Token هنا..."
                  className="pl-10"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex gap-3">
                <Button onClick={handleSave} className="flex-1">
                  <Save className="w-4 h-4" />
                  حفظ
                </Button>
                <Button variant="outline" onClick={handleClear}>
                  مسح
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Settings;
