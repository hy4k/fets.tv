import { NextResponse } from 'next/server';
import { createRequestSupabaseClient } from '@/lib/supabase';
import * as XLSX from 'xlsx';

function normalize(value: unknown) { return String(value ?? '').trim().replace(/\s+/g, ' '); }
function findHeader(rows: string[][]) { return rows.findIndex(row => row.some(cell => /first\s*name/i.test(cell)) && row.some(cell => /last\s*name/i.test(cell))); }

export async function POST(request: Request) {
  const authClient = createRequestSupabaseClient(request);
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const supabase = authClient;
  const form = await request.formData(); const file = form.get('file'); const examSessionId = String(form.get('examSessionId') ?? '');
  if (!(file instanceof File)) return NextResponse.json({ error: 'CSV or XLSX file is required' }, { status: 400 });
  if (!examSessionId) return NextResponse.json({ error: 'examSessionId is required' }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer()); const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true }); const sheet = workbook.Sheets[workbook.SheetNames[0]]; const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }).map(row => row.map(normalize));
  const headerIndex = findHeader(rows); if (headerIndex < 0) return NextResponse.json({ error: 'Could not detect FIRST NAME and LAST NAME headers' }, { status: 422 });
  const headers = rows[headerIndex].map(value => value.toLowerCase()); const index = (patterns: RegExp[]) => headers.findIndex(header => patterns.some(pattern => pattern.test(header))); const first = index([/first/]); const last = index([/last/]); const part = index([/part/]); const phone = index([/phone/]); const place = index([/place/]); const flag = index([/flag/, /status/]); const roster = index([/sl/, /serial/, /roster/]);
  const candidates = rows.slice(headerIndex + 1).map((row, offset) => ({ row, source_row: headerIndex + offset + 2 })).filter(item => item.row[first] && item.row[last]).map((item, i) => ({ exam_session_id: examSessionId, source_row: item.source_row, roster_number: roster >= 0 ? item.row[roster] : String(i + 1), first_name: item.row[first], last_name: item.row[last], part: part >= 0 ? item.row[part] || null : null, phone: phone >= 0 ? item.row[phone] || null : null, place: place >= 0 ? item.row[place] || null : null, roster_flag: flag >= 0 ? item.row[flag] || null : null, public_token: `FETS-${String(i + 1).padStart(3, '0')}`, status: flag >= 0 && /no\s*show/i.test(item.row[flag]) ? 'no_show' : 'scheduled' }));
  if (!candidates.length) return NextResponse.json({ error: 'No candidate rows found after the header' }, { status: 422 });
  const { error } = await supabase.from('candidates').upsert(candidates, { onConflict: 'exam_session_id,public_token' }); if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ validRows: candidates.length, warningCount: candidates.filter(row => !row.part || !row.place).length, errorCount: 0, noShowCount: candidates.filter(row => row.status === 'no_show').length });
}
