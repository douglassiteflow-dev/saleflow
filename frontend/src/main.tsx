import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../tailwind.css";

function App() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-[var(--color-text-secondary)]">SaleFlow — loading…</p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
