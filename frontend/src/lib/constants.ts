export const OUTCOME_LABELS: Record<string, string> = {
  meeting_booked: "Möte bokat",
  callback: "Återuppringning",
  not_interested: "Ej intresserad",
  no_answer: "Ej svar",
  call_later: "Ring senare",
  bad_number: "Fel nummer",
  customer: "Kund",
  other: "Övrigt",
};

export const OUTCOME_COLORS: Record<string, string> = {
  meeting_booked: "bg-emerald-100 text-emerald-700",
  callback: "bg-amber-100 text-amber-700",
  not_interested: "bg-rose-100 text-rose-700",
  no_answer: "bg-slate-100 text-slate-600",
  call_later: "bg-blue-100 text-blue-700",
  bad_number: "bg-red-100 text-red-700",
  customer: "bg-indigo-100 text-indigo-700",
  other: "bg-slate-100 text-slate-600",
};

/** Solid dot colors used in charts/lists (e.g. daily-summary outcome breakdown). */
export const OUTCOME_DOT_COLORS: Record<string, string> = {
  meeting_booked: "bg-emerald-500",
  callback: "bg-amber-400",
  not_interested: "bg-rose-500",
  no_answer: "bg-slate-400",
  call_later: "bg-blue-500",
  bad_number: "bg-red-500",
  customer: "bg-indigo-500",
  other: "bg-slate-400",
};
