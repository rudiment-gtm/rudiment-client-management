// Returns the Mapbox public access token to the frontend.
// The token is a publishable key (pk.*) — safe to expose to the browser.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const token = Deno.env.get("MAPBOX_ACCESS_TOKEN") ?? Deno.env.get("VITE_MAPBOX_ACCESS_TOKEN") ?? "";
  return new Response(JSON.stringify({ token }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
