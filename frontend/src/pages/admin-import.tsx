import { useRef, useState } from "react";
import { useImportLeads } from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import type { ImportResult } from "@/api/types";

export function AdminImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importLeads = useImportLeads();

  async function handleImport() {
    setError(null);
    setResult(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Välj en Excel-fil (.xlsx) att importera.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await importLeads.mutateAsync(formData);
      setResult(res);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError((err as Error).message ?? "Import misslyckades.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1
          className="font-semibold text-[var(--color-text-primary)]"
          style={{ fontSize: "24px" }}
        >
          Importera leads
        </h1>
      </div>

      <Card>
        <CardTitle className="mb-4">Excel-import</CardTitle>
        <p className="text-sm text-[var(--color-text-secondary)] mb-5">
          Välj en .xlsx-fil med leads att importera. Duplicerade rader hoppas
          automatiskt över.
        </p>

        <div className="space-y-4">
          <div className="space-y-1">
            <label
              className="block text-[var(--color-text-secondary)] uppercase tracking-wider"
              style={{ fontSize: "12px" }}
            >
              Excel-fil (.xlsx)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="block w-full text-sm text-[var(--color-text-primary)] file:mr-4 file:py-2 file:px-4 file:rounded-[6px] file:border file:border-[var(--color-border-input)] file:text-sm file:font-medium file:bg-white file:text-[var(--color-text-primary)] file:cursor-pointer hover:file:bg-[var(--color-bg-panel)] cursor-pointer"
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--color-danger)]">{error}</p>
          )}

          {result && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-1">
              <p className="text-sm font-medium text-emerald-800">
                Import slutförd
              </p>
              <p className="text-sm text-emerald-700">
                {result.imported} leads skapade, {result.skipped} hoppades
                över
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {result.errors.map((err, i) => (
                    <li key={i} className="text-xs text-red-600">
                      {err}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <Button
            variant="primary"
            onClick={() => void handleImport()}
            disabled={importLeads.isPending}
          >
            {importLeads.isPending ? "Importerar..." : "Importera"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
