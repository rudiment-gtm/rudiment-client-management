// HubSpot private apps use one static access token (a Supabase Edge Function
// secret) — there's no per-user OAuth connection to check the way Salesforce
// had. The only client-side thing worth knowing is the portal ID, used to
// build "Open in HubSpot" deep links. `instanceUrl` here is the record-URL
// PREFIX (`.../company`), so call sites building `${instanceUrl}/${companyId}`
// keep working unchanged.
export function useHubSpotConnection() {
  const portalId = import.meta.env.VITE_HUBSPOT_PORTAL_ID as string | undefined;
  return {
    data: portalId ? { instanceUrl: `https://app.hubspot.com/contacts/${portalId}/company` } : null,
    isLoading: false,
  };
}
