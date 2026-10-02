import { redirect } from "next/navigation";
import { START_PATH } from "@/app/lib/marketingAccess";

// MS2: startsiden ligger paa /start. proxy.ts sender / dit foer siden
// rendres; dette er reserven hvis proxyen ikke gjoer det. Med flere
// rot-layouter maa / ligge i en route group (route-groups.md:32).
export default function RootRedirect() {
  redirect(START_PATH);
}
