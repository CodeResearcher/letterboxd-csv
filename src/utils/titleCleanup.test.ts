import { describe, expect, it } from "vitest";
import { cleanTitle } from "./titleCleanup";

describe("cleanTitle", () => {
  it("removes format words", () => {
    expect(cleanTitle("The Matrix (Blu-ray)")).toBe("The Matrix");
    expect(cleanTitle("The Matrix DVD")).toBe("The Matrix");
    expect(cleanTitle("Blade Runner 2049 4K Ultra HD")).toBe("Blade Runner 2049");
  });

  it("removes region and disc-count markers", () => {
    expect(cleanTitle("Alien Region B")).toBe("Alien");
    expect(cleanTitle("Alien [Region 2]")).toBe("Alien");
    expect(cleanTitle("Alien 2 Disc Special Edition")).toBe("Alien");
  });

  it("removes edition wording", () => {
    expect(cleanTitle("Heat Collector's Edition")).toBe("Heat");
    expect(cleanTitle("Heat Limited Edition")).toBe("Heat");
    expect(cleanTitle("Heat Steelbook")).toBe("Heat");
  });

  it("removes trailing format sections after a separator", () => {
    expect(cleanTitle("Jaws | Blu-ray + Digital")).toBe("Jaws");
  });

  it("leaves legitimate titles alone", () => {
    expect(cleanTitle("BlacKkKlansman")).toBe("BlacKkKlansman");
    expect(cleanTitle("The DVD Collector")).toBe("The Collector");
    expect(cleanTitle("2001: A Space Odyssey")).toBe("2001: A Space Odyssey");
    expect(cleanTitle("Up")).toBe("Up");
  });

  it("normalises smart quotes but keeps the title", () => {
    expect(cleanTitle("Ocean\u2019s Eleven (Blu-ray)")).toBe("Ocean's Eleven");
  });

  it("never returns an empty string", () => {
    expect(cleanTitle("Blu-ray")).toBe("Blu-ray");
    expect(cleanTitle("")).toBe("");
  });
});