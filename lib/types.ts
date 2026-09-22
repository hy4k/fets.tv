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
  notice: { body: string; tone: NoticeTone; posted_at: string } | null;
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
      labs: Table<Lab>;
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
    };
    Enums: {
      staff_role: StaffRole;
      candidate_status: CandidateStatus;
      workstation_status: WorkstationStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};
