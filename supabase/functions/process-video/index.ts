const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Process Video Queue Edge Function
 * Manages video processing jobs — enqueues, tracks status, and updates results.
 * Actual FFmpeg processing happens client-side; this manages the queue state.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const headers = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'enqueue';

    if (action === 'enqueue') {
      const body = await req.json();
      const { project_id, command, content_type, template_id } = body;

      if (!project_id) {
        return new Response(
          JSON.stringify({ error: 'project_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update project status to queued
      const res = await fetch(`${supabaseUrl}/rest/v1/projects?id=eq.${project_id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: 'queued',
          user_command: command || null,
          content_type: content_type || null,
          template_id: template_id || null,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to update project: ${await res.text()}`);
      }

      // Create notification
      await fetch(`${supabaseUrl}/rest/v1/notifications`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          project_id,
          message: `تم إضافة المشروع لقائمة المعالجة: ${command || 'معالجة عامة'}`,
          level: 'info',
        }),
      });

      return new Response(
        JSON.stringify({ success: true, status: 'queued', project_id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'status') {
      const projectId = url.searchParams.get('project_id');
      if (!projectId) {
        return new Response(
          JSON.stringify({ error: 'project_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const res = await fetch(`${supabaseUrl}/rest/v1/projects?id=eq.${projectId}&select=id,status,output_url,error,updated_at`, {
        headers,
      });
      const data = await res.json();

      return new Response(
        JSON.stringify(data[0] || { error: 'Project not found' }),
        { status: data[0] ? 200 : 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'complete') {
      const body = await req.json();
      const { project_id, output_url, error: errorMsg } = body;

      const status = errorMsg ? 'failed' : 'completed';
      await fetch(`${supabaseUrl}/rest/v1/projects?id=eq.${project_id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status,
          output_url: output_url || null,
          error: errorMsg || null,
        }),
      });

      await fetch(`${supabaseUrl}/rest/v1/notifications`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          project_id,
          message: status === 'completed' ? '✅ اكتمل المونتاج!' : `❌ فشلت المعالجة: ${errorMsg}`,
          level: status === 'completed' ? 'success' : 'error',
        }),
      });

      return new Response(
        JSON.stringify({ success: true, status }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('process-video error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
