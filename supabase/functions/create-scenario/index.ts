import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse multipart form data
    const formData = await req.formData();
    
    // Get scenario data from form
    const title = formData.get("title") as string;
    const gameType = formData.get("game_type") as string;
    const slug = formData.get("slug") as string;
    const description = formData.get("description") as string || "";
    const status = formData.get("status") as string || "draft";
    const dataStr = formData.get("data") as string;
    const zipFile = formData.get("media_zip") as File;

    // Validate required fields
    if (!title || !gameType || !slug) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: title, game_type, slug" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let data = {};
    if (dataStr) {
      try {
        data = JSON.parse(dataStr);
      } catch (e) {
        return new Response(
          JSON.stringify({ error: "Invalid JSON in data field" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    let mediaUrl = null;

    // Upload zip file if provided
    if (zipFile) {
      const fileName = `${slug}-${Date.now()}.zip`;
      const filePath = `scenarios/${user.id}/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("scenario-media")
        .upload(filePath, zipFile, {
          contentType: "application/zip",
          upsert: false,
        });

      if (uploadError) {
        return new Response(
          JSON.stringify({ error: `Failed to upload media: ${uploadError.message}` }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("scenario-media")
        .getPublicUrl(filePath);
      
      mediaUrl = urlData.publicUrl;
    }

    // Insert scenario into database
    const { data: scenario, error: insertError } = await supabase
      .from("scenarios")
      .insert({
        title,
        game_type: gameType,
        slug,
        description,
        status,
        data,
        media_url: mediaUrl,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: `Failed to create scenario: ${insertError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        scenario,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});