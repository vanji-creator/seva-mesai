import { Sidebar } from "@/components/desk/Sidebar";
import { requireOfficer } from "@/lib/auth";

/**
 * Inbox split view: the queue stays on the left, the open case on the right.
 * On phones the queue is the home screen and a case takes the full screen.
 */
export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const officer = await requireOfficer();
  return (
    <div className="flex h-dvh overflow-hidden">
      <div className="hidden lg:flex">
        <Sidebar officer={officer} />
      </div>
      <main className="pane min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
