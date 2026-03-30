import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Trash2, Download, Bell, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { toast } from 'sonner';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'في الانتظار', color: '#9e9a8e', bg: '#1e1e2a' },
  queued: { label: 'في الانتظار', color: '#9e9a8e', bg: '#1e1e2a' },
  downloading: { label: 'جارٍ التنزيل', color: '#5a9fd4', bg: '#0d2035' },
  processing: { label: 'قيد المونتاج', color: '#e8c96a', bg: '#2a2000' },
  transcribing: { label: 'جارٍ التفريغ', color: '#5a9fd4', bg: '#0d2035' },
  completed: { label: 'جاهز للتحميل', color: '#5ad48a', bg: '#0d2a1a' },
  failed: { label: 'فشلت المعالجة', color: '#d45a5a', bg: '#2a0d0d' },
};

const AdminPanel = () => {
  const navigate = useNavigate();
  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!isAdmin) navigate('/');
  }, [isAdmin]);

  const { data: projects, refetch, isLoading } = useQuery({
    queryKey: ['admin-projects'],
    queryFn: async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/admin/projects`);
        const data = await res.json();
        return data.projects || [];
      } catch {
        const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
        return data || [];
      }
    },
  });

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(20);
      return data || [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('admin-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload: any) => {
        toast.info(`🔔 ${payload.new.message}`);
        refetch();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => refetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  const filtered = projects?.filter((p: any) => {
    if (filter === 'all') return true;
    if (filter === 'processing') return !['completed', 'failed', 'pending'].includes(p.status);
    return p.status === filter;
  });

  const stats = {
    total: projects?.length || 0,
    processing: projects?.filter((p: any) => !['completed', 'failed', 'pending'].includes(p.status)).length || 0,
    completed: projects?.filter((p: any) => p.status === 'completed').length || 0,
    failed: projects?.filter((p: any) => p.status === 'failed').length || 0,
  };

  const handleDelete = async (id: string) => {
    await supabase.from('projects').delete().eq('id', id);
    refetch();
    toast.success('تم حذف المشروع');
  };

  const timeSince = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    return `منذ ${Math.floor(hours / 24)} يوم`;
  };

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="h-14 flex items-center justify-between px-6 bg-secondary border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-lg">🛡️</span>
          <span className="font-bold text-foreground text-lg">لوحة الإدارة — مونتاجي الذكي</span>
        </div>
        <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight size={16} />
          العودة للمحرر
        </button>
      </div>

      <div className="grid grid-cols-[240px_1fr] gap-0 min-h-[calc(100vh-56px)]">
        {/* Sidebar */}
        <div className="bg-card border-l border-border p-4 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-foreground mb-3">الإحصائيات</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">📊 إجمالي</span><span className="text-foreground">{stats.total}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">⏳ معالجة</span><span className="text-primary">{stats.processing}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">✅ مكتمل</span><span className="text-success">{stats.completed}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">❌ فشل</span><span className="text-destructive">{stats.failed}</span></div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-foreground mb-3">🔔 الإشعارات</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {notifications?.slice(0, 5).map((n: any) => (
                <div key={n.id} className="text-xs text-muted-foreground p-2 bg-muted rounded">
                  <Bell size={10} className="inline ml-1" />
                  {n.message}
                  <br />
                  <span className="text-[10px]">{timeSince(n.created_at)}</span>
                </div>
              ))}
              {!notifications?.length && <p className="text-xs text-muted-foreground">لا توجد إشعارات</p>}
            </div>
          </div>
        </div>

        {/* Projects */}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            {['all', 'processing', 'completed', 'failed'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all ${filter === f ? 'gold-gradient text-primary-foreground font-bold' : 'bg-card text-muted-foreground border border-border hover:border-gold-dim'}`}
              >
                {f === 'all' ? 'الكل' : f === 'processing' ? 'قيد المعالجة' : f === 'completed' ? 'جاهز' : 'فشل'}
              </button>
            ))}
            <button onClick={() => refetch()} className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-primary transition-all mr-auto">
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="space-y-3">
            {filtered?.map((p: any) => {
              const sc = statusConfig[p.status] || statusConfig.pending;
              return (
                <div key={p.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">🎬</span>
                        <span className="font-bold text-foreground text-sm">{p.id.slice(0, 8)}...</span>
                        {p.content_type && <span className="text-xs text-muted-foreground">({p.content_type})</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ color: sc.color, backgroundColor: sc.bg }}>
                          {sc.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">🕐 {timeSince(p.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {p.output_url && (
                        <a href={p.output_url} target="_blank" className="p-1.5 rounded bg-muted hover:bg-gold-dim/30 text-muted-foreground hover:text-primary transition-all">
                          <Download size={14} />
                        </a>
                      )}
                      <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded bg-muted hover:bg-destructive/30 text-muted-foreground hover:text-destructive transition-all">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!filtered?.length && <p className="text-center text-muted-foreground py-8">لا توجد مشاريع</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;