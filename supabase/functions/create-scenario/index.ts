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
    const uniqid = formData.get("uniqid") as string;
    const title = formData.get("title") as string;
    const gameType = formData.get("game_type") as string;
    const slug = formData.get("slug") as string;
    const description = formData.get("description") as string || "";
    const status = formData.get("status") as string || "draft";
    const dataStr = formData.get("data") as string;
    const zipFile = formData.get("media_zip") as File;

    // Validate required fields
    if (!uniqid || !title || !gameType || !slug) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: uniqid, title, game_type, slug" }),
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

    // Check if scenario with this uniqid already exists
    const { data: existingScenario } = await supabase
      .from("scenarios")
      .select("id")
      .eq("uniqid", uniqid)
      .maybeSingle();

    let scenario;
    let isUpdate = false;

    if (existingScenario) {
      // Update existing scenario
      isUpdate = true;
      const updateData: any = {
        title,
        game_type: gameType,
        slug,
        description,
        status,
        data,
        updated_at: new Date().toISOString(),
      };

      // Only update media_url if a new file was uploaded
      if (mediaUrl) {
        updateData.media_url = mediaUrl;
      }

      const { data: updatedScenario, error: updateError } = await supabase
        .from("scenarios")
        .update(updateData)
        .eq("uniqid", uniqid)
        .select()
        .single();

      if (updateError) {
        return new Response(
          JSON.stringify({ error: `Failed to update scenario: ${updateError.message}` }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      scenario = updatedScenario;
    } else {
      // Insert new scenario
      const { data: newScenario, error: insertError } = await supabase
        .from("scenarios")
        .insert({
          uniqid,
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

      scenario = newScenario;
    }

    return new Response(
      JSON.stringify({
        success: true,
        scenario,
        action: isUpdate ? "updated" : "created",
      }),
      {
        status: isUpdate ? 200 : 201,
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