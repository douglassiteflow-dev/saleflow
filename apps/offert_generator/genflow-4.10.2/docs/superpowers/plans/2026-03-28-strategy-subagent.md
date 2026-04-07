# Strategy Subagent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pre-generation Claude subagent that reasons about service/image volume and produces a `strategy.json` to guide the main website builder.

**Architecture:** A new `runStrategy()` function in `claude-runner.js` spawns a separate Claude process (max 3 turns, JSON output) before the main `runPipeline()`. The strategy prompt template lives in `pipeline/strategy-prompt.md`. The resulting `strategy.json` is injected into the existing brief via a `$STRATEGY` placeholder.

**Tech Stack:** Node.js (spawn), Claude CLI (`--output-format json --max-turns 3`), Markdown templates

**Spec:** `docs/superpowers/specs/2026-03-28-strategy-subagent-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `pipeline/strategy-prompt.md` | Prompt template for strategy subagent — rules for reasoning about services and images |
| Modify | `server/lib/claude-runner.js` | Add `runStrategy()` function, update `runPipeline()` to inject `$STRATEGY` |
| Modify | `server/routes/generate.js` | Call `runStrategy()` before `runPipeline()` |
| Modify | `pipeline/brief.md` | Add `$STRATEGY` section, update Step 4 with strategy-following instructions |

---

### Task 1: Create the strategy prompt template

**Files:**
- Create: `pipeline/strategy-prompt.md`

- [ ] **Step 1: Write the strategy prompt template**

```markdown
# Content Strategy Analysis

You are a content strategist for a web agency. Analyze the following business data and make decisions about how to present services and images on the website.

## Business Data
$BUSINESS_DATA

## Selected Services ($SERVICE_COUNT total, in $CATEGORY_COUNT categories)
$SERVICES

## Selected Images ($IMAGE_COUNT total)
$IMAGE_DESCRIPTIONS

## Your Task

Analyze the volume and type of content, then produce a strategy. Think carefully:

### Services
- The services are listed in bokadirekt popularity order (most booked first).
- If there are many services (more than ~10), select the most representative ones for the main page ("featured"). Pick the top services per category so all categories are represented.
- Decide if remaining services should be on a separate `services.html` page or an expand/toggle section:
  - ~15 or fewer total services → expand (toggle "Visa fler" in the same page) is sufficient
  - More than ~15 total services → a separate `services.html` page is better
- Determine the best category display order based on what best represents this business.

### Images
Choose a layout type for each section based on how many images fit that section. Available layout types:
- `"single"` — 1 image, full width
- `"asymmetric-pair"` — 2 images, different sizes (visually interesting)
- `"grid-even"` — 3-4 images in an even grid (MUST be even — never 3 in a 2-column grid)
- `"carousel"` — 5+ images in a slider/carousel

Rules:
- NEVER create uneven grids. If the number of images doesn't fit an even grid, use carousel instead.
- Assign images to sections based on their category tags:
  - `lokal` → hero section and/or about section
  - `personal` → team section
  - `arbete` → gallery/portfolio section
  - `produkt` → services section or gallery
- Pick the single best `lokal` image for the hero.

## Output Format

Respond with ONLY valid JSON, no other text:

```json
{
  "reasoning": "Your analysis and motivation for the decisions (2-4 sentences)",
  "services": {
    "total": <number>,
    "featuredCount": <number>,
    "featured": [
      {"namn": "<service name>", "kategori": "<category>", "reason": "<why featured>"}
    ],
    "separatePage": <true/false>,
    "pageType": "<services.html or expand>",
    "categoryOrder": ["<category1>", "<category2>"]
  },
  "images": {
    "total": <number>,
    "hero": {"file": "<filename>", "reason": "<why this image>"},
    "sections": {
      "team": {"files": ["<filename>"], "layout": "<layout-type>"},
      "gallery": {"files": ["<filename>"], "layout": "<layout-type>", "reason": "<motivation>"},
      "about": {"files": ["<filename>"], "layout": "<layout-type>"}
    }
  }
}
```

Only include sections that have images assigned to them. If no images match a category, omit that section.
```

- [ ] **Step 2: Verify the file was created**

Run: `cat pipeline/strategy-prompt.md | head -5`
Expected: First lines of the prompt template visible.

- [ ] **Step 3: Commit**

```bash
git add pipeline/strategy-prompt.md
git commit -m "feat: add strategy prompt template for content reasoning subagent"
```

---

### Task 2: Add `runStrategy()` function to claude-runner.js

**Files:**
- Modify: `server/lib/claude-runner.js:1-14` (imports and constants)
- Modify: `server/lib/claude-runner.js` (add new function before `runPipeline`)

- [ ] **Step 1: Add the strategy prompt template path constant**

In `server/lib/claude-runner.js`, after line 11 (`const BRIEF_TEMPLATE = ...`), add:

```javascript
const STRATEGY_TEMPLATE = join(RESOURCES, "pipeline/strategy-prompt.md");
```

- [ ] **Step 2: Add the `runStrategy()` function**

In `server/lib/claude-runner.js`, after line 14 (`export const pipelineEvents = ...`) and before the `runPipeline` function, add:

```javascript
export function runStrategy(slug, selectedImages, filteredServices, outputDir, customer = null) {
  return new Promise((resolve, reject) => {
    const logPath = join(outputDir, "pipeline.log");
    const log = (msg) => {
      const line = `[${new Date().toLocaleTimeString("sv-SE")}] ${msg}\n`;
      appendFileSync(logPath, line);
      pipelineEvents.emit(slug, line);
    };

    log("Strategisk analys startad...");

    // Read business data
    const dataPath = join(outputDir, "företagsdata.json");
    let businessData = "{}";
    if (existsSync(dataPath)) {
      businessData = readFileSync(dataPath, "utf-8");
    }

    // Build services list
    const services = (filteredServices || []);
    const serviceList = services.map(s => `- [${s.kategori}] ${s.namn} (${s.pris_kr || "?"} kr, ${s.tid_min} min)`).join("\n");
    const categories = [...new Set(services.map(s => s.kategori))];

    // Build image descriptions
    const imageDescriptions = (customer?.imageDescriptions || []).length > 0
      ? customer.imageDescriptions.map(d => `- ${d.filename} [${d.category}]: ${d.description}`).join("\n")
      : selectedImages.map(img => `- ${img} [okategoriserad]: Ingen beskrivning`).join("\n");

    // Fill template
    const template = readFileSync(STRATEGY_TEMPLATE, "utf-8");
    const prompt = template
      .replace("$BUSINESS_DATA", businessData.slice(0, 2000))
      .replace("$SERVICE_COUNT", String(services.length))
      .replace("$CATEGORY_COUNT", String(categories.length))
      .replace("$SERVICES", serviceList || "Inga tjänster valda")
      .replace("$IMAGE_COUNT", String(selectedImages.length))
      .replace("$IMAGE_DESCRIPTIONS", imageDescriptions || "Inga bilder valda");

    const proc = spawn(CLAUDE_BIN, [
      "-p", prompt,
      "--output-format", "json",
      "--max-turns", "3",
    ], {
      env: process.env,
      cwd: outputDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", d => { stdout += d.toString(); });
    proc.stderr.on("data", d => { stderr += d.toString(); });

    proc.on("error", (err) => {
      log(`Strategifel (spawn): ${err.message}`);
      reject(err);
    });

    proc.on("close", code => {
      if (code !== 0) {
        const errMsg = (stderr || stdout).slice(0, 300);
        log(`Strategifel: ${errMsg}`);
        reject(new Error(errMsg));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        const text = parsed.result || parsed.content || stdout;
        const match = typeof text === "string" ? text.match(/\{[\s\S]*\}/) : null;
        const strategy = match ? JSON.parse(match[0]) : JSON.parse(text);

        const strategyPath = join(outputDir, "strategy.json");
        writeFileSync(strategyPath, JSON.stringify(strategy, null, 2));

        log(`Strategisk analys klar — ${strategy.services?.featuredCount || "?"} featured tjänster, ${strategy.images?.total || "?"} bilder planerade`);
        resolve(strategy);
      } catch (e) {
        log(`Strategifel (parse): ${e.message}`);
        reject(new Error("Failed to parse strategy: " + e.message));
      }
    });
  });
}
```

- [ ] **Step 3: Verify syntax**

Run: `node -c server/lib/claude-runner.js`
Expected: No syntax errors.

- [ ] **Step 4: Commit**

```bash
git add server/lib/claude-runner.js
git commit -m "feat: add runStrategy() function for content reasoning subagent"
```

---

### Task 3: Update `runPipeline()` to inject strategy into brief

**Files:**
- Modify: `server/lib/claude-runner.js:35-41` (the brief template substitution block)

- [ ] **Step 1: Add strategy injection to `runPipeline()`**

In `server/lib/claude-runner.js`, inside `runPipeline()`, after line 39 (the `imageDescriptions` block) and before line 41 (where `const brief = template...`), add:

```javascript
    // Read strategy if available
    const strategyPath = join(outputDir, "strategy.json");
    let strategyContent = "Ingen strategi tillgänglig — använd eget omdöme för layout och tjänsteurval.";
    if (existsSync(strategyPath)) {
      try {
        strategyContent = readFileSync(strategyPath, "utf-8");
      } catch {
        // Keep fallback
      }
    }
```

Then add `.replace("$STRATEGY", strategyContent)` to the brief substitution chain. The updated chain becomes:

```javascript
    const brief = template
      .replaceAll("$OUTPUT_DIR", outputDir)
      .replace("$LOGO_URL", logoUrl)
      .replace("$COLOR_PALETTE", colorPalette)
      .replace("$IMAGE_DESCRIPTIONS", imageDescriptions)
      .replace("$SELECTED_IMAGES", imageList)
      .replace("$SELECTED_SERVICES", serviceList || "Alla tjänster från företagsdata.json")
      .replace("$STRATEGY", strategyContent);
```

- [ ] **Step 2: Verify syntax**

Run: `node -c server/lib/claude-runner.js`
Expected: No syntax errors.

- [ ] **Step 3: Commit**

```bash
git add server/lib/claude-runner.js
git commit -m "feat: inject strategy.json into brief template via \$STRATEGY placeholder"
```

---

### Task 4: Update brief template with strategy section and instructions

**Files:**
- Modify: `pipeline/brief.md`

- [ ] **Step 1: Add Content Strategy section to brief**

In `pipeline/brief.md`, after the `## Selected Services` section (after line 25 `$SELECTED_SERVICES`) and before `## Instructions`, add:

```markdown

## Content Strategy
The following strategy was produced by a pre-analysis step. Follow it EXACTLY — do not override these decisions:
$STRATEGY
```

- [ ] **Step 2: Update Step 4 (Build Website) with strategy-following instructions**

In `pipeline/brief.md`, in Step 4, after the line `- Be visually distinctive — avoid generic AI aesthetics` (line 64), add:

```markdown
- Follow the content strategy EXACTLY:
  - Show ONLY the featured services on the main page — do not include any others
  - Use the specified layout type for each image section (single, asymmetric-pair, grid-even, carousel)
  - If separatePage is true and pageType is "services.html", create a separate `$OUTPUT_DIR/site/services.html` with ALL services, in the same design and theme as index.html. Add a "Se alla våra tjänster" button on the main page linking to services.html.
  - If pageType is "expand", include all services in index.html but hide non-featured ones behind a "Visa fler" button with smooth JavaScript toggle animation
  - NEVER create uneven grids — if images don't fit evenly, use a carousel/slider instead
  - Place the hero image specified in the strategy
  - Follow the categoryOrder for service section ordering
```

- [ ] **Step 3: Verify the brief has no broken placeholders**

Run: `grep -c '\$' pipeline/brief.md`
Expected: Count of `$` signs matches expected placeholders (OUTPUT_DIR appears multiple times, plus LOGO_URL, COLOR_PALETTE, IMAGE_DESCRIPTIONS, SELECTED_IMAGES, SELECTED_SERVICES, STRATEGY).

- [ ] **Step 4: Commit**

```bash
git add pipeline/brief.md
git commit -m "feat: add content strategy section and layout instructions to brief template"
```

---

### Task 5: Wire up strategy in generate route

**Files:**
- Modify: `server/routes/generate.js:1-6` (imports)
- Modify: `server/routes/generate.js:46-54` (pipeline execution block)

- [ ] **Step 1: Add `runStrategy` to imports**

In `server/routes/generate.js`, line 5, update the import:

```javascript
import { runPipeline, runStrategy, pipelineEvents } from "../lib/claude-runner.js";
```

- [ ] **Step 2: Add strategy call before pipeline**

In `server/routes/generate.js`, replace the try block (lines 46-54):

```javascript
  try {
    // Pass customer data to pipeline for logo/palette/descriptions
    const customer = customerId ? getCustomer(customerId) : null;

    // Run strategy subagent first
    try {
      await runStrategy(slug, selectedImages, filteredServices, outputDir, customer);
    } catch (strategyErr) {
      console.warn("Strategy subagent failed, continuing without strategy:", strategyErr.message);
      // Pipeline will use fallback text for $STRATEGY
    }

    await runPipeline(slug, selectedImages, filteredServices, outputDir, customer);
    // Update customer status if linked
    if (customerId) updateCustomer(customerId, { status: "generated" });
    const store = read();
    const p = store.projects.find(p => p.slug === slug);
    if (p) { p.status = "done"; write(store); }
  } catch (err) {
    console.error("Pipeline error:", err.message);
    const store = read();
    const p = store.projects.find(p => p.slug === slug);
    if (p) { p.status = "error"; p.error = err.message; write(store); }
  }
```

- [ ] **Step 3: Verify syntax**

Run: `node -c server/routes/generate.js`
Expected: No syntax errors.

- [ ] **Step 4: Commit**

```bash
git add server/routes/generate.js
git commit -m "feat: wire strategy subagent into generate route with graceful fallback"
```

---

### Task 6: End-to-end smoke test

- [ ] **Step 1: Start the server**

Run: `node bin/genflow.js`
Expected: Server starts on port 1337 without errors.

- [ ] **Step 2: Test with existing output data**

Use the existing `output/o-viks-halsa-i-balans-37148/` as test data. Trigger a generation via the UI or curl:

```bash
curl -X POST http://localhost:1337/api/generate \
  -H "Content-Type: application/json" \
  -d '{"slug": "o-viks-halsa-i-balans-37148", "selectedImages": ["-_21.jpg"], "selectedServices": [0,1,2]}'
```

Expected: Pipeline log shows "Strategisk analys startad..." followed by "Strategisk analys klar" before the main generation begins.

- [ ] **Step 3: Verify strategy.json was created**

Run: `cat output/o-viks-halsa-i-balans-37148/strategy.json | head -20`
Expected: Valid JSON with `reasoning`, `services`, and `images` fields.

- [ ] **Step 4: Verify brief includes strategy**

Run: `grep "Content Strategy" output/o-viks-halsa-i-balans-37148/brief.md`
Expected: The "Content Strategy" section exists with filled-in strategy JSON.

- [ ] **Step 5: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: adjustments from smoke test"
```
