import { describe, expect, it } from "vitest";
import { describeFailure } from "./types";

/**
 * `describeFailure` is the only thing a user reads when a lookup finds nothing,
 * so the wording is behaviour, not decoration. The regression these tests pin:
 * a `cors` failure used to always say "Add a CORS proxy in Settings", even when
 * a proxy was already configured (and even though UPCMDB, which triggered it,
 * never needed one). See the fix in `./http.ts`.
 */
describe("describeFailure", () => {
  it("asks for a proxy when none is configured", () => {
    const message = describeFailure("cors", "UPCitemdb");
    expect(message).toContain("UPCitemdb");
    expect(message).toContain("Add a CORS proxy in Settings");
  });

  it("stops asking for a proxy once one is configured", () => {
    const message = describeFailure("cors", "UPCitemdb", { proxyConfigured: true });
    expect(message).not.toContain("Add a CORS proxy");
    expect(message).toContain("proxy URL in Settings");
  });

  it("frames a transport failure as a network problem", () => {
    expect(describeFailure("network", "UPCMDB")).toContain("Check your connection");
  });

  it("names the provider for auth and rate-limit failures", () => {
    expect(describeFailure("auth", "UPCMDB")).toContain("UPCMDB");
    expect(describeFailure("rate_limit", "EANdata")).toContain("EANdata");
  });

  it("falls back to a generic message for an unexpected response", () => {
    expect(describeFailure("unknown", "UPCMDB")).toContain("unexpected response");
  });
});
