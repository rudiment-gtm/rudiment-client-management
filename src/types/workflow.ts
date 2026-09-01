// Shared with AccountDrawer's Activity Type select — kept in one place so
// the workflow conditions card's "Last activity type" list and the drawer's
// own list can't drift apart.
export const BUILT_IN_ACTIVITY_TYPES = [
  'Quote Created',
  'Call',
  'Drop By',
  'Follow up',
  'Presentation',
  'Setup',
  'First Post',
  'Training',
  'Onboarding',
  'Direct Hire',
  'Retention',
  'Expansion',
  'Reactivation',
  'Freshdesk Ticket',
];

export type TriggerType =
  | 'tag_added'
  | 'status_changed'
  | 'activity_logged'
  | 'no_activity_days'
  | 'follow_up_due'
  | 'account_imported';

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  tag_added: 'Account has tag',
  status_changed: 'Account status changes',
  activity_logged: 'Activity is logged',
  no_activity_days: 'No activity for 90 days',
  follow_up_due: 'Follow-up date arrives',
  account_imported: 'Account is imported',
};

export interface TriggerConfig {
  statuses?: string[];
  activityTypes?: string[];
  tagIds?: string[];
  days?: number;
}

export interface WorkflowConditions {
  statuses?: string[];
  tagIds?: string[];
  lastActivityTypes?: string[];
  cities?: string[];
}

// Insertable in an Alert step's message template as {{token}} — substituted
// by the engine at send time from the run's stored trigger_payload plus a
// couple of always-available account fields.
export const MESSAGE_PLACEHOLDERS: { token: string; label: string }[] = [
  { token: 'account_name', label: 'Account name' },
  { token: 'status_from', label: 'Status (from)' },
  { token: 'status_to', label: 'Status (to)' },
  { token: 'activity_type', label: 'Activity type' },
  { token: 'owner', label: 'Account owner' },
  { token: 'workflow_name', label: 'Workflow name' },
];

export const DEFAULT_ALERT_MESSAGE = '{{workflow_name}} fired for {{account_name}}';

export type WorkflowStep =
  | { type: 'wait'; value: number; unit: 'hours' | 'days' | 'weeks' }
  | { type: 'alert'; channel: 'slack' | 'email' | 'both'; message?: string; slackChannelId?: string; slackChannelName?: string }
  | { type: 'nurture'; provider: 'instantly' | 'encore' }
  | { type: 'task'; title?: string }
  | { type: 'tag'; tagId: string }
  | { type: 'status'; status: string }
  | { type: 'outbound' };

export type StepLibraryKey = 'wait' | 'alert_slack' | 'email_owner' | 'task' | 'tag' | 'status' | 'outbound';

export const STEP_LIBRARY: { key: StepLibraryKey; label: string }[] = [
  { key: 'wait', label: 'Wait' },
  { key: 'alert_slack', label: 'Alert account owner in Slack' },
  { key: 'email_owner', label: 'Email the account owner' },
  { key: 'task', label: 'Create a follow-up task' },
  { key: 'tag', label: 'Add a tag to the account' },
  { key: 'status', label: 'Change account status' },
  { key: 'outbound', label: 'Add to outbound sequence' },
];

export function stepFromLibraryKey(key: StepLibraryKey): WorkflowStep {
  switch (key) {
    case 'wait': return { type: 'wait', value: 30, unit: 'days' };
    case 'alert_slack': return { type: 'alert', channel: 'slack' };
    case 'email_owner': return { type: 'alert', channel: 'email' };
    case 'task': return { type: 'task' };
    case 'tag': return { type: 'tag', tagId: '' };
    case 'status': return { type: 'status', status: 'lead' };
    case 'outbound': return { type: 'outbound' };
  }
}

export function describeStep(step: WorkflowStep): string {
  switch (step.type) {
    case 'wait': return `Waits ${step.value} ${step.unit} before the next step.`;
    case 'alert': return step.channel === 'both'
      ? 'Alerts the account owner via Slack and email.'
      : `Alerts the account owner via ${step.channel === 'slack' ? 'Slack' : 'email'}.`;
    case 'nurture': return step.provider === 'encore'
      ? 'Sends through Encore sending (EmailBison).'
      : 'Sends through the connected Instantly.ai workspace.';
    case 'task': return step.title ? `Creates task: ${step.title}` : 'Creates a follow-up task.';
    case 'tag': return 'Adds a tag to the account.';
    case 'status': return `Changes account status to ${step.status}.`;
    case 'outbound': return 'Adds the account to an outbound sequence.';
  }
}

export interface Workflow {
  id: string;
  name: string;
  status: 'draft' | 'active';
  trigger_type: TriggerType;
  trigger_config: TriggerConfig;
  conditions: WorkflowConditions;
  steps: WorkflowStep[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  account_id: string;
  workflow_id: string | null;
  workflow_run_id: string | null;
  title: string;
  subtitle: string | null;
  owner: string | null;
  due_at: string;
  status: 'upcoming' | 'done';
  completed_at: string | null;
  created_at: string;
}
