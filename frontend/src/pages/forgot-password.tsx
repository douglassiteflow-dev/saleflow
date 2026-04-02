import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useForgotPassword } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export function ForgotPasswordPage() {
  const forgotPassword = useForgotPassword();
  const [email, setEmail] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    forgotPassword.mutate({ email });
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
            Återställ ditt lösenord
          </p>
        </div>

        <Card>
          {forgotPassword.isSuccess ? (
            <div className="space-y-4">
              <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                Om kontot finns har vi skickat en länk till din e-post.
              </p>
              <Link
                to="/login"
                className="block text-center text-sm text-indigo-600 hover:text-indigo-500"
              >
                Tillbaka till inloggning
              </Link>
            </div>
          ) : (
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
                  placeholder="namn@företag.se"
                />
              </div>

              {forgotPassword.isError && (
                <p className="text-sm text-[var(--color-danger)] bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {forgotPassword.error?.message ??
                    "Något gick fel. Försök igen."}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={forgotPassword.isPending}
              >
                {forgotPassword.isPending
                  ? "Skickar..."
                  : "Skicka återställningslänk"}
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
