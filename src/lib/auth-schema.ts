import { z } from "zod";

/**
 * 【做什么】校验登录/注册提交的邮箱和密码。
 * 【何时使用】账号页提交前，以及服务端写入用户表之前。
 */
export const AuthCredentialsSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(120, "邮箱过长")
      .pipe(z.email("请输入有效邮箱")),
    // NOTE: bcrypt 只使用前 72 字节，超长密码必须在哈希前拒绝。
    password: z.string().min(8, "密码至少 8 位").max(72, "密码过长"),
  })
  .strict();

export type AuthCredentials = z.infer<typeof AuthCredentialsSchema>;

/**
 * 【做什么】把校验失败转成可展示的一句中文。
 * 【何时调用】Zod safeParse 失败、需要把第一处问题告诉用户时。
 */
export function formatAuthError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "账号信息无效";
}
