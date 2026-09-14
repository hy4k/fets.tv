'use client';

import { FormEvent, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase';

export default function LoginPage() {
  const supabase = createBrowserSupabaseClient();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setError(error.message); else window.location.href = '/front'; setBusy(false); }
  return <main className="auth"><form className="auth-card" onSubmit={submit}><div className="logo">F</div><h1>FETS.TV</h1><p>Sign in to the CBT center operations console.</p><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="staff@fets.in" /><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required /><button className="btn gold" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>{error && <div className="error">{error}</div>}</form></main>;
}
