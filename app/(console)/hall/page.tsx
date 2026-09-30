import { redirect } from "next/navigation";

// The hall is the admin room now; old links and bookmarks land there.
export default function Page() {
  redirect("/admin");
}
