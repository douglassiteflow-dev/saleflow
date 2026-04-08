import { useRef, useState } from "react";
import { useImportLeads } from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ImportResult } from "@/api/types";

export function AdminImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [listName, setListName] = useState("");
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
    if (listName.trim()) {
      formData.append("list_name", listName.trim());
    }

    try {
      const res = await importLeads.mutateAsync(formData);
      setResult(res);
      fileRef.current!.value = "";
      setListName("");
    } catch (err) {
      setError((err as Error).message ?? "Import misslyckades.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1
          className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]"
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
              className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider"
            >
              Listnamn (valfritt)
            </label>
            <Input
              type="text"
              placeholder="T.ex. Kunder utan hemsida"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
            />
            <p className="text-xs text-[var(--color-text-secondary)]">
              Om du anger ett listnamn skapas en ny lista och alla importerade leads kopplas till den.
            </p>
          </div>

          <div className="space-y-1">
            <label
              className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider"
            >
              Excel-fil (.xlsx)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="block w-full text-sm text-[var(--color-text-primary)] file:mr-4 file:py-2 file:px-4 file:rounded-[6px] file:border file:border-[var(--color-border-input)] file:text-sm file:font-medium file:bg-[var(--color-bg-primary)] file:text-[var(--color-text-primary)] file:cursor-pointer hover:file:bg-[var(--color-bg-panel)] cursor-pointer"
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
                {result.created} leads skapade, {result.skipped} hoppades
                över
              </p>
              {result.list_id && (
                <p className="text-sm text-emerald-700">
                  Lista skapad och kopplad till importen.
                </p>
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

          {importLeads.isPending && (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Spinner size="sm" className="border-[var(--color-accent)] border-t-transparent" />
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Importerar leads, detta kan ta några minuter för stora filer...
                </p>
              </div>
              <div className="w-full bg-[var(--color-bg-panel)] rounded-full h-2 overflow-hidden">
                <div className="bg-[var(--color-accent)] h-2 rounded-full animate-pulse w-[60%]" />
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
