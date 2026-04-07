# ConfigureWizard UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the ConfigureWizard from 6 to 5 steps — default to nothing selected, add AI auto-tagging in background, improve all UX guidance.

**Architecture:** The wizard UI (`ConfigureWizard.tsx`) is a single-file React component with sub-components per step. Changes are mostly in that file (remove StepTag, add queue logic, fix defaults, improve labels). A new backend endpoint (`POST /api/customers/:id/auto-tag`) uses Claude CLI with vision to classify images. A new API function `autoTagImages()` bridges frontend to backend.

**Tech Stack:** React + TypeScript (Vite), Express.js backend, Claude CLI for image tagging (spawned via `child_process`).

**Spec:** `docs/superpowers/specs/2026-03-28-wizard-ux-overhaul.md`

---

### Task 1: Remove pre-selection of images and services

**Files:**
- Modify: `ui/src/pages/ConfigureWizard.tsx:797-803`

This is the highest-impact change — after scrape, images and services start empty instead of all-selected.

- [ ] **Step 1: Remove auto-select in StepScrape onDone callback**

In `ConfigureWizard.tsx`, find the `onDone` callback inside the JSX for `StepScrape` (around line 797). Remove the three lines that pre-fill selections:

```tsx
// REMOVE these lines (800-802):
if (updated.allImages) setSelectedImages(new Set(updated.allImages));
const svcCount = ((updated.scrapedData as Record<string, unknown>)?.tjänster as unknown[] || []).length;
if (svcCount > 0) setSelectedServices(new Set(Array.from({ length: svcCount }, (_, i) => i)));
```

The `onDone` callback should now only do:

```tsx
onDone={(updated) => {
  setCustomer(updated);
  setStep(1);
}}
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd /Users/douglassiteflow/dev/genflow/ui && npx vite build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/ConfigureWizard.tsx
git commit -m "fix: default images and services to empty selection"
```

---

### Task 2: Add "Välj alla / Avmarkera alla" buttons for images

**Files:**
- Modify: `ui/src/pages/ConfigureWizard.tsx` — `StepSelect` component (line 203-337)

- [ ] **Step 1: Add selectAll/deselectAll handlers for images**

Inside `StepSelect`, after the existing `toggleService` function (line 236), add:

```tsx
const selectAllImages = () => {
  setSelectedImages(new Set(images));
};

const deselectAllImages = () => {
  setSelectedImages(new Set());
};
```

- [ ] **Step 2: Add button row above image grid**

Replace the existing image header (line 249-252):

```tsx
<h3 className="text-sm font-medium mb-3">
  Bilder ({selectedImages.size} / {images.length} valda)
</h3>
```

With:

```tsx
<div className="flex items-center justify-between mb-3">
  <h3 className="text-sm font-medium">
    Bilder ({selectedImages.size} / {images.length} valda)
  </h3>
  <div className="flex gap-2">
    <Button variant="ghost" size="sm" className="text-xs h-6" onClick={selectAllImages}>
      Välj alla
    </Button>
    <Button variant="ghost" size="sm" className="text-xs h-6" onClick={deselectAllImages}>
      Avmarkera
    </Button>
  </div>
</div>
```

- [ ] **Step 3: Verify the build compiles**

Run: `cd /Users/douglassiteflow/dev/genflow/ui && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add ui/src/pages/ConfigureWizard.tsx
git commit -m "feat: add select-all/deselect-all buttons for images"
```

---

### Task 3: Update step labels, instructions, and grid size

**Files:**
- Modify: `ui/src/pages/ConfigureWizard.tsx` — multiple locations

- [ ] **Step 1: Update STEPS array and reduce to 5 steps**

Replace the `STEPS` constant (line 27-34):

```tsx
const STEPS = [
  { label: "Hämta data", icon: "1" },
  { label: "Välj innehåll", icon: "2" },
  { label: "Välj logo", icon: "3" },
  { label: "Färger", icon: "4" },
  { label: "Skapa", icon: "5" },
];
```

- [ ] **Step 2: Reduce IMAGES_PER_PAGE to 8**

Change line 44:

```tsx
const IMAGES_PER_PAGE = 8;
```

- [ ] **Step 3: Add instruction header to StepScrape**

In `StepScrape`, update the scraping state message (line 143):

```tsx
setMessage("Hämtar bilder och information från bokadirekt...");
```

And the done state (line 166-179), update the text:

```tsx
<p className="text-lg font-medium">Data hämtad!</p>
<p className="text-sm text-muted-foreground">
  {imageCount} bilder hittade — nu väljer du vad som ska visas
</p>
```

- [ ] **Step 4: Add instruction header to StepSelect**

In `StepSelect`, add instruction text at the top of the returned JSX (inside the outer `<div className="space-y-6 p-4">`), before the images section:

```tsx
<div className="space-y-1 mb-2">
  <h2 className="text-base font-semibold">Välj vad som ska visas på hemsidan</h2>
  <p className="text-sm text-muted-foreground">Markera de bilder och tjänster du vill ha med</p>
</div>
```

- [ ] **Step 5: Change image grid to larger tiles**

In `StepSelect`, change the image grid class (line 253):

```tsx
// FROM
className="grid grid-cols-5 sm:grid-cols-8 gap-1.5"
// TO
className="grid grid-cols-3 sm:grid-cols-4 gap-2"
```

In `StepLogo`, change the image grid class (line 374):

```tsx
// FROM
className="grid grid-cols-5 sm:grid-cols-8 gap-1.5"
// TO
className="grid grid-cols-3 sm:grid-cols-4 gap-2"
```

- [ ] **Step 6: Add instruction to StepPalette**

In `StepPalette`, update the subtitle text (line 483-484):

```tsx
<h3 className="text-sm font-medium mb-1">Justera färgpaletten</h3>
<p className="text-xs text-muted-foreground mb-4">
  Färgerna är extraherade från loggan. Ändra om du vill, eller gå vidare.
</p>
```

- [ ] **Step 7: Verify the build compiles**

Run: `cd /Users/douglassiteflow/dev/genflow/ui && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add ui/src/pages/ConfigureWizard.tsx
git commit -m "feat: improve step labels, instructions, and image grid size"
```

---

### Task 4: Remove StepTag and "Hoppa över" buttons, fix step indices

**Files:**
- Modify: `ui/src/pages/ConfigureWizard.tsx` — remove StepTag component + update wizard logic

This is the structural change — wizard goes from 6 steps (0-5) to 5 steps (0-4). Step 5 (tag) is removed, step 6 (generate) becomes step 4.

- [ ] **Step 1: Delete the entire StepTag component**

Remove the `StepTag` function (lines 531-674) and its `CATEGORIES` constant (lines 36-41). These are no longer used.

- [ ] **Step 2: Update step rendering in the main wizard JSX**

In the `AnimatePresence` block (lines 786-845), the step mapping needs updating. Steps 0-3 stay the same, step 4 (old tag) is removed, step 5 (generate) becomes step 4. The new block should be:

```tsx
{step === 0 && (
  <StepScrape
    customer={customer}
    onDone={(updated) => {
      setCustomer(updated);
      setStep(1);
    }}
  />
)}
{step === 1 && (
  <StepSelect
    customer={customer}
    selectedImages={selectedImages}
    setSelectedImages={setSelectedImages}
    selectedServices={selectedServices}
    setSelectedServices={setSelectedServices}
  />
)}
{step === 2 && (
  <StepLogo
    customer={customer}
    onLogoProcessed={(data) => {
      setPalette(data.palette);
      setCustomer((c) => c ? { ...c, logoTransparent: data.logoUrl } : c);
    }}
  />
)}
{step === 3 && (
  <StepPalette palette={palette} onChange={setPalette} />
)}
{step === 4 && (
  <StepGenerate
    customer={customer}
    selectedImages={[...selectedImages]}
    selectedServices={[...selectedServices]}
  />
)}
```

- [ ] **Step 3: Update navigation bounds**

The footer nav currently checks `step < 5` (line 848). Change to `step < 4`:

```tsx
{step < 4 && (
```

The "Nästa" onClick changes `Math.min(5, ...)` to `Math.min(4, ...)`:

```tsx
onClick={() => setStep((s) => Math.min(4, s + 1))}
```

- [ ] **Step 4: Remove "Hoppa över" buttons**

Delete the entire block (lines 859-866):

```tsx
{step >= 2 && step <= 4 && (
  <Button
    variant="ghost"
    size="sm"
    className="text-muted-foreground"
    onClick={() => setStep((s) => s + 1)}
  >
    Hoppa över
  </Button>
)}
```

- [ ] **Step 5: Remove unused descriptions state**

In the main `ConfigureWizard` component, remove:

```tsx
const [descriptions, setDescriptions] = useState<Customer["imageDescriptions"]>([]);
```

And remove `imageDescriptions: descriptions` from the auto-save `useEffect` (line 749). The save effect should be:

```tsx
useEffect(() => {
  if (!customer) return;
  const timeout = setTimeout(() => {
    updateCustomer(customer.id, {
      selectedImages: [...selectedImages],
      selectedServices: [...selectedServices],
      palette,
    } as Partial<Customer>).catch(console.error);
  }, 500);
  return () => clearTimeout(timeout);
}, [selectedImages, selectedServices, palette, customer]);
```

Also remove the restoration line in the initial `useEffect`:

```tsx
// REMOVE:
if (c.imageDescriptions?.length) setDescriptions(c.imageDescriptions);
```

- [ ] **Step 6: Remove unused imports**

Remove `Tag` from the lucide-react import (it was only used in StepTag):

```tsx
import { ArrowLeft, ArrowRight, Check, Crown, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
```

Remove `Textarea` from the ui imports (only used in StepTag):

```tsx
// Remove this line:
import { Textarea } from "@/components/ui/textarea";
```

Remove `Badge` import (only used in StepTag):

```tsx
// Remove this line:
import { Badge } from "@/components/ui/badge";
```

Remove `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` imports (only used in StepTag):

```tsx
// Remove this entire block:
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

- [ ] **Step 7: Verify the build compiles**

Run: `cd /Users/douglassiteflow/dev/genflow/ui && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add ui/src/pages/ConfigureWizard.tsx
git commit -m "feat: remove manual image tagging step, reduce wizard to 5 steps"
```

---

### Task 5: Improve "Nästa" button with contextual labels

**Files:**
- Modify: `ui/src/pages/ConfigureWizard.tsx` — bottom navigation

- [ ] **Step 1: Update the Nästa button**

Replace the existing "Nästa" button (currently around the footer navigation) with:

```tsx
<Button
  size="sm"
  className="gradient-accent text-white btn-glow click-ripple"
  onClick={() => setStep((s) => Math.min(4, s + 1))}
  disabled={!canNext()}
>
  {!canNext() && step === 1
    ? "Välj minst en bild"
    : step < 3
    ? `Nästa: ${STEPS[step + 1]?.label}`
    : "Skapa hemsida"
  }
  <ArrowRight className="w-4 h-4 ml-1" />
</Button>
```

This shows:
- Step 1 disabled: "Välj minst en bild"
- Step 1 enabled: "Nästa: Välj logo"
- Step 2: "Nästa: Färger"
- Step 3: "Skapa hemsida"

- [ ] **Step 2: Verify the build compiles**

Run: `cd /Users/douglassiteflow/dev/genflow/ui && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/ConfigureWizard.tsx
git commit -m "feat: contextual next-button labels in wizard"
```

---

### Task 6: Add auto-tag API function in frontend

**Files:**
- Modify: `ui/src/lib/api.ts` — add new function

- [ ] **Step 1: Add autoTagImages function**

At the end of the `// --- Generate ---` section in `api.ts` (before `// --- Helpers ---`), add:

```tsx
// --- Auto-tag ---

export async function autoTagImages(customerId: string, selectedImages: string[]) {
  const res = await fetch(`${API}/customers/${customerId}/auto-tag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedImages }),
  });
  if (!res.ok) throw new Error("Auto-taggning misslyckades");
  return res.json() as Promise<{ descriptions: Customer["imageDescriptions"] }>;
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd /Users/douglassiteflow/dev/genflow/ui && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add ui/src/lib/api.ts
git commit -m "feat: add autoTagImages API function"
```

---

### Task 7: Add auto-tag backend endpoint

**Files:**
- Modify: `server/routes/customers.js` — add new route

This endpoint takes selected image filenames, spawns Claude CLI with vision to classify each image, and returns structured descriptions.

- [ ] **Step 1: Add imports needed for auto-tag**

At the top of `server/routes/customers.js`, add `spawn` to imports:

```js
import { spawn } from "child_process";
import { CLAUDE_BIN } from "../lib/platform.js";
```

- [ ] **Step 2: Add the auto-tag route**

Before the `export default router;` line at the bottom of the file, add:

```js
// Auto-tag images using Claude vision
router.post("/:id/auto-tag", async (req, res) => {
  const customer = getCustomer(req.params.id);
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const { selectedImages } = req.body;
  if (!selectedImages?.length) return res.status(400).json({ error: "selectedImages required" });

  const outputDir = join(getOutput(), customer.slug);
  const bilderDir = join(outputDir, "bilder");

  if (!existsSync(bilderDir)) {
    return res.status(404).json({ error: "Images directory not found" });
  }

  // Build prompt that references all images
  const imageArgs = selectedImages
    .filter(img => existsSync(join(bilderDir, img)))
    .map(img => join(bilderDir, img));

  if (imageArgs.length === 0) {
    return res.status(400).json({ error: "No valid images found" });
  }

  const fileList = imageArgs.map(p => `File: ${p}`).join("\n");

  const prompt = `Look at these images from a business listing. For each image, respond with a JSON array.

${fileList}

For each image, classify it as one of these categories:
- "lokal" — interior, exterior, storefront, decor
- "personal" — people, staff, portraits
- "arbete" — work being performed, treatments, services in action
- "produkt" — products, tools, equipment

Give a short English description (max 15 words).

Respond with ONLY a JSON array, no other text:
[{"filename": "original-filename.jpg", "category": "lokal", "description": "..."}]

Use the original filenames from the list: ${selectedImages.join(", ")}`;

  try {
    const result = await new Promise((resolve, reject) => {
      const proc = spawn(CLAUDE_BIN, [
        "-p", prompt,
        "--output-format", "json",
        "--max-turns", "1",
      ], {
        env: process.env,
        cwd: outputDir,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", d => { stdout += d.toString(); });
      proc.stderr.on("data", d => { stderr += d.toString(); });

      proc.on("close", code => {
        if (code !== 0) {
          reject(new Error(stderr || "Claude auto-tag failed"));
          return;
        }
        try {
          // Claude JSON output wraps the result in a message object
          const parsed = JSON.parse(stdout);
          const text = parsed.result || parsed.content || stdout;
          // Extract JSON array from the text
          const match = typeof text === "string" ? text.match(/\[[\s\S]*\]/) : null;
          const descriptions = match ? JSON.parse(match[0]) : [];
          resolve(descriptions);
        } catch (e) {
          reject(new Error("Failed to parse Claude response: " + e.message));
        }
      });

      proc.on("error", reject);
    });

    const descriptions = Array.isArray(result) ? result.map(d => ({
      filename: d.filename,
      category: ["lokal", "personal", "arbete", "produkt"].includes(d.category) ? d.category : "lokal",
      description: (d.description || "").slice(0, 100),
    })) : [];

    // Save to customer
    updateCustomer(customer.id, { imageDescriptions: descriptions });

    res.json({ descriptions });
  } catch (err) {
    console.error("Auto-tag error:", err.message);
    // Fail gracefully — return empty so pipeline handles it
    res.json({ descriptions: [] });
  }
});
```

- [ ] **Step 3: Verify the server starts**

Run: `cd /Users/douglassiteflow/dev/genflow && node -e "import('./server/routes/customers.js').then(() => console.log('OK')).catch(e => console.error(e.message))"`
Expected: "OK" or at least no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add server/routes/customers.js
git commit -m "feat: add auto-tag endpoint using Claude vision"
```

---

### Task 8: Wire up auto-tagging + queue logic in wizard

**Files:**
- Modify: `ui/src/pages/ConfigureWizard.tsx` — main wizard component + StepGenerate

This is the final integration: trigger auto-tag on leaving step 1, pass `taggingDone` to StepGenerate, queue generation.

- [ ] **Step 1: Add imports and state**

Add `autoTagImages` to the import from `api.ts`:

```tsx
import {
  getCustomer,
  updateCustomer,
  scrape,
  processLogo,
  generate,
  autoTagImages,
  imageUrl,
  type Customer,
} from "@/lib/api";
```

In the main `ConfigureWizard` component, after the existing state declarations, add:

```tsx
const [taggingDone, setTaggingDone] = useState(false);
```

- [ ] **Step 2: Create handleNext function with auto-tag trigger**

In the main `ConfigureWizard` component, before the `canNext` function, add:

```tsx
const handleNext = () => {
  const nextStep = Math.min(4, step + 1);
  if (step === 1 && selectedImages.size > 0) {
    // Trigger AI auto-tagging in background
    setTaggingDone(false);
    autoTagImages(customer.id, [...selectedImages])
      .then(() => setTaggingDone(true))
      .catch(() => setTaggingDone(true)); // Fail gracefully
  }
  setStep(nextStep);
};
```

- [ ] **Step 3: Update navigation to use handleNext**

Replace the "Nästa" button's `onClick`:

```tsx
// FROM:
onClick={() => setStep((s) => Math.min(4, s + 1))}

// TO:
onClick={handleNext}
```

Also update the "Bakåt" button — it should stay as direct `setStep`:

```tsx
onClick={() => setStep((s) => Math.max(0, s - 1))}
```

- [ ] **Step 4: Update StepGenerate to accept taggingDone prop**

Replace the `StepGenerate` component:

```tsx
function StepGenerate({
  customer,
  selectedImages,
  selectedServices,
  taggingDone,
}: {
  customer: Customer;
  selectedImages: string[];
  selectedServices: number[];
  taggingDone: boolean;
}) {
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (!taggingDone || started.current) return;
    started.current = true;

    (async () => {
      try {
        await generate(customer.slug, selectedImages, selectedServices, customer.id);
        navigate(`/customer/${customer.id}`);
      } catch {
        navigate(`/customer/${customer.id}`);
      }
    })();
  }, [taggingDone, customer, selectedImages, selectedServices, navigate]);

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <Loader2 className="w-10 h-10 text-violet animate-spin" />
      <p className="text-sm text-muted-foreground">
        {taggingDone ? "Startar generering..." : "Förbereder bilder..."}
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Pass taggingDone to StepGenerate in JSX**

Update the step 4 rendering:

```tsx
{step === 4 && (
  <StepGenerate
    customer={customer}
    selectedImages={[...selectedImages]}
    selectedServices={[...selectedServices]}
    taggingDone={taggingDone}
  />
)}
```

- [ ] **Step 6: Verify the build compiles**

Run: `cd /Users/douglassiteflow/dev/genflow/ui && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add ui/src/pages/ConfigureWizard.tsx
git commit -m "feat: wire auto-tagging + queue logic in wizard"
```

---

### Task 9: Manual smoke test

- [ ] **Step 1: Start the server**

Run: `cd /Users/douglassiteflow/dev/genflow && npm start`

- [ ] **Step 2: Verify wizard flow**

Open UI, navigate to a customer in "booked" status, click "Configure Demo":

1. Step 1 (Hämta data): Auto-scrapes, shows "Data hämtad!" with image count
2. Step 2 (Välj innehåll): Images and services start **empty**. "Välj alla/Avmarkera" buttons work. Grid shows 4 columns. Next button says "Välj minst en bild" when disabled.
3. Step 3 (Välj logo): Larger image grid, clear instructions
4. Step 4 (Färger): Palette editor, instructions say "Ändra om du vill, eller gå vidare"
5. Click "Skapa hemsida" → Step 5: Shows "Förbereder bilder..." then "Startar generering..." → redirects

- [ ] **Step 3: Verify no "Hoppa över" buttons exist in any step**

- [ ] **Step 4: Final commit if any fixes needed**
