import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MapPin, Loader2 } from 'lucide-react';
import { MAPBOX_ACCESS_TOKEN } from '@/config/mapbox';
import { ALL_SERVICE_TYPES, serviceConfig, statusConfig, type ServiceType, type AccountStatus } from '@/types/account';
import { useAuthContext } from '@/components/AuthProvider';

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coordinates: { lat: number; lng: number } | null;
  onAccountAdded: () => void;
}

const accountStatusOptions = (Object.entries(statusConfig) as [AccountStatus, typeof statusConfig[AccountStatus]][]).map(
  ([value, cfg]) => ({ value, label: cfg.label }),
);

export default function AddAccountDialog({ open, onOpenChange, coordinates, onAccountAdded }: AddAccountDialogProps) {
  const { user } = useAuthContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);
  const [formData, setFormData] = useState({
    accountName: '',
    firstName: '',
    lastName: '',
    jobTitle: '',
    mainEmail: '',
    mainPhone: '',
    routeAddress: '',
    routeCity: '',
    routeState: '',
    routeZip: '',
    services: [] as ServiceType[],
    accountStatus: 'lead' as AccountStatus,
    notes: '',
  });

  // Reverse geocode when coordinates change
  useEffect(() => {
    if (!open || !coordinates) return;

    const reverseGeocode = async () => {
      if (!MAPBOX_ACCESS_TOKEN) return;

      setIsGeocodingAddress(true);

      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${coordinates.lng},${coordinates.lat}.json?access_token=${MAPBOX_ACCESS_TOKEN}&types=address,place`
        );

        const data = await response.json();

        if (data.features && data.features.length > 0) {
          const feature = data.features[0];
          const context = feature.context || [];

          // Extract address components from context
          const getContextValue = (type: string) => {
            const item = context.find((c: any) => c.id?.startsWith(type));
            return item?.text || '';
          };

          // Parse the address
          const streetAddress = feature.address
            ? `${feature.address} ${feature.text}`
            : feature.text || '';
          const city = getContextValue('place') || getContextValue('locality');
          const state = getContextValue('region');
          const zipCode = getContextValue('postcode');

          setFormData(prev => ({
            ...prev,
            routeAddress: streetAddress,
            routeCity: city,
            routeState: state,
            routeZip: zipCode,
          }));
        }
      } catch (error) {
        console.error('Reverse geocoding error:', error);
      } finally {
        setIsGeocodingAddress(false);
      }
    };

    reverseGeocode();
  }, [open, coordinates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.accountName || !formData.routeAddress || !formData.routeCity || !formData.routeState || !formData.routeZip) {
      toast.error('Please fill in all required fields');
      return;
    }


    setIsSubmitting(true);

    try {
      // Normalize address for duplicate detection
      const normKey = (street: string, city: string, state: string, zip: string) =>
        [street.trim().toLowerCase(), city.trim().toLowerCase(), state.trim().toLowerCase(), zip.trim()].join('|');

      const newKey = normKey(formData.routeAddress, formData.routeCity, formData.routeState, formData.routeZip);

      // Fetch existing accounts' addresses for duplicate check
      const { data: existing } = await supabase
        .from('accounts')
        .select('id, account_name, route_address, route_city, route_state, route_zip');

      const duplicate = (existing ?? []).find(
        (a) => normKey(a.route_address ?? '', a.route_city ?? '', a.route_state ?? '', a.route_zip ?? '') === newKey
      );
      if (duplicate) {
        toast.error(`An account already exists at this address: ${duplicate.account_name}`);
        setIsSubmitting(false);
        return;
      }

      // Resolve coordinates: use passed-in (right-click) or forward-geocode (manual)
      let lat = coordinates?.lat;
      let lng = coordinates?.lng;

      if (lat == null || lng == null) {
        if (!MAPBOX_ACCESS_TOKEN) {
          toast.error('Mapbox not configured; cannot geocode address');
          setIsSubmitting(false);
          return;
        }
        const q = `${formData.routeAddress}, ${formData.routeCity}, ${formData.routeState} ${formData.routeZip}`;
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&country=us&limit=1&types=address`
        );
        const data = await res.json();
        const feature = data?.features?.[0];
        if (!feature?.center) {
          toast.error('Could not find that address. Please check and try again.');
          setIsSubmitting(false);
          return;
        }
        lng = feature.center[0];
        lat = feature.center[1];
      }

      // NOTE: `supabase.from('accounts')` is cast here because the shared
      // src/integrations/supabase/types.ts mirror (out of scope for this fix)
      // omits the `Relationships` field the installed @supabase/supabase-js
      // version's GenericTable requires, which collapses every table's
      // Row/Insert/Update types to `never` for ALL tables app-wide (verified
      // independently of this component). The object below is otherwise
      // fully typed against the real `accounts` column set.
      const { data: inserted, error } = await (supabase.from('accounts') as any)
        .insert({
          account_name: formData.accountName,
          first_name: formData.firstName || null,
          last_name: formData.lastName || null,
          job_title: formData.jobTitle || null,
          main_email: formData.mainEmail || null,
          main_phone: formData.mainPhone || null,
          route_address: formData.routeAddress,
          route_city: formData.routeCity,
          route_state: formData.routeState,
          route_zip: formData.routeZip,
          services: formData.services,
          account_status: formData.accountStatus,
          account_notes: formData.notes || null,
          latitude: lat,
          longitude: lng,
          created_by_user_id: user?.id ?? null,
        })
        .select('id')
        .single() as { data: { id: string } | null; error: { message?: string } | null };

      if (error) throw error;
      if (!inserted) throw new Error('Insert succeeded but no record was returned');

      toast.success('Account added');

      onAccountAdded();
      onOpenChange(false);

      // Reset form
      setFormData({
        accountName: '',
        firstName: '',
        lastName: '',
        jobTitle: '',
        mainEmail: '',
        mainPhone: '',
        routeAddress: '',
        routeCity: '',
        routeState: '',
        routeZip: '',
        services: [],
        accountStatus: 'lead',
        notes: '',
      });
    } catch (error) {
      console.error('Error adding account:', error);
      toast.error('Failed to add account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleService = (service: ServiceType) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter((s) => s !== service)
        : [...prev.services, service],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Add New Account
          </DialogTitle>
          <DialogDescription className="sr-only">
            Create a new account in Encore.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {coordinates && (
            <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md flex items-center gap-2">
              📍 Location: {coordinates.lat.toFixed(5)}, {coordinates.lng.toFixed(5)}
              {isGeocodingAddress && (
                <span className="flex items-center gap-1 text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Finding address...
                </span>
              )}
            </div>
          )}

          {/* Account Info */}
          <div className="space-y-1.5">
            <Label htmlFor="accountName">Account Name *</Label>
            <Input
              id="accountName"
              value={formData.accountName}
              onChange={(e) => updateField('accountName', e.target.value)}
              placeholder="Acme Lawn Care"
            />
          </div>

          {/* Services */}
          <div className="space-y-1.5">
            <Label>Services</Label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_SERVICE_TYPES.map((service) => {
                const checked = formData.services.includes(service);
                return (
                  <button
                    key={service}
                    type="button"
                    onClick={() => toggleService(service)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors text-left hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleService(service)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span>{serviceConfig[service].label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => updateField('firstName', e.target.value)}
                placeholder="John"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => updateField('lastName', e.target.value)}
                placeholder="Smith"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="jobTitle">Job Title</Label>
            <Input
              id="jobTitle"
              value={formData.jobTitle}
              onChange={(e) => updateField('jobTitle', e.target.value)}
              placeholder="Owner"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mainEmail">Email</Label>
              <Input
                id="mainEmail"
                type="email"
                value={formData.mainEmail}
                onChange={(e) => updateField('mainEmail', e.target.value)}
                placeholder="john@acme.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mainPhone">Phone</Label>
              <Input
                id="mainPhone"
                value={formData.mainPhone}
                onChange={(e) => updateField('mainPhone', e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-1.5">
            <Label htmlFor="routeAddress">Street Address *</Label>
            <Input
              id="routeAddress"
              value={formData.routeAddress}
              onChange={(e) => updateField('routeAddress', e.target.value)}
              placeholder="123 Main Street"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="routeCity">City *</Label>
              <Input
                id="routeCity"
                value={formData.routeCity}
                onChange={(e) => updateField('routeCity', e.target.value)}
                placeholder="Salt Lake City"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="routeState">State *</Label>
              <Input
                id="routeState"
                value={formData.routeState}
                onChange={(e) => updateField('routeState', e.target.value)}
                placeholder="UT"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="routeZip">ZIP *</Label>
              <Input
                id="routeZip"
                value={formData.routeZip}
                onChange={(e) => updateField('routeZip', e.target.value)}
                placeholder="84101"
              />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Account Status</Label>
            <Select value={formData.accountStatus} onValueChange={(v) => updateField('accountStatus', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accountStatusOptions.map(status => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Any additional notes..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
