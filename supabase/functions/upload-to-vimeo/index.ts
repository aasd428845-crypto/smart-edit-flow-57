import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const token = formData.get("token") as string;
    const projectId = formData.get("project_id") as string;

    if (!file || !token || !projectId) {
      return new Response(
        JSON.stringify({ error: "file, token, and project_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Create upload ticket on Vimeo
    const createRes = await fetch("https://api.vimeo.com/me/videos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.vimeo.*+json;version=3.4",
      },
      body: JSON.stringify({
        upload: {
          approach: "tus",
          size: file.size,
        },
        name: `Project ${projectId}`,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error("Vimeo create error:", err);
      return new Response(
        JSON.stringify({ error: "Failed to create Vimeo upload ticket" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const createData = await createRes.json();
    const uploadLink = createData.upload.upload_link;
    const videoUri = createData.uri; // e.g. /videos/123456
    const videoUrl = `https://vimeo.com${videoUri}`;

    // Step 2: Upload file via TUS
    const fileBytes = await file.arrayBuffer();

    const uploadRes = await fetch(uploadLink, {
      method: "PATCH",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": "0",
        "Content-Type": "application/offset+octet-stream",
      },
      body: fileBytes,
    });

    if (!uploadRes.ok) {
      console.error("Vimeo upload error:", await uploadRes.text());
      return new Response(
        JSON.stringify({ error: "Failed to upload file to Vimeo" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Update project in DB
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabase
      .from("projects")
      .update({ video_url: videoUrl })
      .eq("id", projectId);

    return new Response(
      JSON.stringify({ video_url: videoUrl, video_uri: videoUri }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
