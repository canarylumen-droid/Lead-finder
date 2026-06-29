import { useState } from "react";
import { Link, useLocation } from "wouter";
import type { User } from "../App";
import {
  LayoutDashboard, Settings, Mail, Server, Globe,
  LogOut, Menu, X, Zap, BarChart2,
} from "lucide-react";

interface NavItem {
  label: string;
  path:  string;
  Icon:  React.ComponentType<{ size?: number; className?: string }>;
}

const NAV: NavItem[] = [
  { label: "Dashboard",      path: "/",           Icon: LayoutDashboard },
  { label: "New Scrape",     path: "/setup",      Icon: Settings },
  { label: "SMTP Providers", path: "/smtp",       Icon: Mail },
  { label: "Mailcow",        path: "/mailcow",    Icon: Server },
  { label: "DNS Manager",    path: "/dns",        Icon: Globe },
  { label: "Analytics",      path: "/analytics",  Icon: BarChart2 },
];

function NavLinks({ current, onClick }: { current: string; onClick?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {NAV.map(({ label, path, Icon }) => {
        const active = path === "/" ? current === "/" : current.startsWith(path);
        return (
          <Link key={path} href={path} onClick={onClick}>
            <span
              data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors select-none ${
                active
                  ? "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.3)]"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              <Icon size={16} />
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarInner({ current, user, onLogout, onClose }: {
  current: string; user: User; onLogout: () => void; onClose?: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-6 py-5 border-b border-[hsl(var(--border))]">
        <div className="w-7 h-7 rounded-lg bg-[hsl(var(--primary))] flex items-center justify-center">
          <Zap size={15} className="text-black" />
        </div>
        <span className="font-bold text-[hsl(var(--foreground))]">Lead Finder</span>
      </div>
      <div className="flex-1 py-4 overflow-y-auto">
        <NavLinks current={current} onClick={onClose} />
      </div>
      <div className="px-6 py-4 border-t border-[hsl(var(--border))]">
        <p className="text-xs text-[hsl(var(--muted-foreground))] mb-3 truncate">{user.email}</p>
        <button
          onClick={onLogout}
          data-testid="button-logout"
          className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] hover:text-red-400 transition-colors"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function Layout({ user, onLogout, children }: {
  user: User; onLogout: () => void; children: React.ReactNode;
}) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--background))]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <SidebarInner current={location} user={user} onLogout={onLogout} />
      </aside>

      {/* Mobile */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] shrink-0 z-30">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[hsl(var(--primary))] flex items-center justify-center">
              <Zap size={13} className="text-black" />
            </div>
            <span className="font-bold text-sm text-[hsl(var(--foreground))]">Lead Finder</span>
          </div>
          <button
            onClick={() => setOpen(!open)}
            data-testid="button-hamburger"
            className="p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>

        {/* Mobile drawer overlay */}
        {open && (
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/60"
            onClick={() => setOpen(false)}
          />
        )}
        <div
          className={`md:hidden fixed top-0 left-0 h-full w-64 z-50 bg-[hsl(var(--card))] border-r border-[hsl(var(--border))] transform transition-transform duration-200 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarInner current={location} user={user} onLogout={onLogout} onClose={() => setOpen(false)} />
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
