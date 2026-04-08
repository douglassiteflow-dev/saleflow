import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  fetchContract,
  verifyContract,
  signContract,
  downloadPdf,
  updateTracking,
  type ContractData,
} from "@/api/contract-public";
import { SignatureCanvas } from "@/components/signature-canvas";
import { inputClass } from "@/lib/form-styles";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageState = "loading" | "verify" | "view" | "done";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format amount Swedish style: 5000 -> "5 000 kr" */
function formatAmount(amount: number, currency: string): string {
  const formatted = amount.toLocaleString("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  if (currency === "SEK" || currency === "sek") return `${formatted} kr`;
  return `${formatted} ${currency}`;
}

/** Format ISO date to Swedish: 2026-04-08T... -> "8 april 2026" */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Check if contract has expired */
function isExpired(contract: ContractData): boolean {
  if (!contract.expires_at) return false;
  return new Date(contract.expires_at) < new Date();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-gray-900 rounded-full" />
        <p className="text-sm text-gray-500">Laddar avtal...</p>
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-lg border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Avtalet hittades inte</h1>
        <p className="text-sm text-gray-500">{message}</p>
      </div>
    </div>
  );
}

function VerifyScreen({
  contract,
  onVerified,
}: {
  contract: ContractData;
  onVerified: (data: ContractData) => void;
}) {
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const { token } = useParams<{ token: string }>();

  const handleVerify = async () => {
    if (!token || code.length !== 6) return;
    setVerifying(true);
    setError("");
    try {
      const data = await verifyContract(token, code);
      onVerified(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Felaktig verifieringskod";
      setError(message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-lg border bg-white p-8 shadow-sm">
        <div className="text-center mb-6">
          <span className="text-sm font-medium tracking-widest text-gray-400 uppercase">
            Siteflow
          </span>
          <div className="mx-auto mt-2 h-px w-12 bg-gray-300" />
          <h1 className="mt-4 text-xl font-semibold text-gray-900">
            Verifiera din identitet
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Avtal {contract.contract_number} till {contract.recipient_name}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Ange den 6-siffriga verifieringskoden du fick via e-post.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">
              Verifieringskod
            </label>
            <input
              value={code}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(val);
                setError("");
              }}
              placeholder="000000"
              className={`${inputClass} text-center text-2xl tracking-[0.3em] font-mono`}
              maxLength={6}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && code.length === 6) {
                  handleVerify();
                }
              }}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>

          <button
            type="button"
            className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            disabled={code.length !== 6 || verifying}
            onClick={handleVerify}
          >
            {verifying ? "Verifierar..." : "Verifiera"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DoneScreen({ contract }: { contract: ContractData }) {
  const { token } = useParams<{ token: string }>();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!token) return;
    setDownloading(true);
    try {
      const blob = await downloadPdf(token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `avtal-${contract.contract_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — PDF might not be ready yet
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-lg border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Tack! Ditt avtal är signerat.
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Avtal {contract.contract_number} har signerats framgångsrikt.
          Du kommer att få en bekräftelse via e-post.
        </p>

        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          onClick={handleDownload}
          disabled={downloading}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {downloading ? "Laddar ner..." : "Ladda ner avtal (PDF)"}
        </button>
      </div>
    </div>
  );
}

function ExpiredScreen({ contract }: { contract: ContractData }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-lg border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Avtalet har gått ut</h1>
        <p className="text-sm text-gray-500">
          Avtal {contract.contract_number} gick ut {contract.expires_at ? formatDate(contract.expires_at) : ""}.
          Kontakta din säljare för ett nytt avtal.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View state — the main contract viewing + signing experience
// ---------------------------------------------------------------------------

function ViewScreen({
  contract,
  onSigned,
}: {
  contract: ContractData;
  onSigned: (data: ContractData) => void;
}) {
  const { token } = useParams<{ token: string }>();
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState("");

  // -- IntersectionObserver tracking --
  const currentSectionRef = useRef("forsattsblad");
  const sectionTimesRef = useRef<Record<string, number>>({});
  const lastTickRef = useRef(Date.now());
  const trackingTimerRef = useRef<ReturnType<typeof setInterval>>();

  // Track section visibility
  useEffect(() => {
    const sections = document.querySelectorAll("[data-section]");
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
            const name = (entry.target as HTMLElement).dataset.section;
            if (name) currentSectionRef.current = name;
          }
        }
      },
      { threshold: 0.3 },
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  // Accumulate time + send tracking data every 5 seconds
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.round((now - lastTickRef.current) / 1000);
      lastTickRef.current = now;
      if (elapsed <= 0) return;

      const section = currentSectionRef.current;
      sectionTimesRef.current[section] = (sectionTimesRef.current[section] ?? 0) + elapsed;

      const totalTime = Object.values(sectionTimesRef.current).reduce((a, b) => a + b, 0);

      updateTracking(token, {
        last_viewed_page: section,
        total_view_time: totalTime,
        page_views: { ...sectionTimesRef.current },
      });
    }, 5000);

    trackingTimerRef.current = interval;
    return () => clearInterval(interval);
  }, [token]);

  const canSign = customerName.trim() && customerEmail.trim() && signature;

  const handleSign = async () => {
    if (!token || !canSign) return;
    setSigning(true);
    setSignError("");
    try {
      await signContract(token, {
        signature: signature!,
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim(),
      });
      onSigned({
        ...contract,
        status: "signed",
        customer_name: customerName.trim(),
        customer_signed_at: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Kunde inte signera avtalet";
      setSignError(message);
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="text-sm font-medium tracking-widest text-gray-400 uppercase">
            Siteflow
          </span>
          <span className="text-xs text-gray-500">
            {contract.contract_number}
          </span>
        </div>
      </header>

      {/* Scrollable contract content */}
      <main className="mx-auto max-w-3xl px-4 py-8 flex flex-col gap-6">
        {/* Försättsblad */}
        <div data-section="forsattsblad" className="rounded-lg border bg-white p-8 shadow-sm">
          <div className="flex flex-col items-center justify-center gap-8 py-12 text-center">
            <div className="flex flex-col items-center gap-2">
              <span className="text-sm font-medium tracking-widest text-gray-400 uppercase">
                Siteflow
              </span>
              <div className="h-px w-16 bg-gray-300" />
            </div>
            <div className="flex flex-col gap-3">
              <h1 className="text-3xl font-bold text-gray-900">Avtal</h1>
              <p className="text-lg text-gray-600">{contract.recipient_name}</p>
            </div>
            <div className="flex flex-col gap-1 text-sm text-gray-500">
              <p>Avtalsnummer: {contract.contract_number}</p>
              <p>Datum: {formatDate(new Date().toISOString())}</p>
            </div>
            <div className="flex flex-col gap-1 text-sm text-gray-500 mt-4">
              <p className="font-medium text-gray-700">Parter</p>
              <p>Siteflow AB (Leverantör)</p>
              <p>{contract.recipient_name} (Kund)</p>
            </div>
          </div>
        </div>

        <div className="mx-auto w-24 border-t border-dashed border-gray-300" />

        {/* Prisöversikt */}
        <div data-section="prisoversikt" className="rounded-lg border bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Prisöversikt</h2>
          <div className="flex flex-col gap-4 rounded-lg border p-6">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Belopp</span>
              <span className="text-2xl font-bold">
                {formatAmount(contract.amount, contract.currency)}
              </span>
            </div>
          </div>
        </div>

        <div className="mx-auto w-24 border-t border-dashed border-gray-300" />

        {/* Villkor */}
        <div data-section="villkor" className="rounded-lg border bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Villkor</h2>
          {contract.terms ? (
            <div className="prose prose-sm prose-gray max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
              {contract.terms}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">Inga villkor specificerade.</p>
          )}
        </div>

        <div className="mx-auto w-24 border-t border-dashed border-gray-300" />

        {/* Signering */}
        <div data-section="signering" className="rounded-lg border bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Signering</h2>

          {/* Seller signature */}
          <div className="rounded-lg border p-6 flex flex-col gap-4 mb-6">
            <h3 className="font-semibold text-gray-800">Siteflow (Leverantör)</h3>
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex flex-col">
                <span className="text-lg italic text-gray-700">
                  {contract.seller_name}
                </span>
                <span className="text-xs text-gray-500">
                  {contract.seller_name} &middot; {formatDate(contract.seller_signed_at)}
                </span>
              </div>
            </div>
          </div>

          {/* Customer signature form */}
          <div className="rounded-lg border p-6 flex flex-col gap-4">
            <h3 className="font-semibold text-gray-800">Kund</h3>

            <SignatureCanvas onSignatureChange={setSignature} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Namnförtydligande
                </label>
                <input
                  type="text"
                  placeholder="Ditt fullständiga namn"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">E-post</label>
                <input
                  type="email"
                  placeholder="din@epost.se"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {signError && <p className="text-sm text-red-500">{signError}</p>}

            <button
              type="button"
              className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={!canSign || signing}
              onClick={handleSign}
            >
              {signing ? (
                <span className="inline-flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                  Signerar...
                </span>
              ) : (
                "Signera avtal"
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function ContractSigningPage() {
  const { token } = useParams<{ token: string }>();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [contract, setContract] = useState<ContractData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch contract on mount
  useEffect(() => {
    if (!token) return;

    async function load() {
      try {
        const data = await fetchContract(token!);
        setContract(data);

        if (data.status === "signed") {
          setPageState("done");
        } else if (data.status === "viewed") {
          setPageState("view");
        } else {
          // draft or sent — need verification
          setPageState("verify");
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Länken är ogiltig eller har gått ut. Kontakta din säljare för en ny länk.";
        setError(message);
        setPageState("loading"); // will show error
      }
    }

    load();
  }, [token]);

  // -- Render --

  if (error) {
    return <ErrorScreen message={error} />;
  }

  if (pageState === "loading" || !contract) {
    return <Spinner />;
  }

  if (isExpired(contract)) {
    return <ExpiredScreen contract={contract} />;
  }

  if (pageState === "verify") {
    return (
      <VerifyScreen
        contract={contract}
        onVerified={(data) => {
          setContract(data);
          if (data.status === "signed") {
            setPageState("done");
          } else {
            setPageState("view");
          }
        }}
      />
    );
  }

  if (pageState === "done") {
    return <DoneScreen contract={contract} />;
  }

  // pageState === "view"
  return (
    <ViewScreen
      contract={contract}
      onSigned={(data) => {
        setContract(data);
        setPageState("done");
      }}
    />
  );
}
