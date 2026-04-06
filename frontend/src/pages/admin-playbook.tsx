import { useState } from "react";
import {
  usePlaybooks,
  useCreatePlaybook,
  useUpdatePlaybook,
  useDeletePlaybook,
} from "@/api/playbooks";
import type { Playbook } from "@/api/playbooks";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Loader from "@/components/kokonutui/loader";

// ---------------------------------------------------------------------------
// Section editor
// ---------------------------------------------------------------------------

interface SectionProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}

function Section({ label, value, onChange, rows = 5, placeholder }: SectionProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] text-[var(--color-text-secondary)] uppercase tracking-wider font-medium">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-[6px] border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-none"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Playbook editor
// ---------------------------------------------------------------------------

interface EditorProps {
  playbook: Playbook;
  onSaved: () => void;
  onDeleted: () => void;
}

function PlaybookEditor({ playbook, onSaved, onDeleted }: EditorProps) {
  const [name, setName] = useState(playbook.name);
  const [opening, setOpening] = useState(playbook.opening ?? "");
  const [pitch, setPitch] = useState(playbook.pitch ?? "");
  const [objections, setObjections] = useState(playbook.objections ?? "");
  const [closing, setClosing] = useState(playbook.closing ?? "");
  const [guidelines, setGuidelines] = useState(playbook.guidelines ?? "");
  const [active, setActive] = useState(playbook.active);
  const [showDelete, setShowDelete] = useState(false);

  const updatePlaybook = useUpdatePlaybook();
  const deletePlaybook = useDeletePlaybook();

  async function handleSave() {
    await updatePlaybook.mutateAsync({
      id: playbook.id,
      name,
      opening,
      pitch,
      objections,
      closing,
      guidelines,
      active,
    });
    onSaved();
  }

  async function handleDelete() {
    await deletePlaybook.mutateAsync(playbook.id);
    onDeleted();
  }

  return (
    <Card className="flex-1 min-w-0">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <CardTitle>Redigera manus</CardTitle>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm text-[var(--color-text-secondary)]">Aktiv</span>
            <button
              type="button"
              role="switch"
              aria-checked={active}
              onClick={() => setActive(!active)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 ${
                active ? "bg-indigo-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                  active ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </label>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[11px] text-[var(--color-text-secondary)] uppercase tracking-wider font-medium">
            Namn
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="T.ex. Standard B2B-manus"
            className="w-full h-9 rounded-[6px] border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </div>

        <Section
          label="Öppning"
          value={opening}
          onChange={setOpening}
          placeholder="Hur samtalet ska inledas..."
        />

        <Section
          label="Pitch"
          value={pitch}
          onChange={setPitch}
          placeholder="Huvudbudskapet och värdeerbjudandet..."
        />

        <Section
          label="Invändningshantering"
          value={objections}
          onChange={setObjections}
          placeholder="Vanliga invändningar och hur de hanteras..."
        />

        <Section
          label="Avslut"
          value={closing}
          onChange={setClosing}
          placeholder="Hur samtalet avslutas och nästa steg bokas..."
        />

        <Section
          label="Riktlinjer"
          value={guidelines}
          onChange={setGuidelines}
          rows={3}
          placeholder="Övergripande riktlinjer, t.ex. tonalitet, saker att undvika..."
        />

        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="primary"
            size="default"
            onClick={() => void handleSave()}
            disabled={updatePlaybook.isPending || !name.trim()}
          >
            {updatePlaybook.isPending ? "Sparar..." : "Spara"}
          </Button>

          {!showDelete ? (
            <Button variant="secondary" size="default" onClick={() => setShowDelete(true)}>
              Radera
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--color-text-secondary)]">Bekräfta radering?</span>
              <Button
                variant="danger"
                size="default"
                onClick={() => void handleDelete()}
                disabled={deletePlaybook.isPending}
              >
                {deletePlaybook.isPending ? "Raderar..." : "Ja, radera"}
              </Button>
              <Button variant="secondary" size="default" onClick={() => setShowDelete(false)}>
                Avbryt
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AdminPlaybookPage() {
  const { data: playbooks, isLoading } = usePlaybooks();
  const createPlaybook = useCreatePlaybook();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function handleCreate() {
    const result = await createPlaybook.mutateAsync({
      name: "Nytt manus",
      opening: "",
      pitch: "",
      objections: "",
      closing: "",
      guidelines: "",
      active: false,
    });
    setSelectedId(result.id);
  }

  const selected = (playbooks ?? []).find((p) => p.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
          Säljmanus & Playbook
        </h1>
        <Button
          variant="primary"
          size="default"
          onClick={() => void handleCreate()}
          disabled={createPlaybook.isPending}
        >
          {createPlaybook.isPending ? "Skapar..." : "Nytt manus"}
        </Button>
      </div>

      {isLoading ? (
        <Loader size="sm" title="Laddar manus" />
      ) : (playbooks ?? []).length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Inga säljmanus skapade ännu.
            </p>
            <Button
              variant="primary"
              size="default"
              onClick={() => void handleCreate()}
              disabled={createPlaybook.isPending}
            >
              Skapa ditt första manus
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex gap-6 items-start">
          {/* Left: list */}
          <div className="w-64 shrink-0 space-y-2">
            {(playbooks ?? []).map((pb) => (
              <button
                key={pb.id}
                onClick={() => setSelectedId(pb.id)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors duration-150 ${
                  selectedId === pb.id
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-[var(--color-border)] bg-white hover:bg-[var(--color-bg-panel)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  {pb.active && (
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  )}
                  <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                    {pb.name}
                  </span>
                </div>
                {pb.active && (
                  <span className="text-[11px] text-emerald-600 font-medium mt-0.5 block">
                    Aktiv
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Right: editor */}
          {selected ? (
            <PlaybookEditor
              key={selected.id}
              playbook={selected}
              onSaved={() => {}}
              onDeleted={() => setSelectedId(null)}
            />
          ) : (
            <Card className="flex-1">
              <p className="text-sm text-[var(--color-text-secondary)] py-8 text-center">
                Välj ett manus till vänster för att redigera.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
