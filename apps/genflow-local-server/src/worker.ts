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

  // Step 2: Generate
  log(`  Genererar hemsida...`);
  const genRes = await fetch(`${config.flowingAiUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: job.slug,
      selectedImages: scrapeData.images || [],
      selectedServices: scrapeData.services || [],
    }),
  });
  if (!genRes.ok) throw new Error(`Generering misslyckades (${genRes.status})`);

  // Step 3: Deploy
  log(`  Deployar...`);
  const deployRes = await fetch(`${config.flowingAiUrl}/api/deploy/${job.slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "",
  });
  if (!deployRes.ok) throw new Error(`Deploy misslyckades (${deployRes.status})`);
  const deployData = await deployRes.json();

  return deployData.url || `https://${job.slug}.vercel.app`;
}
