export const CANDIDATE_STAGES = [
  'scheduled',
  'arrived',
  'id_checked',
  'waiting',
  'frisking',
  'biometrics',
  'assigned',
  'lab_entry',
  'testing',
  'completed',
  'signed_out',
  'no_show',
] as const;

export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

export type Candidate = {
  id: string;
  public_token: string;
  first_name: string;
  last_name: string;
  part: string | null;
  place: string | null;
  roster_number: string | null;
  status: CandidateStage;
  scheduled_at: string | null;
  arrival_at: string | null;
  check_in_at: string | null;
  id_verified_at: string | null;
  locker_key: string | null;
  frisked_at: string | null;
  biometrics_at: string | null;
  workstation_id: string | null;
  lab_entry_at: string | null;
  testing_started_at: string | null;
  completed_at: string | null;
  signed_out_at: string | null;
};

export type PublicDisplayCall = {
  id: string;
  display_key: string;
  token: string;
  instruction: string;
  hall: string;
  active: boolean;
  created_at: string;
};
