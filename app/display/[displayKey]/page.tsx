import { PublicDisplay } from '@/components/public-display';
export default async function DisplayPage({ params }: { params: Promise<{ displayKey: string }> }) { const { displayKey } = await params; return <PublicDisplay displayKey={displayKey} />; }
