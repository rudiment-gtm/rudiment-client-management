import { useState } from 'react';
import { ClipboardList, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { INTAKE_SECTIONS, IntakeField } from '@/types/intake';
import { useCreateFile } from '@/hooks/useFiles';
import { useAppStore } from '@/store/appStore';
import { toast } from 'sonner';

type Answers = Record<string, string>;

function FieldInput({ field, value, onChange }: { field: IntakeField; value: string; onChange: (v: string) => void }) {
  if (field.type === 'heading') {
    return <h4 className="text-sm font-semibold text-primary pt-2">{field.label}</h4>;
  }

  const id = `intake-${field.id}`;

  if (field.type === 'textarea') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} className="min-h-[80px]" />
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div className="space-y-1.5">
        <Label>{field.label}</Label>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select one…" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.type === 'radio') {
    return (
      <div className="space-y-1.5">
        <Label>{field.label}</Label>
        <RadioGroup value={value} onValueChange={onChange} className="flex flex-wrap gap-4">
          {(field.options ?? []).map((opt) => (
            <div key={opt} className="flex items-center gap-2">
              <RadioGroupItem value={opt} id={`${id}-${opt}`} />
              <Label htmlFor={`${id}-${opt}`} className="font-normal">{opt}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{field.label}{field.required && <span className="text-destructive"> *</span>}</Label>
      <Input id={id} type={field.type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />
    </div>
  );
}

export default function OnboardingView() {
  const [answers, setAnswers] = useState<Answers>({});
  const [submitted, setSubmitted] = useState(false);
  const createFile = useCreateFile();
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const set = (id: string, v: string) => setAnswers((a) => ({ ...a, [id]: v }));

  const missingRequired = INTAKE_SECTIONS
    .flatMap((s) => s.fields)
    .filter((f) => f.required && !answers[f.id]?.trim());

  const handleSubmit = () => {
    if (missingRequired.length > 0) {
      toast.error('Please fill in the required fields (company name and primary contact).');
      return;
    }
    const companyName = answers.company_name?.trim() || 'Untitled client';
    createFile.mutate(
      {
        title: `${companyName} — Onboarding Intake`,
        category: 'onboarding_intake',
        description: `Submitted by ${answers.primary_contact_name || 'unknown'} (${answers.primary_contact_email || 'no email'})`,
        intake_data: answers,
      },
      {
        onSuccess: () => {
          setSubmitted(true);
          toast.success('Intake submitted — saved to Files.');
        },
      },
    );
  };

  if (submitted) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
        <CheckCircle2 className="w-10 h-10 text-status-active" />
        <h2 className="text-lg font-semibold">Thanks — that's everything we need to get started.</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Your answers were saved to the Files tab so the team can start building your campaigns.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => setActiveTab('files')}>Go to Files</Button>
          <Button variant="outline" onClick={() => { setSubmitted(false); setAnswers({}); }}>Submit another</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-6 pt-6 pb-3 border-b flex items-start gap-3">
        <ClipboardList className="w-5 h-5 text-primary mt-0.5" />
        <div>
          <h2 className="text-lg font-bold">Client Intake Form</h2>
          <p className="text-xs text-muted-foreground">
            Answer what you can — the more detail here, the faster we can build campaigns that actually fit your business.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-10">
          {INTAKE_SECTIONS.map((section, i) => (
            <div key={section.id} className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold">{i + 1}</span>
                <h3 className="text-base font-semibold">{section.title}</h3>
              </div>
              <div className="space-y-4 pl-8">
                {section.fields.map((field) => (
                  <FieldInput key={field.id} field={field} value={answers[field.id] ?? ''} onChange={(v) => set(field.id, v)} />
                ))}
              </div>
            </div>
          ))}

          <div className="pl-8 pb-10">
            <Button onClick={handleSubmit} disabled={createFile.isPending} size="lg">
              {createFile.isPending ? 'Submitting…' : 'Submit intake form'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
