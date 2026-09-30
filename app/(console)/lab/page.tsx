import { redirect } from "next/navigation";

// Seating happens on the admin page now, next to the call.
export default function Page() {
  redirect("/admin");
}
