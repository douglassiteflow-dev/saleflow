import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  fetchQuestionnaire,
  saveAnswers,
  completeQuestionnaire,
  uploadMedia,
  type QuestionnaireData,
} from "@/api/questionnaire";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { inputClass, labelClass } from "@/lib/form-styles";

// ── Constants ─────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 7;
const AUTOSAVE_DELAY = 500;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const CAPACITY_OPTIONS = [
  "1-10",
  "10-20",
  "20-30",
  "30-40",
  "50-100",
  "Obegränsat",
] as const;

type ServiceInputMode = "upload" | "text" | "link";

interface AddonService {
  key: string;
  label: string;
  tooltip: string;
}

const ADDON_SERVICES: AddonService[] = [
  {
    key: "professional_email",
    label: "Professionell företags-email",
    tooltip:
      "Ge ditt företag en professionell look med @dittföretag.se — inga fler Gmail-adresser till kunder",
  },
  {
    key: "company_phone",
    label: "Företagsnummer / Växel",
    tooltip:
      "Ett eget företagsnummer med vidarekoppling, hälsningsfras och köhantering",
  },
  {
    key: "ai_receptionist",
    label: "AI-Receptionist",
    tooltip:
      "En AI som svarar i telefon, bokar möten åt dig och en chattbubbla på hemsidan som hjälper kunder dygnet runt",
  },
  {
    key: "advanced_seo",
    label: "Avancerad SEO",
    tooltip:
      "Hamna högst på Google — vi optimerar din hemsida så att kunderna hittar dig först",
  },
  {
    key: "journal_system",
    label: "Journalsystem / Journalkoppling",
    tooltip:
      "Digitalt journalsystem integrerat med din hemsida och bokning",
  },
  {
    key: "scheduling",
    label: "Schemaläggning & Personal",
    tooltip:
      "Hantera personalscheman, skift och semestrar enkelt i ett system",
  },
  {
    key: "booking_system",
    label: "Bokningssystem",
    tooltip:
      "Låt kunder boka tid direkt via din hemsida — automatiska påminnelser och kalendersynk",
  },
  {
    key: "online_payments",
    label: "Ta betalt online",
    tooltip:
      "Kortbetalning direkt på hemsidan — Swish, kort, faktura, allt på ett ställe",
  },
  {
    key: "webshop",
    label: "Webshop",
    tooltip:
      "Sälj produkter online med lagerhantering, frakt och betalning",
  },
  {
    key: "paid_ads",
    label: "Betalda annonser",
    tooltip:
      "Marknadsföring via Facebook, Instagram och Snapchat — vi sköter allt åt dig",
  },
  {
    key: "quote_generator",
    label: "Offertgenerering",
    tooltip:
      "Dina kunder kan begära prisförslag direkt via hemsidan",
  },
];

// ── Main component ────────────────────────────────────────────────────────────

export function QuestionnairePage() {
  const { token } = useParams<{ token: string }>();

  // Page-level state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<QuestionnaireData | null>(null);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Step 1 — Kapacitet
  const [capacity, setCapacity] = useState<string | null>(null);

  // Step 2 — Utseende
  const [colorTheme, setColorTheme] = useState<string>("#4f46e5");

  // Step 3 — Tjänster
  const [serviceMode, setServiceMode] = useState<ServiceInputMode>("text");
  const [servicesText, setServicesText] = useState("");
  const [servicesLink, setServicesLink] = useState("");
  const [servicesFile, setServicesFile] = useState<File | null>(null);
  const [servicesFileUrl, setServicesFileUrl] = useState<string | null>(null);
  const [uploadingService, setUploadingService] = useState(false);

  // Step 4 — Media
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Step 5 — Tilläggstjänster
  const [addonServices, setAddonServices] = useState<string[]>([]);
  const [expandedTooltip, setExpandedTooltip] = useState<string | null>(null);

  // Step 6 — Övrigt
  const [mostProfitable, setMostProfitable] = useState("");
  const [customChanges, setCustomChanges] = useState("");

  // Autosave timer ref
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch questionnaire on mount ──────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchQuestionnaire(token)
      .then((q) => {
        setData(q);
        // Populate state from existing data
        if (q.capacity) setCapacity(q.capacity);
        if (q.color_theme) setColorTheme(q.color_theme);
        if (q.services_text) setServicesText(q.services_text);
        if (q.services_file_url) setServicesFileUrl(q.services_file_url);
        if (q.custom_changes) setCustomChanges(q.custom_changes);
        if (q.most_profitable_service) setMostProfitable(q.most_profitable_service);
        if (q.addon_services?.length) setAddonServices(q.addon_services);
        if (q.media_urls?.length) setMediaUrls(q.media_urls);
        if (q.status === "completed") setSubmitted(true);
      })
      .catch((err) => {
        if (err instanceof Error && "status" in err && (err as Error & { status: unknown }).status === 404) {
          setError("Länken är ogiltig eller har utgått.");
        } else {
          setError("Något gick fel. Försök igen senare.");
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  // ── Autosave ──────────────────────────────────────────────────────────────

  const debouncedSave = useCallback(
    (answers: Partial<QuestionnaireData>) => {
      if (!token) return;
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        saveAnswers(token, answers).catch(() => {
          // silent — autosave failures are non-blocking
        });
      }, AUTOSAVE_DELAY);
    },
    [token],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleCapacityChange(val: string) {
    setCapacity(val);
    debouncedSave({ capacity: val });
  }

  function handleColorChange(val: string) {
    setColorTheme(val);
    debouncedSave({ color_theme: val });
  }

  function handleServicesTextChange(val: string) {
    setServicesText(val);
    debouncedSave({ services_text: val });
  }

  function handleServicesLinkChange(val: string) {
    setServicesLink(val);
    debouncedSave({ services_text: val });
  }

  async function handleServicesFileUpload(file: File) {
    if (!token) return;
    if (file.size > MAX_FILE_SIZE) {
      alert("Filen är för stor. Max 50 MB.");
      return;
    }
    setServicesFile(file);
    setUploadingService(true);
    try {
      const url = await uploadMedia(token, file);
      setServicesFileUrl(url);
      await saveAnswers(token, { services_file_url: url });
    } catch {
      alert("Kunde inte ladda upp filen. Försök igen.");
    } finally {
      setUploadingService(false);
    }
  }

  async function handleMediaUpload(files: FileList | File[]) {
    if (!token) return;
    setUploadingMedia(true);
    const newUrls: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        alert(`${file.name} är för stor. Max 50 MB.`);
        continue;
      }
      try {
        const url = await uploadMedia(token, file);
        newUrls.push(url);
      } catch {
        alert(`Kunde inte ladda upp ${file.name}.`);
      }
    }
    if (newUrls.length > 0) {
      const updated = [...mediaUrls, ...newUrls];
      setMediaUrls(updated);
      await saveAnswers(token, { media_urls: updated }).catch(() => {});
    }
    setUploadingMedia(false);
  }

  function removeMedia(index: number) {
    const updated = mediaUrls.filter((_, i) => i !== index);
    setMediaUrls(updated);
    if (token) debouncedSave({ media_urls: updated });
  }

  function toggleAddon(key: string) {
    const updated = addonServices.includes(key)
      ? addonServices.filter((s) => s !== key)
      : [...addonServices, key];
    setAddonServices(updated);
    debouncedSave({ addon_services: updated });
  }

  function handleMostProfitableChange(val: string) {
    setMostProfitable(val);
    debouncedSave({ most_profitable_service: val });
  }

  function handleCustomChangesChange(val: string) {
    setCustomChanges(val);
    debouncedSave({ custom_changes: val });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) {
      handleMediaUpload(e.dataTransfer.files);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
  }

  async function handleComplete() {
    if (!token) return;
    setSubmitting(true);
    try {
      await completeQuestionnaire(token);
      setSubmitted(true);
    } catch {
      alert("Kunde inte skicka in formuläret. Försök igen.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    // Save current step data before advancing
    if (token) {
      const answers: Partial<QuestionnaireData> = {};
      if (step === 1 && capacity) answers.capacity = capacity;
      if (step === 2) answers.color_theme = colorTheme;
      if (step === 3) {
        if (serviceMode === "text") answers.services_text = servicesText;
        else if (serviceMode === "link") answers.services_text = servicesLink;
      }
      if (step === 5) answers.addon_services = addonServices;
      if (step === 6) {
        answers.most_profitable_service = mostProfitable;
        answers.custom_changes = customChanges;
      }
      if (Object.keys(answers).length > 0) {
        saveAnswers(token, answers).catch(() => {});
      }
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 1));
  }

  // ── Step validation ───────────────────────────────────────────────────────

  const isStep1Valid = capacity !== null;

  // ── Render states ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
          <Spinner size="lg" className="border-indigo-600" />
          <p className="text-sm text-[var(--color-text-secondary)]">Laddar formulär...</p>
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
          <div className="h-16 w-16 rounded-full bg-rose-100 flex items-center justify-center">
            <svg className="h-8 w-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{error}</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Kontrollera att länken stämmer eller kontakta oss om du behöver hjälp.
          </p>
        </div>
      </PageShell>
    );
  }

  if (submitted || data?.status === "completed") {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
          <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Tack! Vi återkommer när din hemsida är redo
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Dina svar har skickats in. Du kan stänga den här sidan.
          </p>
        </div>
      </PageShell>
    );
  }

  // ── Main wizard ───────────────────────────────────────────────────────────

  return (
    <PageShell>
      {/* Progress bar */}
      <div className="mb-2">
        <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
          Steg {step} av {TOTAL_STEPS}
        </p>
        <div className="flex gap-1">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-200",
                i < step ? "bg-indigo-600" : "bg-slate-200",
              )}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="py-8 min-h-[400px]">
        {step === 1 && (
          <StepCapacity value={capacity} onChange={handleCapacityChange} />
        )}
        {step === 2 && (
          <StepColor value={colorTheme} onChange={handleColorChange} />
        )}
        {step === 3 && (
          <StepServices
            mode={serviceMode}
            onModeChange={setServiceMode}
            text={servicesText}
            onTextChange={handleServicesTextChange}
            link={servicesLink}
            onLinkChange={handleServicesLinkChange}
            file={servicesFile}
            fileUrl={servicesFileUrl}
            onFileUpload={handleServicesFileUpload}
            uploading={uploadingService}
          />
        )}
        {step === 4 && (
          <StepMedia
            urls={mediaUrls}
            onUpload={handleMediaUpload}
            onRemove={removeMedia}
            uploading={uploadingMedia}
            dragActive={dragActive}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          />
        )}
        {step === 5 && (
          <StepAddons
            selected={addonServices}
            onToggle={toggleAddon}
            expandedTooltip={expandedTooltip}
            onToggleTooltip={setExpandedTooltip}
          />
        )}
        {step === 6 && (
          <StepOther
            mostProfitable={mostProfitable}
            onMostProfitableChange={handleMostProfitableChange}
            customChanges={customChanges}
            onCustomChangesChange={handleCustomChangesChange}
          />
        )}
        {step === 7 && (
          <StepSummary
            capacity={capacity}
            colorTheme={colorTheme}
            servicesText={servicesText}
            servicesLink={servicesLink}
            servicesFileUrl={servicesFileUrl}
            serviceMode={serviceMode}
            mediaUrls={mediaUrls}
            addonServices={addonServices}
            mostProfitable={mostProfitable}
            customChanges={customChanges}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between gap-3 pt-4 border-t border-[var(--color-border)]">
        {step > 1 ? (
          <Button variant="secondary" onClick={handleBack}>
            Tillbaka
          </Button>
        ) : (
          <div />
        )}
        {step < TOTAL_STEPS ? (
          <Button
            variant="primary"
            onClick={handleNext}
            disabled={step === 1 && !isStep1Valid}
          >
            Nästa
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleComplete}
            disabled={submitting}
          >
            {submitting ? "Skickar..." : "Skicka"}
          </Button>
        )}
      </div>
    </PageShell>
  );
}

// ── Page shell (no sidebar, no app chrome) ──────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
            Siteflow
          </h1>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Step 1: Kapacitet ───────────────────────────────────────────────────────

function StepCapacity({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Hur många fler kunder kan du hantera per dag?
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Svaret avgör hur starkt vi pushar din hemsida i Google-resultaten
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CAPACITY_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "flex items-center justify-center rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all duration-150 cursor-pointer",
              value === opt
                ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                : "border-[var(--color-border-input)] bg-white text-[var(--color-text-primary)] hover:border-indigo-300 hover:bg-indigo-50/50",
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 2: Utseende ────────────────────────────────────────────────────────

function StepColor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Vill du ha någon specifik färg som tema?
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Valfritt — vi väljer en passande färg om du hoppar över
        </p>
      </div>
      <div className="flex items-center gap-4">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-12 cursor-pointer rounded-lg border border-[var(--color-border-input)] p-0.5"
        />
        <div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">
            Vald färg
          </p>
          <p className="text-xs font-mono text-[var(--color-text-secondary)] uppercase">
            {value}
          </p>
        </div>
        <div
          className="ml-4 h-12 w-24 rounded-lg border border-[var(--color-border-input)]"
          style={{ backgroundColor: value }}
        />
      </div>
    </div>
  );
}

// ── Step 3: Tjänster ────────────────────────────────────────────────────────

function StepServices({
  mode,
  onModeChange,
  text,
  onTextChange,
  link,
  onLinkChange,
  file,
  fileUrl,
  onFileUpload,
  uploading,
}: {
  mode: ServiceInputMode;
  onModeChange: (m: ServiceInputMode) => void;
  text: string;
  onTextChange: (v: string) => void;
  link: string;
  onLinkChange: (v: string) => void;
  file: File | null;
  fileUrl: string | null;
  onFileUpload: (f: File) => void;
  uploading: boolean;
}) {
  const tabs: { key: ServiceInputMode; label: string }[] = [
    { key: "text", label: "Skriv in" },
    { key: "upload", label: "Ladda upp fil" },
    { key: "link", label: "Klistra in länk" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Vilka tjänster erbjuder du dina kunder?
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Valfritt — du kan ladda upp en fil, skriva in eller klistra in en länk
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onModeChange(t.key)}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150 cursor-pointer",
              mode === t.key
                ? "bg-white text-[var(--color-text-primary)] shadow-sm"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {mode === "text" && (
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={6}
          placeholder="T.ex. Klippning — 350 kr, Färgning — 800 kr..."
          className={`${inputClass} resize-y`}
        />
      )}

      {mode === "upload" && (
        <div className="space-y-3">
          <input
            type="file"
            accept=".xlsx,.xls,.pdf,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFileUpload(f);
            }}
            className="block w-full text-sm text-[var(--color-text-secondary)] file:mr-3 file:py-1.5 file:px-3 file:rounded-[6px] file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-[var(--color-text-primary)] hover:file:bg-slate-200 cursor-pointer"
          />
          {uploading && (
            <p className="text-xs text-[var(--color-text-secondary)]">Laddar upp...</p>
          )}
          {file && !uploading && (
            <p className="text-xs text-[var(--color-text-secondary)]">
              Uppladdad: {file.name}
            </p>
          )}
          {fileUrl && !file && (
            <p className="text-xs text-emerald-600">Fil redan uppladdad</p>
          )}
        </div>
      )}

      {mode === "link" && (
        <input
          type="url"
          value={link}
          onChange={(e) => onLinkChange(e.target.value)}
          placeholder="https://www.example.se/prislista"
          className={inputClass}
        />
      )}
    </div>
  );
}

// ── Step 4: Media ───────────────────────────────────────────────────────────

function StepMedia({
  urls,
  onUpload,
  onRemove,
  uploading,
  dragActive,
  onDrop,
  onDragOver,
  onDragLeave,
}: {
  urls: string[];
  onUpload: (files: FileList) => void;
  onRemove: (index: number) => void;
  uploading: boolean;
  dragActive: boolean;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Skicka bilder/videos du vill att vi använder på hemsidan
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Valfritt — max 50 MB per fil
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 transition-colors duration-150",
          dragActive
            ? "border-indigo-400 bg-indigo-50"
            : "border-[var(--color-border-input)] bg-white hover:border-indigo-300",
        )}
      >
        <svg
          className="h-10 w-10 text-slate-400 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 16v-8m0 0l-3 3m3-3l3 3M3 16.5V18a2.25 2.25 0 002.25 2.25h13.5A2.25 2.25 0 0021 18v-1.5M7.5 12.75l4.5-4.5 4.5 4.5"
          />
        </svg>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Dra och släpp filer här, eller{" "}
          <label className="text-indigo-600 cursor-pointer hover:text-indigo-700 font-medium">
            välj filer
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) onUpload(e.target.files);
              }}
            />
          </label>
        </p>
        {uploading && (
          <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Laddar upp...</p>
        )}
      </div>

      {/* Uploaded files */}
      {urls.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {urls.map((url, i) => {
            const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
            return (
              <div
                key={i}
                className="group relative rounded-lg border border-[var(--color-border)] overflow-hidden bg-slate-50"
              >
                {isImage ? (
                  <img
                    src={url}
                    alt={`Uppladdad bild ${i + 1}`}
                    className="h-24 w-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-24">
                    <svg
                      className="h-8 w-8 text-slate-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
                      />
                    </svg>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Step 5: Tilläggstjänster ────────────────────────────────────────────────

function StepAddons({
  selected,
  onToggle,
  expandedTooltip,
  onToggleTooltip,
}: {
  selected: string[];
  onToggle: (key: string) => void;
  expandedTooltip: string | null;
  onToggleTooltip: (key: string | null) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Vill du lägga till några av våra andra tjänster?
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Valfritt — klicka på info-ikonen för mer detaljer
        </p>
      </div>
      <div className="space-y-2">
        {ADDON_SERVICES.map((svc) => {
          const isSelected = selected.includes(svc.key);
          const isExpanded = expandedTooltip === svc.key;
          return (
            <div key={svc.key}>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-lg border-2 px-4 py-3 transition-all duration-150",
                  isSelected
                    ? "border-indigo-600 bg-indigo-50"
                    : "border-[var(--color-border-input)] bg-white hover:border-indigo-300",
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(svc.key)}
                  className="h-4 w-4 rounded border-[var(--color-border-input)] text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span
                  className={cn(
                    "flex-1 text-sm font-medium cursor-pointer",
                    isSelected ? "text-indigo-700" : "text-[var(--color-text-primary)]",
                  )}
                  onClick={() => onToggle(svc.key)}
                >
                  {svc.label}
                </span>
                <button
                  type="button"
                  onClick={() => onToggleTooltip(isExpanded ? null : svc.key)}
                  className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors cursor-pointer flex-shrink-0"
                  title="Mer info"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
              {isExpanded && (
                <div className="ml-11 mt-1 mb-1 rounded-md bg-slate-50 px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                  {svc.tooltip}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 6: Övrigt ──────────────────────────────────────────────────────────

function StepOther({
  mostProfitable,
  onMostProfitableChange,
  customChanges,
  onCustomChangesChange,
}: {
  mostProfitable: string;
  onMostProfitableChange: (v: string) => void;
  customChanges: string;
  onCustomChangesChange: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Övrigt
        </h2>
      </div>

      <div className="space-y-1.5">
        <label className={labelClass}>
          Vilken tjänst tjänar du mest pengar på?
        </label>
        <input
          type="text"
          value={mostProfitable}
          onChange={(e) => onMostProfitableChange(e.target.value)}
          placeholder="T.ex. Botox, klippning, massage..."
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label className={labelClass}>
          Vill du ändra/lägga till något specifikt innan publicering?
        </label>
        <textarea
          value={customChanges}
          onChange={(e) => onCustomChangesChange(e.target.value)}
          rows={4}
          placeholder="Skriv eventuella önskemål eller ändringar..."
          className={`${inputClass} resize-y`}
        />
      </div>
    </div>
  );
}

// ── Step 7: Sammanfattning ──────────────────────────────────────────────────

function StepSummary({
  capacity,
  colorTheme,
  servicesText,
  servicesLink,
  servicesFileUrl,
  serviceMode,
  mediaUrls,
  addonServices,
  mostProfitable,
  customChanges,
}: {
  capacity: string | null;
  colorTheme: string;
  servicesText: string;
  servicesLink: string;
  servicesFileUrl: string | null;
  serviceMode: ServiceInputMode;
  mediaUrls: string[];
  addonServices: string[];
  mostProfitable: string;
  customChanges: string;
}) {
  const addonLabels = addonServices
    .map((key) => ADDON_SERVICES.find((s) => s.key === key)?.label)
    .filter(Boolean);

  const servicesDisplay =
    serviceMode === "text" && servicesText
      ? servicesText
      : serviceMode === "link" && servicesLink
        ? servicesLink
        : servicesFileUrl
          ? "Fil uppladdad"
          : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Sammanfattning
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Kontrollera dina svar innan du skickar in
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-[var(--color-border)] bg-white p-5">
        <SummaryRow label="Kapacitet" value={capacity} />
        <SummaryRow
          label="Temafärg"
          value={
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-block h-4 w-4 rounded border border-[var(--color-border)]"
                style={{ backgroundColor: colorTheme }}
              />
              <span className="font-mono text-xs uppercase">{colorTheme}</span>
            </span>
          }
        />
        <SummaryRow label="Tjänster" value={servicesDisplay} />
        <SummaryRow
          label="Media"
          value={mediaUrls.length > 0 ? `${mediaUrls.length} fil(er) uppladdade` : null}
        />
        <SummaryRow
          label="Tilläggstjänster"
          value={addonLabels.length > 0 ? addonLabels.join(", ") : null}
        />
        <SummaryRow label="Mest lönsam tjänst" value={mostProfitable || null} />
        <SummaryRow label="Övriga önskemål" value={customChanges || null} />
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-[var(--color-border)] last:border-0">
      <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
        {label}
      </span>
      <span className="text-sm text-[var(--color-text-primary)]">
        {value ?? (
          <span className="text-[var(--color-text-secondary)] italic">Ej ifyllt</span>
        )}
      </span>
    </div>
  );
}
