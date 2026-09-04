const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const OAUTH_STATE_COOKIE = "smt_oauth_state";
const SESSION_COOKIE = "smt_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/auth/google") {
      return startGoogleAuth(env);
    }

    if (url.pathname === "/auth/callback") {
      return finishGoogleAuth(request, env, url);
    }

    if (url.pathname === "/auth/logout") {
      return logout(url);
    }

    if (url.pathname === "/api/me") {
      return currentUser(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

function startGoogleAuth(env) {
  const missing = missingOAuthConfig(env);
  if (missing.length) {
    return configurationError(missing);
  }

  const state = randomBase64Url(32);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account"
  });

  return new Response(null, {
    status: 302,
    headers: {
      location: `${GOOGLE_AUTH_URL}?${params.toString()}`,
      "set-cookie": serializeCookie(OAUTH_STATE_COOKIE, state, {
        maxAge: 600,
        path: "/auth/callback",
        httpOnly: true,
        secure: true,
        sameSite: "Lax"
      })
    }
  });
}

async function finishGoogleAuth(request, env, url) {
  const missing = missingOAuthConfig(env);
  if (missing.length) {
    return configurationError(missing);
  }

  const googleError = url.searchParams.get("error");
  if (googleError) {
    return textResponse(`Google sign-in was cancelled or failed: ${googleError}`, 400);
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const expectedState = cookies[OAUTH_STATE_COOKIE];

  if (!code || !returnedState || !expectedState || !constantTimeEqual(returnedState, expectedState)) {
    return textResponse("Invalid or expired Google sign-in request. Please return to the app and try again.", 400);
  }

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code"
    })
  });

  if (!tokenResponse.ok) {
    const detail = await safeResponseText(tokenResponse);
    console.error("Google token exchange failed", tokenResponse.status, detail);
    return textResponse("Google sign-in could not be completed. Please try again.", 502);
  }

  const tokens = await tokenResponse.json();
  if (!tokens.access_token) {
    console.error("Google token response did not contain an access token");
    return textResponse("Google sign-in returned an incomplete response. Please try again.", 502);
  }

  const userResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${tokens.access_token}` }
  });

  if (!userResponse.ok) {
    const detail = await safeResponseText(userResponse);
    console.error("Google userinfo request failed", userResponse.status, detail);
    return textResponse("We signed you in with Google but could not load your profile. Please try again.", 502);
  }

  const googleUser = await userResponse.json();
  if (!googleUser.sub || !googleUser.email) {
    return textResponse("Google did not return the account information required by this app.", 502);
  }

  const session = await createSession(
    {
      sub: googleUser.sub,
      email: googleUser.email,
      name: googleUser.name || googleUser.email,
      picture: googleUser.picture || null
    },
    env.GOOGLE_CLIENT_SECRET
  );

  const headers = new Headers({ location: "/" });
  headers.append(
    "set-cookie",
    serializeCookie(OAUTH_STATE_COOKIE, "", {
      maxAge: 0,
      path: "/auth/callback",
      httpOnly: true,
      secure: true,
      sameSite: "Lax"
    })
  );
  headers.append(
    "set-cookie",
    serializeCookie(SESSION_COOKIE, session, {
      maxAge: SESSION_MAX_AGE,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax"
    })
  );

  return new Response(null, { status: 302, headers });
}

async function currentUser(request, env) {
  if (!env.GOOGLE_CLIENT_SECRET) {
    return jsonResponse({ authenticated: false }, 401);
  }

  const cookies = parseCookies(request.headers.get("cookie") || "");
  const session = cookies[SESSION_COOKIE];
  if (!session) {
    return jsonResponse({ authenticated: false }, 401);
  }

  const user = await verifySession(session, env.GOOGLE_CLIENT_SECRET);
  if (!user) {
    return jsonResponse({ authenticated: false }, 401, {
      "set-cookie": serializeCookie(SESSION_COOKIE, "", {
        maxAge: 0,
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax"
      })
    });
  }

  return jsonResponse({ authenticated: true, user });
}

function logout(url) {
  return new Response(null, {
    status: 302,
    headers: {
      location: `${url.origin}/`,
      "set-cookie": serializeCookie(SESSION_COOKIE, "", {
        maxAge: 0,
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax"
      })
    }
  });
}

function missingOAuthConfig(env) {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"].filter(
    (name) => !env[name]
  );
}

function configurationError(missing) {
  return textResponse(`OAuth configuration is missing: ${missing.join(", ")}`, 500);
}

async function createSession(user, secret) {
  const payload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

async function verifySession(value, secret) {
  const [encodedPayload, suppliedSignature, extra] = value.split(".");
  if (!encodedPayload || !suppliedSignature || extra) return null;

  const expectedSignature = await sign(encodedPayload, secret);
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture || null
    };
  } catch {
    return null;
  }
}

async function sign(value, secret) {
  const keyMaterial = new TextEncoder().encode(`strawberry-matcha-session:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", keyMaterial);
  const key = await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

function randomBase64Url(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncode(value) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function parseCookies(header) {
  const cookies = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const name = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    cookies[name] = value;
  }
  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join("; ");
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

async function safeResponseText(response) {
  try {
    return (await response.text()).slice(0, 1000);
  } catch {
    return "";
  }
}

function textResponse(message, status = 200) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" }
  });
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}
