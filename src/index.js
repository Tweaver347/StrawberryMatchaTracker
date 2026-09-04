const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const OAUTH_STATE_COOKIE = "smt_oauth_state";
const SESSION_COOKIE = "smt_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/auth/google") return startGoogleAuth(env);
    if (url.pathname === "/auth/callback") return finishGoogleAuth(request, env, url);
    if (url.pathname === "/auth/logout") return logout(url);

    if (url.pathname === "/api/me") return currentUser(request, env);
    if (url.pathname === "/api/status") return jsonResponse({ database: Boolean(env.DB) });
    if (url.pathname === "/api/entries") return entriesApi(request, env, url);

    const favoriteMatch = url.pathname.match(/^\/api\/entries\/([^/]+)\/favorite$/);
    if (favoriteMatch) return favoriteApi(request, env, decodeURIComponent(favoriteMatch[1]));

    return env.ASSETS.fetch(request);
  }
};

function startGoogleAuth(env) {
  const missing = missingOAuthConfig(env);
  if (missing.length) return configurationError(missing);

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
  if (missing.length) return configurationError(missing);

  const googleError = url.searchParams.get("error");
  if (googleError) return textResponse(`Google sign-in was cancelled or failed: ${googleError}`, 400);

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
    console.error("Google token exchange failed", tokenResponse.status, await safeResponseText(tokenResponse));
    return textResponse("Google sign-in could not be completed. Please try again.", 502);
  }

  const tokens = await tokenResponse.json();
  if (!tokens.access_token) return textResponse("Google sign-in returned an incomplete response. Please try again.", 502);

  const userResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${tokens.access_token}` }
  });

  if (!userResponse.ok) {
    console.error("Google userinfo request failed", userResponse.status, await safeResponseText(userResponse));
    return textResponse("We signed you in with Google but could not load your profile. Please try again.", 502);
  }

  const googleUser = await userResponse.json();
  if (!googleUser.sub || !googleUser.email) return textResponse("Google did not return the account information required by this app.", 502);

  const user = {
    sub: googleUser.sub,
    email: googleUser.email,
    name: googleUser.name || googleUser.email,
    picture: googleUser.picture || null
  };

  if (env.DB) {
    try {
      await env.DB.prepare(`
        INSERT INTO users (google_sub, email, name, picture_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(google_sub) DO UPDATE SET
          email = excluded.email,
          name = excluded.name,
          picture_url = excluded.picture_url,
          updated_at = datetime('now')
      `).bind(user.sub, user.email, user.name, user.picture).run();
    } catch (error) {
      console.error("Could not upsert signed-in user", error);
    }
  }

  const session = await createSession(user, env.GOOGLE_CLIENT_SECRET);
  const headers = new Headers({ location: "/" });
  headers.append("set-cookie", serializeCookie(OAUTH_STATE_COOKIE, "", {
    maxAge: 0,
    path: "/auth/callback",
    httpOnly: true,
    secure: true,
    sameSite: "Lax"
  }));
  headers.append("set-cookie", serializeCookie(SESSION_COOKIE, session, {
    maxAge: SESSION_MAX_AGE,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax"
  }));
  return new Response(null, { status: 302, headers });
}

async function currentUser(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ authenticated: false }, 401);
  return jsonResponse({ authenticated: true, user });
}

async function getSessionUser(request, env) {
  if (!env.GOOGLE_CLIENT_SECRET) return null;
  const cookies = parseCookies(request.headers.get("cookie") || "");
  if (!cookies[SESSION_COOKIE]) return null;
  return verifySession(cookies[SESSION_COOKIE], env.GOOGLE_CLIENT_SECRET);
}

async function entriesApi(request, env, url) {
  if (!env.DB) return jsonResponse({ error: "database_not_configured", entries: [] }, 503);

  if (request.method === "GET") {
    const scope = url.searchParams.get("scope") || "community";
    const user = await getSessionUser(request, env);

    if (scope === "mine") {
      if (!user) return jsonResponse({ error: "authentication_required" }, 401);
      const result = await env.DB.prepare(`
        SELECT e.*,
          EXISTS(SELECT 1 FROM favorites f WHERE f.entry_id = e.id AND f.user_sub = ?) AS favorite
        FROM entries e
        WHERE e.owner_sub = ?
        ORDER BY COALESCE(e.visit_date, e.created_at) DESC
        LIMIT 250
      `).bind(user.sub, user.sub).all();
      return jsonResponse({ entries: (result.results || []).map(rowToEntry) });
    }

    if (scope !== "community") return jsonResponse({ error: "invalid_scope" }, 400);

    let result;
    if (user) {
      result = await env.DB.prepare(`
        SELECT e.*,
          EXISTS(SELECT 1 FROM favorites f WHERE f.entry_id = e.id AND f.user_sub = ?) AS favorite
        FROM entries e
        WHERE e.share_community = 1
        ORDER BY e.created_at DESC
        LIMIT 250
      `).bind(user.sub).all();
    } else {
      result = await env.DB.prepare(`
        SELECT e.*, 0 AS favorite
        FROM entries e
        WHERE e.share_community = 1
        ORDER BY e.created_at DESC
        LIMIT 250
      `).all();
    }
    return jsonResponse({ entries: (result.results || []).map(rowToEntry) });
  }

  if (request.method === "POST") {
    const user = await getSessionUser(request, env);
    if (!user) return jsonResponse({ error: "authentication_required" }, 401);

    const body = await readJson(request);
    if (!body) return jsonResponse({ error: "invalid_json" }, 400);
    const validation = validateEntry(body);
    if (validation) return jsonResponse({ error: validation }, 400);

    const entry = normalizeEntry(body, user);
    await env.DB.prepare(`
      INSERT INTO entries (
        id, owner_sub, owner_name, owner_picture, place_name, location_label,
        latitude, longitude, location_source, rating, vibe, price_cents,
        drink_size, milk_type, sweetness, visit_date, wait_minutes, add_ons,
        notes, would_order_again, share_community, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      entry.id,
      user.sub,
      user.name,
      user.picture,
      entry.placeName,
      entry.locationLabel,
      entry.latitude,
      entry.longitude,
      entry.locationSource,
      entry.rating,
      entry.vibe,
      entry.priceCents,
      entry.drinkSize,
      entry.milkType,
      entry.sweetness,
      entry.visitDate,
      entry.waitMinutes,
      JSON.stringify(entry.addOns),
      entry.notes,
      entry.wouldOrderAgain ? 1 : 0,
      entry.shareCommunity ? 1 : 0,
      entry.createdAt,
      entry.createdAt
    ).run();

    return jsonResponse({ entry }, 201);
  }

  return methodNotAllowed(["GET", "POST"]);
}

async function favoriteApi(request, env, entryId) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  if (!env.DB) return jsonResponse({ error: "database_not_configured" }, 503);

  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ error: "authentication_required" }, 401);
  const body = await readJson(request);
  if (!body || typeof body.favorite !== "boolean") return jsonResponse({ error: "favorite_boolean_required" }, 400);

  const visible = await env.DB.prepare(`
    SELECT id FROM entries
    WHERE id = ? AND (owner_sub = ? OR share_community = 1)
  `).bind(entryId, user.sub).first();
  if (!visible) return jsonResponse({ error: "entry_not_found" }, 404);

  if (body.favorite) {
    await env.DB.prepare(`
      INSERT INTO favorites (user_sub, entry_id, created_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(user_sub, entry_id) DO NOTHING
    `).bind(user.sub, entryId).run();
  } else {
    await env.DB.prepare("DELETE FROM favorites WHERE user_sub = ? AND entry_id = ?").bind(user.sub, entryId).run();
  }
  return jsonResponse({ favorite: body.favorite });
}

function validateEntry(body) {
  if (typeof body.placeName !== "string" || !body.placeName.trim() || body.placeName.length > 160) return "place_name_required";
  const rating = Number(body.rating);
  const vibe = Number(body.vibe);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return "rating_must_be_1_to_5";
  if (!Number.isInteger(vibe) || vibe < 1 || vibe > 5) return "vibe_must_be_1_to_5";
  if (body.notes != null && String(body.notes).length > 500) return "notes_too_long";
  if (body.latitude != null && (!Number.isFinite(Number(body.latitude)) || Number(body.latitude) < -90 || Number(body.latitude) > 90)) return "invalid_latitude";
  if (body.longitude != null && (!Number.isFinite(Number(body.longitude)) || Number(body.longitude) < -180 || Number(body.longitude) > 180)) return "invalid_longitude";
  return null;
}

function normalizeEntry(body, user) {
  return {
    id: typeof body.id === "string" && /^[0-9a-f-]{20,40}$/i.test(body.id) ? body.id : crypto.randomUUID(),
    ownerName: user.name,
    ownerPicture: user.picture || null,
    placeName: body.placeName.trim().slice(0, 160),
    locationLabel: cleanString(body.locationLabel, 400),
    latitude: nullableNumber(body.latitude),
    longitude: nullableNumber(body.longitude),
    locationSource: cleanString(body.locationSource, 24),
    rating: Number(body.rating),
    vibe: Number(body.vibe),
    priceCents: nullableInteger(body.priceCents, 0, 1000000),
    drinkSize: cleanString(body.drinkSize, 40),
    milkType: cleanString(body.milkType, 60),
    sweetness: cleanString(body.sweetness, 40),
    visitDate: cleanDate(body.visitDate),
    waitMinutes: nullableInteger(body.waitMinutes, 0, 600),
    addOns: Array.isArray(body.addOns) ? body.addOns.map((value) => cleanString(value, 80)).filter(Boolean).slice(0, 12) : [],
    notes: cleanString(body.notes, 500) || "",
    wouldOrderAgain: Boolean(body.wouldOrderAgain),
    shareCommunity: Boolean(body.shareCommunity),
    favorite: false,
    createdAt: new Date().toISOString()
  };
}

function rowToEntry(row) {
  let addOns = [];
  try { addOns = JSON.parse(row.add_ons || "[]"); } catch {}
  return {
    id: row.id,
    ownerName: row.owner_name,
    ownerPicture: row.owner_picture || null,
    placeName: row.place_name,
    locationLabel: row.location_label || "",
    latitude: row.latitude,
    longitude: row.longitude,
    locationSource: row.location_source || null,
    rating: Number(row.rating),
    vibe: Number(row.vibe),
    priceCents: row.price_cents,
    drinkSize: row.drink_size || null,
    milkType: row.milk_type || null,
    sweetness: row.sweetness || null,
    visitDate: row.visit_date || null,
    waitMinutes: row.wait_minutes,
    addOns: Array.isArray(addOns) ? addOns : [],
    notes: row.notes || "",
    wouldOrderAgain: Boolean(row.would_order_again),
    shareCommunity: Boolean(row.share_community),
    favorite: Boolean(row.favorite),
    createdAt: row.created_at
  };
}

function cleanString(value, maxLength) {
  if (value == null) return null;
  const cleaned = String(value).trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function nullableNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableInteger(value, min, max) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number)) return null;
  return Math.max(min, Math.min(max, number));
}

function cleanDate(value) {
  if (!value) return null;
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
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
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"].filter((name) => !env[name]);
}

function configurationError(missing) {
  return textResponse(`OAuth configuration is missing: ${missing.join(", ")}`, 500);
}

async function createSession(user, secret) {
  const payload = { ...user, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE };
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
    return { sub: payload.sub, email: payload.email, name: payload.name, picture: payload.picture || null };
  } catch { return null; }
}

async function sign(value, secret) {
  const keyMaterial = new TextEncoder().encode(`strawberry-matcha-session:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", keyMaterial);
  const key = await crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
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
    cookies[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
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
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

async function safeResponseText(response) {
  try { return (await response.text()).slice(0, 1000); } catch { return ""; }
}

function textResponse(message, status = 200) {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders }
  });
}

function methodNotAllowed(methods) {
  return new Response("Method not allowed", { status: 405, headers: { allow: methods.join(", ") } });
}
