import { redirect } from "next/navigation";
import { getCurrentUser, isManager } from "@/lib/auth/session";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(isManager(user) ? "/manager" : "/inquiries");
}
