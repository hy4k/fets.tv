import { redirect } from "next/navigation";

// Duty rotas and 90-minute blocks are kept in fets.live now; the floor walk
// and DVR timer sit on the Lab page.
export default function DutyPage() {
  redirect("/floor");
}
