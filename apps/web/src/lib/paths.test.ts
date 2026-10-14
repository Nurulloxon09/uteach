import { describe, expect, it } from "vitest";
import { matchesPath, publicPathsFor, safeNextPath, splitLocale } from "./paths";

describe("safeNextPath", () => {
  it("allows same-site paths", () => {
    expect(safeNextPath("/invite/abc")).toBe("/invite/abc");
    expect(safeNextPath("/uz/staff?x=1")).toBe("/uz/staff?x=1");
  });

  it("rejects open redirects and junk", () => {
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("/ok\r\nSet-Cookie: x")).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });
});

describe("splitLocale", () => {
  const locales = ["uz", "ru", "en"];
  it("strips a known locale", () => {
    expect(splitLocale("/uz/staff", locales)).toEqual({ locale: "uz", path: "/staff" });
    expect(splitLocale("/ru", locales)).toEqual({ locale: "ru", path: "/" });
  });

  it("leaves other paths alone", () => {
    expect(splitLocale("/staff", locales)).toEqual({ locale: null, path: "/staff" });
  });
});

describe("matchesPath", () => {
  it("matches whole segments only", () => {
    expect(matchesPath("/invite/abc", ["/invite"])).toBe(true);
    expect(matchesPath("/invitex", ["/invite"])).toBe(false);
    expect(matchesPath("/login", ["/login"])).toBe(true);
  });
});

describe("publicPathsFor", () => {
  it("lets /dev/ui through without login outside production only", () => {
    expect(matchesPath("/dev/ui", publicPathsFor("development"))).toBe(true);
    expect(matchesPath("/dev/ui", publicPathsFor("test"))).toBe(true);
    expect(matchesPath("/dev/ui", publicPathsFor("production"))).toBe(false);
    expect(matchesPath("/login", publicPathsFor("production"))).toBe(true);
  });

  it("lets visitors open the landing and legal pages, and nothing else by accident", () => {
    const paths = publicPathsFor("production");
    expect(matchesPath("/", paths)).toBe(true);
    expect(matchesPath("/terms", paths)).toBe(true);
    expect(matchesPath("/privacy", paths)).toBe(true);
    expect(matchesPath("/home", paths)).toBe(false);
    expect(matchesPath("/students", paths)).toBe(false);
    expect(matchesPath("/admin", paths)).toBe(false);
  });
});
