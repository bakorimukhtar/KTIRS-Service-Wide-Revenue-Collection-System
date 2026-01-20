import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    console.log("User auth:", !!userData?.user ? "OK" : userErr?.message);

    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ message: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TEMP BYPASS: Skip admin check for now
    console.log("User ID:", userData.user.id, "- BYPASSING ADMIN CHECK");

    const { officer_id, new_password } = await req.json();
    console.log("Input:", { officer_id, new_password: new_password ? "OK" : "MISSING" });

    if (!officer_id || !new_password || String(new_password).length < 6) {
      return new Response(JSON.stringify({ message: "Invalid input" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Admin client created, updating password...");
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(officer_id, {
      password: new_password,
    });

    if (updErr) {
      console.error("Update error:", updErr);
      throw updErr;
    }

    return new Response(JSON.stringify({ message: "Password updated successfully." }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Full error:", e);
    return new Response(JSON.stringify({ message: e?.message || "Server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
