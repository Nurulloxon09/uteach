import { notFound } from "next/navigation";
import { DevUi } from "./dev-ui";

export const metadata = { title: "UI kit", robots: { index: false } };

/** Every pattern from 05-ui.md §5 with fake data. Development only: 404 in production builds. */
export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevUi />;
}
