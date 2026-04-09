import { GenFlowConfig } from "./config";

export interface GenJob {
  id: string;
  source_url: string;
  slug: string;
  status: string;
  deal_id: string | null;
  demo_config_id: string | null;
}

export type LogFn = (msg: string) => void;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let processing = false;

export function startPolling(
  config: GenFlowConfig,
  log: LogFn,
  onJobUpdate: () => void
) {
  if (pollTimer) return;
  log("Polling startat...");
  pollTimer = setInterval(
    () => pollOnce(config, log, onJobUpdate),
    config.pollInterval
  );
}

export function stopPolling(log: LogFn) {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  log("Polling stoppat.");
}

export function isPolling() {
  return pollTimer !== null;
}

async function pollOnce(
  config: GenFlowConfig,
  log: LogFn,
  onJobUpdate: () => void
) {
  if (processing) return;

  try {
    const res = await fetch(`${config.backendUrl}/api/gen-jobs/pending`, {
      headers: { "X-GenFlow-Key": config.apiKey },
    });
    const data = await res.json();
    if (!data.job) return;

    processing = true;
    const job = data.job as GenJob;
    log(`Nytt jobb: ${job.slug} (${job.source_url})`);

    // Pick the job
    await fetch(`${config.backendUrl}/api/gen-jobs/${job.id}/pick`, {
      method: "POST",
      headers: { "X-GenFlow-Key": config.apiKey },
    });

    try {
      const resultUrl = await processJob(job, config, log);

      // Complete
      await fetch(`${config.backendUrl}/api/gen-jobs/${job.id}/complete`, {
        method: "POST",
        headers: {
          "X-GenFlow-Key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ result_url: resultUrl }),
      });
      log(`Klar: ${job.slug} -> ${resultUrl}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      await fetch(`${config.backendUrl}/api/gen-jobs/${job.id}/fail`, {
        method: "POST",
        headers: {
          "X-GenFlow-Key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: errorMsg }),
      });
      log(`Misslyckades: ${job.slug} -- ${errorMsg}`);
    }

    onJobUpdate();
  } catch {
    // Network error -- silent, will retry
  } finally {
    processing = false;
  }
}

async function processJob(
  job: GenJob,
  config: GenFlowConfig,
  log: LogFn
): Promise<string> {
  // Step 1: Scrape
  log(`  Scrapar ${job.source_url}...`);
  const scrapeRes = await fetch(`${config.flowingAiUrl}/api/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: job.source_url }),
  });
  if (!scrapeRes.ok) throw new Error(`Scrape misslyckades (${scrapeRes.status})`);
  const scrapeData = await scrapeRes.json();

  // Use slug from scrape response (Flowing AI generates its own slug)
  const slug = scrapeData.slug || job.slug;
  log(`  Slug från scrape: ${slug}`);

  // Step 2: Generate
  // ALWAYS use stock images — empty selectedImages triggers Unsplash fallback.
  // Customer photos from scrape are intentionally ignored (they look worse).
  log(`  Genererar hemsida...`);
  const scraped = scrapeData.data || scrapeData;
  const genRes = await fetch(`${config.flowingAiUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug,
      selectedImages: [],
      selectedServices: scraped.services || scraped.selectedServices || [],
    }),
  });
  if (!genRes.ok) {
    const errText = await genRes.text().catch(() => "");
    throw new Error(`Generering misslyckades (${genRes.status}): ${errText.slice(0, 200)}`);
  }

  // Step 2b: Poll generation status (async job, max 25 min)
  // 25 min = build (~8 min) + review (~3 min) + image verifier (~2 min x 3 retries) + buffer
  log(`  Väntar på generering...`);
  const maxPolls = 300; // 25 min at 5s interval
  let done = false;
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const statusRes = await fetch(`${config.flowingAiUrl}/api/generate/${slug}/status`);
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    if (statusData.status === "done" || statusData.status === "complete" || statusData.status === "ready") {
      log(`  ✓ Generering klar`);
      done = true;
      break;
    }
    if (statusData.status === "error" || statusData.error) {
      throw new Error(`Generering fel: ${statusData.error || "unknown"}`);
    }
    if (i % 6 === 0) log(`  Genererar... (${(i + 1) * 5}s)`);
  }
  if (!done) throw new Error("Generering timeout efter 25 min");

  // Step 3: Deploy
  log(`  Deployar...`);
  const deployRes = await fetch(`${config.flowingAiUrl}/api/deploy/${slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "",
  });
  if (!deployRes.ok) {
    const errText = await deployRes.text().catch(() => "");
    throw new Error(`Deploy misslyckades (${deployRes.status}): ${errText.slice(0, 200)}`);
  }
  const deployData = await deployRes.json();

  return deployData.url || `https://${slug}.vercel.app`;
}
