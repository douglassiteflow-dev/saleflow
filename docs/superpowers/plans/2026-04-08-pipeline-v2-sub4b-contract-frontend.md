# Pipeline v2 Sub-plan 4b: Avtalssystem — Frontend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public contract signing page (verification, viewing with tracking, canvas signature), add "Skicka avtal" button to deal detail, and show real-time contract tracking for agents.

**Architecture:** New public React page at `/contract/:token` outside auth wrapper. WebSocket connection for real-time page tracking. Canvas signature component. Admin API hooks for contract management.

**Tech Stack:** React/TypeScript/Tailwind/shadcn, Phoenix WebSocket (via phoenix.js), Canvas API

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/pages/contract-signing.tsx` | Public contract signing page (verify → view → sign → done) |
| Create | `frontend/src/api/contract-public.ts` | API client for public contract endpoints |
| Create | `frontend/src/api/contract-admin.ts` | Admin hooks (send contract from deal) |
| Create | `frontend/src/components/signature-canvas.tsx` | Canvas signature drawing component |
| Modify | `frontend/src/App.tsx` | Add /contract/:token route outside auth |
| Modify | `frontend/src/pages/pipeline-detail.tsx` | "Skicka avtal" button + live tracking |
| Modify | `frontend/src/components/dialer/deal-detail-tab.tsx` | "Skicka avtal" button in dialer |

---

### Task 1: Public contract API client + SignatureCanvas component

### Task 2: Public contract signing page (4 states: verify → view → sign → done)

### Task 3: "Skicka avtal" button + admin hooks + deal detail integration

### Task 4: Frontend tests + final validation
