import { useState, useEffect } from "react";
import { Router, Route, Switch, useLocation, Redirect } from "wouter";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Dashboard from "./pages/Dashboard";
import SmtpProviders from "./pages/SmtpProviders";
import MailcowPage from "./pages/Mailcow";
import DnsManager from "./pages/DnsManager";
import Analytics from "./pages/Analytics";
import Layout from "./components/Layout";

export interface User {
  id: number;
  email: string;
}

const STORAGE_KEY = "lf_user";

function AppRoutes({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [, navigate] = useLocation();

  return (
    <Layout user={user} onLogout={onLogout}>
      <Switch>
        <Route path="/" component={() => <Dashboard user={user} onLogout={onLogout} onNewScrape={() => navigate("/setup")} />} />
        <Route path="/setup" component={() => <Setup user={user} onLaunched={() => navigate("/")} onLogout={onLogout} onGoToDashboard={() => navigate("/")} />} />
        <Route path="/smtp" component={() => <SmtpProviders user={user} />} />
        <Route path="/mailcow" component={() => <MailcowPage user={user} />} />
        <Route path="/dns" component={() => <DnsManager user={user} />} />
        <Route path="/analytics" component={() => <Analytics user={user} />} />
        <Route component={() => <Redirect to="/" />} />
      </Switch>
    </Layout>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  function login(u: User) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  if (!user) {
    return <Login onLogin={login} />;
  }

  return (
    <Router>
      <AppRoutes user={user} onLogout={logout} />
    </Router>
  );
}
