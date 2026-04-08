import fs from "fs";
import path from "path";
import os from "os";

export interface GenFlowConfig {
  backendUrl: string;
  apiKey: string;
  flowingAiUrl: string;
  pollInterval: number;
}

const CONFIG_DIR = path.join(os.homedir(), ".genflow");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const DEFAULTS: GenFlowConfig = {
  backendUrl: "https://sale.siteflow.se",
  apiKey: "",
  flowingAiUrl: "http://localhost:1337",
  pollInterval: 5000,
};

export function loadConfig(): GenFlowConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      return { ...DEFAULTS, ...data };
    }
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

export function saveConfig(config: GenFlowConfig): void {
  if (!fs.existsSync(CONFIG_DIR))
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
