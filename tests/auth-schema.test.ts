import { describe, expect, it } from "vitest";

import { AuthCredentialsSchema, formatAuthError } from "@/lib/auth-schema";

describe("AuthCredentialsSchema", () => {
  it("接受有效邮箱并把大小写规范成小写", () => {
    const parsed = AuthCredentialsSchema.parse({
      email: "  Neo@Example.com ",
      password: "secret-pass",
    });
    expect(parsed.email).toBe("neo@example.com");
  });

  it("拒绝过短密码", () => {
    const parsed = AuthCredentialsSchema.safeParse({
      email: "neo@example.com",
      password: "short",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(formatAuthError(parsed.error)).toContain("8");
    }
  });
});
