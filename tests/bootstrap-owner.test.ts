import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../packages/database/src/index.js";
import { bootstrapOwner } from "../apps/api/src/modules/admin/bootstrap-owner.js";

function fixture(
  existing: Record<string, unknown> | null = null,
  owner = false,
) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    user: {
      findFirst: vi.fn().mockResolvedValue(owner ? { id: "owner" } : null),
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({ id: "new-owner" }),
      update: vi.fn().mockResolvedValue({ id: "customer" }),
    },
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const db = {
    $transaction: async (callback: (value: typeof tx) => Promise<unknown>) =>
      callback(tx),
  } as unknown as PrismaClient;
  return { db, tx };
}
const customer = {
  id: "customer",
  role: "CUSTOMER",
  emailVerified: true,
  disabled: false,
};
describe("first owner bootstrap", () => {
  it("creates an unverified owner and records the audited server action", async () => {
    const { db, tx } = fixture();
    await expect(bootstrapOwner(db, "owner@example.com")).resolves.toBe(
      "new-owner",
    );
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: "OWNER", emailVerified: false }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "OWNER_BOOTSTRAPPED",
        summary: { source: "server-command", promotedExistingCustomer: false },
      }),
    });
  });
  it("requires explicit authorization before promoting an existing customer", async () => {
    const { db, tx } = fixture(customer);
    await expect(bootstrapOwner(db, "owner@example.com")).rejects.toThrow(
      "--promote-verified-customer",
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it("promotes an active verified customer, revokes sessions and audits promotion", async () => {
    const { db, tx } = fixture(customer);
    await bootstrapOwner(db, "owner@example.com", true);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "customer" },
      data: { role: "OWNER" },
    });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "customer" },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        summary: { source: "server-command", promotedExistingCustomer: true },
      }),
    });
  });
  it.each([
    { ...customer, disabled: true },
    { ...customer, emailVerified: false },
    { ...customer, role: "STAFF" },
  ])("rejects ineligible existing accounts: %j", async (account) => {
    const { db, tx } = fixture(account);
    await expect(bootstrapOwner(db, "owner@example.com", true)).rejects.toThrow(
      "active, verified customer",
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it("never bootstraps a second owner", async () => {
    const { db, tx } = fixture(null, true);
    await expect(bootstrapOwner(db, "owner@example.com", true)).rejects.toThrow(
      "owner already exists",
    );
    expect(tx.user.create).not.toHaveBeenCalled();
  });
});
