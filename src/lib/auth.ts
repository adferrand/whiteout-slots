import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "wsb_admin";
const SESSION_HOURS = 12;

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function sessionSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET is missing or shorter than 16 characters");
  }
  return new TextEncoder().encode(s);
}

/** Changing ADMIN_PASSWORD invalidates every existing admin session. */
function passwordFingerprint(): string {
  return sha256(process.env.ADMIN_PASSWORD ?? "").toString("hex").slice(0, 16);
}

export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(sha256(input), sha256(expected));
}

export async function startAdminSession(): Promise<void> {
  const token = await new SignJWT({ role: "admin", pwv: passwordFingerprint() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(sessionSecret());
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function endAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      algorithms: ["HS256"],
    });
    return payload.role === "admin" && payload.pwv === passwordFingerprint();
  } catch {
    return false;
  }
}

// --- Player edit tokens and IP hashing ------------------------------------

export function newEditToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return sha256(token).toString("hex");
}

export function hashIp(ip: string): string {
  return createHash("sha256")
    .update(`${process.env.SESSION_SECRET ?? ""}|${ip}`)
    .digest("hex")
    .slice(0, 32);
}
