import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { Logo } from "@/components/Logo";
import { Shield, Lock, Loader2, Mail, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Login() {
  const { login, error, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [accessCode, setAccessCode] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !accessCode.trim()) return;
    try {
      await login(email.trim(), accessCode.trim());
    } catch {
      // error is set by the hook
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        aria-hidden
      >
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full opacity-[0.08]"
          style={{
            background:
              "radial-gradient(ellipse, hsl(var(--baby-blue-400)), transparent 70%)",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="bg-card rounded-2xl border shadow-lg overflow-hidden">
          {/* Navy header */}
          <div
            className="px-8 pt-10 pb-8 flex flex-col items-center gap-5"
            style={{ backgroundColor: "hsl(215 55% 10%)", color: "white" }}
          >
            <Logo
              className="h-20 w-auto drop-shadow-[0_2px_12px_rgba(74,159,217,0.3)]"
              variant="white"
            />
            <div>
              <h1 className="text-xl font-bold text-center tracking-tight">
                Team KPI Dashboards
              </h1>
              <p className="text-xs text-center mt-1.5 opacity-60 uppercase tracking-[0.15em]">
                My Tennessee Home Solution
              </p>
            </div>
          </div>

          {/* Sign-in area */}
          <form onSubmit={handleSubmit} className="px-8 py-8 flex flex-col gap-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
              <Lock className="h-3.5 w-3.5" />
              <span>Sign in with your company credentials</span>
            </div>

            {/* Email field */}
            <div className="space-y-2">
              <label htmlFor="login-email" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                Email
              </label>
              <Input
                id="login-email"
                type="email"
                placeholder="you@mytennesseehomesolution.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                data-testid="input-email"
                className="h-11"
                autoComplete="email"
                required
              />
            </div>

            {/* Access code field */}
            <div className="space-y-2">
              <label htmlFor="login-code" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                Access Code
              </label>
              <Input
                id="login-code"
                type="password"
                placeholder="Enter your team access code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                disabled={isLoading}
                data-testid="input-access-code"
                className="h-11"
                autoComplete="current-password"
                required
              />
            </div>

            {/* Error message */}
            {error && (
              <div
                className="w-full rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400"
                data-testid="text-login-error"
              >
                {error}
              </div>
            )}

            {/* Submit button */}
            <Button
              type="submit"
              disabled={isLoading || !email.trim() || !accessCode.trim()}
              data-testid="button-login"
              className="w-full h-12 text-sm font-semibold"
              style={{
                backgroundColor: "hsl(215 55% 15%)",
                color: "white",
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <div className="px-8 pb-6 pt-2 border-t">
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Shield className="h-3 w-3" />
              <span>
                Only @mytennesseehomesolution.com accounts can access this dashboard
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
