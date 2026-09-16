import { UnauthorizedException } from "@nestjs/common";
import { LocalStrategy } from "./local.strategy";

describe("LocalStrategy", () => {
  it("uses identifier when provided", async () => {
    const authService = {
      validateUser: jest.fn().mockResolvedValue({ id: "u1" }),
    } as any;
    const strategy = new LocalStrategy(authService);

    const req = {
      body: { tenantId: "tenant-1", slug: "acme" },
    } as any;

    const result = await strategy.validate(req, "DOC0001", "secret");

    expect(authService.validateUser).toHaveBeenCalledWith(
      "DOC0001",
      "secret",
      "tenant-1",
      "acme",
    );
    expect(result).toEqual({ id: "u1" });
  });

  it("falls back to legacy email payloads", async () => {
    const authService = {
      validateUser: jest.fn().mockResolvedValue({ id: "u1" }),
    } as any;
    const strategy = new LocalStrategy(authService);

    const req = {
      body: { email: "staff@acme.com", slug: "acme" },
    } as any;

    await strategy.validate(req, undefined, "secret");

    expect(authService.validateUser).toHaveBeenCalledWith(
      "staff@acme.com",
      "secret",
      undefined,
      "acme",
    );
  });

  it("throws UnauthorizedException when authentication fails", async () => {
    const authService = {
      validateUser: jest.fn().mockResolvedValue(null),
    } as any;
    const strategy = new LocalStrategy(authService);

    await expect(
      strategy.validate({ body: {} } as any, undefined, "secret"),
    ).rejects.toThrow(UnauthorizedException);
  });
});
