import { useParams } from "react-router-dom";

const APP_INFO: Record<string, { name: string; description: string }> = {
  genflow: { name: "Genflow", description: "Generera professionella hemsidor för dina kunder" },
  signflow: { name: "Signflow", description: "Skapa offerter och avtal, skicka för signering" },
  leadflow: { name: "Leadflow", description: "Scrapa och importera leads automatiskt" },
};

export function AppPlaceholderPage() {
  const { slug } = useParams<{ slug: string }>();
  const info = APP_INFO[slug ?? ""];

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
        {info?.name ?? slug}
      </h1>
      <p className="text-sm text-[var(--color-text-secondary)]">
        {info?.description ?? "Appen laddas..."}
      </p>
      <div className="rounded-[14px] bg-[var(--color-bg-primary)] p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-center">
        <p className="text-[var(--color-text-secondary)]">Kommer snart</p>
      </div>
    </div>
  );
}
