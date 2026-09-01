import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { useAddQuote } from '@/hooks/useQuotes';
import { toast } from 'sonner';

interface AddQuoteModalProps {
  accountId: string;
  open: boolean;
  onClose: () => void;
}

export default function AddQuoteModal({ accountId, open, onClose }: AddQuoteModalProps) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const addQuote = useAddQuote();

  const reset = () => {
    setTitle('');
    setAmount('');
    setDescription('');
    setValidUntil('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount);
    if (!title.trim() || Number.isNaN(amountNum)) return;
    try {
      await addQuote.mutateAsync({
        accountId,
        title: title.trim(),
        amount: amountNum,
        description: description.trim() || undefined,
        validUntil: validUntil || null,
      });
      toast.success('Quote created as a draft');
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create quote');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Quote</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="quote-title">Title</Label>
            <Input
              id="quote-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Full Service — Annual Contract"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quote-amount">Amount</Label>
            <Input
              id="quote-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quote-valid-until">Valid Until</Label>
            <Input
              id="quote-valid-until"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quote-description">Description</Label>
            <Textarea
              id="quote-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Scope of work, terms, notes..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={addQuote.isPending || !title.trim() || !amount}>
              {addQuote.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Quote
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
