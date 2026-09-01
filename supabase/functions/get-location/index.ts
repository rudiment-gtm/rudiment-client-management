import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_LOCATION = {
  success: true,
  latitude: 40.7128,
  longitude: -73.956,
  city: 'New York',
  region: 'New York',
  country: 'United States',
  source: 'default' as const,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authenticated user
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get client IP from trusted proxy headers (informational only).
    // Do NOT allow spoofed IPs to drive arbitrary lookups — let ip-api.com infer
    // the caller IP by sending no IP, which is the safer default.
    const clientIP = req.headers.get('cf-connecting-ip')
      || req.headers.get('x-real-ip')
      || '';
    console.log('[get-location] Authenticated user:', user.id, 'IP hint:', clientIP || '(none)');

    // Use HTTPS endpoint; omit IP so ip-api uses the request's source IP.
    const response = await fetch(`https://ip-api.com/json/?fields=status,lat,lon,city,regionName,country`);
    const data = await response.json();

    if (data.status === 'success') {
      return new Response(
        JSON.stringify({
          success: true,
          latitude: data.lat,
          longitude: data.lon,
          city: data.city,
          region: data.regionName,
          country: data.country,
          source: 'ip-geolocation'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(DEFAULT_LOCATION), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[get-location] Error:', error);
    return new Response(
      JSON.stringify({ ...DEFAULT_LOCATION, source: 'default-error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
