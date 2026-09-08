// Mirrors the `files` table (supabase/migrations/20260908000000_onboarding_files_meetings.sql).
// Replaces the old Projects spreadsheet tracker: this is where the
// onboarding intake submission lands, plus anything else the team drops in
// for the client to review (lead lists, ad copy).

export type FileCategory = 'onboarding_intake' | 'lead_list' | 'copy' | 'other';

export const FILE_CATEGORIES: FileCategory[] = ['onboarding_intake', 'lead_list', 'copy', 'other'];

export const FILE_CATEGORY_LABELS: Record<FileCategory, string> = {
  onboarding_intake: 'Onboarding intake',
  lead_list: 'Lead list',
  copy: 'Copy for review',
  other: 'Other',
};

export interface FileRecord {
  id: string;
  title: string;
  category: FileCategory;
  description: string | null;
  content: string | null;
  link_url: string | null;
  intake_data: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
