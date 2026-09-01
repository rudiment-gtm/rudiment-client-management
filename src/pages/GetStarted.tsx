import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Check, X, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Public, unauthenticated PLG-style signup — separate from the internal
// @getrudiment.com login in Auth.tsx. Anyone can submit an email here; the
// lead is captured in plg_signups regardless of whether they ever click
// through the invite email. This is a sales-demo simulation, not a real
// multi-tenant product — every signup lands in the same shared demo data,
// with a 14-day trial and plan_tier='trial' set by handle_new_user().
const CONTACT_EMAIL = 'hello@getrudiment.com';

interface PlanFeature {
  label: string;
  included: boolean;
}

interface Plan {
  eyebrow: string;
  name: string;
  price: string;
  priceSuffix?: string;
  badge?: string;
  creditsLabel: string;
  description: string;
  features: PlanFeature[];
  cta: string;
  selfServe: boolean;
  highlighted?: boolean;
}

const PLANS: Plan[] = [
  {
    eyebrow: 'ENTRY',
    name: 'Base',
    price: '$149',
    priceSuffix: '/mo',
    creditsLabel: 'No enrichment credits',
    description: 'For the solopreneur running the whole book alone. No more working out of spreadsheets.',
    features: [
      { label: 'Upload your accounts by CSV', included: true },
      { label: 'AI chat — ask questions about your book in plain language', included: true },
      { label: 'Route your day and log field activity', included: true },
      { label: 'Two-way CRM sync', included: false },
      { label: 'Enrichment credits', included: false },
      { label: 'Dedicated Slack channel', included: false },
      { label: 'API access and custom endpoints', included: false },
    ],
    cta: 'Start for free',
    selfServe: true,
  },
  {
    eyebrow: 'CONNECTED',
    name: 'Standard',
    price: '$299',
    priceSuffix: '/mo',
    creditsLabel: 'No enrichment credits',
    description: 'Everything in Base, wired live into the CRM you already run.',
    features: [
      { label: 'Two-way CRM sync — changes on the map write back in real time', included: true },
      { label: 'AI chat — ask questions about your book in plain language', included: true },
      { label: 'Route your day and log field activity', included: true },
      { label: 'Enrichment credits', included: false },
      { label: 'Dedicated Slack channel', included: false },
      { label: 'API access and custom endpoints', included: false },
    ],
    // Two-way CRM sync needs onboarding to get right — not self-serve yet,
    // even though the reference pricing page shows "Start for free" here.
    cta: 'Talk to us',
    selfServe: false,
  },
  {
    eyebrow: 'FULL',
    name: 'Growth',
    price: '$599',
    priceSuffix: '/mo',
    badge: 'MOST TEAMS',
    creditsLabel: '5,000 credits / mo',
    description: 'The whole product. Contacts found and verified, and a channel straight to us.',
    features: [
      { label: 'Two-way CRM sync — changes on the map write back in real time', included: true },
      { label: '5,000 enrichment credits every month', included: true },
      { label: 'Dedicated Slack channel with the team that built it', included: true },
      { label: 'API access and custom endpoints', included: true },
      { label: 'AI chat, routing, and field activity logging', included: true },
    ],
    cta: 'Book a demo',
    selfServe: false,
    highlighted: true,
  },
  {
    eyebrow: 'BILLED MONTHLY',
    name: 'Custom',
    price: 'Get pricing',
    creditsLabel: 'Credits to scope',
    description: 'Larger teams, several branches, or integrations beyond your CRM.',
    features: [
      { label: 'Everything in Growth, sized to your organization', included: true },
      { label: 'Enrichment credit pool scoped to your volume', included: true },
      { label: 'Priority support with a named account lead', included: true },
      { label: 'API access and custom endpoints', included: true },
      { label: 'Custom integrations beyond your CRM', included: true },
    ],
    cta: 'Talk to us',
    selfServe: false,
  },
];

export default function GetStarted() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('plg-signup', {
        body: { email: email.trim(), redirectTo: window.location.origin },
      });
      if (error || data?.error) {
        toast.error(data?.error || 'Could not send the signup link. Please try again.');
        return;
      }
      setSubmitted(true);
    } catch {
      toast.error('Could not send the signup link. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="relative overflow-hidden">
        <div className="ambient-bg" aria-hidden="true">
          <svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="getStartedAmbientGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(165 100% 47%)" stopOpacity="0" />
                <stop offset="50%" stopColor="hsl(165 100% 47%)" stopOpacity="0.5" />
                <stop offset="100%" stopColor="hsl(165 100% 47%)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="ambient-wavy-path" d="M -50,180 C 150,120 250,260 450,180 S 750,120 900,220" fill="none" stroke="url(#getStartedAmbientGradient)" strokeWidth="1.5" />
            <path className="ambient-wavy-path" d="M -50,340 C 180,280 280,420 480,340 S 780,280 900,380" fill="none" stroke="url(#getStartedAmbientGradient)" strokeWidth="1.5" style={{ animationDelay: '-3s' }} />
          </svg>
        </div>

        <div className="relative z-10 max-w-lg mx-auto px-4 pt-20 pb-12 text-center">
          {/* Text-only confirmed by Ani — no logo asset for Cyber Halo */}
          <span className="block text-2xl font-bold tracking-tight mx-auto mb-6">Cyber Halo</span>
          <h1 className="text-3xl font-extrabold tracking-tight mb-3">Get started with Cyber Halo</h1>
          <p className="text-muted-foreground mb-8">
            14 days free, no credit card required. We'll create your account after you verify your email.
          </p>

          {submitted ? (
            <div className="glass-card p-6 text-left flex items-start gap-3">
              <span className="icon-chip mt-0.5"><Mail className="w-4 h-4 text-primary" /></span>
              <div>
                <p className="font-semibold mb-1">Check your email</p>
                <p className="text-sm text-muted-foreground">
                  We sent a link to <span className="text-foreground">{email}</span>. Click it to activate your 14-day trial.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="glass-card p-4 flex flex-col sm:flex-row gap-2">
              <Input
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={submitting} className="gap-2 sm:w-auto">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Send sign-up link
              </Button>
            </form>
          )}

          <p className="text-xs text-muted-foreground mt-4">
            Already have an account? <Link to="/auth" className="text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={plan.highlighted ? 'glass-card p-6 flex flex-col' : 'rounded-2xl border border-border bg-card p-6 flex flex-col'}
            >
              {plan.badge && (
                <span className="self-end -mt-2 mb-2 text-[10px] font-bold tracking-widest uppercase bg-primary text-primary-foreground rounded-full px-2.5 py-1">
                  {plan.badge}
                </span>
              )}
              <span className="text-[11px] font-mono tracking-widest text-muted-foreground uppercase">{plan.eyebrow}</span>
              <h3 className="text-xl font-bold mt-1">{plan.name}</h3>
              <div className="mt-2 mb-3">
                <span className="text-3xl font-extrabold" style={plan.highlighted ? { color: 'hsl(var(--primary))' } : undefined}>{plan.price}</span>
                {plan.priceSuffix && <span className="text-muted-foreground text-sm"> {plan.priceSuffix}</span>}
              </div>
              <span className="inline-block text-xs font-mono bg-muted rounded px-2 py-1 w-fit mb-4">{plan.creditsLabel}</span>
              <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
              <div className="border-t border-border my-2" />
              <ul className="space-y-2.5 my-4 flex-1">
                {plan.features.map((f) => (
                  <li key={f.label} className="flex items-start gap-2 text-sm">
                    {f.included
                      ? <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      : <X className="w-4 h-4 text-destructive/70 shrink-0 mt-0.5" />}
                    <span className={f.included ? '' : 'text-muted-foreground'}>{f.label}</span>
                  </li>
                ))}
              </ul>
              {plan.selfServe ? (
                <Button
                  className="w-full"
                  onClick={() => document.querySelector<HTMLInputElement>('input[type="email"]')?.focus()}
                >
                  {plan.cta}
                </Button>
              ) : (
                <Button variant="outline" className="w-full" asChild>
                  <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Cyber Halo ${plan.name} plan`)}`}>
                    {plan.cta}
                  </a>
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
