import React, { useState, useRef, useEffect, useCallback } from "react";
import { loadConfig, saveConfig, GenFlowConfig } from "./config";
import { startPolling, stopPolling, isPolling } from "./worker";

interface LogEntry {
  time: string;
  msg: string;
  type: "info" | "success" | "error";
}

function formatTime(): string {
  return new Date().toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function App() {
  const [config, setConfig] = useState<GenFlowConfig>(loadConfig);
  const [running, setRunning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [completed, setCompleted] = useState(0);
  const [failed, setFailed] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  const log = useCallback((msg: string) => {
    let type: LogEntry["type"] = "info";
    if (msg.includes("Klar:") || msg.includes("✓")) type = "success";
    else if (msg.includes("Misslyckades:") || msg.includes("✗")) type = "error";

    setLogs((prev) => [...prev.slice(-200), { time: formatTime(), msg, type }]);
    if (type === "success") setCompleted((c) => c + 1);
    if (type === "error") setFailed((f) => f + 1);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const handleToggle = () => {
    if (running) {
      stopPolling(log);
      setRunning(false);
    } else {
      saveConfig(config);
      startPolling(config, log, () => {});
      setRunning(true);
    }
  };

  const updateConfig = (field: keyof GenFlowConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="app">
      {/* Header — centered */}
      <div className="header">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
          <img src="./icon.png" alt="Genflow" className="logo" />
          <div className="header-text">
            <h1>Genflow</h1>
            <div className="sub">Lokal genereringsserver</div>
          </div>
          <div className={`status-pill ${running ? "online" : "offline"}`}>
            <span className="dot" />
            {running ? "Ansluten" : "Frånkopplad"}
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Settings toggle */}
      <button
        className="settings-toggle"
        onClick={() => setSettingsOpen(!settingsOpen)}
      >
        <span>Inställningar</span>
        <span>{settingsOpen ? "▲" : "▼"}</span>
      </button>

      {/* Settings panel */}
      <div className={`settings ${settingsOpen ? "expanded" : "collapsed"}`}>
        <div className="field">
          <label>Backend URL</label>
          <input
            value={config.backendUrl}
            onChange={(e) => updateConfig("backendUrl", e.target.value)}
            disabled={running}
          />
        </div>
        <div className="field">
          <label>API-nyckel</label>
          <input
            value={config.apiKey}
            onChange={(e) => updateConfig("apiKey", e.target.value)}
            disabled={running}
            type="password"
          />
        </div>
        <div className="field">
          <label>Flowing AI URL</label>
          <input
            value={config.flowingAiUrl}
            onChange={(e) => updateConfig("flowingAiUrl", e.target.value)}
            disabled={running}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="controls">
        <button
          className={`btn-main ${running ? "btn-stop" : "btn-start"}`}
          onClick={handleToggle}
        >
          {running ? "Stoppa" : "Starta"}
        </button>
      </div>

      {/* Stats */}
      <div className="stats">
        <div className="stat success">
          <span>Genomförda</span>
          <span className="count">{completed}</span>
        </div>
        <div className="stat fail">
          <span>Misslyckade</span>
          <span className="count">{failed}</span>
        </div>
      </div>

      {/* Log panel */}
      <div className="log-panel" ref={logRef}>
        {logs.length === 0 && (
          <div className="empty-log">Klicka Starta för att börja...</div>
        )}
        {logs.map((entry, i) => (
          <div key={i} className={`log-line ${entry.type}`}>
            <span className="timestamp">{entry.time}</span>
            {entry.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
