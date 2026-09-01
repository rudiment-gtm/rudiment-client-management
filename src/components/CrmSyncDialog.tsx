import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CloudDownload, Copy, Check, ExternalLink, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthContext } from '@/components/AuthProvider';

export function CrmSyncDialog() {
  const { profile } = useAuthContext();
  const isLocked = profile?.plan_tier === 'trial' || profile?.plan_tier === 'base';
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-clay`;

  if (isLocked) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sync CRM</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              Upgrade to sync your CRM
            </DialogTitle>
            <DialogDescription>
              Two-way CRM sync is available on the Standard and Growth plans.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Standard ($299/mo) and Growth ($599/mo) wire every account change straight into Clay in real time. Your current plan doesn't include it yet.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Maybe later</Button>
            <Button onClick={() => setOpen(false)}>Talk to us</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      toast.success('Webhook URL copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy URL');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <CloudDownload className="h-4 w-4" />
          <span className="hidden sm:inline">Sync CRM</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>CRM Sync (placeholder)</DialogTitle>
          <DialogDescription>
            Placeholder for whichever CRM this customer ends up using — the actual
            integration gets wired up per-customer once that's decided.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(85vh-180px)] pr-4">
          <div className="grid gap-4 py-4">
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Setup Instructions:</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Open your Clay table</li>
                <li>Add an <strong>HTTP API</strong> enrichment column</li>
                <li>Set method to <strong>POST</strong></li>
                <li>Paste the webhook URL below as the endpoint</li>
                <li>Configure the body to include your account fields</li>
                <li>Run the enrichment to sync your data</li>
              </ol>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="webhookUrl" className="text-sm font-medium">
                Your Webhook URL
              </label>
              <div className="flex gap-2">
                <Input
                  id="webhookUrl"
                  value={webhookUrl}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <h5 className="text-sm font-medium">Required Header:</h5>
              <pre className="text-xs overflow-auto bg-background rounded p-2">
{`x-clay-api-key: YOUR_CLAY_API_KEY`}
              </pre>
              <p className="text-xs text-muted-foreground">
                Add this header in Clay's HTTP API settings. Use the same key value stored in your backend secrets.
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <h5 className="text-sm font-medium">Sync key: <code>id</code></h5>
              <p className="text-xs text-muted-foreground">
                Always include the account's Encore record UUID in the <code>id</code> field. It's the value in the first column of the accounts table (e.g. <code>15a6af97-e88b-42e7-877a-1f43ae83c5e2</code>) and is how Clay maps every push to the correct record. When <code>id</code> is included, only the fields you send are updated — omitted fields are left untouched. Records without an <code>id</code> are treated as brand-new accounts.
              </p>

              <h5 className="text-sm font-medium pt-2">Update an existing account (minimal):</h5>
              <pre className="text-xs overflow-auto bg-background rounded p-2">
{`{
  "id": "15a6af97-e88b-42e7-877a-1f43ae83c5e2",
  "Email": "john@acme.com"
}`}
              </pre>

              <h5 className="text-sm font-medium pt-2">Create a new account (no <code>id</code>):</h5>
              <pre className="text-xs overflow-auto bg-background rounded p-2">
{`{
  "Company": "Acme Corp",
  "Contact First Name": "John",
  "Contact Last Name": "Doe",
  "Contact Title": "Sales Manager",
  "Contact Phone Number": "555-123-4567",
  "Email": "john@acme.com",
  "Street": "123 Main St",
  "City": "Dallas",
  "State": "TX",
  "Zip Code": "75201",
  "Industry": "Warehouse",
  "Account Status": "Active",
  "Last Posting": "Forklift Operator",
  "Who Posted": "Jane Smith",
  "Last Posting Date": "2026-03-15",
  "Postings Per Month": 12,
  "Pay Rate": 22.50,
  "ICP Fit Score": 85,
  "Rating": "Hot"
}`}
               </pre>
               <p className="text-xs text-muted-foreground">
                 Valid Status: Account, Active, At-Risk, Churned, Expansion, Flex Tier. Valid Rating: Hot, Warm, Cold. Valid Industry: Warehouse, Events, Food, Technology, Services, Retail, Other.
               </p>

              <p className="text-xs text-muted-foreground mt-1">
                Multiple contacts at the same address are automatically grouped — the first synced becomes Main Contact, others appear as Secondary Contacts.
              </p>
            </div>
          </div>
        </ScrollArea>
        <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 pb-2.5">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button asChild>
            <a 
              href="https://docs.clay.com/en/articles/9672489-http-api-with-clay"
              target="_blank"
              rel="noopener noreferrer"
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Clay HTTP API Docs
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
