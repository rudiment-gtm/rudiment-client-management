import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Phone,
  Mail,
  Linkedin,
  MapPin,
  Calendar,
  CalendarIcon,
  Clock,
  User,
  ClipboardCheck,
  ChevronRight,
  ExternalLink,
  Trash2,
  Pencil,
  Check,
  Info,
  Binoculars,
  Globe,
  UserSearch,
  Loader2
} from 'lucide-react';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAppStore } from '@/store/appStore';
import { statusConfig, serviceConfig, isFullService, FULL_SERVICE_CONFIG, AccountStatus, Account, ServiceType, ALL_SERVICE_TYPES } from '@/types/account';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/components/AuthProvider';
import { useAccountNotes, useAddNote, useUpdateNote, useDeleteNote } from '@/hooks/useAccountNotes';
import type { AccountNote } from '@/hooks/useAccountNotes';
import { useProspectContactsForAccount, useUpsertProspectContact } from '@/hooks/useProspectContacts';
import type { ProspectContact } from '@/hooks/useProspectContacts';
import { useAccountEvents } from '@/hooks/useAccountEvents';
import { findAccountByAddress, useCreateAccountFromAroundMe, useUpdateAccountStatus } from '@/hooks/useAccounts';
import { format } from 'date-fns';
import { useMembers } from '@/hooks/useMembers';
import { useCustomActivityTypes, useCreateActivityType } from '@/hooks/useTags';
import { BUILT_IN_ACTIVITY_TYPES } from '@/types/workflow';
import EditContactDialog from '@/components/EditContactDialog';
import AccountTagsEditor from '@/components/AccountTagsEditor';

// QB accounts often only have company + free-text contact fields (no named
// person) — ~49% of source rows have no first/last name at all. Build a
// best-effort display name and let callers render the null case gracefully.
function getContactDisplayName(account: Account): string | null {
  const named = [account.firstName, account.lastName].filter(Boolean).join(' ');
  return named || account.primaryContact || account.secondaryContact || null;
}


export default function AccountDrawer() {
  const { selectedAccount, isDrawerOpen, setDrawerOpen, updateAccountStatus, logVisit, accounts, openAroundMeWithOrigin } = useAppStore();
  const [visitNotes, setVisitNotes] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [eventType, setEventType] = useState<string>('');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [quoteServices, setQuoteServices] = useState<ServiceType[]>([]);
  const [quotePrice, setQuotePrice] = useState<string>('');
  const [findingContacts, setFindingContacts] = useState(false);
  const [revealingField, setRevealingField] = useState<Record<string, 'email' | 'phone'>>({});
  const [isCreatingActivityType, setIsCreatingActivityType] = useState(false);
  const [customActivityLabel, setCustomActivityLabel] = useState('');

  const { data: customActivityTypes = [] } = useCustomActivityTypes();
  const createActivityType = useCreateActivityType();

  const toHHMM = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  // Single Date+Time in the UI — end_at (required by the DB) is derived
  // silently as start + 30min, matching the reference design's single
  // date/time field instead of a separate Start/End range.
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState<string>(toHHMM(new Date()));

  const eventTypeOptions = [...BUILT_IN_ACTIVITY_TYPES, ...customActivityTypes];

  const { data: members = [] } = useMembers();
  const assignedToOptions = members.map((m) => m.display_name || m.email);
  const queryClient = useQueryClient();
  const { user, profile } = useAuthContext();
  const isPreview = !!selectedAccount?.isAroundMePreview;
  const realAccountId = isPreview ? undefined : selectedAccount?.id;
  const { data: accountNotes = [], isLoading: notesLoading } = useAccountNotes(realAccountId);
  const { data: savedContacts = [] } = useProspectContactsForAccount(realAccountId);
  const upsertContact = useUpsertProspectContact();
  const addNoteMutation = useAddNote();
  const updateNoteMutation = useUpdateNote();
  const deleteNoteMutation = useDeleteNote();
  const { data: accountEvents = [] } = useAccountEvents(realAccountId);
  const createAccountFromAroundMe = useCreateAccountFromAroundMe();
  const updateAccountStatusMutation = useUpdateAccountStatus();

  // Reset event log time to current local time whenever drawer opens
  useEffect(() => {
    if (isDrawerOpen) {
      const now = new Date();
      setStartDate(now);
      setStartTime(toHHMM(now));
    }
  }, [isDrawerOpen]);

  if (!selectedAccount) return null;

  const combineDateTime = (d: Date, t: string): Date | null => {
    if (!d || !t) return null;
    const [hh, mm] = t.split(':').map(Number);
    const out = new Date(d);
    out.setHours(hh ?? 0, mm ?? 0, 0, 0);
    return out;
  };
  const startAt = combineDateTime(startDate, startTime);
  const endAt = startAt ? new Date(startAt.getTime() + 30 * 60 * 1000) : null;
  const isQuoteCreated = eventType === 'Quote Created';
  const quotePriceNum = parseFloat(quotePrice);
  const missingFields: string[] = [];
  if (!eventType) missingFields.push('Activity Type');
  if (!assignedTo) missingFields.push('Account Owner');
  if (!startDate || !startTime) missingFields.push('Date/Time');
  if (isQuoteCreated && quoteServices.length === 0) missingFields.push('Service(s) Quoted');
  if (isQuoteCreated && (!quotePrice || Number.isNaN(quotePriceNum) || quotePriceNum <= 0)) missingFields.push('Price (USD)');
  const canLog = missingFields.length === 0;
  const disabledReason = !canLog ? `Please fill: ${missingFields.join(', ')}.` : '';

  const config = statusConfig[selectedAccount.accountStatus];
  const contactDisplayName = getContactDisplayName(selectedAccount);

  const secondaryContacts = accounts.filter(
    account =>
      !!selectedAccount.routeAddress &&
      account.routeAddress === selectedAccount.routeAddress &&
      account.id !== selectedAccount.id
  );
  
  const handleLogVisit = async () => {
    if (!canLog || !startAt || !endAt) {
      toast.error(disabledReason || 'Please complete required fields');
      return;
    }

    // Around-Me preview flow: dedup by address first. If a match exists,
    // redirect the rep to the existing account instead of creating a duplicate.
    // If no match, promote the POI to a real account before logging the event.
    let effectiveAccount = selectedAccount;
    if (selectedAccount.isAroundMePreview) {
      try {
        const existing = await findAccountByAddress(
          selectedAccount.routeAddress,
          selectedAccount.routeZip,
          selectedAccount.routeCity,
        );
        if (existing) {
          toast.success(`This account already exists — opening "${existing.accountName}".`);
          // Swap drawer to the real account so the rep can log there.
          useAppStore.setState({ selectedAccount: existing, isDrawerOpen: true });
          return;
        }
      } catch (err) {
        console.error('[AccountDrawer] address dedup lookup failed', err);
        toast.error('Could not verify this address. Please try again.');
        return;
      }

      // No match — create the account now.
      try {
        const created = await createAccountFromAroundMe.mutateAsync({
          id: selectedAccount.aroundMeSourceId || selectedAccount.id,
          name: selectedAccount.accountName,
          address: [
            selectedAccount.routeAddress,
            selectedAccount.routeCity,
            `${selectedAccount.routeState ?? ''} ${selectedAccount.routeZip ?? ''}`.trim(),
          ].filter(Boolean).join(', '),
          latitude: selectedAccount.latitude,
          longitude: selectedAccount.longitude,
          category: '',
          prospectCategory: 'other',
          distanceMiles: 0,
        });
        effectiveAccount = created;
        useAppStore.setState({ selectedAccount: created });
      } catch (err) {
        console.error('[AccountDrawer] create account from around-me failed', err);
        toast.error('Could not create this account. Please try again.');
        return;
      }
    }

    logVisit(effectiveAccount.id, visitNotes);
    const noteText = visitNotes;
    const evType = eventType;
    const assignee = assignedTo;
    const evIsQuoteCreated = isQuoteCreated;
    const evQuoteServices = quoteServices;
    const evQuotePrice = quotePriceNum;
    const startIso = startAt.toISOString();
    const endIso = endAt.toISOString();
    setVisitNotes('');

    setEventType('');
    setAssignedTo('');
    setQuoteServices([]);
    setQuotePrice('');

    try {
      const { data: evData, error } = await supabase
        .from('account_events')
        .insert({
          account_id: effectiveAccount.id,
          event_type: evType || 'visit',
          assigned_to: assignee,
          start_at: startIso,
          end_at: endIso,
          notes: noteText || null,
          author_user_id: user?.id ?? '00000000-0000-0000-0000-000000000000',
          author_name: user?.email ?? 'Unknown',
          ...(evIsQuoteCreated ? { quote_services: evQuoteServices, quote_price_usd: evQuotePrice } : {}),
        })
        .select()
        .single();
      if (error) throw error;
      if (!evData) throw new Error('Event was not created');
      const ev = evData as { id: string; quote_number?: string | null };
      if (evIsQuoteCreated && ev.quote_number) {
        toast.success(`Quote logged: ${ev.quote_number}`);
      } else {
        toast.success('Event logged');
      }
      queryClient.invalidateQueries({ queryKey: ['account_events', effectiveAccount.id] });
    } catch (e) {
      console.error('Log event error', e);
      toast.error('Failed to log event');
    }
  };

  const handleFindContacts = async () => {
    if (!selectedAccount) return;
    setFindingContacts(true);
    try {
      const { data, error } = await supabase.functions.invoke('leadmagic-find-best-contact', {
        body: { companyName: selectedAccount.accountName, website: selectedAccount.website },
      });
      if (error) throw error;
      if (data?.notConfigured) {
        toast.warning('Contact finder isn\'t connected yet — add a LEADMAGIC_API_KEY to enable it.');
        return;
      }
      const found = data?.contacts?.[0];
      if (!found) {
        toast.info('No employees found for this account.');
        return;
      }
      await upsertContact.mutateAsync({
        accountId: selectedAccount.id,
        firstName: found.firstName,
        lastName: found.lastName,
        patch: { title: found.title, linkedinUrl: found.linkedinUrl, email: found.email, phone: found.phone },
      });
      toast.success(`Found contact: ${found.firstName} ${found.lastName}`);
    } catch (e) {
      toast.error(`Find Contacts failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setFindingContacts(false);
    }
  };

  const handleRevealEmail = async (contact: ProspectContact) => {
    setRevealingField((s) => ({ ...s, [contact.id]: 'email' }));
    try {
      const { data, error } = await supabase.functions.invoke('leadmagic-reveal-contact', {
        body: { field: 'email', firstName: contact.first_name, lastName: contact.last_name, website: selectedAccount?.website },
      });
      if (error) throw error;
      if (data?.notConfigured) {
        toast.warning('Contact finder isn\'t connected yet — add a LEADMAGIC_API_KEY to enable it.');
        return;
      }
      await upsertContact.mutateAsync({
        accountId: contact.account_id,
        firstName: contact.first_name,
        lastName: contact.last_name,
        patch: { email: data?.email ?? null },
      });
      toast.success(data?.email ? 'Email revealed' : 'No email found');
    } catch (e) {
      toast.error(`Reveal failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setRevealingField((s) => { const n = { ...s }; delete n[contact.id]; return n; });
    }
  };

  const handleRevealPhone = async (contact: ProspectContact) => {
    if (!contact.email) return;
    setRevealingField((s) => ({ ...s, [contact.id]: 'phone' }));
    try {
      const { data, error } = await supabase.functions.invoke('leadmagic-reveal-contact', {
        body: { field: 'phone', workEmail: contact.email },
      });
      if (error) throw error;
      if (data?.notConfigured) {
        toast.warning('Contact finder isn\'t connected yet — add a LEADMAGIC_API_KEY to enable it.');
        return;
      }
      await upsertContact.mutateAsync({
        accountId: contact.account_id,
        firstName: contact.first_name,
        lastName: contact.last_name,
        patch: { phone: data?.phone ?? null },
      });
      toast.success(data?.phone ? 'Phone revealed' : 'No phone found');
    } catch (e) {
      toast.error(`Reveal failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setRevealingField((s) => { const n = { ...s }; delete n[contact.id]; return n; });
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', selectedAccount.id);

      if (error) throw error;

      toast.success('Account deleted successfully');
      setDrawerOpen(false);
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error('Failed to delete account');
    } finally {
      setIsDeleting(false);
    }
  };
  
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };
  
  return (
    <AnimatePresence>
      {isDrawerOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          
          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={cn(
              "fixed right-0 top-0 h-full z-50 overflow-hidden",
              "w-full sm:w-[420px] bg-card shadow-drawer",
              "flex flex-col"
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-4 border-b bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedAccount.id.startsWith('preview:') ? (
                    <h2 className="text-xl font-extrabold tracking-[-0.02em] text-foreground truncate">
                      {selectedAccount.accountName}
                    </h2>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const account = selectedAccount;
                        setDrawerOpen(false);
                        window.dispatchEvent(
                          new CustomEvent('previewAccount', {
                            detail: { id: account.id, latitude: account.latitude, longitude: account.longitude },
                          })
                        );
                      }}
                      className="text-xl font-extrabold tracking-[-0.02em] text-foreground truncate text-left hover:underline hover:text-primary focus:outline-none focus:underline"
                      title="Show on map"
                    >
                      {selectedAccount.accountName}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`status-badge ${config.bgClass}`}>
                    {config.label}
                  </span>
                  {isFullService(selectedAccount.services) ? (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold shrink-0"
                      style={{ backgroundColor: `${FULL_SERVICE_CONFIG.color}20`, color: FULL_SERVICE_CONFIG.color }}
                    >
                      {FULL_SERVICE_CONFIG.label}
                    </span>
                  ) : selectedAccount.services.length > 0 ? (
                    selectedAccount.services.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold shrink-0"
                        style={{ backgroundColor: `${serviceConfig[s].color}20`, color: serviceConfig[s].color }}
                      >
                        {serviceConfig[s].label}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No services</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="touch-button text-muted-foreground hover:text-foreground transition-colors -mr-2 -mt-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide safe-bottom">
              {isPreview && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-pink-500/10 border border-pink-500/30 text-xs text-pink-700 dark:text-pink-300">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Not yet saved.</strong> Logging an event will check for an existing account at this address; if none exists, it will create a new account.
                  </span>
                </div>
              )}

              {/* Primary Contact Card */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Primary Contact
                  </h3>
                  {!isPreview && <EditContactDialog account={selectedAccount} />}
                </div>

                <div className="glass-card p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="icon-chip-lg">
                      <User className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {contactDisplayName || <span className="italic text-muted-foreground font-normal">No named contact</span>}
                      </p>
                      <p className="text-sm text-muted-foreground">{selectedAccount.jobTitle || '—'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    {selectedAccount.mainPhone ? (
                      <a
                        href={`tel:${selectedAccount.mainPhone}`}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors group min-w-0"
                      >
                        <span className="icon-chip shrink-0"><Phone className="w-4 h-4 text-primary" /></span>
                        <span className="text-sm truncate">{selectedAccount.mainPhone}</span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 p-2 rounded-lg">
                        <span className="icon-chip shrink-0"><Phone className="w-4 h-4 text-muted-foreground" /></span>
                        <span className="text-sm text-muted-foreground">—</span>
                      </div>
                    )}
                    {selectedAccount.mainEmail ? (
                      <a
                        href={`mailto:${selectedAccount.mainEmail}`}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors group min-w-0"
                      >
                        <span className="icon-chip shrink-0"><Mail className="w-4 h-4 text-primary" /></span>
                        <span className="text-sm truncate">{selectedAccount.mainEmail || 'Email'}</span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 p-2 rounded-lg">
                        <span className="icon-chip shrink-0"><Mail className="w-4 h-4 text-muted-foreground" /></span>
                        <span className="text-sm text-muted-foreground">—</span>
                      </div>
                    )}
                    {selectedAccount.website ? (
                      <a
                        href={/^https?:\/\//i.test(selectedAccount.website) ? selectedAccount.website : `https://${selectedAccount.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors group min-w-0"
                      >
                        <span className="icon-chip shrink-0"><Globe className="w-4 h-4 text-primary" /></span>
                        <span className="text-sm truncate">{selectedAccount.website.replace(/^https?:\/\//i, '')}</span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 p-2 rounded-lg">
                        <span className="icon-chip shrink-0"><Globe className="w-4 h-4 text-muted-foreground" /></span>
                        <span className="text-sm text-muted-foreground">—</span>
                      </div>
                    )}
                    {selectedAccount.linkedinUrl ? (
                      <a
                        href={selectedAccount.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors group min-w-0"
                      >
                        <span className="icon-chip shrink-0"><Linkedin className="w-4 h-4 text-primary" /></span>
                        <span className="text-sm truncate">LinkedIn</span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 p-2 rounded-lg">
                        <span className="icon-chip shrink-0"><Linkedin className="w-4 h-4 text-muted-foreground" /></span>
                        <span className="text-sm text-muted-foreground">—</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Tags */}
              {!isPreview && <AccountTagsEditor accountId={selectedAccount.id} />}

              {/* Account Status */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Account Status
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(statusConfig) as [AccountStatus, typeof statusConfig[AccountStatus]][]).map(
                    ([key, value]) => {
                      const active = selectedAccount.accountStatus === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={isPreview}
                          onClick={() => {
                            if (active) return;
                            const previousStatus = selectedAccount.accountStatus;
                            updateAccountStatus(selectedAccount.id, key); // optimistic UI update
                            updateAccountStatusMutation.mutate(
                              { accountId: selectedAccount.id, status: key },
                              {
                                onError: (err) => {
                                  updateAccountStatus(selectedAccount.id, previousStatus); // revert on failure
                                  toast.error(`Failed to update status: ${err instanceof Error ? err.message : 'unknown error'}`);
                                },
                              },
                            );
                          }}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors disabled:opacity-60',
                            active
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-transparent border-border text-muted-foreground hover:text-foreground hover:border-foreground/40',
                          )}
                        >
                          {value.label}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              {/* Location */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Location
                </h3>
                {(() => {
                  const formattedAddress = [
                    selectedAccount.routeAddress,
                    selectedAccount.routeCity,
                    `${selectedAccount.routeState ?? ''} ${selectedAccount.routeZip ?? ''}`.trim()
                  ].filter(Boolean).join(', ');
                  const formattedBilling = [
                    selectedAccount.billingAddress,
                    selectedAccount.billingCity,
                    `${selectedAccount.billingState ?? ''} ${selectedAccount.billingZip ?? ''}`.trim()
                  ].filter(Boolean).join(', ');
                  const billingSameAsRoute = !formattedBilling || formattedBilling === selectedAccount.routeAddress;

                  return (
                    <div className="glass-card p-3 flex items-start gap-3">
                      <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{formattedAddress || '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          {billingSameAsRoute ? 'Billing address is the same' : `Billing: ${formattedBilling}`}
                        </p>
                      </div>
                    </div>
                  );
                })()}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(selectedAccount.routeAddress ?? '')}`, '_blank')}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    Directions
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-status-active/40 text-status-active hover:bg-status-active/10 hover:text-status-active"
                    onClick={() => openAroundMeWithOrigin({ kind: 'account', accountId: selectedAccount.id })}
                    disabled={isPreview}
                  >
                    <Binoculars className="w-3.5 h-3.5" />
                    Search nearby
                  </Button>
                </div>
              </div>

              {/* Activity & Stats */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Activity
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {selectedAccount.visitCount} visit{selectedAccount.visitCount === 1 ? '' : 's'} logged
                  </span>
                </div>
                <div className={cn('grid gap-3', selectedAccount.nextFollowUpDate ? 'grid-cols-3' : 'grid-cols-2')}>
                  <div className="glass-card p-3">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Calendar className="w-4 h-4" />
                      <span className="text-xs">Last Visit</span>
                    </div>
                    <p className="font-semibold">{formatDate(selectedAccount.lastVisitDate)}</p>
                  </div>
                  <div className="glass-card p-3">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <ClipboardCheck className="w-4 h-4" />
                      <span className="text-xs">Visits</span>
                    </div>
                    <p className="font-semibold">{selectedAccount.visitCount}</p>
                  </div>
                  {selectedAccount.nextFollowUpDate && (
                    <div className="glass-card p-3">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Calendar className="w-4 h-4" />
                        <span className="text-xs">Follow-up</span>
                      </div>
                      <p className="font-semibold">{formatDate(selectedAccount.nextFollowUpDate)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Log activity — one boxed card: when, activity type, owner, notes */}
              <div className="glass-card p-4 space-y-4">
                <h3 className="text-sm font-bold text-foreground">Log activity</h3>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Date</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("w-full justify-between font-normal", !startDate && "text-muted-foreground")}
                        >
                          {startDate ? format(startDate, 'MMM d, yyyy') : 'Pick a date'}
                          <CalendarIcon className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={startDate}
                          onSelect={(d) => d && setStartDate(d)}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Time</label>
                    <div className="relative">
                      <Input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="pr-9"
                      />
                      <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Activity type</label>
                  {isCreatingActivityType ? (
                  <div className="flex items-center gap-2">
                    <Input
                      autoFocus
                      value={customActivityLabel}
                      onChange={(e) => setCustomActivityLabel(e.target.value)}
                      placeholder="New activity type"
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' || !customActivityLabel.trim()) return;
                        createActivityType.mutate(customActivityLabel, {
                          onSuccess: (label) => {
                            setEventType(label);
                            setCustomActivityLabel('');
                            setIsCreatingActivityType(false);
                          },
                        });
                      }}
                    />
                    <Button
                      size="sm"
                      disabled={!customActivityLabel.trim() || createActivityType.isPending}
                      onClick={() =>
                        createActivityType.mutate(customActivityLabel, {
                          onSuccess: (label) => {
                            setEventType(label);
                            setCustomActivityLabel('');
                            setIsCreatingActivityType(false);
                          },
                        })
                      }
                    >
                      Add
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsCreatingActivityType(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={eventType}
                    onValueChange={(v) => {
                      if (v === '__create_custom__') {
                        setIsCreatingActivityType(true);
                        return;
                      }
                      setEventType(v);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select activity type" />
                    </SelectTrigger>
                    <SelectContent>
                      {eventTypeOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                      <SelectItem value="__create_custom__" className="text-primary font-medium">
                        + Create custom activity
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Quote Created — service(s) quoted + price */}
              {isQuoteCreated && (
                <>
                  <div className="space-y-2 pb-[15px]">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      <span className="text-destructive">*</span> Service(s) Quoted
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {ALL_SERVICE_TYPES.map((s) => {
                        const active = quoteServices.includes(s);
                        return (
                          <button
                            type="button"
                            key={s}
                            onClick={() =>
                              setQuoteServices((prev) =>
                                prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                              )
                            }
                            className="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
                            style={
                              active
                                ? { backgroundColor: `${serviceConfig[s].color}20`, borderColor: serviceConfig[s].color, color: serviceConfig[s].color }
                                : { backgroundColor: 'transparent', borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }
                            }
                          >
                            {serviceConfig[s].label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2 pb-[15px]">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      <span className="text-destructive">*</span> Price (USD)
                    </h3>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={quotePrice}
                      onChange={(e) => setQuotePrice(e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* Account Owner */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Account owner</label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignedToOptions.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes + Log activity button */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Notes</label>
                <Textarea
                  placeholder="What happened during this visit?"
                  value={visitNotes}
                  onChange={(e) => setVisitNotes(e.target.value)}
                  className="min-h-[80px] resize-none"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={cn("block w-full", !canLog && "cursor-not-allowed")}>
                        <Button
                          size="sm"
                          className="w-full gap-2"
                          disabled={!canLog}
                          onClick={() => {
                            if (!canLog) {
                              toast.error(disabledReason);
                              return;
                            }
                            handleLogVisit();
                          }}
                        >
                          <ClipboardCheck className="w-4 h-4" />
                          Log activity
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!canLog && (
                      <TooltipContent>
                        <p>{disabledReason}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>
              </div>

              {/* Recent Activity — compact, un-boxed feed below the Log activity card */}
              {accountEvents.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</h3>
                  <div className="space-y-1.5">
                    {accountEvents.map((ev) => (
                      <div key={ev.id} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{ev.event_type}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {format(new Date(ev.start_at), 'MMM d, yyyy')} · {ev.assigned_to}
                          </p>
                          {ev.event_type === 'Quote Created' && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {ev.quote_number}
                              {ev.quote_price_usd != null && ` · $${ev.quote_price_usd.toLocaleString()}`}
                              {ev.quote_services && ev.quote_services.length > 0 &&
                                ` · ${ev.quote_services.map((s) => serviceConfig[s as ServiceType]?.label ?? s).join(', ')}`}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Account Notes (add/edit/delete free-text log, separate from Recent Activity) */}
              <div className="space-y-2">
                {notesLoading ? (
                  <p className="text-sm text-muted-foreground">Loading notes...</p>
                ) : accountNotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No notes yet. Add your first visit note above.</p>
                ) : (
                  <div className="space-y-2">
                    {accountNotes.map((note) => (
                      <div key={note.id} className="glass-card p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">{note.author_name}</span>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}
                            </span>
                            {user && note.author_user_id === user.id && (
                              <>
                                {editingNoteId === note.id ? (
                                  <button
                                    onClick={() => {
                                      if (!selectedAccount) return;
                                      updateNoteMutation.mutate({
                                        noteId: note.id,
                                        noteText: editingNoteText.trim(),
                                        accountId: selectedAccount.id,
                                      }, {
                                        onSuccess: () => {
                                          setEditingNoteId(null);
                                          setEditingNoteText('');
                                        },
                                      });
                                    }}
                                    disabled={!editingNoteText.trim() || updateNoteMutation.isPending}
                                    className="p-1 rounded hover:bg-muted transition-colors text-primary"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setEditingNoteId(note.id);
                                      setEditingNoteText(note.note_text);
                                    }}
                                    className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    if (!selectedAccount) return;
                                    deleteNoteMutation.mutate({ noteId: note.id, accountId: selectedAccount.id });
                                  }}
                                  disabled={deleteNoteMutation.isPending}
                                  className="p-1 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {editingNoteId === note.id ? (
                          <Textarea
                            value={editingNoteText}
                            onChange={(e) => setEditingNoteText(e.target.value)}
                            className="min-h-[60px] resize-none text-sm"
                            autoFocus
                          />
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">{note.note_text}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Contacts (found via LeadMagic, persisted per account) */}
              {!isPreview && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Contacts{savedContacts.length > 0 ? ` (${savedContacts.length})` : ''}
                  </h3>

                  {savedContacts.map((contact) => {
                    const revealing = revealingField[contact.id];
                    return (
                      <div key={contact.id} className="glass-card p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{contact.first_name} {contact.last_name}</p>
                            {contact.title && <p className="text-xs text-muted-foreground">{contact.title}</p>}
                          </div>
                          {contact.linkedin_url && (
                            <a
                              href={/^https?:\/\//i.test(contact.linkedin_url) ? contact.linkedin_url : `https://${contact.linkedin_url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary flex-shrink-0"
                            >
                              LinkedIn
                            </a>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1">
                          <span className="text-muted-foreground">Email</span>
                          {contact.email ? (
                            <span className="truncate max-w-[180px]">{contact.email}</span>
                          ) : (
                            <button
                              onClick={() => handleRevealEmail(contact)}
                              disabled={!!revealing}
                              className="text-primary hover:underline disabled:opacity-60"
                            >
                              {revealing === 'email' ? 'Revealing…' : 'Reveal email'}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Mobile</span>
                          {contact.phone ? (
                            <span>{contact.phone}</span>
                          ) : contact.email ? (
                            <button
                              onClick={() => handleRevealPhone(contact)}
                              disabled={!!revealing}
                              className="text-primary hover:underline disabled:opacity-60"
                            >
                              {revealing === 'phone' ? 'Revealing…' : 'Reveal mobile'}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">Reveal email first</span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <button
                    onClick={handleFindContacts}
                    disabled={findingContacts}
                    className="w-full inline-flex items-center justify-center gap-1.5 text-sm bg-primary/10 text-primary rounded-lg py-2 hover:bg-primary/20 transition-colors disabled:opacity-60"
                  >
                    {findingContacts ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserSearch className="w-3.5 h-3.5" />
                    )}
                    {findingContacts ? 'Searching…' : savedContacts.length > 0 ? 'Find another contact' : 'Find contacts'}
                  </button>
                </div>
              )}

              {/* Secondary Contacts */}
              {secondaryContacts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Secondary Contacts ({secondaryContacts.length})
                  </h3>
                  <div className="space-y-2">
                    {secondaryContacts.map((contact) => (
                      <div key={contact.id} className="glass-card p-3 space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate">
                              {getContactDisplayName(contact) || <span className="italic text-muted-foreground font-normal">No named contact</span>}
                            </p>
                            <p className="text-xs text-muted-foreground">{contact.jobTitle || '—'}</p>
                          </div>
                        </div>
                        <div className="grid gap-1 pl-11">
                          {contact.mainPhone ? (
                            <a
                              href={`tel:${contact.mainPhone}`}
                              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted transition-colors group"
                            >
                              <Phone className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
                              <span className="text-xs">{contact.mainPhone}</span>
                            </a>
                          ) : (
                            <div className="flex items-center gap-2 p-1.5">
                              <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">—</span>
                            </div>
                          )}
                          {contact.mainEmail ? (
                            <a
                              href={`mailto:${contact.mainEmail}`}
                              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted transition-colors group"
                            >
                              <Mail className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
                              <span className="text-xs truncate">{contact.mainEmail}</span>
                            </a>
                          ) : (
                            <div className="flex items-center gap-2 p-1.5">
                              <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">—</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Legacy Notes (QB "Company" column, rolled up over visits) */}
              {selectedAccount.accountNotes && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Legacy Notes
                  </h3>
                  <div className="glass-card p-3">
                    <p className="text-sm whitespace-pre-wrap">{selectedAccount.accountNotes}</p>
                  </div>
                </div>
              )}

            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t bg-card safe-bottom space-y-3">
              {/* Delete Button */}
              {!isPreview && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this account?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete <strong>{selectedAccount.accountName}</strong>?
                      This action cannot be undone and all associated data will be permanently removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      disabled={isDeleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isDeleting ? 'Deleting...' : 'Delete'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
