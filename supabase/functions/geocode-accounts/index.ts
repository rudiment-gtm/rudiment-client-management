import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeocodedLocation {
  latitude: number | null;
  longitude: number | null;
}

// Validate API key for authentication
function validateApiKey(req: Request): boolean {
  const GEOCODE_API_KEY = Deno.env.get('GEOCODE_API_KEY');
  if (!GEOCODE_API_KEY) {
    console.error('GEOCODE_API_KEY not configured');
    return false;
  }
  const headerKey = req.headers.get('authorization')?.replace('Bearer ', '');
  return headerKey === GEOCODE_API_KEY;
}

// Safe error mapping
function getSafeErrorMessage(error: unknown): { code: string; message: string } {
  const msg = error instanceof Error ? error.message : String(error);
  console.error('Internal error details:', msg);

  if (msg.includes('duplicate') || msg.includes('unique')) {
    return { code: 'DUPLICATE_ENTRY', message: 'Record already exists' };
  }
  if (msg.includes('database') || msg.includes('Database')) {
    return { code: 'DATABASE_ERROR', message: 'Database operation failed' };
  }
  if (msg.includes('Mapbox') || msg.includes('geocod')) {
    return { code: 'GEOCODING_ERROR', message: 'Geocoding service unavailable' };
  }
  return { code: 'INTERNAL_ERROR', message: 'Request failed. Please try again.' };
}

// Geocode an address using Mapbox
async function geocodeAddress(address: string, mapboxToken: string): Promise<GeocodedLocation> {
  if (!address || !mapboxToken) {
    return { latitude: null, longitude: null };
  }
  try {
    const encodedAddress = encodeURIComponent(address);
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${mapboxToken}&country=us&limit=1`
    );
    if (!response.ok) {
      console.error(`Geocoding failed: ${response.status}`);
      return { latitude: null, longitude: null };
    }
    const data = await response.json();
    if (data.features && data.features.length > 0) {
      const [longitude, latitude] = data.features[0].center;
      return { latitude, longitude };
    }
    return { latitude: null, longitude: null };
  } catch (error) {
    console.error('Geocoding error:', error);
    return { latitude: null, longitude: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!validateApiKey(req)) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Unauthorized' 
    }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const MAPBOX_ACCESS_TOKEN = Deno.env.get('MAPBOX_ACCESS_TOKEN');
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Server configuration missing');
    }
    
    if (!MAPBOX_ACCESS_TOKEN) {
      throw new Error('Geocoding not configured');
    }

    // Check for force mode to re-geocode all accounts
    let forceMode = false;
    try {
      const body = await req.json();
      forceMode = body?.force === true;
    } catch {
      // No body or invalid JSON — default to non-force mode
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    let query = supabase
      .from('accounts')
      .select('id, account_name, route_address, route_city, route_state, route_zip');
    
    if (!forceMode) {
      query = query.or('latitude.is.null,longitude.is.null');
    }

    const { data: accounts, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Database error: ${fetchError.message}`);
    }

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        geocoded: 0,
        message: forceMode ? 'No accounts found' : 'All accounts already have coordinates'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${accounts.length} accounts missing coordinates`);

    let geocodedCount = 0;
    
    for (const account of accounts) {
      // Require an actual street address — falling back to just city/state or
      // the account name lets Mapbox's geocoder match a same-named place
      // anywhere on Earth instead of finding nothing. Better to leave
      // lat/lng null (invisible on the map) than plot it overseas.
      const streetPart = account.route_address?.trim() || '';
      if (!streetPart) {
        continue;
      }
      const cityStateZip = [account.route_city, account.route_state].filter(Boolean).join(', ') + (account.route_zip ? ` ${account.route_zip}` : '');
      const addressToGeocode = cityStateZip.trim() ? `${streetPart}, ${cityStateZip}` : streetPart;
      
      const geocoded = await geocodeAddress(addressToGeocode, MAPBOX_ACCESS_TOKEN);
      
      if (geocoded.latitude !== null && geocoded.longitude !== null) {
        const { error: updateError } = await supabase
          .from('accounts')
          .update({ 
            latitude: geocoded.latitude, 
            longitude: geocoded.longitude 
          })
          .eq('id', account.id);
          
        if (updateError) {
          console.error(`Failed to update account:`, updateError);
        } else {
          geocodedCount++;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return new Response(JSON.stringify({ 
      success: true, 
      total: accounts.length,
      geocoded: geocodedCount,
      message: `Geocoded ${geocodedCount} of ${accounts.length} accounts`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const safeError = getSafeErrorMessage(error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: safeError.message,
      code: safeError.code
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
