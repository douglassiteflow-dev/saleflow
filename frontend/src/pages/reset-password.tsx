import { useState, type FormEvent } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useResetPassword } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export function ResetPasswordPage() {
  const resetPassword = useResetPassword();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    resetPassword.mutate(
      { token, password, password_confirmation: passwordConfirmation },
      {
        onSuccess: () => {
          // Redirect to login after short delay so user sees success message
          setTimeout(() => {
            void navigate("/login");
          }, 2000);
        },
      },
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div style={{ width: "100%", maxWidth: "400px" }}>
          <Card>
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-danger)] bg-red-50 border border-red-200 rounded-md px-3 py-2">
                Ogiltig återställningslänk. Kontrollera att du använde hela
                länken från ditt e-postmeddelande.
              </p>
              <Link
                to="/login"
                className="block text-center text-sm text-indigo-600 hover:text-indigo-500"
              >
                Tillbaka till inloggning
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <div className="mb-8 text-center">
          <h1
            className="text-2xl font-semibold text-indigo-600"
            style={{ fontSize: "28px" }}
          >
            Saleflow
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Välj ett nytt lösenord
          </p>
        </div>

        <Card>
          {resetPassword.isSuccess ? (
            <div className="space-y-4">
              <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                Ditt lösenord har återställts. Du omdirigeras till
                inloggningssidan...
              </p>
              <Link
                to="/login"
                className="block text-center text-sm text-indigo-600 hover:text-indigo-500"
              >
                Gå till inloggning
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label
                  htmlFor="new-password"
                  className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]"
                >
                  Nytt lösenord
                </label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="confirm-password"
                  className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]"
                >
                  Bekräfta lösenord
                </label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={passwordConfirmation}
                  onChange={(e) => setPasswordConfirmation(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {resetPassword.isError && (
                <p className="text-sm text-[var(--color-danger)] bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {resetPassword.error?.message ??
                    "Något gick fel. Försök igen."}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={resetPassword.isPending}
              >
                {resetPassword.isPending
                  ? "Återställer..."
                  : "Återställ lösenord"}
              </Button>

              <Link
                to="/login"
                className="block text-center text-sm text-indigo-600 hover:text-indigo-500"
              >
                Tillbaka till inloggning
              </Link>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
