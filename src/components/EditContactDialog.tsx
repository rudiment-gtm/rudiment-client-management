import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil } from 'lucide-react';
import { Account } from '@/types/account';
import { useUpdateAccountContact, ContactPatch } from '@/hooks/useAccounts';
import { useAppStore } from '@/store/appStore';
import { toast } from 'sonner';

interface EditContactDialogProps {
  account: Account;
}

export default function EditContactDialog({ account }: EditContactDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ContactPatch>({});
  const updateContact = useUpdateAccountContact();

  useEffect(() => {
    if (open) {
      setForm({
        salutation: account.salutation ?? '',
        firstName: account.firstName ?? '',
        middleInitial: account.middleInitial ?? '',
        lastName: account.lastName ?? '',
        jobTitle: account.jobTitle ?? '',
        mainPhone: account.mainPhone ?? '',
        altPhone: account.altPhone ?? '',
        mainEmail: account.mainEmail ?? '',
        website: account.website ?? '',
        linkedinUrl: account.linkedinUrl ?? '',
      });
    }
  }, [open, account]);

  const field = (key: keyof ContactPatch) => ({
    value: form[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const handleSave = () => {
    updateContact.mutate(
      { accountId: account.id, patch: form },
      {
        onSuccess: () => {
          useAppStore.getState().updateAccountFields(account.id, form);
          toast.success('Contact record updated');
          setOpen(false);
        },
        onError: (err) => {
          toast.error(`Failed to update contact: ${err instanceof Error ? err.message : 'unknown error'}`);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <Pencil className="w-3 h-3" />
        Edit contact record
      </Button>
      <DialogContent className="sm:max-w-[440px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit contact record</DialogTitle>
          <DialogDescription>
            Updates the primary contact on {account.accountName}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Salutation</Label>
              <Input {...field('salutation')} placeholder="Mr./Ms." />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Job title</Label>
              <Input {...field('jobTitle')} placeholder="Property Manager" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>First name</Label>
              <Input {...field('firstName')} />
            </div>
            <div className="space-y-1.5">
              <Label>M.I.</Label>
              <Input {...field('middleInitial')} maxLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Last name</Label>
              <Input {...field('lastName')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input {...field('mainPhone')} placeholder="925-555-0176" />
            </div>
            <div className="space-y-1.5">
              <Label>Alt. phone</Label>
              <Input {...field('altPhone')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input {...field('mainEmail')} type="email" placeholder="name@company.com" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input {...field('website')} placeholder="company.com" />
            </div>
            <div className="space-y-1.5">
              <Label>LinkedIn</Label>
              <Input {...field('linkedinUrl')} placeholder="linkedin.com/in/..." />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateContact.isPending}>
            {updateContact.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
