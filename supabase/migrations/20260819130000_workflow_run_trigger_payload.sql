-- Carries the original trigger event's payload (e.g. status from/to,
-- activity type) forward onto the run, so a later Alert step can reference
-- it in a custom message even after a Wait step has passed. Time-based
-- triggers (no_activity_days, follow_up_due) have no event payload, so this
-- stays '{}' for those.
alter table workflow_runs
  add column if not exists trigger_payload jsonb not null default '{}';
