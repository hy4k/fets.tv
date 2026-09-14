'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase';
import type { Candidate } from '@/types/domain';

const fallback: Candidate[] = [
  { id: 'demo-014', public_token: 'FETS-014', first_name: 'Aparna', last_name: 'Venugopal', part: 'PART II', place: 'Kozhikode', roster_number: '014', status: 'scheduled', scheduled_at: '2026-09-14T09:00:00+05:30', arrival_at: null, check_in_at: null, id_verified_at: null, locker_key: null, frisked_at: null, biometrics_at: null, workstation_id: null, lab_entry_at: null, testing_started_at: null, completed_at: null, signed_out_at: null },
  { id: 'demo-015', public_token: 'FETS-015', first_name: 'Mohammed', last_name: 'Rashid', part: 'PART I', place: 'Malappuram', roster_number: '015', status: 'scheduled', scheduled_at: '2026-09-14T09:00:00+05:30', arrival_at: null, check_in_at: null, id_verified_at: null, locker_key: null, frisked_at: null, biometrics_at: null, workstation_id: null, lab_entry_at: null, testing_started_at: null, completed_at: null, signed_out_at: null },
  { id: 'demo-016', public_token: 'FETS-016', first_name: 'Nisha', last_name: 'Balakrishnan', part: 'PART II', place: 'Kozhikode', roster_number: '016', status: 'id_checked', scheduled_at: '2026-09-14T09:30:00+05:30', arrival_at: '2026-09-14T09:18:00+05:30', check_in_at: '2026-09-14T09:20:00+05:30', id_verified_at: '2026-09-14T09:20:00+05:30', locker_key: 'K-16', frisked_at: null, biometrics_at: null, workstation_id: null, lab_entry_at: null, testing_started_at: null, completed_at: null, signed_out_at: null },
];

export function FrontOffice() {
  const supabase = createBrowserSupabaseClient();
  const [candidates, setCandidates] = useState<Candidate[]>(fallback);
  const [selected, setSelected] = useState<Candidate>(fallback[0]);
  const [filter, setFilter] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let alive = true;
    supabase.from('candidates').select('*').order('scheduled_at').limit(100).then(({ data }) => { if (alive && data?.length) { setCandidates(data as Candidate[]); setSelected(data[0] as Candidate); } });
    const channel = supabase.channel('front-office-candidates').on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, payload => { const next = payload.new as Candidate; setCandidates(current => current.some(item => item.id === next.id) ? current.map(item => item.id === next.id ? next : item) : [next, ...current]); setSelected(current => current.id === next.id ? next : current); }).subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, []);

  const visible = useMemo(() => candidates.filter(candidate => `${candidate.first_name} ${candidate.last_name} ${candidate.public_token} ${candidate.place ?? ''}`.toLowerCase().includes(filter.toLowerCase())), [candidates, filter]);
  const patchSelected = (patch: Partial<Candidate>) => { const next = { ...selected, ...patch }; setSelected(next); setCandidates(current => current.map(item => item.id === next.id ? next : item)); };
  async function transition(to: Candidate['status'], note?: string, locker?: string) { setMessage(''); const { data, error } = await supabase.rpc('transition_candidate', { p_candidate_id: selected.id, p_to_status: to, p_note: note ?? null, p_locker_key: locker ?? selected.locker_key }); if (error) { setMessage(error.message); return; } if (data) patchSelected(data as Candidate); }
  async function verifyId() { await transition('id_checked', 'ID cross-verified at Front Office'); }
  async function issueKey() { if (!selected.id_verified_at && selected.status === 'scheduled') { await verifyId(); } const key = selected.locker_key ?? `K-${selected.public_token.slice(-2)}`; await transition('waiting', 'Locker key issued', key); }
  async function completeCheckIn() { if (!selected.id_verified_at) { setMessage('Verify the original ID first.'); return; } if (!selected.locker_key) { setMessage('Issue a locker key first.'); return; } await transition('waiting', 'Candidate checked in on roster'); }

  const initials = `${selected.first_name[0] ?? ''}${selected.last_name[0] ?? ''}`;
  return <div className="page"><div className="page-head"><div /><div className="head-right"><span className="pill green">● LIVE</span><Link className="head-btn" href="/roster">Roster</Link></div></div><div className="two-col"><div className="panel pad"><div className="subhead" style={{ margin: '-12px -12px 11px' }}>Candidate check-in</div><input className="search" value={filter} onChange={event => setFilter(event.target.value)} placeholder="⌕  Roster no-name" /><div className="list">{visible.map(candidate => <button className={`candidate ${candidate.id === selected.id ? 'sel' : ''}`} key={candidate.id} onClick={() => { setSelected(candidate); setMessage(''); }}><span className="person"><span className="initials">{candidate.first_name[0]}{candidate.last_name[0]}</span><span><strong>{candidate.first_name} {candidate.last_name}</strong><small>{candidate.public_token} · {candidate.part ?? '—'} · {candidate.place ?? '—'}</small></span></span><span className={`pill ${candidate.status === 'scheduled' ? 'gold' : 'green'}`}>{candidate.status.replace('_', ' ')}</span></button>)}</div><details className="accordion"><summary>Recent check-ins</summary><div className="accordion-body"><div className="small">Every status update is recorded in the audit trail.</div></div></details></div><div className="panel detail"><div className="detail-top"><div className="person-large"><div className="initials large">{initials}</div><div><div className="name">{selected.first_name} {selected.last_name}</div><div className="meta">{selected.public_token} · {selected.part ?? '—'} · {selected.place ?? '—'}</div></div></div><div className="token">{selected.public_token}<small>TOKEN</small></div></div><div className="checks"><div className={`check ${selected.id_verified_at ? 'done' : ''}`}><span className="left"><span className="dot">✓</span><span>ID cross-verified</span></span><button onClick={verifyId}>{selected.id_verified_at ? 'done' : 'pending'}</button></div><div className={`check ${selected.locker_key ? 'done' : ''}`}><span className="left"><span className="dot">✓</span><span>Locker key issued</span></span><button onClick={issueKey}>{selected.locker_key ?? 'select'}</button></div><div className={`check ${selected.status === 'waiting' || selected.status === 'id_checked' ? 'done' : ''}`}><span className="left"><span className="dot">✓</span><span>Checked in on roster</span></span><button onClick={completeCheckIn}>{selected.status === 'waiting' ? 'done' : '—'}</button></div></div><div className="locker"><span>LOCKER KEYS</span><button onClick={issueKey}>{selected.locker_key ?? '＋ Assign key'}</button></div><button className={`complete ${selected.id_verified_at && selected.locker_key ? 'ready' : ''}`} onClick={completeCheckIn}>{selected.status === 'waiting' ? 'Checked in · send to Admin Room' : 'Complete ID + locker key'}</button>{message && <div className="error" style={{ marginTop: 10 }}>{message}</div>}</div></div></div>;
}
