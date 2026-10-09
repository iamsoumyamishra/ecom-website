import type { BetterAuthPlugin } from "better-auth";
export const cookieOnly = {
  id: "cookie-only-session-responses",
  async onResponse(response: Response) {
    if (!response.headers.get("content-type")?.includes("application/json"))
      return;
    const data: unknown = await response.clone().json();
    if (!data || typeof data !== "object" || Array.isArray(data)) return;
    const body = { ...data } as Record<string, unknown>;
    if (!response.ok) {
      if (
        ![
          "INVALID_OTP",
          "OTP_EXPIRED",
          "TOO_MANY_ATTEMPTS",
          "USER_NOT_FOUND",
        ].includes(String(body.code))
      )
        return;
      return {
        response: new Response(
          JSON.stringify({
            code: "INVALID_OTP",
            message: "The code is invalid or expired",
          }),
          { status: 400, headers: response.headers },
        ),
      };
    }
    delete body.token;
    if (body.session && typeof body.session === "object") {
      const session = { ...body.session } as Record<string, unknown>;
      delete session.token;
      delete session.ipAddress;
      delete session.userAgent;
      body.session = session;
    }
    return {
      response: new Response(JSON.stringify(body), {
        status: response.status,
        headers: response.headers,
      }),
    };
  },
} satisfies BetterAuthPlugin;
