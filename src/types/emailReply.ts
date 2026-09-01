// Shape mirrors EmailBison's own reply object (see supabase/functions/_shared/emailbison.ts) —
// only the fields the UI actually renders, not the full API payload.

export interface EmailReplyLead {
  id: number;
  first_name: string;
  last_name?: string | null;
  email: string;
  company?: string | null;
  title?: string | null;
}

export interface EmailReply {
  id: number;
  folder: string;
  subject: string;
  read: boolean;
  interested: boolean;
  automated_reply: boolean;
  html_body: string | null;
  text_body: string | null;
  date_received: string;
  campaign_id: number | null;
  lead_id: number | null;
  lead: EmailReplyLead | null;
  sender_email_id: number | null;
  from_name: string | null;
  from_email_address: string | null;
  to: { name: string | null; address: string }[] | null;
}
