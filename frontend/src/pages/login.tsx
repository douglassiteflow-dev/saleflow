import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import {
  useMe,
  useLogin,
  useVerifyOtp,
  useResendOtp,
  isLoginTrustedResponse,
} from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { OtpInput } from "@/components/otp-input";
import Loader from "@/components/kokonutui/loader";

export function LoginPage() {
  const { data: user, isLoading } = useMe();
  const login = useLogin();
  const verifyOtp = useVerifyOtp();
  const resendOtp = useResendOtp();
  const navigate = useNavigate();

  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader size="sm" title="Laddar..." />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: (data) => {
          if (isLoginTrustedResponse(data)) {
            // Trusted device — skip OTP, go directly to dashboard
            void navigate("/dashboard");
          } else {
            setUserId(data.user_id);
            setStep("otp");
          }
        },
      },
    );
  }

  function handleOtpComplete(code: string) {
    verifyOtp.mutate(
      { user_id: userId, code, remember_me: rememberMe },
      {
        onSuccess: () => {
          void navigate("/dashboard");
        },
      },
    );
  }

  function handleResendOtp() {
    resendOtp.mutate({ email, password });
  }

  function getOtpError(): string | null {
    if (!verifyOtp.isError) return null;
    return verifyOtp.error?.message ?? "Verifieringen misslyckades";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <div className="mb-8 text-center">
          <h1
            className="text-2xl font-semibold text-indigo-600"
            style={{ fontSize: "28px" }}
          >
            SaleFlow
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {step === "credentials"
              ? "Logga in på ditt konto"
              : "Kod skickad till din e-post"}
          </p>
        </div>

        <Card>
          {step === "credentials" ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]"
                >
                  E-post
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="namn@foretag.se"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]"
                >
                  Lösenord
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Kom ihåg mig
                </label>
                <Link
                  to="/forgot-password"
                  className="text-sm text-indigo-600 hover:text-indigo-500"
                >
                  Glömt lösenord?
                </Link>
              </div>

              {login.isError && (
                <p className="text-sm text-[var(--color-danger)] bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {login.error?.message ?? "Inloggningen misslyckades"}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={login.isPending}
              >
                {login.isPending ? "Loggar in..." : "Logga in"}
              </Button>
            </form>
          ) : (
            <div className="space-y-5">
              <OtpInput
                onComplete={handleOtpComplete}
                onResend={handleResendOtp}
                error={getOtpError()}
                disabled={verifyOtp.isPending}
              />

              {verifyOtp.isPending && (
                <p className="text-sm text-center text-[var(--color-text-secondary)]">
                  Verifierar...
                </p>
              )}

              {resendOtp.isSuccess && (
                <p className="text-sm text-center text-emerald-600">
                  Ny kod skickad
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
