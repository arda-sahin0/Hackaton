import { CommandCenter } from "@/components/dashboard/command-center";

// Root URL opens straight into the command center — no landing page, no login (directive §4).
export default function Page() {
  return <CommandCenter />;
}
