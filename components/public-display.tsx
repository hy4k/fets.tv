'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase';
import type { PublicDisplayCall } from '@/types/domain';

export function PublicDisplay({ displayKey }: { displayKey: string }) {
  const supabase = createBrowserSupabaseClient();
  const [call, setCall] = useState<PublicDisplayCall | null>(null);
  useEffect(() => { let active = true; supabase.from('public_display_calls').select('*').eq('display_key', displayKey).eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => { if (active && data) setCall(data as PublicDisplayCall); }); const channel = supabase.channel('public-display-' + displayKey).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'public_display_calls', filter: 'display_key=eq.' + displayKey }, payload => setCall(payload.new as PublicDisplayCall)).subscribe(); return () => { active = false; supabase.removeChannel(channel); }; }, [displayKey]);
  return <main className="display-app"><div className="display-topbar"><div className="location"><span className="site-chip"><i />4960 · CALICUT</span><span className="title">Public Display</span></div><div className="display-tools"><span className="pill green">● LIVE</span><span className="clock">10:24</span><Link className="display-home" href="/front">← Operations home</Link></div></div><div className="display-main"><div className="display-screen"><span className="hall">{call?.hall ?? 'HALL 1'}</span><span className="live-time">● LIVE&nbsp; 10:24</span><div className="now">Now calling</div><div className="display-number">{call?.token ?? '—'}</div><div className="display-text">{call?.instruction ?? 'Waiting for call'}</div><div className="proceed">— &nbsp; PROCEED NOW</div></div></div></main>;
}
