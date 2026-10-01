import { redirect } from "next/navigation";

// The list, the check-in and the locker key are one page now.
export default function Page() {
  redirect("/front-office");
}
