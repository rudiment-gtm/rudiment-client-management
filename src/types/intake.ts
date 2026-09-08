// Schema for the client onboarding intake form (OnboardingView). A
// submission is stored as one `files` row (category 'onboarding_intake')
// with the answers keyed by field id in `intake_data`.

export type IntakeFieldType = 'text' | 'email' | 'textarea' | 'select' | 'radio' | 'heading';

export interface IntakeField {
  id: string;
  label: string;
  type: IntakeFieldType;
  options?: string[];
  placeholder?: string;
  required?: boolean;
}

export interface IntakeSection {
  id: string;
  title: string;
  fields: IntakeField[];
}

const customerFields = (n: 1 | 2 | 3): IntakeField[] => [
  { id: `customer_${n}_heading`, type: 'heading', label: `Customer ${n}` },
  { id: `customer_${n}_name_and_why`, type: 'textarea', label: 'Name the customer — why did they buy, in their own words?' },
  { id: `customer_${n}_size`, type: 'text', label: 'What size are they (employee count / revenue range)?' },
  { id: `customer_${n}_industry`, type: 'text', label: 'What industries/verticals are they in?' },
  { id: `customer_${n}_geography`, type: 'text', label: 'What geography are they in?' },
  { id: `customer_${n}_titles`, type: 'text', label: 'What job title(s) made or influenced the buying decision?' },
];

export const INTAKE_SECTIONS: IntakeSection[] = [
  {
    id: 'company_basics',
    title: 'Company Basics',
    fields: [
      { id: 'company_name', type: 'text', label: 'Company name', required: true },
      { id: 'primary_contact_name', type: 'text', label: 'Primary contact name', required: true },
      { id: 'primary_contact_email', type: 'email', label: 'Primary contact email', required: true },
      { id: 'industries', type: 'text', label: 'What are the industry/industries you focus on?' },
      { id: 'technical_contact_name', type: 'text', label: 'Technical contact name (if different from primary)' },
      { id: 'technical_contact_email', type: 'email', label: 'Technical contact email (if different from primary)' },
    ],
  },
  {
    id: 'tech_stack',
    title: 'Tech Stack',
    fields: [
      { id: 'crm', type: 'select', label: 'What CRM are you on?', options: ['HubSpot', 'Salesforce', 'Pipedrive', 'Other'] },
      { id: 'uses_clay', type: 'radio', label: 'Are you using Clay?', options: ['Yes', 'No'] },
      { id: 'b2b_data_tools', type: 'select', label: 'Are you using any B2B data tools?', options: ['Apollo', 'ZoomInfo', 'Clearbit', 'Other', 'None'] },
      { id: 'automation_tool', type: 'text', label: 'Are you using n8n, Zapier, or Make for automations? If yes, which one?' },
      { id: 'gtm_stack_other', type: 'textarea', label: 'What other tools are part of your GTM stack?' },
      { id: 'stack_connectedness', type: 'select', label: 'Do these tools feel connected or are they living in silos?', options: ['Connected', 'Somewhat connected', 'Mostly siloed'] },
    ],
  },
  {
    id: 'current_state',
    title: 'Current State',
    fields: [
      { id: 'crm_contact_count', type: 'text', label: 'How many contacts are currently in your CRM? (rough estimate)' },
      { id: 'inbound_sources', type: 'textarea', label: 'Which sources are inbound leads coming from?' },
      { id: 'inbound_to_crm', type: 'select', label: 'Are inbound leads currently getting into your CRM?', options: ['Form fill', 'Manual', 'Zapier', 'Other'] },
      { id: 'whats_broken', type: 'textarea', label: "What's broken or slow right now that you want fixed first?" },
    ],
  },
  {
    id: 'gtm_intelligence',
    title: 'Go-to-Market Intelligence',
    fields: [
      { id: 'what_you_sell', type: 'textarea', label: 'What do you sell and what does it cost?' },
      ...customerFields(1),
      ...customerFields(2),
      ...customerFields(3),
      { id: 'what_tried_before', type: 'textarea', label: 'What did those customers try before you?' },
      { id: 'if_prospect_does_nothing', type: 'textarea', label: 'What happens if your prospect does nothing?' },
      { id: 'market_data', type: 'textarea', label: 'What public or industry-specific data exists in your market?' },
      { id: 'buying_signals', type: 'textarea', label: 'What signals typically show up before someone becomes a customer?' },
      { id: 'tech_stack_signals', type: 'textarea', label: 'Any tech-stack signals that indicate fit? (e.g. "companies using Salesforce," "companies without a dedicated RevOps hire")' },
      { id: 'outbound_tried', type: 'textarea', label: 'What outbound have you tried and what happened?' },
      { id: 'off_limits_segments', type: 'textarea', label: 'Are there any segments, verticals, or geographies that are off-limits or already saturated?' },
      { id: 'company_type_notes', type: 'text', label: 'Company type worth noting — public/private, funded/bootstrapped (if relevant to your sale)' },
      { id: 'inbox_owner', type: 'text', label: 'Your team: who monitors the inbox?' },
      { id: 'response_time_target', type: 'text', label: "What's the response time target (same hour, same day)?" },
    ],
  },
  {
    id: 'list_build_specs',
    title: 'List Build Specs',
    fields: [
      { id: 'target_list_size', type: 'text', label: 'Target list size (how many companies/contacts per pull?)' },
      { id: 'list_shape', type: 'radio', label: 'Is this one flat list or tiered (ideal / good / stretch)?', options: ['Flat list', 'Tiered (ideal / good / stretch)'] },
      { id: 'list_destination_tools', type: 'text', label: 'Which of your GTM tools should the list live in or get pushed to? (Clay, HubSpot, Apollo, etc.)' },
      { id: 'required_fields', type: 'textarea', label: 'What fields do you need per contact/company row? (e.g. name, title, company, LinkedIn URL, email, employee count)' },
      { id: 'suppressions', type: 'textarea', label: 'Any competitors or current customers to explicitly suppress/exclude?' },
    ],
  },
];
