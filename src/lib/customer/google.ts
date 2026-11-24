import { cookies } from "next/headers";
import { AuthError } from "@auth/core/errors";
import { prisma } from "@/lib/prisma";
import { customerAuthPath, customerSignInUrl, googleLinkContext } from "./auth";
import { issueChallenge } from "./challenges";
import { activeCustomerSession, customerSession, lockCustomer } from "./session";
import { customerCookie, customerOrigin, googleEnabled, passwordMatches, rateLimit } from "./security";

export type GoogleResult = { url: string } | { error: "failed" | "invalid" | "signinError" | "rate" | "unavailable" };

export async function startGoogle(data: URLSearchParams): Promise<GoogleResult> {
  if (!googleEnabled()) return { error: "unavailable" };
  const mode = data.get("mode");
  if (mode !== "link" && mode !== "signin") return { error: "invalid" };
  const cookie = customerCookie("link");
  const jar = await cookies();
  const session = mode === "link" ? await customerSession() : null;

  if (mode === "link") {
    if (!session?.emailVerified) return { error: "invalid" };
    if (!await rateLimit("linkGoogle", session.id)) return { error: "rate" };
    const password = data.get("password");
    const user = await prisma.user.findUnique({ where: { id: session.id }, select: { passwordHash: true } });
    if (typeof password !== "string" || !await passwordMatches(password, user?.passwordHash)) return { error: "signinError" };
  } else {
    if (!await rateLimit("googleStart")) return { error: "rate" };
  }

  try {
    const destination = await customerSignInUrl("google");
    if (!destination) return { error: "failed" };
    const url = new URL(destination);
    const callback = customerOrigin() + customerAuthPath + "/callback/google";
    const state = url.searchParams.get("state");
    if (url.origin !== "https://accounts.google.com" || url.username || url.password || !state ||
        url.searchParams.get("redirect_uri") !== callback) return { error: "failed" };
    if (session) {
      const token = await prisma.$transaction(async (tx) => {
        if (!await lockCustomer(tx, session.id) || !await activeCustomerSession(tx, session.id, session.binding)) return null;
        return issueChallenge(tx, { purpose: "linkGoogle", userId: session.id, email: session.email, context: googleLinkContext(session.binding, state) }, 10);
      });
      if (!token) return { error: "invalid" };
      jar.set(cookie.name, token, { ...cookie.options, maxAge: 1200 });
    } else {
      jar.set(cookie.name, "", { ...cookie.options, maxAge: 0 });
    }
    return { url: url.href };
  } catch (error) {
    if (!(error instanceof AuthError || error instanceof TypeError)) throw error;
  }
  return { error: "failed" };
}
