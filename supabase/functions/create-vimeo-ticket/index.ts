const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { file_size, project_id, file_name } = await req.json()

    if (!file_size || !project_id) {
      return new Response(
        JSON.stringify({ error: 'file_size and project_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const accessToken = Deno.env.get('VIMEO_ACCESS_TOKEN')
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'VIMEO_ACCESS_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create a TUS upload ticket on Vimeo
    const vimeoRes = await fetch('https://api.vimeo.com/me/videos', {
      method: 'POST',
      headers: {
        'Authorization': `bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.vimeo.*+json;version=3.4',
      },
      body: JSON.stringify({
        upload: {
          approach: 'tus',
          size: String(file_size),
        },
        name: file_name || `video_${project_id}`,
        privacy: { view: 'anybody' },
      }),
    })

    if (!vimeoRes.ok) {
      const errText = await vimeoRes.text()
      console.error('Vimeo API error:', errText)
      return new Response(
        JSON.stringify({ error: 'Failed to create Vimeo upload ticket', details: errText }),
        { status: vimeoRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const vimeoData = await vimeoRes.json()
    const uploadLink = vimeoData.upload?.upload_link
    const videoUri = vimeoData.uri
    const videoUrl = vimeoData.link

    if (!uploadLink) {
      return new Response(
        JSON.stringify({ error: 'No upload_link in Vimeo response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update project with video URL
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    await fetch(`${supabaseUrl}/rest/v1/projects?id=eq.${project_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ video_url: videoUrl, status: 'uploading' }),
    })

    return new Response(
      JSON.stringify({ upload_link: uploadLink, video_uri: videoUri, video_url: videoUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('create-vimeo-ticket error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
