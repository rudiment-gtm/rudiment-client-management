import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { parseCsv } from '@/lib/csv';
import { useImportPoolCompanies } from '@/hooks/useProspectPool';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import ImportMappingDialog from '@/components/ImportMappingDialog';

interface ImportCsvButtonProps {
  onImported: (result: { ids: string[]; count: number }) => void;
  className?: string;
}

const SKIP = '__skip__';
const NUMERIC_FIELDS = new Set(['latitude', 'longitude']);

// Shared CSV-import trigger — used by both the Prospect tab and the Map
// view's list dialog so a rep can kick off an import from wherever they
// are. Always lands in the prospect_pool_companies staging table; what
// happens after (review, push to map) is the caller's decision via
// onImported. Parsing just splits the file into rows — the actual
// header→field assignment happens in ImportMappingDialog before anything
// is inserted, since a rep's CSV headers rarely match our column names.
export default function ImportCsvButton({ onImported, className }: ImportCsvButtonProps) {
  const importCompanies = useImportPoolCompanies();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [parsed, setParsed] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);

  const handleClick = () => fileInputRef.current?.click();

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (!rows.length) {
        toast.error('No rows found — expected a CSV with a header row.');
        return;
      }
      setParsed({ headers: Object.keys(rows[0]), rows });
    } catch (e) {
      toast.error(`Could not read file: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };

  const handleConfirmMapping = async (mapping: Record<string, string>) => {
    if (!parsed) return;
    setImporting(true);
    try {
      const companies = parsed.rows.map((row) => {
        const out: Record<string, string | number | null> = {};
        for (const [field, header] of Object.entries(mapping)) {
          if (header === SKIP) {
            out[field] = null;
            continue;
          }
          const raw = row[header] || '';
          out[field] = NUMERIC_FIELDS.has(field) ? (raw ? Number(raw) : null) : (raw || null);
        }
        return out as unknown as {
          company_name: string; category: string | null; address: string | null; city: string | null;
          state: string | null; latitude: number | null; longitude: number | null; website: string | null; phone: string | null;
        };
      }).filter((c) => !!c.company_name);

      if (!companies.length) {
        toast.error('No usable rows — every row needs a Company Name value.');
        return;
      }

      const inserted = await importCompanies.mutateAsync(companies);
      toast.success(`Imported ${inserted.length} compan${inserted.length === 1 ? 'y' : 'ies'} into the prospect pool.`);
      setParsed(null);
      onImported({ ids: inserted.map((r) => r.id), count: inserted.length });
    } catch (e) {
      toast.error(`Import failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={importing}
        size="sm"
        className={cn('gap-1.5 flex-shrink-0', className)}
      >
        {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        Import CSV
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      {parsed && (
        <ImportMappingDialog
          open={!!parsed}
          onOpenChange={(open) => { if (!open) setParsed(null); }}
          headers={parsed.headers}
          rows={parsed.rows}
          onConfirm={handleConfirmMapping}
        />
      )}
    </>
  );
}
