// Mirrors the `project_sections` / `project_items` tables and their check
// constraints (supabase/migrations/20260901000000_projects_meetings_tasks.sql).

export type ProjectItemStatus = 'P1 - Priority' | 'P2 - High' | 'P3 - Normal' | 'P4 - Nice to Have';
export const PROJECT_ITEM_STATUSES: ProjectItemStatus[] = [
  'P1 - Priority',
  'P2 - High',
  'P3 - Normal',
  'P4 - Nice to Have',
];

export type ProjectCompleteStatus = 'Not Started' | 'In Progress' | 'In Review' | 'Completed' | 'Blocked';
export const PROJECT_COMPLETE_STATUSES: ProjectCompleteStatus[] = [
  'Not Started',
  'In Progress',
  'In Review',
  'Completed',
  'Blocked',
];

// Manually-set percent-complete pill — not computed from anything.
export type PercentComplete = 0 | 25 | 50 | 75 | 100;
export const PERCENT_COMPLETE_OPTIONS: PercentComplete[] = [0, 25, 50, 75, 100];

export interface ProjectSection {
  id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectItem {
  id: string;
  section_id: string;
  description: string;
  status: ProjectItemStatus;
  start_date: string | null;
  completion_target_date: string | null;
  assigned_by: string | null;
  owner: string | null;
  percent_complete: number | null;
  complete_status: ProjectCompleteStatus;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectSectionWithItems extends ProjectSection {
  items: ProjectItem[];
}
