"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type DetailTab = { value: string; label: ReactNode; content: ReactNode };

/**
 * Detail page body: a `ProfileCard` header, then underline tabs (active tab in primary).
 * The `PageHeader` goes above it on the page.
 */
export function DetailPage({
  header,
  tabs,
  defaultTab,
}: {
  header: ReactNode;
  tabs: DetailTab[];
  defaultTab?: string;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(280px,360px)_1fr] lg:items-start">
      {header}
      <section className="min-w-0 rounded-2xl bg-card p-4 shadow-card sm:p-6">
        <Tabs defaultValue={defaultTab ?? tabs[0]?.value}>
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((t) => (
            <TabsContent key={t.value} value={t.value}>
              {t.content}
            </TabsContent>
          ))}
        </Tabs>
      </section>
    </div>
  );
}
