import type { LeadSource, LeadStatus } from "@uteach/core";
import {
  Camera,
  CircleDot,
  Footprints,
  Globe,
  Megaphone,
  Phone,
  Send,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ChipTone } from "@/components/patterns";

/** Shared by the Leads server pages and client components (a "use client" module can't export values to both). */

export const SOURCE_ICONS: Record<LeadSource, LucideIcon> = {
  instagram: Camera,
  telegram: Send,
  walk_in: Footprints,
  call: Phone,
  referral: Users,
  web_form: Globe,
  meta_ads: Megaphone,
  other: CircleDot,
};

export const STATUS_TONES: Record<LeadStatus, ChipTone> = {
  new: "primary",
  contacted: "primary",
  trial_scheduled: "warning",
  trial_done: "warning",
  won: "success",
  lost: "muted",
};
