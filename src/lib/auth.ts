import { compare, hash } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE = "tally_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const BCRYPT_ROUNDS = 10;

export type SessionUser = {
  id: string;
  email: string;
};

/**
 * 【做什么】确认登录所需的密钥和数据库地址都已配置。
 * 【何时调用】账号接口返回是否开放云同步，以及写入会话之前。
 */
export function getCloudAuthConfig(): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) {
    missing.push("DATABASE_URL");
  }
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 16) {
    missing.push("AUTH_SECRET");
  }
  return { ready: missing.length === 0, missing };
}

function getSessionSecret(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    return null;
  }
  return new TextEncoder().encode(secret);
}

/**
 * 【做什么】把明文密码变成不可逆哈希后再入库。
 * 【何时调用】注册新账号时。
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

/**
 * 【做什么】比对登录密码和库里的哈希。
 * 【何时调用】登录接口验证账号时。
 */
export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

/**
 * 【做什么】签发 HttpOnly 会话 Cookie，让后续同步请求带上登录身份。
 * 【何时调用】注册或登录成功后。
 */
export async function createSession(user: SessionUser): Promise<void> {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("缺少 AUTH_SECRET，无法登录");
  }

  const token = await new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // NOTE: 生产环境走 HTTPS（Vercel），本地 http 必须关掉 Secure 才能写入 Cookie。
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * 【做什么】清除会话 Cookie。
 * 【何时调用】用户退出登录时。
 */
export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * 【做什么】从 Cookie 解析当前登录用户；令牌无效时视为未登录。
 * 【何时调用】/api/auth/me、账本同步，以及线上已启用云登录时的截图识别。
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const secret = getSessionSecret();
  if (!secret) {
    return null;
  }

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return { id: payload.sub, email: payload.email };
  } catch {
    // WARN: 过期或被篡改的令牌不能抛到前端，静默当成未登录以免泄露校验细节。
    return null;
  }
}
