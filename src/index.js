const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const OAUTH_STATE_COOKIE = "smt_oauth_state";
const SESSION_COOKIE = "smt_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const PHOTO_BUCKET = "matcha-photos";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_JSON_BYTES = 8 * 1024 * 1024;

const ENTRY_COLUMNS = [
  "id",
  "owner_sub",
  "owner_name",
  "owner_picture",
  "place_name",
  "location_label",
  "latitude",
  "longitude",
  "location_source",
  "rating",
  "vibe",
  "price_cents",
  "drink_size",
  "milk_type",
  "sweetness",
  "visit_date",
  "wait_minutes",
  "add_ons",
  "notes",
  "would_order_again",
  "share_community",
  "photo_path",
  "photo_mime_type",
  "status",
  "draft_step",
  "completed_at",
  "created_at",
  "updated_at"
].join(",");

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/auth/google") return startGoogleAuth(env);
      if (url.pathname === "/auth/callback") return finishGoogleAuth(request, env, url);
      if (url.pathname === "/auth/logout") return logout(url);

      if (url.pathname === "/api/me") return currentUser(request, env);
      if (url.pathname === "/api/status") return statusApi(env);
      if (url.pathname === "/api/settings") return settingsApi(request, env);
      if (url.pathname === "/api/entries") return entriesApi(request, env, url);

      const entryMatch = url.pathname.match(/^\/api\/entries\/([0-9a-f-]+)$/i);
      if (entryMatch) return entryItemApi(request, env, entryMatch[1]);

      const favoriteMatch = url.pathname.match(/^\/api\/entries\/([0-9a-f-]+)\/favorite$/i);
      if (favoriteMatch) return favoriteApi(request, env, favoriteMatch[1]);

      const photoMatch = url.pathname.match(/^\/api\/photos\/([0-9a-f-]+)$/i);
      if (photoMatch) return photoApi(request, env, photoMatch[1]);

      return serveAsset(request, env);
    } catch (error) {
      console.error("Unhandled Worker request error", {
        path: url.pathname,
        method: request.method,
        message: error instanceof Error ? error.message : String(error)
      });

      if (url.pathname.startsWith("/api/")) {
        return jsonResponse({ error: "internal_error" }, 500);
      }
      return textResponse("The app hit an unexpected error. Please try again.", 500);
    }
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
  if (googleError) {
    return textResponse(`Google sign-in was cancelled or failed: ${googleError}`, 400);
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const expectedState = cookies[OAUTH_STATE_COOKIE];

  if (!code || !returnedState || !expectedState || !constantTimeEqual(returnedState, expectedState)) {
    return textResponse("Invalid or expired Google sign-in request. Return to the app and try again.", 400);
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
  if (!tokens.access_token) {
    return textResponse("Google sign-in returned an incomplete response. Please try again.", 502);
  }

  const userResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${tokens.access_token}` }
  });

  if (!userResponse.ok) {
    console.error("Google userinfo request failed", userResponse.status, await safeResponseText(userResponse));
    return textResponse("We signed you in but could not load your Google profile. Please try again.", 502);
  }

  const googleUser = await userResponse.json();
  if (!googleUser.sub || !googleUser.email) {
    return textResponse("Google did not return the account information required by this app.", 502);
  }

  const user = {
    sub: String(googleUser.sub),
    email: String(googleUser.email),
    name: String(googleUser.name || googleUser.email),
    picture: googleUser.picture ? String(googleUser.picture) : null
  };

  if (supabaseReady(env)) {
    try {
      await upsertAppUser(env, user);
    } catch (error) {
      console.error("Could not sync signed-in user to Supabase", error instanceof Error ? error.message : error);
    }
  }

  const session = await createSession(user, sessionSecret(env));
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
  const secret = sessionSecret(env);
  if (!secret) return null;
  const cookies = parseCookies(request.headers.get("cookie") || "");
  if (!cookies[SESSION_COOKIE]) return null;
  return verifySession(cookies[SESSION_COOKIE], secret);
}

function statusApi(env) {
  return jsonResponse({
    database: supabaseReady(env),
    storage: supabaseReady(env),
    provider: supabaseReady(env) ? "supabase" : null,
    drafts: supabaseReady(env)
  });
}

async function settingsApi(request, env) {
  if (!["GET", "PUT", "PATCH"].includes(request.method)) {
    return methodNotAllowed(["GET", "PUT", "PATCH"]);
  }
  if (!supabaseReady(env)) return databaseUnavailable();

  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ error: "authentication_required" }, 401);
  await upsertAppUser(env, user);

  if (request.method === "GET") {
    const params = new URLSearchParams({
      google_sub: `eq.${user.sub}`,
      select: "settings",
      limit: "1"
    });
    const rows = await supabaseJson(env, "rest", `app_users?${params.toString()}`);
    return jsonResponse({ settings: rows[0]?.settings || {} });
  }

  const body = await readJson(request);
  if (!body || typeof body.settings !== "object" || Array.isArray(body.settings)) {
    return jsonResponse({ error: "settings_object_required" }, 400);
  }

  const incoming = sanitizeSettings(body.settings);
  const existingParams = new URLSearchParams({
    google_sub: `eq.${user.sub}`,
    select: "settings",
    limit: "1"
  });
  const currentRows = await supabaseJson(env, "rest", `app_users?${existingParams.toString()}`);
  const merged = { ...(currentRows[0]?.settings || {}), ...incoming };

  const updateParams = new URLSearchParams({ google_sub: `eq.${user.sub}` });
  await supabaseJson(env, "rest", `app_users?${updateParams.toString()}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ settings: merged, last_seen_at: new Date().toISOString() })
  });

  return jsonResponse({ settings: merged });
}

async function entriesApi(request, env, url) {
  if (!["GET", "POST"].includes(request.method)) return methodNotAllowed(["GET", "POST"]);
  if (!supabaseReady(env)) return databaseUnavailable();

  if (request.method === "GET") {
    const scope = url.searchParams.get("scope") || "community";
    const user = await getSessionUser(request, env);

    if (scope === "mine" || scope === "drafts") {
      if (!user) return jsonResponse({ error: "authentication_required" }, 401);
      await upsertAppUser(env, user);

      const params = new URLSearchParams({
        owner_sub: `eq.${user.sub}`,
        status: scope === "drafts" ? "eq.draft" : "eq.complete",
        select: ENTRY_COLUMNS,
        order: scope === "drafts" ? "updated_at.desc" : "visit_date.desc.nullslast,completed_at.desc.nullslast,created_at.desc",
        limit: "250"
      });
      const rows = await supabaseJson(env, "rest", `matcha_entries?${params.toString()}`);
      const favoriteIds = scope === "mine" ? await getFavoriteIds(env, user.sub) : new Set();
      return jsonResponse({ entries: rows.map((row) => rowToEntry(row, favoriteIds)) });
    }

    if (scope !== "community") return jsonResponse({ error: "invalid_scope" }, 400);

    const params = new URLSearchParams({
      share_community: "eq.true",
      status: "eq.complete",
      select: ENTRY_COLUMNS,
      order: "completed_at.desc.nullslast,created_at.desc",
      limit: "250"
    });
    const rows = await supabaseJson(env, "rest", `matcha_entries?${params.toString()}`);
    const favoriteIds = user ? await getFavoriteIds(env, user.sub) : new Set();
    return jsonResponse({ entries: rows.map((row) => rowToCommunityEntry(row, favoriteIds)) });
  }

  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ error: "authentication_required" }, 401);

  const body = await readJson(request);
  if (!body) return jsonResponse({ error: "invalid_json" }, 400);

  const requestedStatus = body.status === "draft" ? "draft" : "complete";
  const validation = validateEntryShape(body, requestedStatus);
  if (validation) return jsonResponse({ error: validation }, 400);

  await upsertAppUser(env, user);

  const entry = normalizeEntry(body, user, requestedStatus);
  const existing = await getEntryById(env, entry.id, "owner_sub,photo_path,photo_mime_type,created_at,status");
  if (existing && existing.owner_sub !== user.sub) {
    return jsonResponse({ error: "entry_id_conflict" }, 409);
  }

  let photoPath = existing?.photo_path || null;
  let photoMimeType = existing?.photo_mime_type || null;
  let uploadedPath = null;

  if (body.photoData) {
    const decodedPhoto = decodePhotoDataUrl(body.photoData);
    if (!decodedPhoto) return jsonResponse({ error: "invalid_photo_data" }, 400);
    if (decodedPhoto.bytes.byteLength > MAX_PHOTO_BYTES) {
      return jsonResponse({ error: "photo_too_large" }, 413);
    }

    photoPath = `${safeStorageSegment(user.sub)}/${entry.id}.${decodedPhoto.extension}`;
    photoMimeType = decodedPhoto.mimeType;
    await uploadPhoto(env, photoPath, decodedPhoto.bytes, decodedPhoto.mimeType);
    uploadedPath = photoPath;
  }

  if (requestedStatus === "complete") {
    if (!photoPath) return jsonResponse({ error: "photo_required" }, 400);
    if (!entry.placeName) return jsonResponse({ error: "place_name_required" }, 400);
    if (!entry.rating) return jsonResponse({ error: "rating_required" }, 400);
  }

  const createdAt = existing?.created_at || entry.createdAt;
  const row = entryToRow(entry, user, photoPath, photoMimeType, createdAt);
  const params = new URLSearchParams({ on_conflict: "id" });

  let savedRows;
  try {
    savedRows = await supabaseJson(env, "rest", `matcha_entries?${params.toString()}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([row])
    });
  } catch (error) {
    if (uploadedPath && uploadedPath !== existing?.photo_path) {
      await deletePhotoBestEffort(env, uploadedPath);
    }
    throw error;
  }

  if (existing?.photo_path && uploadedPath && existing.photo_path !== uploadedPath) {
    await deletePhotoBestEffort(env, existing.photo_path);
  }

  const saved = savedRows[0] || row;
  return jsonResponse({ entry: rowToEntry(saved, new Set()) }, existing ? 200 : 201);
}

async function entryItemApi(request, env, entryId) {
  if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);
  if (!supabaseReady(env)) return databaseUnavailable();
  if (!isUuid(entryId)) return jsonResponse({ error: "invalid_entry_id" }, 400);

  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ error: "authentication_required" }, 401);

  const entry = await getEntryById(env, entryId, "id,owner_sub,photo_path");
  if (!entry || entry.owner_sub !== user.sub) return jsonResponse({ error: "entry_not_found" }, 404);

  const params = new URLSearchParams({ id: `eq.${entryId}`, owner_sub: `eq.${user.sub}` });
  await supabaseJson(env, "rest", `matcha_entries?${params.toString()}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });

  if (entry.photo_path) await deletePhotoBestEffort(env, entry.photo_path);
  return new Response(null, { status: 204 });
}

async function favoriteApi(request, env, entryId) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  if (!supabaseReady(env)) return databaseUnavailable();
  if (!isUuid(entryId)) return jsonResponse({ error: "invalid_entry_id" }, 400);

  const user = await getSessionUser(request, env);
  if (!user) return jsonResponse({ error: "authentication_required" }, 401);

  const body = await readJson(request);
  if (!body || typeof body.favorite !== "boolean") {
    return jsonResponse({ error: "favorite_boolean_required" }, 400);
  }

  const entry = await getEntryById(env, entryId, "id,owner_sub,share_community,status");
  if (!entry || entry.status !== "complete" || (entry.owner_sub !== user.sub && !entry.share_community)) {
    return jsonResponse({ error: "entry_not_found" }, 404);
  }

  await upsertAppUser(env, user);

  if (body.favorite) {
    const params = new URLSearchParams({ on_conflict: "user_sub,entry_id" });
    await supabaseJson(env, "rest", `matcha_favorites?${params.toString()}`, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify([{ user_sub: user.sub, entry_id: entryId }])
    });
  } else {
    const params = new URLSearchParams({
      user_sub: `eq.${user.sub}`,
      entry_id: `eq.${entryId}`
    });
    await supabaseJson(env, "rest", `matcha_favorites?${params.toString()}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
  }

  return jsonResponse({ favorite: body.favorite });
}

async function photoApi(request, env, entryId) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD"]);
  }
  if (!supabaseReady(env)) return databaseUnavailable();
  if (!isUuid(entryId)) return jsonResponse({ error: "invalid_entry_id" }, 400);

  const entry = await getEntryById(env, entryId, "id,owner_sub,share_community,photo_path,photo_mime_type,status");
  if (!entry || !entry.photo_path) return jsonResponse({ error: "photo_not_found" }, 404);

  const user = await getSessionUser(request, env);
  const isOwner = Boolean(user && user.sub === entry.owner_sub);
  const publiclyVisible = entry.status === "complete" && entry.share_community;
  if (!publiclyVisible && !isOwner) {
    return jsonResponse({ error: "photo_not_found" }, 404);
  }

  const storageResponse = await supabaseFetch(
    env,
    "storage",
    `object/authenticated/${encodeURIComponent(PHOTO_BUCKET)}/${encodeStoragePath(entry.photo_path)}`,
    { method: request.method }
  );

  if (!storageResponse.ok) {
    console.error("Supabase photo download failed", storageResponse.status, await safeResponseText(storageResponse));
    return jsonResponse({ error: "photo_not_found" }, 404);
  }

  const headers = new Headers();
  headers.set("content-type", storageResponse.headers.get("content-type") || entry.photo_mime_type || "image/jpeg");
  headers.set("cache-control", publiclyVisible ? "public, max-age=900" : "private, max-age=300");
  headers.set("x-content-type-options", "nosniff");
  headers.set("vary", "Cookie");
  const etag = storageResponse.headers.get("etag");
  if (etag) headers.set("etag", etag);

  return new Response(request.method === "HEAD" ? null : storageResponse.body, {
    status: 200,
    headers
  });
}

async function upsertAppUser(env, user) {
  const params = new URLSearchParams({ on_conflict: "google_sub" });
  await supabaseJson(env, "rest", `app_users?${params.toString()}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      google_sub: user.sub,
      email: user.email,
      display_name: user.name,
      picture_url: user.picture || null,
      last_seen_at: new Date().toISOString()
    }])
  });
}

async function getFavoriteIds(env, userSub) {
  const params = new URLSearchParams({
    user_sub: `eq.${userSub}`,
    select: "entry_id",
    limit: "1000"
  });
  const rows = await supabaseJson(env, "rest", `matcha_favorites?${params.toString()}`);
  return new Set(rows.map((row) => row.entry_id));
}

async function getEntryById(env, entryId, columns = ENTRY_COLUMNS) {
  const params = new URLSearchParams({
    id: `eq.${entryId}`,
    select: columns,
    limit: "1"
  });
  const rows = await supabaseJson(env, "rest", `matcha_entries?${params.toString()}`);
  return rows[0] || null;
}

function rowToEntry(row, favoriteIds) {
  return {
    id: row.id,
    ownerName: row.owner_name,
    ownerPicture: row.owner_picture || null,
    placeName: row.place_name || null,
    locationLabel: row.location_label || "",
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
    locationSource: row.location_source || null,
    rating: nullableInteger(row.rating, 1, 5),
    vibe: nullableInteger(row.vibe, 1, 5),
    priceCents: nullableInteger(row.price_cents, 0, 1000000),
    drinkSize: row.drink_size || null,
    milkType: row.milk_type || null,
    sweetness: row.sweetness || null,
    visitDate: row.visit_date || null,
    waitMinutes: nullableInteger(row.wait_minutes, 0, 600),
    addOns: Array.isArray(row.add_ons) ? row.add_ons : [],
    notes: row.notes || "",
    wouldOrderAgain: typeof row.would_order_again === "boolean" ? row.would_order_again : null,
    shareCommunity: Boolean(row.share_community),
    favorite: favoriteIds.has(row.id),
    photoUrl: row.photo_path ? `/api/photos/${row.id}` : null,
    status: row.status || "complete",
    draftStep: nullableInteger(row.draft_step, 1, 3) || 1,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToCommunityEntry(row, favoriteIds) {
  return {
    id: row.id,
    placeName: row.place_name || "Published matcha",
    locationLabel: row.location_label || "",
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
    rating: nullableInteger(row.rating, 1, 5),
    favorite: favoriteIds.has(row.id),
    photoUrl: row.photo_path ? `/api/photos/${row.id}` : null,
    status: "complete",
    shareCommunity: true,
    createdAt: row.completed_at || row.created_at
  };
}

function entryToRow(entry, user, photoPath, photoMimeType, createdAt) {
  const status = entry.status === "draft" ? "draft" : "complete";
  return {
    id: entry.id,
    owner_sub: user.sub,
    owner_name: user.name,
    owner_picture: user.picture || null,
    place_name: entry.placeName,
    location_label: entry.locationLabel,
    latitude: entry.latitude,
    longitude: entry.longitude,
    location_source: entry.locationSource,
    rating: entry.rating,
    vibe: entry.vibe,
    price_cents: entry.priceCents,
    drink_size: entry.drinkSize,
    milk_type: entry.milkType,
    sweetness: entry.sweetness,
    visit_date: entry.visitDate,
    wait_minutes: entry.waitMinutes,
    add_ons: entry.addOns,
    notes: entry.notes,
    would_order_again: entry.wouldOrderAgain,
    share_community: status === "complete" ? entry.shareCommunity : false,
    photo_path: photoPath,
    photo_mime_type: photoMimeType,
    status,
    draft_step: entry.draftStep,
    completed_at: status === "complete" ? (entry.completedAt || new Date().toISOString()) : null,
    created_at: createdAt,
    updated_at: new Date().toISOString()
  };
}

function validateEntryShape(body, status) {
  if (body.placeName != null && (typeof body.placeName !== "string" || body.placeName.trim().length > 160)) {
    return "invalid_place_name";
  }

  if (body.rating != null && body.rating !== "") {
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return "rating_must_be_1_to_5";
  }

  if (body.vibe != null && body.vibe !== "") {
    const vibe = Number(body.vibe);
    if (!Number.isInteger(vibe) || vibe < 1 || vibe > 5) return "vibe_must_be_1_to_5";
  }

  if (status === "complete" && (!body.placeName || !String(body.placeName).trim())) return "place_name_required";
  if (status === "complete" && (!Number.isInteger(Number(body.rating)) || Number(body.rating) < 1 || Number(body.rating) > 5)) return "rating_required";
  if (body.notes != null && String(body.notes).length > 500) return "notes_too_long";

  if (body.latitude != null && body.latitude !== "") {
    const latitude = Number(body.latitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return "invalid_latitude";
  }

  if (body.longitude != null && body.longitude !== "") {
    const longitude = Number(body.longitude);
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return "invalid_longitude";
  }

  if (body.photoData != null && typeof body.photoData !== "string") return "invalid_photo_data";
  return null;
}

function normalizeEntry(body, user, status) {
  return {
    id: isUuid(body.id) ? body.id.toLowerCase() : crypto.randomUUID(),
    ownerName: user.name,
    ownerPicture: user.picture || null,
    placeName: cleanString(body.placeName, 160),
    locationLabel: cleanString(body.locationLabel, 400),
    latitude: nullableNumber(body.latitude),
    longitude: nullableNumber(body.longitude),
    locationSource: cleanString(body.locationSource, 24),
    rating: nullableInteger(body.rating, 1, 5),
    vibe: nullableInteger(body.vibe, 1, 5),
    priceCents: nullableInteger(body.priceCents, 0, 1000000),
    drinkSize: cleanString(body.drinkSize, 40),
    milkType: cleanString(body.milkType, 60),
    sweetness: cleanString(body.sweetness, 40),
    visitDate: cleanDate(body.visitDate),
    waitMinutes: nullableInteger(body.waitMinutes, 0, 600),
    addOns: Array.isArray(body.addOns)
      ? body.addOns.map((value) => cleanString(value, 80)).filter(Boolean).slice(0, 12)
      : [],
    notes: cleanString(body.notes, 500) || "",
    wouldOrderAgain: typeof body.wouldOrderAgain === "boolean" ? body.wouldOrderAgain : null,
    shareCommunity: status === "complete" && Boolean(body.shareCommunity),
    favorite: false,
    status,
    draftStep: nullableInteger(body.draftStep, 1, 3) || 1,
    completedAt: status === "complete" ? (cleanTimestamp(body.completedAt) || new Date().toISOString()) : null,
    createdAt: cleanTimestamp(body.createdAt) || new Date().toISOString()
  };
}

function sanitizeSettings(settings) {
  const result = {};

  if (["system", "light", "dark"].includes(settings.theme)) result.theme = settings.theme;
  if (["normal", "large", "xlarge"].includes(settings.textSize)) result.textSize = settings.textSize;

  for (const key of ["highContrast", "reduceMotion", "readableFont", "largeTargets", "reduceClutter", "tourComplete"]) {
    if (typeof settings[key] === "boolean") result[key] = settings[key];
  }

  for (const [key, maxLength] of [
    ["defaultMilk", 60],
    ["defaultSweetness", 40],
    ["defaultSize", 40],
    ["defaultAddOns", 400]
  ]) {
    if (typeof settings[key] === "string") result[key] = settings[key].slice(0, maxLength);
  }

  if (settings.earnedAchievements && typeof settings.earnedAchievements === "object" && !Array.isArray(settings.earnedAchievements)) {
    const earned = {};
    for (const [key, value] of Object.entries(settings.earnedAchievements).slice(0, 50)) {
      if (!/^[a-z0-9-]{1,80}$/.test(key)) continue;
      const timestamp = cleanTimestamp(value);
      if (timestamp) earned[key] = timestamp;
    }
    result.earnedAchievements = earned;
  }

  return result;
}

function decodePhotoDataUrl(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:(image\/(?:jpeg|png|webp|heic|heif));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const base64 = match[2].replace(/\s+/g, "");
  if (base64.length > Math.ceil(MAX_PHOTO_BYTES * 4 / 3) + 16) return null;

  let binary;
  try {
    binary = atob(base64);
  } catch {
    return null;
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const extensionByMime = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif"
  };

  return {
    mimeType,
    extension: extensionByMime[mimeType],
    bytes
  };
}

async function uploadPhoto(env, path, bytes, mimeType) {
  const response = await supabaseFetch(
    env,
    "storage",
    `object/${encodeURIComponent(PHOTO_BUCKET)}/${encodeStoragePath(path)}`,
    {
      method: "POST",
      headers: {
        "content-type": mimeType,
        "cache-control": "3600",
        "x-upsert": "true"
      },
      body: bytes
    }
  );

  if (!response.ok) {
    const detail = await safeResponseText(response);
    console.error("Supabase photo upload failed", response.status, detail);
    throw new Error(`photo_upload_failed_${response.status}`);
  }
}

async function deletePhotoBestEffort(env, path) {
  try {
    const response = await supabaseFetch(
      env,
      "storage",
      `object/${encodeURIComponent(PHOTO_BUCKET)}/${encodeStoragePath(path)}`,
      { method: "DELETE" }
    );
    if (!response.ok && response.status !== 404) {
      console.warn("Could not clean up Supabase photo", response.status, await safeResponseText(response));
    }
  } catch (error) {
    console.warn("Could not clean up Supabase photo", error instanceof Error ? error.message : error);
  }
}

function supabaseReady(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY);
}

async function supabaseJson(env, service, path, init = {}) {
  const response = await supabaseFetch(env, service, path, init);
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    console.error("Supabase request failed", {
      service,
      path: path.split("?")[0],
      status: response.status,
      detail: typeof data === "string" ? data.slice(0, 500) : data
    });
    throw new Error(`supabase_${service}_${response.status}`);
  }

  return data ?? [];
}

function supabaseFetch(env, service, path, init = {}) {
  if (!supabaseReady(env)) throw new Error("supabase_not_configured");

  const base = String(env.SUPABASE_URL).replace(/\/+$/, "");
  const prefix = service === "storage" ? "/storage/v1/" : "/rest/v1/";
  const headers = new Headers(init.headers || {});
  const key = String(env.SUPABASE_SECRET_KEY);

  headers.set("apikey", key);
  headers.set("accept", headers.get("accept") || "application/json");

  if (!key.startsWith("sb_secret_") && key.split(".").length === 3) {
    headers.set("authorization", `Bearer ${key}`);
  }

  if (init.body && !headers.has("content-type") && service === "rest") {
    headers.set("content-type", "application/json");
  }

  return fetch(`${base}${prefix}${path}`, { ...init, headers });
}

async function serveAsset(request, env) {
  const response = await env.ASSETS.fetch(request);
  if (!response.ok) return response;

  const url = new URL(request.url);
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(self), geolocation=(self)");

  if (url.pathname === "/" || url.pathname === "/index.html") {
    headers.set("cache-control", "no-cache");
  }

  return new Response(response.body, { status: response.status, headers });
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

function sessionSecret(env) {
  return env.SESSION_SECRET || env.GOOGLE_CLIENT_SECRET || "";
}

function missingOAuthConfig(env) {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"].filter((name) => !env[name]);
}

function configurationError(missing) {
  return textResponse(`OAuth configuration is missing: ${missing.join(", ")}`, 500);
}

function databaseUnavailable() {
  return jsonResponse({ error: "database_not_configured", entries: [] }, 503);
}

async function createSession(user, secret) {
  const payload = {
    sub: user.sub,
    email: user.email,
    name: user.name,
    picture: user.picture || null,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

async function verifySession(value, secret) {
  const [encodedPayload, suppliedSignature, extra] = String(value).split(".");
  if (!encodedPayload || !suppliedSignature || extra) return null;

  const expectedSignature = await sign(encodedPayload, secret);
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!payload.sub || !payload.email) return null;

    return {
      sub: String(payload.sub),
      email: String(payload.email),
      name: String(payload.name || payload.email),
      picture: payload.picture ? String(payload.picture) : null
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
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

async function readJson(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_JSON_BYTES) return null;
  try {
    return await request.json();
  } catch {
    return null;
  }
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

function cleanTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeStorageSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

function encodeStoragePath(path) {
  return String(path).split("/").map(encodeURIComponent).join("/");
}

async function safeResponseText(response) {
  try {
    return (await response.text()).slice(0, 1000);
  } catch {
    return "";
  }
}

function methodNotAllowed(methods) {
  return jsonResponse({ error: "method_not_allowed" }, 405, { allow: methods.join(", ") });
}

function textResponse(message, status = 200) {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store"
    }
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
