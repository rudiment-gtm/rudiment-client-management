import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Lock, ArrowUpDown } from 'lucide-react';
import { useAuthContext } from '@/components/AuthProvider';
import { useMembers, useInviteMember } from '@/hooks/useMembers';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type SettingsTab = 'profile' | 'members' | 'billing' | 'integrations';

const TABS: { key: SettingsTab; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'members', label: 'Members' },
  { key: 'billing', label: 'Billing' },
  { key: 'integrations', label: 'Integrations' },
];

// Cosmetic — no real billing behind this yet, matching the same
// simulated-plan pattern already used for plan_tier/trial elsewhere in Encore.
const SEAT_LIMIT = 5;

function ProfileTab() {
  const { user, profile, updateProfile } = useAuthContext();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    const { error } = await updateProfile({ display_name: displayName });
    setSavingProfile(false);
    if (error) {
      toast.error(`Failed to save: ${error instanceof Error ? error.message : 'unknown error'}`);
    } else {
      toast.success('Profile updated');
    }
  };

  const handleSavePassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      toast.error('Passwords must match and not be empty');
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      toast.error(`Failed to change password: ${error.message}`);
    } else {
      toast.success('Password changed');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const initials = (profile?.display_name || user?.email || '?').slice(0, 1).toUpperCase();

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold">Profile</h3>

      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold">
          {initials}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={user?.email ?? ''} disabled />
        </div>
      </div>
      <Button size="sm" onClick={handleSaveProfile} disabled={savingProfile}>
        {savingProfile ? 'Saving…' : 'Save changes'}
      </Button>

      <div className="pt-4 border-t space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Change password
        </Label>
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={handleSavePassword} disabled={savingPassword}>
          {savingPassword ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

function MembersTab() {
  const { data: members = [], isLoading } = useMembers();
  const inviteMember = useInviteMember();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'rep'>('rep');

  const handleInvite = () => {
    if (!inviteEmail.trim()) return;
    inviteMember.mutate(
      { email: inviteEmail.trim(), role: inviteRole },
      { onSuccess: () => setInviteEmail('') },
    );
  };

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">Members</h3>

      <div className="flex items-center gap-2">
        <Input
          placeholder="teammate@company.com"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
          className="flex-1"
        />
        <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'admin' | 'rep')}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rep">Rep</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleInvite} disabled={!inviteEmail.trim() || inviteMember.isPending}>
          {inviteMember.isPending ? 'Inviting…' : 'Invite'}
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left font-semibold px-3 py-2">Member</th>
              <th className="text-left font-semibold px-3 py-2">Role</th>
              <th className="text-left font-semibold px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">Loading…</td></tr>
            ) : members.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">No members yet.</td></tr>
            ) : (
              members.map((m) => (
                <tr key={m.user_id} className="border-t">
                  <td className="px-3 py-2">
                    <p className="font-medium">{m.display_name || m.email}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </td>
                  <td className="px-3 py-2 capitalize">{m.role}</td>
                  <td className="px-3 py-2">
                    <Badge variant={m.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                      {m.status}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {members.length} of {SEAT_LIMIT} seats used on the Standard plan.
      </p>
    </div>
  );
}

function BillingTab() {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold">Billing</h3>

      <div className="glass-card p-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary/90">Current plan</p>
          <p className="text-lg font-bold">Standard</p>
          <p className="text-xs text-muted-foreground">{SEAT_LIMIT} seats</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">$249<span className="text-sm text-muted-foreground">/mo</span></p>
          <Button size="sm" variant="outline" className="mt-1">Change plan</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Payment method</p>
          <p className="font-medium">Visa •••• 4412</p>
          <p className="text-xs text-muted-foreground">Expires 09/2028</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Next invoice</p>
          <p className="font-medium">Sep 1, 2026</p>
          <p className="text-xs text-muted-foreground">$249.00 · auto-renews</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invoice history</p>
        {[['Aug 1, 2026', '$249.00'], ['Jul 1, 2026', '$249.00']].map(([date, amt]) => (
          <div key={date} className="flex items-center justify-between text-sm py-1.5 border-t">
            <span>{date}</span>
            <span>{amt}</span>
            <a href="#" className="text-primary text-xs">Receipt</a>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t">
        <p className="text-sm font-medium">Cancel plan</p>
        <p className="text-xs text-muted-foreground">
          To cancel your plan, email <a href="mailto:support@fieldencore.com" className="text-primary underline">support@fieldencore.com</a>.
        </p>
      </div>
    </div>
  );
}

function IntegrationsTab() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 space-y-3">
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
        <ArrowUpDown className="w-4 h-4" />
      </div>
      <p className="font-semibold">Integrations coming soon</p>
      <p className="text-sm text-muted-foreground max-w-xs">
        Connect your CRM, calendar and enrichment providers directly from here.
      </p>
    </div>
  );
}

export default function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [tab, setTab] = useState<SettingsTab>('profile');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] p-0 overflow-hidden">
        <div className="flex min-h-[420px]">
          <div className="w-40 bg-muted/30 border-r p-3 space-y-0.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 pb-2">Settings</p>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`w-full flex items-center gap-1.5 text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
                  tab === t.key ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
                {t.key === 'integrations' && <Lock className="w-3 h-3 ml-auto" />}
              </button>
            ))}
          </div>
          <div className="flex-1 p-6 overflow-y-auto">
            {tab === 'profile' && <ProfileTab />}
            {tab === 'members' && <MembersTab />}
            {tab === 'billing' && <BillingTab />}
            {tab === 'integrations' && <IntegrationsTab />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
