# SaleFlow Frontend Core — Implementation Plan (2A of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React frontend with design system, auth, layout, dashboard, and customer card — the complete sales agent workflow.

**Architecture:** Vite + React 19 SPA. shadcn/ui components customized with strict design tokens. TanStack Query for server state. React Router for navigation. API client with session cookie auth against Phoenix backend on port 4000.

**Tech Stack:** React 19, TypeScript strict, Vite 6, shadcn/ui, Tailwind CSS v4, TanStack Query v5, React Router v7, Vitest, Playwright

---

## File Structure

```
frontend/
├── src/
│   ├── main.tsx                    # App entry point
│   ├── app.tsx                     # Router + providers
│   ├── design/
│   │   └── tokens.ts               # All design tokens (spacing, colors, typography)
│   ├── api/
│   │   ├── client.ts               # fetch wrapper with credentials
│   │   ├── types.ts                # All API response types
│   │   ├── auth.ts                 # Auth API hooks (useLogin, useLogout, useMe)
│   │   ├── leads.ts                # Lead API hooks (useNextLead, useLeadDetail, useOutcome)
│   │   └── meetings.ts             # Meeting API hooks
│   ├── components/
│   │   ├── ui/                     # shadcn components (button, input, card, badge, table)
│   │   ├── layout.tsx              # Sidebar + topbar + content wrapper
│   │   ├── sidebar.tsx             # Navigation sidebar
│   │   ├── topbar.tsx              # Top bar with user info
│   │   ├── stat-card.tsx           # Stats display card
│   │   ├── lead-info.tsx           # Company info display (left column of card)
│   │   ├── outcome-panel.tsx       # Outcome buttons + notes + callback picker
│   │   ├── history-timeline.tsx    # Call/audit log timeline
│   │   └── protected-route.tsx     # Auth guard wrapper
│   ├── pages/
│   │   ├── login.tsx               # Login page
│   │   ├── dashboard.tsx           # Stats overview (no dialer)
│   │   ├── dialer.tsx              # Dialer view — next lead + customer card + outcomes
│   │   └── lead-detail.tsx         # Read-only lead detail (from history click)
│   └── lib/
│       ├── format.ts               # Phone/date/currency formatters
│       └── cn.ts                   # shadcn className util
├── index.html
├── tailwind.css                    # Tailwind v4 global styles + design system
├── vite.config.ts
├── tsconfig.json
└── package.json

> **Note:** No `components.json` — shadcn components are hand-rolled to avoid CLI dependency on components.json.
```

---

### Task 1: Scaffold Vite + React project

**Files:**
- Create: `frontend/` (entire project)

- [ ] **Step 1: Create Vite project**

```bash
cd ~/dev/saleflow
npm create vite@latest frontend -- --template react-ts
cd frontend
```

- [ ] **Step 2: Install dependencies**

```bash
cd ~/dev/saleflow/frontend
npm install @tanstack/react-query react-router-dom
npm install -D tailwindcss @tailwindcss/vite
npm install class-variance-authority clsx tailwind-merge lucide-react
```

- [ ] **Step 3: Configure Vite with Tailwind and proxy**

Replace `frontend/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 4: Configure TypeScript strict**

Replace `frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Verify it builds**

```bash
cd ~/dev/saleflow/frontend
npm run build
```

Expected: build succeeds

- [ ] **Step 6: Commit**

```bash
cd ~/dev/saleflow
git add frontend/
git commit -m "feat: scaffold frontend with Vite + React + Tailwind + TanStack Query"
```

---

### Task 2: Design system — Tailwind config + tokens + shadcn setup

**Files:**
- Create: `frontend/src/design/tokens.ts`
- Create: `frontend/tailwind.css`
- Create: `frontend/src/lib/cn.ts`
- Create: `frontend/src/components/ui/button.tsx`
- Create: `frontend/src/components/ui/input.tsx`
- Create: `frontend/src/components/ui/card.tsx`
- Create: `frontend/src/components/ui/badge.tsx`

- [ ] **Step 1: Create design tokens**

Create `frontend/src/design/tokens.ts`:

```typescript
// SaleFlow Design System — Single Source of Truth
// Every visual value in the app MUST come from here.

export const colors = {
  bg: {
    primary: "#FFFFFF",
    panel: "#F8FAFC",    // slate-50
  },
  text: {
    primary: "#0F172A",  // slate-900
    secondary: "#64748B", // slate-500
    inverse: "#FFFFFF",
  },
  accent: {
    primary: "#4F46E5",  // indigo-600
    primaryHover: "#4338CA", // indigo-700
  },
  status: {
    success: "#059669",  // emerald-600
    warning: "#F59E0B",  // amber-500
    danger: "#DC2626",   // rose-600
  },
  border: {
    default: "#E2E8F0",  // slate-200
    input: "#CBD5E1",    // slate-300
  },
  outcome: {
    meeting_booked: "#059669",  // emerald-600
    callback: "#F59E0B",        // amber-500
    not_interested: "#DC2626",  // rose-600
    no_answer: "#64748B",       // slate-500
    bad_number: "#1E293B",      // slate-800
    customer: "#4F46E5",        // indigo-600
  },
} as const;

export const spacing = {
  page: "24px",
  card: "20px",
  section: "24px",
  element: "12px",
  buttonX: "16px",
  buttonY: "10px",
  inputX: "12px",
  inputY: "8px",
} as const;

export const typography = {
  fontFamily: {
    sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },
  pageTitle: { size: "24px", weight: "600" },
  sectionTitle: { size: "18px", weight: "600" },
  body: { size: "14px", weight: "400" },
  label: { size: "12px", weight: "500", transform: "uppercase" as const, tracking: "0.05em" },
  mono: { size: "13px", weight: "400" },
} as const;

export const layout = {
  maxWidth: "1280px",
  sidebarWidth: "240px",
  topbarHeight: "56px",
} as const;

export const radii = {
  card: "8px",    // rounded-lg
  button: "6px",  // rounded-md
  input: "6px",   // rounded-md
  badge: "9999px", // rounded-full
} as const;
```

- [ ] **Step 2: Create Tailwind global styles**

Create `frontend/tailwind.css`:

```css
@import "tailwindcss";

@theme inline {
  --font-sans: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  --color-bg-primary: #FFFFFF;
  --color-bg-panel: #F8FAFC;
  --color-text-primary: #0F172A;
  --color-text-secondary: #64748B;
  --color-accent: #4F46E5;
  --color-accent-hover: #4338CA;
  --color-success: #059669;
  --color-warning: #F59E0B;
  --color-danger: #DC2626;
  --color-border: #E2E8F0;
  --color-border-input: #CBD5E1;

  --spacing-page: 24px;
  --spacing-card: 20px;
  --spacing-section: 24px;
  --spacing-element: 12px;
  --spacing-button-x: 16px;
  --spacing-button-y: 10px;
  --spacing-input-x: 12px;
  --spacing-input-y: 8px;
}

@layer base {
  * {
    border-color: var(--color-border);
  }

  body {
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--color-text-primary);
    background: var(--color-bg-panel);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
}
```

- [ ] **Step 3: Create cn utility**

Create `frontend/src/lib/cn.ts`:

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Create shadcn Button component**

Create `frontend/src/components/ui/button.tsx`:

```typescript
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "danger" | "outcome";
type ButtonSize = "default" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]",
  secondary: "bg-white border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-panel)]",
  danger: "bg-[var(--color-danger)] text-white hover:bg-red-700",
  outcome: "border-2 font-medium",
};

const sizeStyles: Record<ButtonSize, string> = {
  default: "h-9 px-[var(--spacing-button-x)] py-[var(--spacing-button-y)]",
  lg: "h-12 px-6 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
        "disabled:pointer-events-none disabled:opacity-50",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
```

- [ ] **Step 5: Create Input component**

Create `frontend/src/components/ui/input.tsx`:

```typescript
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-[var(--color-border-input)] bg-white",
        "px-[var(--spacing-input-x)] py-[var(--spacing-input-y)] text-sm",
        "placeholder:text-[var(--color-text-secondary)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
```

- [ ] **Step 6: Create Card component**

Create `frontend/src/components/ui/card.tsx`:

```typescript
import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--color-border)] bg-white p-[var(--spacing-card)]",
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-lg font-semibold text-[var(--color-text-primary)]", className)}
      {...props}
    />
  );
}
```

- [ ] **Step 7: Create Badge component**

Create `frontend/src/components/ui/badge.tsx`:

```typescript
import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  assigned: "bg-yellow-100 text-yellow-800",
  callback: "bg-amber-100 text-amber-800",
  meeting_booked: "bg-emerald-100 text-emerald-800",
  quarantine: "bg-red-100 text-red-800",
  bad_number: "bg-slate-100 text-slate-800",
  customer: "bg-indigo-100 text-indigo-800",
  scheduled: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: string;
}

export function Badge({ status, className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        statusColors[status] ?? "bg-slate-100 text-slate-800",
        className
      )}
      {...props}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
```

- [ ] **Step 8: Update index.html and main entry**

Replace `frontend/index.html`:

```html
<!DOCTYPE html>
<html lang="sv">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SaleFlow</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Verify build**

```bash
cd ~/dev/saleflow/frontend
npm run build
```

- [ ] **Step 10: Commit**

```bash
cd ~/dev/saleflow
git add frontend/
git commit -m "feat: add design system tokens + shadcn UI components"
```

---

### Task 3: API client + types + auth hooks

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/types.ts`
- Create: `frontend/src/api/auth.ts`

- [ ] **Step 1: Create API types**

Create `frontend/src/api/types.ts`:

```typescript
export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "agent";
}

export interface Lead {
  id: string;
  företag: string;
  telefon: string;
  epost: string | null;
  hemsida: string | null;
  adress: string | null;
  postnummer: string | null;
  stad: string | null;
  bransch: string | null;
  orgnr: string | null;
  omsättning_tkr: string | null;
  vinst_tkr: string | null;
  anställda: string | null;
  vd_namn: string | null;
  bolagsform: string | null;
  status: LeadStatus;
  quarantine_until: string | null;
  callback_at: string | null;
  imported_at: string | null;
  inserted_at: string;
  updated_at: string;
}

export type LeadStatus =
  | "new"
  | "assigned"
  | "callback"
  | "meeting_booked"
  | "quarantine"
  | "bad_number"
  | "customer";

export type Outcome =
  | "meeting_booked"
  | "callback"
  | "not_interested"
  | "no_answer"
  | "bad_number"
  | "customer";

export interface CallLog {
  id: string;
  lead_id: string;
  user_id: string;
  outcome: Outcome;
  notes: string | null;
  called_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  changes: Record<string, { from: string; to: string }>;
  metadata: Record<string, string>;
  inserted_at: string;
}

export interface Meeting {
  id: string;
  lead_id: string;
  user_id: string;
  title: string;
  meeting_date: string;
  meeting_time: string;
  notes: string | null;
  status: "scheduled" | "completed" | "cancelled";
  inserted_at: string;
}

export interface Stats {
  new: number;
  assigned: number;
  meeting_booked: number;
  quarantine: number;
  customer: number;
  bad_number: number;
  calls_today: number;
  leads_remaining: number;
}

export interface ImportResult {
  created: number;
  skipped: number;
}
```

- [ ] **Step 2: Create API client**

Create `frontend/src/api/client.ts`:

```typescript
const BASE_URL = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown
  ) {
    super(`API error ${status}`);
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body);
  }

  return res.json();
}

export async function apiUpload<T>(
  path: string,
  formData: FormData
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body);
  }

  return res.json();
}
```

- [ ] **Step 3: Create auth hooks**

Create `frontend/src/api/auth.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";
import type { User } from "./types";

export function useMe() {
  return useQuery<User | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        const data = await api<{ user: User }>("/auth/me");
        return data.user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { email: string; password: string }) => {
      const data = await api<{ user: User }>("/auth/sign-in", {
        method: "POST",
        body: JSON.stringify(params),
      });
      return data.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["auth", "me"], user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api("/auth/sign-out", { method: "POST" });
    },
    onSuccess: () => {
      queryClient.setQueryData(["auth", "me"], null);
      queryClient.clear();
    },
  });
}
```

- [ ] **Step 4: Commit**

```bash
cd ~/dev/saleflow
git add frontend/
git commit -m "feat: add API client + types + auth hooks"
```

---

### Task 4: Lead + meeting API hooks

**Files:**
- Create: `frontend/src/api/leads.ts`
- Create: `frontend/src/api/meetings.ts`

- [ ] **Step 1: Create lead hooks**

Create `frontend/src/api/leads.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { Lead, CallLog, AuditLog, Outcome } from "./types";

export function useLeads(search?: string) {
  return useQuery({
    queryKey: ["leads", "list", search],
    queryFn: async () => {
      const params = search ? `?q=${encodeURIComponent(search)}` : "";
      const data = await api<{ leads: Lead[] }>(`/leads${params}`);
      return data.leads;
    },
  });
}

export function useLeadDetail(id: string) {
  return useQuery({
    queryKey: ["leads", "detail", id],
    queryFn: async () => {
      const data = await api<{
        lead: Lead;
        calls: CallLog[];
        audit_logs: AuditLog[];
      }>(`/leads/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useNextLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const data = await api<{ lead: Lead | null }>("/leads/next", {
        method: "POST",
      });
      return data.lead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads", "list"] });
    },
  });
}

export interface OutcomeParams {
  outcome: Outcome;
  notes?: string;
  callback_at?: string;
  title?: string;
  meeting_date?: string;
  meeting_time?: string;
  meeting_notes?: string;
}

export function useAdminStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const data = await api<{ stats: import("./types").Stats }>("/stats");
      return data.stats;
    },
    staleTime: 60 * 1000,
  });
}

export function useSubmitOutcome(leadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: OutcomeParams) => {
      await api(`/leads/${leadId}/outcome`, {
        method: "POST",
        body: JSON.stringify(params),
      });
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ["leads", "list"] });
      queryClient.invalidateQueries({ queryKey: ["leads", "detail", leadId] });
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}
```

- [ ] **Step 2: Create meeting hooks**

Create `frontend/src/api/meetings.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { Meeting } from "./types";

export function useMeetings() {
  return useQuery({
    queryKey: ["meetings"],
    queryFn: async () => {
      const data = await api<{ meetings: Meeting[] }>("/meetings");
      return data.meetings;
    },
  });
}

export function useCreateMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      lead_id: string;
      title: string;
      meeting_date: string;
      meeting_time: string;
      notes?: string;
    }) => {
      const data = await api<{ meeting: Meeting }>("/meetings", {
        method: "POST",
        body: JSON.stringify(params),
      });
      return data.meeting;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}

export function useCancelMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (meetingId: string) => {
      await api(`/meetings/${meetingId}/cancel`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
cd ~/dev/saleflow
git add frontend/
git commit -m "feat: add lead + meeting API hooks"
```

---

### Task 5: Layout + routing + protected routes

**Files:**
- Create: `frontend/src/components/layout.tsx`
- Create: `frontend/src/components/sidebar.tsx`
- Create: `frontend/src/components/topbar.tsx`
- Create: `frontend/src/components/protected-route.tsx`
- Create: `frontend/src/app.tsx`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Create Sidebar**

Create `frontend/src/components/sidebar.tsx`:

```typescript
import { NavLink } from "react-router-dom";
import { useMe } from "@/api/auth";
import { cn } from "@/lib/cn";

// Plan 2A routes: /dashboard, /dialer, /leads/:id
// Plan 2B routes (disabled until implemented): /meetings, /history, /admin/*
const agentLinks = [
  { to: "/dashboard", label: "Dashboard", enabled: true },
  { to: "/dialer", label: "Ringare", enabled: true },
  { to: "/meetings", label: "Möten", enabled: false },      // Plan 2B
  { to: "/history", label: "Historik", enabled: false },    // Plan 2B
];

const adminLinks = [
  { to: "/admin/users", label: "Användare", enabled: false },     // Plan 2B
  { to: "/admin/import", label: "Importera leads", enabled: false }, // Plan 2B
  { to: "/admin/stats", label: "Statistik", enabled: false },     // Plan 2B
];

export function Sidebar() {
  const { data: user } = useMe();

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 flex flex-col bg-[var(--color-bg-panel)] border-r border-[var(--color-border)]"
      style={{ width: "240px" }}
    >
      <div className="h-14 flex items-center px-[var(--spacing-card)] border-b border-[var(--color-border)]">
        <span className="text-lg font-semibold text-[var(--color-accent)]">SaleFlow</span>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        <div className="mb-4">
          <p className="px-3 mb-2 text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
            Säljare
          </p>
          {agentLinks.map((link) =>
            link.enabled ? (
              <SidebarLink key={link.to} to={link.to} label={link.label} />
            ) : (
              <SidebarLinkDisabled key={link.to} label={link.label} />
            )
          )}
        </div>

        {user?.role === "admin" && (
          <div>
            <p className="px-3 mb-2 text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
              Admin
            </p>
            {adminLinks.map((link) =>
              link.enabled ? (
                <SidebarLink key={link.to} to={link.to} label={link.label} />
              ) : (
                <SidebarLinkDisabled key={link.to} label={link.label} />
              )
            )}
          </div>
        )}
      </nav>
    </aside>
  );
}

function SidebarLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "block px-3 py-2 rounded-md text-sm font-medium transition-colors",
          isActive
            ? "bg-white text-[var(--color-accent)] border border-[var(--color-border)]"
            : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white"
        )
      }
    >
      {label}
    </NavLink>
  );
}

// Disabled stub for Plan 2B routes — not yet implemented
function SidebarLinkDisabled({ label }: { label: string }) {
  return (
    <span
      className="block px-3 py-2 rounded-md text-sm font-medium text-[var(--color-border-input)] cursor-not-allowed"
      title="Kommer i Plan 2B"
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Create Topbar**

Create `frontend/src/components/topbar.tsx`:

```typescript
import { useMe, useLogout } from "@/api/auth";
import { Button } from "@/components/ui/button";

export function Topbar() {
  const { data: user } = useMe();
  const logout = useLogout();

  return (
    <header
      className="fixed top-0 right-0 flex items-center justify-end gap-[var(--spacing-element)] bg-white border-b border-[var(--color-border)] px-[var(--spacing-page)]"
      style={{ left: "240px", height: "56px" }}
    >
      <span className="text-sm text-[var(--color-text-secondary)]">
        {user?.name}
      </span>
      <Button
        variant="secondary"
        size="default"
        onClick={() => logout.mutate()}
      >
        Logga ut
      </Button>
    </header>
  );
}
```

- [ ] **Step 3: Create Layout**

Create `frontend/src/components/layout.tsx`:

```typescript
import { Outlet } from "react-router-dom";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function Layout() {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <Topbar />
      <main
        className="pt-14"
        style={{ marginLeft: "240px" }}
      >
        <div className="mx-auto p-[var(--spacing-page)]" style={{ maxWidth: "1280px" }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Create ProtectedRoute**

Create `frontend/src/components/protected-route.tsx`:

```typescript
import { Navigate, Outlet } from "react-router-dom";
import { useMe } from "@/api/auth";

// Used as a layout route wrapper — renders <Outlet /> for nested routes.
// React Router v7: wrap protected routes as children of this route element,
// not as JSX children prop.
export function ProtectedRoute() {
  const { data: user, isLoading } = useMe();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-[var(--color-text-secondary)]">Laddar...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
}
```

- [ ] **Step 5: Create App with router**

Create `frontend/src/app.tsx`:

```typescript
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/components/protected-route";
import { LoginPage } from "@/pages/login";
import { DashboardPage } from "@/pages/dashboard";
import { DialerPage } from "@/pages/dialer";
import { LeadDetailPage } from "@/pages/lead-detail";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* ProtectedRoute renders <Outlet /> — Layout is nested inside it */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/dialer" element={<DialerPage />} />
              <Route path="/leads/:id" element={<LeadDetailPage />} />
              {/* More pages will be added in Plan 2B */}
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 6: Update main.tsx**

Replace `frontend/src/main.tsx`:

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "../tailwind.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 7: Verify build**

```bash
cd ~/dev/saleflow/frontend
npm run build
```

- [ ] **Step 8: Commit**

```bash
cd ~/dev/saleflow
git add frontend/
git commit -m "feat: add layout + routing + sidebar + topbar + auth guards"
```

---

### Task 6: Login page

**Files:**
- Create: `frontend/src/pages/login.tsx`

- [ ] **Step 1: Create login page**

Create `frontend/src/pages/login.tsx`:

```typescript
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useLogin, useMe } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export function LoginPage() {
  const { data: user, isLoading } = useMe();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (isLoading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ email, password });
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-[var(--color-bg-panel)]">
      <Card className="w-full max-w-sm">
        <div className="mb-[var(--spacing-section)]">
          <h1 className="text-2xl font-semibold text-center text-[var(--color-accent)]">
            SaleFlow
          </h1>
          <p className="text-sm text-center text-[var(--color-text-secondary)] mt-2">
            Logga in för att fortsätta
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-[var(--spacing-element)]">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
              E-post
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent@saleflow.se"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
              Lösenord
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {login.isError && (
            <p className="text-sm text-[var(--color-danger)]">
              Fel e-post eller lösenord
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={login.isPending}
          >
            {login.isPending ? "Loggar in..." : "Logga in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
cd ~/dev/saleflow
git add frontend/
git commit -m "feat: add login page"
```

---

### Task 7: Dashboard page (stats only)

**Files:**
- Create: `frontend/src/components/stat-card.tsx`
- Create: `frontend/src/pages/dashboard.tsx`
- Create: `frontend/src/lib/format.ts`

- [ ] **Step 1: Create formatters**

Create `frontend/src/lib/format.ts`:

```typescript
export function formatPhone(phone: string): string {
  if (!phone) return "";
  // +46701234567 → 070-123 45 67
  const clean = phone.replace(/^\+46/, "0");
  if (clean.length === 10) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)} ${clean.slice(6, 8)} ${clean.slice(8)}`;
  }
  return clean;
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("sv-SE");
}

export function formatTime(time: string): string {
  if (!time) return "";
  return time.slice(0, 5); // "14:30:00" → "14:30"
}

export function formatCurrency(tkr: string | null): string {
  if (!tkr) return "–";
  const num = parseInt(tkr, 10);
  if (isNaN(num)) return tkr;
  return `${num.toLocaleString("sv-SE")} tkr`;
}

export function formatDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("sv-SE")} ${d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`;
}
```

- [ ] **Step 2: Create StatCard component**

Create `frontend/src/components/stat-card.tsx`:

```typescript
import { Card } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number;
  color?: string;
}

export function StatCard({ label, value, color }: StatCardProps) {
  return (
    <Card className="flex flex-col items-center justify-center py-4">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">
        {label}
      </p>
      <p
        className="text-3xl font-semibold"
        style={{ color: color ?? "var(--color-text-primary)" }}
      >
        {value}
      </p>
    </Card>
  );
}
```

- [ ] **Step 3: Create Dashboard page (stats + meetings overview, NO dialer)**

Create `frontend/src/pages/dashboard.tsx`:

```typescript
import { useNavigate } from "react-router-dom";
import { useMeetings } from "@/api/meetings";
import { useLeads, useAdminStats, useNextLead } from "@/api/leads";
import { Card, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatTime, formatDateTime } from "@/lib/format";

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: meetings } = useMeetings();
  const { data: stats } = useAdminStats();
  const { data: callbackLeads } = useLeads();
  const nextLead = useNextLead();

  const todaysMeetings = meetings?.filter(
    (m) => m.meeting_date === new Date().toISOString().split("T")[0]
  );

  const upcomingCallbacks = callbackLeads?.filter((l) => l.status === "callback") ?? [];

  async function handleNextLead() {
    const lead = await nextLead.mutateAsync();
    if (lead) {
      navigate("/dialer");
    }
  }

  return (
    <div className="space-y-[var(--spacing-section)]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Button size="lg" onClick={handleNextLead} disabled={nextLead.isPending}>
          {nextLead.isPending ? "Hämtar..." : "Nästa kund"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-[var(--spacing-element)]">
        <StatCard label="Samtal idag" value={stats?.calls_today ?? 0} color="var(--color-accent)" />
        <StatCard label="Leads kvar" value={stats?.leads_remaining ?? 0} />
        <StatCard label="Möten idag" value={todaysMeetings?.length ?? 0} color="var(--color-success)" />
      </div>

      {/* Today's meetings */}
      <Card>
        <CardTitle className="mb-[var(--spacing-element)]">Dagens möten</CardTitle>
        {!todaysMeetings || todaysMeetings.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">Inga möten idag</p>
        ) : (
          <div className="space-y-2">
            {todaysMeetings.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">{m.title}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {formatTime(m.meeting_time)}
                  </p>
                </div>
                <Badge status={m.status} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Upcoming callbacks — real data from useLeads filtered by status=callback */}
      <Card>
        <CardTitle className="mb-[var(--spacing-element)]">Kommande återuppringningar</CardTitle>
        {upcomingCallbacks.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">Inga planerade återuppringningar</p>
        ) : (
          <div className="space-y-2">
            {upcomingCallbacks.map((lead) => (
              <div
                key={lead.id}
                className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">{lead.företag}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {lead.callback_at ? formatDateTime(lead.callback_at) : "Ingen tid angiven"}
                  </p>
                </div>
                <Badge status={lead.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd ~/dev/saleflow
git add frontend/
git commit -m "feat: add dashboard page with stats + meetings overview"
```

---

### Task 8: Dialer page (the main sales workflow)

**Files:**
- Create: `frontend/src/components/lead-info.tsx`
- Create: `frontend/src/components/outcome-panel.tsx`
- Create: `frontend/src/components/history-timeline.tsx`
- Create: `frontend/src/pages/dialer.tsx`
- Create: `frontend/src/pages/lead-detail.tsx`

- [ ] **Step 1: Create LeadInfo component (left column)**

Create `frontend/src/components/lead-info.tsx`:

```typescript
import type { Lead } from "@/api/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPhone, formatCurrency } from "@/lib/format";

interface LeadInfoProps {
  lead: Lead;
}

function InfoRow({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-1.5 border-b border-[var(--color-border)] last:border-0">
      <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
        {label}
      </span>
      <span className={mono ? "font-mono text-[13px]" : "text-sm"}>
        {value}
      </span>
    </div>
  );
}

export function LeadInfo({ lead }: LeadInfoProps) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-[var(--spacing-element)]">
        <h2 className="text-lg font-semibold">{lead.företag}</h2>
        <Badge status={lead.status} />
      </div>

      <div className="space-y-0">
        {/* Clickable phone */}
        <div className="flex justify-between py-1.5 border-b border-[var(--color-border)]">
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
            Telefon
          </span>
          <a
            href={`tel:${lead.telefon}`}
            className="font-mono text-[13px] text-[var(--color-accent)] hover:underline"
          >
            {formatPhone(lead.telefon)}
          </a>
        </div>

        <InfoRow label="Org.nr" value={lead.orgnr} mono />
        <InfoRow label="Adress" value={lead.adress} />
        <InfoRow label="Postnummer" value={lead.postnummer} mono />
        <InfoRow label="Stad" value={lead.stad} />
        <InfoRow label="Bransch" value={lead.bransch} />
        <InfoRow label="Omsättning" value={formatCurrency(lead.omsättning_tkr)} />
        <InfoRow label="Vinst" value={formatCurrency(lead.vinst_tkr)} />
        <InfoRow label="Anställda" value={lead.anställda} />
        <InfoRow label="VD" value={lead.vd_namn} />
        <InfoRow label="Bolagsform" value={lead.bolagsform} />
        <InfoRow label="E-post" value={lead.epost} />
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Create OutcomePanel component (right column)**

Create `frontend/src/components/outcome-panel.tsx`:

```typescript
import { useState } from "react";
import { useSubmitOutcome, type OutcomeParams } from "@/api/leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardTitle } from "@/components/ui/card";
import type { Outcome } from "@/api/types";
import { colors } from "@/design/tokens";

const outcomeButtons: { outcome: Outcome; label: string; color: string }[] = [
  { outcome: "meeting_booked", label: "Möte bokat", color: colors.outcome.meeting_booked },
  { outcome: "callback", label: "Återkom", color: colors.outcome.callback },
  { outcome: "not_interested", label: "Ej intresserad", color: colors.outcome.not_interested },
  { outcome: "no_answer", label: "Ej svar", color: colors.outcome.no_answer },
  { outcome: "bad_number", label: "Fel nummer", color: colors.outcome.bad_number },
  { outcome: "customer", label: "Kund!", color: colors.outcome.customer },
];

interface OutcomePanelProps {
  leadId: string;
  companyName: string;
  onOutcomeSubmitted?: () => void;
}

export function OutcomePanel({ leadId, companyName, onOutcomeSubmitted }: OutcomePanelProps) {
  const submitOutcome = useSubmitOutcome(leadId);
  const [notes, setNotes] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSubmit(outcome: Outcome) {
    setValidationError(null);

    // Validation
    if (outcome === "callback" && !callbackDate) {
      setValidationError("Ange datum för återuppringning");
      return;
    }
    if (outcome === "meeting_booked") {
      if (!meetingDate) {
        setValidationError("Ange mötesdatum");
        return;
      }
      if (!meetingTime) {
        setValidationError("Ange mötestid");
        return;
      }
    }

    const params: OutcomeParams = { outcome, notes };

    if (outcome === "callback" && callbackDate) {
      params.callback_at = new Date(callbackDate).toISOString();
    }

    if (outcome === "meeting_booked") {
      params.title = `Möte med ${companyName}`;
      params.meeting_date = meetingDate;
      params.meeting_time = meetingTime + ":00";
      params.meeting_notes = notes;
    }

    try {
      await submitOutcome.mutateAsync(params);
      onOutcomeSubmitted?.();
    } catch {
      setValidationError("Något gick fel. Försök igen.");
    }
  }

  return (
    <Card>
      <CardTitle className="mb-[var(--spacing-element)]">Utfall</CardTitle>

      {/* Notes */}
      <div className="mb-[var(--spacing-element)]">
        <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
          Anteckningar
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="flex w-full rounded-md border border-[var(--color-border-input)] bg-white px-[var(--spacing-element)] py-2 text-sm placeholder:text-[var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          placeholder="Skriv anteckningar..."
        />
      </div>

      {/* Conditional fields */}
      {selectedOutcome === "callback" && (
        <div className="mb-[var(--spacing-element)]">
          <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
            Återkom datum
          </label>
          <Input
            type="datetime-local"
            value={callbackDate}
            onChange={(e) => setCallbackDate(e.target.value)}
          />
        </div>
      )}

      {selectedOutcome === "meeting_booked" && (
        <div className="grid grid-cols-2 gap-[var(--spacing-element)] mb-[var(--spacing-element)]">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
              Mötesdatum
            </label>
            <Input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-1.5">
              Tid
            </label>
            <Input
              type="time"
              value={meetingTime}
              onChange={(e) => setMeetingTime(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Outcome buttons */}
      <div className="grid grid-cols-2 gap-[var(--spacing-element)]">
        {outcomeButtons.map(({ outcome, label, color }) => (
          <Button
            key={outcome}
            variant="outcome"
            size="lg"
            style={{
              borderColor: color,
              color: selectedOutcome === outcome ? "white" : color,
              backgroundColor: selectedOutcome === outcome ? color : "transparent",
            }}
            onClick={() => {
              if (selectedOutcome === outcome) {
                handleSubmit(outcome);
              } else {
                setSelectedOutcome(outcome);
              }
            }}
            disabled={submitOutcome.isPending}
          >
            {selectedOutcome === outcome ? `Bekräfta ${label}` : label}
          </Button>
        ))}
      </div>

      {validationError && (
        <p className="text-sm text-[var(--color-danger)] mt-2">
          {validationError}
        </p>
      )}

      {submitOutcome.isPending && (
        <p className="text-sm text-[var(--color-text-secondary)] mt-2 text-center">
          Sparar...
        </p>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Create HistoryTimeline component**

Create `frontend/src/components/history-timeline.tsx`:

```typescript
import type { CallLog, AuditLog } from "@/api/types";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";

interface HistoryTimelineProps {
  calls: CallLog[];
  auditLogs: AuditLog[];
}

type TimelineEntry = {
  id: string;
  type: "call" | "audit";
  timestamp: string;
  title: string;
  detail: string | null;
};

export function HistoryTimeline({ calls, auditLogs }: HistoryTimelineProps) {
  const entries: TimelineEntry[] = [
    ...calls.map((c) => ({
      id: c.id,
      type: "call" as const,
      timestamp: c.called_at,
      title: c.outcome.replace(/_/g, " "),
      detail: c.notes,
    })),
    ...auditLogs.map((a) => ({
      id: a.id,
      type: "audit" as const,
      timestamp: a.inserted_at,
      title: a.action.replace(/\./g, " → "),
      detail: null,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <Card>
      <CardTitle className="mb-[var(--spacing-element)]">Historik</CardTitle>

      {entries.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">Ingen historik ännu</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex gap-3 py-2 border-b border-[var(--color-border)] last:border-0"
            >
              <div
                className="mt-1 w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  backgroundColor:
                    entry.type === "call" ? "var(--color-accent)" : "var(--color-border-input)",
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium capitalize">{entry.title}</p>
                  <time className="text-xs text-[var(--color-text-secondary)] font-mono">
                    {formatDateTime(entry.timestamp)}
                  </time>
                </div>
                {entry.detail && (
                  <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                    {entry.detail}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Create Dialer page (main sales workflow)**

Create `frontend/src/pages/dialer.tsx`:

```typescript
import { useState } from "react";
import { useNextLead, useLeadDetail } from "@/api/leads";
import { LeadInfo } from "@/components/lead-info";
import { OutcomePanel } from "@/components/outcome-panel";
import { HistoryTimeline } from "@/components/history-timeline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function DialerPage() {
  const [currentLeadId, setCurrentLeadId] = useState<string | null>(null);
  const nextLead = useNextLead();
  const { data, isLoading } = useLeadDetail(currentLeadId ?? "");

  async function handleGetNext() {
    if (nextLead.isPending) return;
    const lead = await nextLead.mutateAsync();
    if (lead) {
      setCurrentLeadId(lead.id);
    } else {
      setCurrentLeadId(null);
    }
  }

  function handleOutcomeSubmitted() {
    if (nextLead.isPending) return;
    // After outcome, auto-fetch next
    handleGetNext();
  }

  // No lead loaded yet — show start screen
  if (!currentLeadId) {
    return (
      <div className="space-y-[var(--spacing-section)]">
        <h1 className="text-2xl font-semibold">Ringare</h1>
        <Card className="flex flex-col items-center py-16">
          {nextLead.data === null ? (
            <>
              <p className="text-lg text-[var(--color-text-secondary)] mb-4">
                Inga fler leads i kön just nu
              </p>
              <Button size="lg" onClick={handleGetNext} disabled={nextLead.isPending}>
                Försök igen
              </Button>
            </>
          ) : (
            <>
              <p className="text-lg text-[var(--color-text-secondary)] mb-4">
                Redo att börja ringa?
              </p>
              <Button
                size="lg"
                onClick={handleGetNext}
                disabled={nextLead.isPending}
                className="text-lg px-10"
              >
                {nextLead.isPending ? "Hämtar..." : "Nästa kund"}
              </Button>
            </>
          )}
        </Card>
      </div>
    );
  }

  // Loading lead detail
  if (isLoading || !data) {
    return (
      <div className="space-y-[var(--spacing-section)]">
        <h1 className="text-2xl font-semibold">Ringare</h1>
        <p className="text-[var(--color-text-secondary)]">Laddar kundkort...</p>
      </div>
    );
  }

  const { lead, calls, audit_logs: auditLogs } = data;

  return (
    <div className="space-y-[var(--spacing-section)]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{lead.företag}</h1>
        <Button variant="secondary" onClick={handleGetNext} disabled={nextLead.isPending}>
          Hoppa över
        </Button>
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-[var(--spacing-section)]">
        <div className="lg:col-span-3">
          <LeadInfo lead={lead} />
        </div>
        <div className="lg:col-span-2">
          <OutcomePanel
            leadId={lead.id}
            companyName={lead.företag}
            onOutcomeSubmitted={handleOutcomeSubmitted}
          />
        </div>
      </div>

      <HistoryTimeline calls={calls} auditLogs={auditLogs} />
    </div>
  );
}
```

- [ ] **Step 5: Create read-only LeadDetail page (for history clicks)**

Create `frontend/src/pages/lead-detail.tsx`:

```typescript
import { useParams, Navigate } from "react-router-dom";
import { useLeadDetail } from "@/api/leads";
import { LeadInfo } from "@/components/lead-info";
import { HistoryTimeline } from "@/components/history-timeline";

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useLeadDetail(id ?? "");

  if (isLoading) {
    return <p className="text-[var(--color-text-secondary)]">Laddar kundkort...</p>;
  }

  if (error) {
    return (
      <div className="space-y-[var(--spacing-section)]">
        <p className="text-[var(--color-danger)]">
          Kunde inte ladda kundkortet. Kontrollera att länken stämmer.
        </p>
        <Navigate to="/dashboard" replace />
      </div>
    );
  }

  if (!data) {
    return <Navigate to="/dashboard" replace />;
  }

  const { lead, calls, audit_logs: auditLogs } = data;

  return (
    <div className="space-y-[var(--spacing-section)]">
      <h1 className="text-2xl font-semibold">{lead.företag}</h1>
      <LeadInfo lead={lead} />
      <HistoryTimeline calls={calls} auditLogs={auditLogs} />
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

```bash
cd ~/dev/saleflow/frontend
npm run build
```

- [ ] **Step 6: Commit**

```bash
cd ~/dev/saleflow
git add frontend/
git commit -m "feat: add customer card page with lead info, outcome panel, history timeline"
```

---

### Task 9: Frontend documentation

**Files:**
- Create: `docs/frontend/README.md`
- Create: `docs/frontend/design-system.md`
- Create: `docs/frontend/pages.md`

- [ ] **Step 1: Create frontend docs**

Create `docs/frontend/README.md`:

```markdown
# SaleFlow Frontend Documentation

## Stack
- React 19, TypeScript strict, Vite 6
- shadcn/ui + Tailwind CSS v4
- TanStack Query v5 for server state
- React Router v7

## Setup
\`\`\`bash
cd frontend
npm install
npm run dev  # runs on port 5173, proxies /api to backend on 4000
\`\`\`

## Pages
- [/login](/login) — Email + password login
- [/dashboard](/dashboard) — Stats, "Nästa kund" button, today's meetings
- [/leads/:id](/leads/:id) — Customer card with outcome buttons + history

## Docs
- [Design System](./design-system.md)
- [Pages & Components](./pages.md)
```

Create `docs/frontend/design-system.md`:

```markdown
# SaleFlow Design System

All values defined in `src/design/tokens.ts` and `tailwind.css`. No hardcoded values in components.

## Colors
| Token | Value | Usage |
|-------|-------|-------|
| bg-primary | #FFFFFF | White backgrounds |
| bg-panel | #F8FAFC | Sidebar, page bg |
| text-primary | #0F172A | Body text |
| text-secondary | #64748B | Labels, muted text |
| accent | #4F46E5 | Primary buttons, links |
| success | #059669 | Meeting booked |
| warning | #D97706 | Callback |
| danger | #DC2626 | Not interested |
| border | #E2E8F0 | Card borders |

## Typography
| Style | Size | Weight | Usage |
|-------|------|--------|-------|
| Page title | 24px | 600 | h1 |
| Section title | 18px | 600 | Card titles |
| Body | 14px | 400 | Default text |
| Label | 12px | 500 uppercase | Field labels |
| Mono | 13px | 400 | Orgnr, phone |

## Spacing
- Page padding: 24px
- Card padding: 20px
- Section gap: 24px
- Element gap: 12px

## Components
- Card: white bg, 1px border, rounded-lg (8px)
- Button: rounded-md (6px), 14px, font-weight 500
- Input: white bg, 1px border, rounded-md
- Badge: rounded-full, colored by status
```

Create `docs/frontend/pages.md`:

```markdown
# SaleFlow Pages & Components

## Login (/login)
Centered card with email + password. Redirects to /dashboard on success.

## Dashboard (/dashboard)
- Stats bar (3 cards)
- "Nästa kund" button → fetches next lead → navigates to /leads/:id
- Today's meetings list

## Customer Card (/leads/:id)
Two-column layout:
- Left (3/5): LeadInfo — company data, clickable phone (tel: link)
- Right (2/5): OutcomePanel — notes, conditional fields, 6 outcome buttons
- Bottom: HistoryTimeline — merged call logs + audit entries, sorted by time

### Outcome Flow
1. Agent clicks outcome button (first click = select, shows conditional fields)
2. Agent fills in notes/date if needed
3. Agent clicks again to confirm
4. Outcome submitted → next lead fetched → auto-navigate

### Components
- `lead-info.tsx` — Company info display
- `outcome-panel.tsx` — Outcome buttons + notes + callback/meeting fields
- `history-timeline.tsx` — Chronological call + audit log
- `stat-card.tsx` — Dashboard stat display
- `layout.tsx` — Sidebar + topbar + content area
- `sidebar.tsx` — Navigation with agent + admin sections
- `topbar.tsx` — User name + logout
- `protected-route.tsx` — Auth + admin guards
```

- [ ] **Step 2: Commit**

```bash
cd ~/dev/saleflow
mkdir -p docs/frontend
git add docs/frontend/
git commit -m "docs: add frontend documentation (design system, pages, components)"
```

---

## Summary

| Task | What | Key files |
|------|------|-----------|
| 1 | Vite scaffold + deps | frontend/ |
| 2 | Design system + UI components | tokens.ts, tailwind.css, ui/ |
| 3 | API client + auth hooks | api/client.ts, api/auth.ts |
| 4 | Lead + meeting hooks | api/leads.ts, api/meetings.ts |
| 5 | Layout + routing + guards | layout.tsx, sidebar.tsx, app.tsx |
| 6 | Login page | pages/login.tsx |
| 7 | Dashboard (stats only) | pages/dashboard.tsx |
| 8 | Dialer page (kö-flöde) | pages/dialer.tsx, lead-info.tsx, outcome-panel.tsx |
| 9 | Frontend docs | docs/frontend/ |

**Total: 9 tasks — produces a working sales agent workflow (login → dashboard → dialer → next lead → call → outcome → auto-next)**

Plan 2B (remaining pages + tests) will be written after Plan 2A is implemented.
