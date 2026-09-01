// The Workflows engine — called on a schedule by pg_cron (every 5 minutes,
// see the process-workflows cron job in 20260819120000_workflows.sql). Not a
// simulation: task creation, tag/status changes, wait timing, and (once
// SLACK_BOT_TOKEN is set) Slack alerts are all real. Instantly/EmailBison
// nurture sends are still stubbed (logged to workflow_alert_log) pending a
// real per-workspace API key.
//
// Each invocation does three things:
//   1. Consume unprocessed workflow_trigger_events (event-driven triggers:
//      tag_added, status_changed, activity_logged, account_imported) and
//      start a workflow_run for any active workflow whose trigger + filter
//      conditions match.
//   2. Sweep for the purely time-based triggers that can't be a row-insert
//      trigger (no_activity_days, follow_up_due).
//   3. Advance every workflow_run whose next_run_at has passed, executing
//      steps in order until it hits a wait step (which reschedules) or runs
//      out of steps (which marks the run done).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { slackConfigured, postSlackMessage } from "../_shared/slack.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface WorkflowConditions {
  statuses?: string[];
  tagIds?: string[];
  lastActivityTypes?: string[];
  cities?: string[];
}

interface Workflow {
  id: string;
  name: string;
  status: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  conditions: WorkflowConditions;
  steps: Step[];
}

type Step =
  | { type: 'wait'; value: number; unit: 'hours' | 'days' | 'weeks' }
  | { type: 'alert'; channel: 'slack' | 'email' | 'both'; message?: string; slackChannelId?: string; slackChannelName?: string }
  | { type: 'nurture'; provider: 'instantly' | 'encore' }
  | { type: 'task'; title?: string }
  | { type: 'tag'; tagId: string }
  | { type: 'status'; status: string }
  | { type: 'outbound' };

async function accountMatchesConditions(accountId: string, conditions: WorkflowConditions): Promise<boolean> {
  if (!conditions || Object.keys(conditions).length === 0) return true;

  const { data: account } = await supabase
    .from('accounts')
    .select('account_status, route_city')
    .eq('id', accountId)
    .single();
  if (!account) return false;

  if (conditions.statuses?.length && !conditions.statuses.includes(account.account_status)) return false;
  if (conditions.cities?.length && !conditions.cities.includes(account.route_city)) return false;

  if (conditions.tagIds?.length) {
    const { data: tags } = await supabase.from('account_tags').select('tag_id').eq('account_id', accountId);
    const accountTagIds = (tags ?? []).map((t) => t.tag_id);
    if (!conditions.tagIds.some((id) => accountTagIds.includes(id))) return false;
  }

  if (conditions.lastActivityTypes?.length) {
    const { data: lastEvent } = await supabase
      .from('account_events')
      .select('event_type')
      .eq('account_id', accountId)
      .order('start_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastEvent || !conditions.lastActivityTypes.includes(lastEvent.event_type)) return false;
  }

  return true;
}

async function startRunIfNew(workflowId: string, accountId: string, triggerPayload: Record<string, unknown> = {}) {
  const { data: existing } = await supabase
    .from('workflow_runs')
    .select('id')
    .eq('workflow_id', workflowId)
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) return;

  const { error } = await supabase.from('workflow_runs').insert({
    workflow_id: workflowId,
    account_id: accountId,
    step_index: 0,
    status: 'pending',
    next_run_at: new Date().toISOString(),
    trigger_payload: triggerPayload,
  });
  if (error) console.error(`Failed to start run for workflow ${workflowId}/account ${accountId}:`, error.message);
}

async function processTriggerEvents(activeWorkflows: Workflow[]) {
  const { data: events } = await supabase
    .from('workflow_trigger_events')
    .select('id, trigger_type, account_id, payload')
    .eq('processed', false)
    .limit(500);
  if (!events?.length) return;

  for (const event of events) {
    const matchingWorkflows = activeWorkflows.filter((w) => w.trigger_type === event.trigger_type);
    for (const workflow of matchingWorkflows) {
      const cfg = workflow.trigger_config ?? {};
      let triggerMatches = true;

      if (event.trigger_type === 'status_changed') {
        const statuses = cfg.statuses as string[] | undefined;
        triggerMatches = !statuses?.length || statuses.includes((event.payload as { to?: string }).to ?? '');
      } else if (event.trigger_type === 'activity_logged') {
        const types = cfg.activityTypes as string[] | undefined;
        triggerMatches = !types?.length || types.includes((event.payload as { event_type?: string }).event_type ?? '');
      } else if (event.trigger_type === 'tag_added') {
        const tagIds = cfg.tagIds as string[] | undefined;
        triggerMatches = !tagIds?.length || tagIds.includes((event.payload as { tag_id?: string }).tag_id ?? '');
      }

      if (triggerMatches && (await accountMatchesConditions(event.account_id, workflow.conditions))) {
        await startRunIfNew(workflow.id, event.account_id, event.payload as Record<string, unknown>);
      }
    }
    await supabase.from('workflow_trigger_events').update({ processed: true }).eq('id', event.id);
  }
}

async function sweepTimeBasedTriggers(activeWorkflows: Workflow[]) {
  for (const workflow of activeWorkflows.filter((w) => w.trigger_type === 'no_activity_days')) {
    const days = Number((workflow.trigger_config as { days?: number }).days ?? 90);
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const { data: candidates } = await supabase
      .from('accounts')
      .select('id')
      .or(`last_visit_date.lt.${cutoff},last_visit_date.is.null`)
      .limit(500);
    for (const c of candidates ?? []) {
      if (await accountMatchesConditions(c.id, workflow.conditions)) await startRunIfNew(workflow.id, c.id);
    }
  }

  for (const workflow of activeWorkflows.filter((w) => w.trigger_type === 'follow_up_due')) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: candidates } = await supabase
      .from('accounts')
      .select('id')
      .lte('next_follow_up_date', today)
      .not('next_follow_up_date', 'is', null)
      .limit(500);
    for (const c of candidates ?? []) {
      if (await accountMatchesConditions(c.id, workflow.conditions)) await startRunIfNew(workflow.id, c.id);
    }
  }
}

function addDuration(base: Date, value: number, unit: 'hours' | 'days' | 'weeks'): Date {
  const ms = unit === 'hours' ? value * 3600000 : unit === 'weeks' ? value * 7 * 86400000 : value * 86400000;
  return new Date(base.getTime() + ms);
}

interface RunContext {
  id: string;
  account_id: string;
  trigger_payload: Record<string, unknown>;
}

async function renderAlertMessage(template: string | undefined, workflow: Workflow, run: RunContext): Promise<string> {
  const { data: account } = await supabase.from('accounts').select('account_name').eq('id', run.account_id).single();
  const { data: lastEvent } = await supabase
    .from('account_events')
    .select('assigned_to')
    .eq('account_id', run.account_id)
    .order('start_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const values: Record<string, string> = {
    account_name: account?.account_name ?? 'an account',
    status_from: String((run.trigger_payload as { from?: string }).from ?? '—'),
    status_to: String((run.trigger_payload as { to?: string }).to ?? '—'),
    activity_type: String((run.trigger_payload as { event_type?: string }).event_type ?? '—'),
    owner: lastEvent?.assigned_to ?? 'Unassigned',
    workflow_name: workflow.name,
  };

  const source = template?.trim() || '{{workflow_name}} fired for {{account_name}}';
  return source.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, token) => values[token] ?? match);
}

async function executeStep(step: Step, workflow: Workflow, run: RunContext) {
  switch (step.type) {
    case 'task': {
      const { data: lastEvent } = await supabase
        .from('account_events')
        .select('assigned_to')
        .eq('account_id', run.account_id)
        .order('start_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: account } = await supabase.from('accounts').select('account_name').eq('id', run.account_id).single();
      await supabase.from('tasks').insert({
        account_id: run.account_id,
        workflow_id: workflow.id,
        workflow_run_id: run.id,
        title: step.title || `${workflow.name} — ${account?.account_name ?? 'Account'}`,
        subtitle: `${workflow.name}`,
        owner: lastEvent?.assigned_to ?? null,
        due_at: new Date().toISOString(),
      });
      break;
    }
    case 'tag':
      await supabase.from('account_tags').upsert({ account_id: run.account_id, tag_id: step.tagId }, { onConflict: 'account_id,tag_id' });
      break;
    case 'status':
      await supabase.from('accounts').update({ account_status: step.status }).eq('id', run.account_id);
      break;
    case 'alert': {
      const message = await renderAlertMessage(step.message, workflow, run);

      let sent = false;
      if ((step.channel === 'slack' || step.channel === 'both') && slackConfigured() && step.slackChannelId) {
        try {
          await postSlackMessage(step.slackChannelId, message);
          sent = true;
        } catch (e) {
          console.error('Slack post failed:', e instanceof Error ? e.message : e);
        }
      }

      await supabase.from('workflow_alert_log').insert({
        workflow_run_id: run.id,
        channel: step.channel,
        message,
        sent,
      });
      break;
    }
    case 'nurture':
    case 'outbound': {
      const provider = step.type === 'nurture' ? step.provider : 'instantly';
      const { data: conn } = await supabase.from('integration_connections').select('provider').eq('provider', 'instantly').maybeSingle();
      await supabase.from('workflow_alert_log').insert({
        workflow_run_id: run.id,
        channel: provider,
        message: `[${workflow.name}] added account ${run.account_id} to outbound sequence`,
        sent: !!conn,
      });
      break;
    }
  }
}

async function advancePendingRuns() {
  const { data: dueRuns } = await supabase
    .from('workflow_runs')
    .select('id, workflow_id, account_id, step_index, trigger_payload')
    .eq('status', 'pending')
    .lte('next_run_at', new Date().toISOString())
    .limit(200);
  if (!dueRuns?.length) return;

  const workflowIds = [...new Set(dueRuns.map((r) => r.workflow_id))];
  const { data: workflows } = await supabase.from('workflows').select('*').in('id', workflowIds);
  const workflowsById = new Map((workflows ?? []).map((w) => [w.id, w as Workflow]));

  for (const run of dueRuns) {
    const workflow = workflowsById.get(run.workflow_id);
    if (!workflow) continue;
    const steps = workflow.steps ?? [];
    let stepIndex = run.step_index;

    while (stepIndex < steps.length) {
      const step = steps[stepIndex];
      if (step.type === 'wait') {
        const nextRunAt = addDuration(new Date(), step.value, step.unit);
        await supabase.from('workflow_runs').update({ step_index: stepIndex + 1, next_run_at: nextRunAt.toISOString() }).eq('id', run.id);
        stepIndex = steps.length + 1; // signal: deferred, don't mark done below
        break;
      }
      await executeStep(step, workflow, run);
      stepIndex += 1;
    }

    if (stepIndex === steps.length) {
      await supabase.from('workflow_runs').update({ status: 'done', step_index: stepIndex }).eq('id', run.id);
    }
  }
}

Deno.serve(async () => {
  try {
    const { data: activeWorkflows } = await supabase.from('workflows').select('*').eq('status', 'active');
    const workflows = (activeWorkflows ?? []) as Workflow[];

    await processTriggerEvents(workflows);
    await sweepTimeBasedTriggers(workflows);
    await advancePendingRuns();

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('process-workflows error:', e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: 'Request failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
