import { useState, type ReactNode } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";

export function DashboardShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-card">
      <div className="flex min-h-screen w-full overflow-hidden bg-card">
        <div className="hidden border-r border-border/70 lg:block">
          <Sidebar />
        </div>

        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              aria-label="Close menu overlay"
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 bg-foreground/40"
            />
            <div className="absolute inset-y-0 left-0 shadow-shell">
              <Sidebar onClose={() => setMenuOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenu={() => setMenuOpen(true)} />

          <main className="flex-1 space-y-5 overflow-y-auto bg-background p-4 sm:p-6 lg:p-7">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
