export type StaffRole = "admin" | "tca" | "front_office" | "lab_staff" | "viewer";

export type CandidateStatus =
  | "scheduled"
  | "arrived"
  | "id_checked"
  | "waiting"
  | "frisking"
  | "biometrics"
  | "assigned"
  | "lab_entry"
  | "testing"
  | "completed"
  | "signed_out"
  | "no_show";

export type WorkstationStatus = "free" | "assigned" | "active" | "cleaning" | "fault";

export type Center = {
  id: string;
  site_code: string;
  name: string;
  timezone: string;
  active: boolean;
  show_name_on_tv: boolean;
  created_at: string;
};

export type Profile = {
  id: string;
  center_id: string;
  role: StaffRole;
  display_name: string;
  created_at: string;
};

export type ExamSession = {
  id: string;
  center_id: string;
  exam_date: string;
  exam_name: string;
  /** Which exam this day runs, and therefore how long each clock lasts. */
  programme_id: string | null;
  source_filename: string | null;
  status: "draft" | "ready" | "live" | "closed";
  created_by: string | null;
  created_at: string;
};

export type Candidate = {
  id: string;
  exam_session_id: string;
  center_id: string;
  source_row: number | null;
  roster_number: string;
  first_name: string;
  last_name: string;
  part: string | null;
  phone: string | null;
  place: string | null;
  roster_flag: string | null;
  public_token: string;
  status: CandidateStatus;
  scheduled_at: string | null;
  arrival_at: string | null;
  id_verified_at: string | null;
  check_in_at: string | null;
  locker_key: string | null;
  called_at: string | null;
  frisked_at: string | null;
  biometrics_at: string | null;
  workstation_id: string | null;
  lab_entry_at: string | null;
  testing_started_at: string | null;
  completed_at: string | null;
  signed_out_at: string | null;
  programme_id: string | null;
  exam_started_at: string | null;
  exam_duration_minutes: number | null;
  exam_expected_end: string | null;
  exam_finished_at: string | null;
  created_at: string;
};

export type ExamProgramme = {
  id: string;
  center_id: string;
  code: string;
  name: string;
  default_duration_minutes: number;
  active: boolean;
  created_at: string;
};

export type NoticeTone = "info" | "warning" | "urgent";

export type NoticeMediaKind = "image" | "video" | "file";

export type NoticeSlot = {
  key: string;
  label: string;
  type: "time" | "text";
};

export type NoticeTemplate = {
  id: string;
  center_id: string | null;
  key: string;
  label: string;
  body_template: string;
  tone: NoticeTone;
  slots: NoticeSlot[];
  sort_order: number;
  active: boolean;
  created_at: string;
};

export type DisplayNotice = {
  id: string;
  center_id: string;
  template_id: string | null;
  template_key: string;
  template_label: string;
  values: Record<string, string>;
  body: string;
  /** Set when staff reworded the template before it went up. */
  body_override: string | null;
  media_path: string | null;
  media_kind: NoticeMediaKind | null;
  tone: NoticeTone;
  active: boolean;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  cleared_at: string | null;
  cleared_by: string | null;
};

export type CandidateBreak = {
  id: string;
  candidate_id: string;
  center_id: string;
  kind: "scheduled" | "unscheduled";
  started_at: string;
  ended_at: string | null;
  authorised_by: string | null;
  reason: string | null;
  created_at: string;
};

export type ScheduleRules = {
  center_id: string;
  slot_interval_minutes: number;
  exam_duration_minutes: number;
  labs_count: number;
  lab_capacity: number;
  exam_start: string;
  exam_end: string;
  break_start: string | null;
  break_minutes: number;
  frisking_enabled: boolean;
  biometrics_enabled: boolean;
  auto_resequence: boolean;
  locker_key_required: boolean;
  admin_override_log: boolean;
  updated_at: string;
};

export type RosterColumnAlias = {
  id: string;
  center_id: string;
  field: string;
  alias: string;
  created_by: string | null;
  created_at: string;
};

export type IncidentKind =
  | "workstation"
  | "network"
  | "power"
  | "candidate"
  | "conduct"
  | "environment"
  | "delivery"
  | "other";

export type IncidentSeverity = "minor" | "major" | "critical";

export type Incident = {
  id: string;
  center_id: string;
  exam_session_id: string | null;
  kind: IncidentKind;
  severity: IncidentSeverity;
  summary: string;
  detail: string | null;
  candidate_id: string | null;
  workstation_id: string | null;
  started_at: string;
  resolved_at: string | null;
  resolution: string | null;
  /** What the candidate lost, as judged by whoever was there. */
  minutes_lost: number | null;
  reportable: boolean;
  logged_by: string | null;
  resolved_by: string | null;
  created_at: string;
};

/** One line of a Center Problem Report timeline, as the database assembles it. */
export type ReportEntry = {
  at: string;
  kind: "incident" | "override" | "correction";
  category: string;
  severity: IncidentSeverity;
  title: string;
  detail: string | null;
  token: string | null;
  seat: string | null;
  minutes_lost: number | null;
  resolved_at: string | null;
  resolution: string | null;
  reportable: boolean;
};

/** One exam part that ran late, gathered across everybody who sat it. */
export type ReportDelay = {
  name: string;
  candidates: number;
  worst_minutes: number;
  median_minutes: number;
};

/**
 * A day's report. The timeline and the counts are read out of what happened;
 * only the narrative is typed. Once signed off the whole thing is served from
 * a frozen snapshot, so it cannot drift from what was sent.
 */
export type ProblemReport = {
  generated_at: string;
  live: boolean;
  session: { id: string; exam_name: string; exam_date: string; status: string };
  center: { name: string; code: string; timezone: string };
  counts: { rostered: number; sat: number; finished: number; signed_out: number; no_shows: number };
  timeline: ReportEntry[];
  delays: ReportDelay[];
  narrative: {
    summary: string | null;
    actions_taken: string | null;
    reported_to: string | null;
    status: "draft" | "final";
    finalised_at: string | null;
  };
};

export type SectionKind = "section" | "tutorial" | "break";

/** One part of an exam, as planned. The estimate the centre works to. */
export type ProgrammeSection = {
  id: string;
  programme_id: string;
  position: number;
  name: string;
  minutes: number;
  kind: SectionKind;
  created_at: string;
};

/**
 * One part of an exam, as it actually went. Name and minutes are copied from
 * the plan at the moment it is confirmed, so editing the plan later cannot
 * rewrite a day that has happened.
 */
export type CandidateSection = {
  id: string;
  candidate_id: string;
  center_id: string;
  exam_session_id: string | null;
  programme_section_id: string | null;
  position: number;
  name: string;
  minutes: number;
  kind: SectionKind;
  started_at: string;
  /** Null on the part still running; the exam finishing is the last one's end. */
  ended_at: string | null;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
};

/** One thing the centre hands out. Global: every room issues the same list. */
export type MaterialKind = {
  code: string;
  label: string;
  /** False for anything consumed — water, earplugs. Only true ones hold a sign-out up. */
  returnable: boolean;
  active: boolean;
  sort_order: number;
};

export type CandidateMaterial = {
  id: string;
  center_id: string;
  exam_session_id: string | null;
  candidate_id: string;
  kind: string;
  /** Only used by 'other'; an empty string otherwise. */
  label: string;
  issued_count: number;
  returned_count: number;
  /** Not coming back. Counted apart from returned so the day's tally stays honest. */
  written_off_count: number;
  written_off_at: string | null;
  written_off_reason: string | null;
  first_issued_at: string;
  last_issued_at: string;
  issued_by: string | null;
  returned_at: string | null;
  returned_by: string | null;
};

/** How many of this issue are still in the candidate's hands. */
export function stillHeld(m: CandidateMaterial) {
  return m.issued_count - m.returned_count - m.written_off_count;
}

export type Lab = {
  id: string;
  center_id: string;
  name: string;
  position: number;
  capacity: number;
  created_at: string;
};

export type Workstation = {
  id: string;
  center_id: string;
  /** Null on a seat from a retired bank, which the console no longer shows. */
  lab_id: string | null;
  lab_name: string;
  seat_code: string;
  status: WorkstationStatus;
  current_candidate_id: string | null;
};

export type CandidateEvent = {
  id: string;
  candidate_id: string;
  center_id: string;
  event_type: string;
  from_status: CandidateStatus | null;
  to_status: CandidateStatus | null;
  operator_id: string | null;
  occurred_at: string;
  note: string | null;
  metadata_json: Record<string, unknown>;
};

export type PublicDisplay = {
  id: string;
  center_id: string;
  display_key_hash: string;
  label: string;
  hall_label: string;
  active: boolean;
  last_seen_at: string | null;
};

/** Append-only call log. The newest active row per center is what the TVs show. */
export type PublicDisplayCall = {
  id: string;
  center_id: string;
  candidate_id: string | null;
  display_key: string | null;
  token: string;
  candidate_name: string | null;
  room_label: string | null;
  instruction: string;
  hall: string;
  call_nonce: number;
  active: boolean;
  created_by: string | null;
  created_at: string;
};

/** Safe projection sent to a public TV. Never carries phone, place or roster. */
export type DisplayState = {
  hall_label: string;
  label: string;
  timezone: string;
  call: {
    token: string;
    name: string | null;
    room: string | null;
    instruction: string | null;
    nonce: number;
    updated_at: string;
  } | null;
  notice: {
    body: string;
    tone: NoticeTone;
    /** Storage key while in the database; a signed URL by the time it reaches the browser. */
    media_path: string | null;
    media_url?: string | null;
    media_kind: NoticeMediaKind | null;
    posted_at: string;
  } | null;
  next: { public_token: string; name: string | null; scheduled_at: string | null }[];
  server_time: string;
};

export type RosterRow = {
  source_row: number;
  roster_number: string;
  first_name: string;
  last_name: string;
  part: string | null;
  phone: string | null;
  place: string | null;
  roster_flag: string | null;
};

export type RosterIssue = {
  source_row: number;
  level: "error" | "warning";
  message: string;
};

export type RosterDiagnostics = {
  sheets: string[];
  sheet_used: string | null;
  rows_found: number;
  columns_found: number;
  best_row: number;
  matched_fields: string[];
  /** Only set when a column name was recognised, so this is never personal data. */
  header_cells: string[] | null;
  understood: Record<string, string[]>;
};

export type RosterPreview = {
  filename: string;
  sheet_used?: string | null;
  header_row: number;
  columns: Record<string, string | null>;
  rows: RosterRow[];
  issues: RosterIssue[];
  counts: { valid: number; warnings: number; errors: number; no_show: number; skipped: number };
  diagnostics?: RosterDiagnostics;
};

type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      centers: Table<Center>;
      profiles: Table<Profile>;
      exam_sessions: Table<ExamSession>;
      candidates: Table<Candidate>;
      schedule_rules: Table<ScheduleRules>;
      incidents: Table<Incident>;
      material_kinds: Table<MaterialKind>;
      programme_sections: Table<ProgrammeSection>;
      candidate_sections: Table<CandidateSection>;
      candidate_materials: Table<CandidateMaterial>;
      labs: Table<Lab>;
      roster_column_aliases: Table<RosterColumnAlias>;
      workstations: Table<Workstation>;
      candidate_events: Table<CandidateEvent>;
      public_displays: Table<PublicDisplay>;
      public_display_calls: Table<PublicDisplayCall>;
      exam_programmes: Table<ExamProgramme>;
      notice_templates: Table<NoticeTemplate>;
      display_notices: Table<DisplayNotice>;
      candidate_breaks: Table<CandidateBreak>;
    };
    Views: Record<never, never>;
    Functions: {
      fets_verify_id: { Args: { p_candidate: string }; Returns: Candidate };
      fets_assign_locker: { Args: { p_candidate: string; p_key: string }; Returns: Candidate };
      fets_check_in: { Args: { p_candidate: string }; Returns: Candidate };
      fets_call_candidate: { Args: { p_candidate: string; p_room?: string | null }; Returns: Candidate };
      fets_recall: { Args: { p_center: string }; Returns: PublicDisplayCall };
      fets_clear_call: { Args: { p_center: string }; Returns: undefined };
      fets_mark_entered: { Args: { p_center: string }; Returns: Candidate };
      fets_advance_stage: { Args: { p_candidate: string; p_note?: string | null }; Returns: Candidate };
      fets_assign_workstation: { Args: { p_candidate: string; p_workstation: string }; Returns: Candidate };
      fets_set_workstation_status: {
        Args: { p_workstation: string; p_status: WorkstationStatus };
        Returns: Workstation;
      };
      fets_mark_no_show: { Args: { p_candidate: string; p_note?: string | null }; Returns: Candidate };
      fets_admin_override: {
        Args: { p_candidate: string; p_status: CandidateStatus; p_note: string };
        Returns: Candidate;
      };
      fets_sync_workstations: { Args: { p_center: string }; Returns: number };
      fets_import_roster: {
        Args: {
          p_center: string;
          p_exam_name: string;
          p_exam_date: string;
          p_filename: string;
          p_rows: RosterRow[];
        };
        Returns: {
          exam_session_id: string;
          inserted: number;
          skipped: number;
          slot_capacity: number;
          overruns_end_time: boolean;
        };
      };
      fets_display_state: { Args: { p_display_key: string }; Returns: DisplayState | null };
      fets_start_exam: {
        Args: { p_candidate: string; p_programme: string | null; p_started_at: string; p_duration: number };
        Returns: Candidate;
      };
      fets_adjust_exam: {
        Args: { p_candidate: string; p_started_at: string; p_duration: number; p_reason: string };
        Returns: Candidate;
      };
      fets_break_out: {
        Args: { p_candidate: string; p_kind?: "scheduled" | "unscheduled"; p_reason?: string | null };
        Returns: CandidateBreak;
      };
      fets_break_in: { Args: { p_candidate: string }; Returns: CandidateBreak };
      fets_confirm_finish: { Args: { p_candidate: string; p_note?: string | null }; Returns: Candidate };
      fets_post_notice: {
        Args: {
          p_center: string;
          p_template: string;
          p_values?: Record<string, string>;
          p_expires_minutes?: number | null;
        };
        Returns: DisplayNotice;
      };
      fets_clear_notice: { Args: { p_center: string }; Returns: void };
      fets_issue_material: {
        Args: { p_candidate: string; p_kind: string; p_count?: number; p_label?: string | null };
        Returns: CandidateMaterial;
      };
      fets_return_material: {
        Args: {
          p_candidate: string;
          p_kind: string;
          p_count?: number | null;
          p_label?: string | null;
        };
        Returns: CandidateMaterial;
      };
      fets_write_off_material: {
        Args: { p_material: string; p_reason: string };
        Returns: CandidateMaterial;
      };
      fets_sign_out: { Args: { p_candidate: string; p_note?: string | null }; Returns: Candidate };
      fets_set_programme_sections: {
        Args: {
          p_programme: string;
          p_sections: { name: string; minutes: number; kind?: SectionKind }[];
        };
        Returns: ProgrammeSection[];
      };
      fets_confirm_section: {
        Args: {
          p_candidate: string;
          p_position: number;
          p_at?: string | null;
          p_note?: string | null;
        };
        Returns: CandidateSection;
      };
      fets_clear_section: { Args: { p_candidate: string; p_position: number }; Returns: void };
      fets_problem_report: { Args: { p_session: string }; Returns: ProblemReport };
      fets_save_problem_report: {
        Args: {
          p_session: string;
          p_summary?: string | null;
          p_actions?: string | null;
          p_reported_to?: string | null;
        };
        Returns: unknown;
      };
      fets_finalise_problem_report: { Args: { p_session: string }; Returns: unknown };
      fets_reopen_problem_report: { Args: { p_session: string }; Returns: unknown };
    };
    Enums: {
      staff_role: StaffRole;
      candidate_status: CandidateStatus;
      workstation_status: WorkstationStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};
