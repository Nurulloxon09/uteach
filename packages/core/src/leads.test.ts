import { describe, expect, it } from "vitest";
import { canMoveLead, LEAD_STATUSES, leadDropAction } from "./leads";

describe("canMoveLead", () => {
  it("matches private.lead_move_allowed (same string as the pgTAP parity test)", () => {
    const sorted = [...LEAD_STATUSES];
    const matrix = sorted
      .map((from) => {
        const to = sorted.filter((t) => canMoveLead(from, t));
        return `${from}>${to.length ? to.join(",") : "-"}`;
      })
      .join(" ");
    expect(matrix).toBe(
      "new>contacted,trial_done,lost contacted>new,trial_done,lost trial_scheduled>new,contacted,trial_done,lost " +
        "trial_done>new,contacted,lost won>- lost>new,contacted",
    );
  });
});

describe("leadDropAction", () => {
  it("opens the dialog a column needs", () => {
    expect(leadDropAction("contacted", "lost")).toBe("lost_dialog");
    expect(leadDropAction("contacted", "trial_scheduled")).toBe("trial_picker");
    expect(leadDropAction("trial_done", "won")).toBe("convert");
    expect(leadDropAction("new", "contacted")).toBe("move");
  });

  it("refuses moves the database refuses", () => {
    expect(leadDropAction("won", "new")).toBe("refused");
    expect(leadDropAction("lost", "won")).toBe("refused");
    expect(leadDropAction("lost", "trial_done")).toBe("refused");
    expect(leadDropAction("new", "new")).toBe("refused");
  });
});
