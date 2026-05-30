import { useState, useEffect } from "react";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Dashboard from "./pages/Dashboard";

export interface User {
  id: number;
  email: string;
}

const STORAGE_KEY = "lf_user";

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // view: "login" | "setup" | "dashboard"
  const [view, setView] = useState<"login" | "setup" | "dashboard">("login");
  const [hasCheckedSessions, setHasCheckedSessions] = useState(false);

  function login(u: User) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setView("login");
    setHasCheckedSessions(false);
  }

  // On mount or user change: figure out which view to show
  useEffect(() => {
    if (!user) {
      setView("login");
      setHasCheckedSessions(false);
      return;
    }
    if (hasCheckedSessions) return;

    // Check if user has existing sessions
    fetch("/api/sessions", {
      headers: { "x-user-id": String(user.id) },
    })
      .then((r) => r.json())
      .then((data) => {
        setHasCheckedSessions(true);
        if (data.sessions && data.sessions.length > 0) {
          setView("dashboard");
        } else {
          setView("setup");
        }
      })
      .catch(() => {
        setHasCheckedSessions(true);
        setView("setup");
      });
  }, [user, hasCheckedSessions]);

  if (!user) {
    return <Login onLogin={login} />;
  }

  if (!hasCheckedSessions) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))]">
        <div className="w-6 h-6 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (view === "setup") {
    return (
      <Setup
        user={user}
        onLaunched={() => setView("dashboard")}
        onLogout={logout}
        onGoToDashboard={() => setView("dashboard")}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      onLogout={logout}
      onNewScrape={() => setView("setup")}
    />
  );
}
