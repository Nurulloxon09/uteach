"use client";

import { createContext, useContext, type ReactNode } from "react";

/** The plan errors that the owner fixes on Settings → Subscription (M7a). */
export const PLAN_ERRORS = new Set([
  "db.student_limit_reached",
  "db.branch_limit_reached",
  "db.center_read_only",
]);

const PlanLinkContext = createContext(false);

/**
 * Set in the app layout: true for owners, who can open Settings → Subscription. Forms then show a link to it
 * under a plan error (M7e); other roles only see the message.
 */
export function PlanLinkProvider({ owner, children }: { owner: boolean; children: ReactNode }) {
  return <PlanLinkContext value={owner}>{children}</PlanLinkContext>;
}

export function useCanOpenSubscription(): boolean {
  return useContext(PlanLinkContext);
}
