import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeStatus =
  | "new"
  | "assigned"
  | "callback"
  | "meeting_booked"
  | "not_interested"
  | "quarantine"
  | "bad_number"
  | "customer"
  | "no_answer"
  | "scheduled"
  | "completed"
  | "cancelled";

const statusStyles: Record<BadgeStatus, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  assigned: "bg-indigo-50 text-indigo-700 border-indigo-200",
  callback: "bg-amber-50 text-amber-700 border-amber-200",
  meeting_booked: "bg-emerald-50 text-emerald-700 border-emerald-200",
  not_interested: "bg-red-50 text-red-700 border-red-200",
  quarantine: "bg-orange-50 text-orange-700 border-orange-200",
  bad_number: "bg-slate-100 text-slate-700 border-slate-300",
  customer: "bg-purple-50 text-purple-700 border-purple-200",
  no_answer: "bg-slate-50 text-slate-600 border-slate-200",
  scheduled: "bg-sky-50 text-sky-700 border-sky-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};

const statusLabels: Record<BadgeStatus, string> = {
  new: "Ny",
  assigned: "Tilldelad",
  callback: "Återuppringning",
  meeting_booked: "Möte bokat",
  not_interested: "Inte intresserad",
  quarantine: "Karantän",
  bad_number: "Fel nummer",
  customer: "Kund",
  no_answer: "Svarar ej",
  scheduled: "Schemalagd",
  completed: "Genomförd",
  cancelled: "Avbokad",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: BadgeStatus;
}

export function Badge({ status, className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        statusStyles[status],
        className,
      )}
      {...props}
    >
      {statusLabels[status]}
    </span>
  );
}
