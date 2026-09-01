import type { FilterGroup } from './filters';

export interface SequenceStep {
  subject: string;
  body: string;
  waitDays: number;
  emailbisonStepId?: number;
}

export interface EmailSequence {
  id: string;
  name: string;
  status: 'draft' | 'active';
  filter_groups: FilterGroup[];
  steps: SequenceStep[];
  emailbison_campaign_id: number | null;
  emailbison_sequence_id: number | null;
  last_pushed_lead_count: number | null;
  last_pushed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const BLANK_STEP: SequenceStep = { subject: '', body: '', waitDays: 1 };
