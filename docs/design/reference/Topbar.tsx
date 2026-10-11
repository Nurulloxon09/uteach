import { Bell, ChevronDown, MessageSquare, Search, Menu } from "lucide-react";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="flex items-center gap-3 border-b border-border/70 bg-card px-4 py-4 sm:px-6 lg:px-8">
      <button
        onClick={onMenu}
        aria-label="Open menu"
        className="grid size-10 shrink-0 place-items-center rounded-xl text-secondary-foreground transition-colors hover:bg-muted lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <label className="relative w-full max-w-[300px]">
        <span className="sr-only">Search</span>
        <input
          type="search"
          placeholder="What do you want to find?"
          className="h-11 w-full rounded-full bg-muted/80 pl-5 pr-11 text-sm text-foreground placeholder:text-muted-foreground/90 outline-none transition-shadow focus:ring-2 focus:ring-primary/30"
        />
        <Search className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-primary" />
      </label>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <button
          aria-label="Notifications"
          className="relative grid size-10 place-items-center rounded-full bg-muted/80 text-secondary-foreground transition-colors hover:bg-muted"
        >
          <Bell className="size-[18px]" strokeWidth={1.8} />
          <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-destructive ring-2 ring-card" />
        </button>
        <button
          aria-label="Messages"
          className="grid size-10 place-items-center rounded-full bg-muted/80 text-secondary-foreground transition-colors hover:bg-muted"
        >
          <MessageSquare className="size-[18px]" strokeWidth={1.8} />
        </button>

        <button className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-muted">
          <span className="grid size-10 place-items-center rounded-full bg-chart-female/25 text-sm font-bold text-foreground">
            PL
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-semibold text-foreground">Priscilla Lily</span>
            <span className="block text-xs text-muted-foreground">Admin</span>
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
}
