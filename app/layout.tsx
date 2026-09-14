import './globals.css';
import Link from 'next/link';

export const metadata = { title: 'FETS.TV — Operations Console', description: 'CBT Center Management System' };

const links = [
  ['front', '▣', 'FRONT', '/front'],
  ['admin', '▤', 'ADMIN', '/admin'],
  ['tv', '◉', 'TV', '/display/hall-1-main'],
  ['roster', '▤', 'ROSTER', '/roster'],
  ['lab', '▦', 'LAB', '/lab'],
  ['setup', '◇', 'SETUP', '/setup'],
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}

export function AppShell({ children, active }: { children: React.ReactNode; active: string }) {
  return <div className="shell"><aside className="rail"><div className="logo">F</div><nav className="rail-nav">{links.map(([id, icon, label, href]) => <Link key={id} href={href} className={`rail-link ${active === id ? 'active' : ''}`}><span>{icon}</span>{label}</Link>)}</nav><div className="avatar">AV</div></aside><section className="workspace"><header className="topbar"><div className="location"><span className="site-chip"><i />4960&nbsp; · &nbsp;CALICUT</span><span className="title">{active === 'front' ? 'Front Office' : active === 'admin' ? 'Admin Room' : active === 'tv' ? 'Public Display' : active === 'roster' ? 'Roster & Schedule' : active === 'lab' ? 'Exam Lab' : 'Center Setup'}</span></div><div className="top-right"><span className="clock">10:24</span><span className="tiny">14 SEP · IST</span><span className="avatar">AV</span></div></header>{children}</section></div>;
}
