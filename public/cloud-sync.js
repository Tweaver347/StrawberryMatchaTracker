(() => {
  "use strict";

  const SETTINGS_KEY = "smt.settings.v1";
  const SETTINGS_HYDRATED_KEY = "smt.settings.hydrated.v1";
  const nativeFetch = window.fetch.bind(window);
  const originalSetItem = Storage.prototype.setItem;

  let hydratingSettings = false;
  let settingsSyncTimer = null;

  window.fetch = async function strawberryMatchaFetch(input, init = {}) {
    const requestUrl = getRequestUrl(input);
    const sameOrigin = requestUrl?.origin === window.location.origin;
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    let nextInit = init;

    if (sameOrigin && requestUrl.pathname === "/api/entries" && method === "POST" && typeof init?.body === "string") {
      try {
        const body = JSON.parse(init.body);
        const preview = document.getElementById("photoPreview");
        if (!body.photoData && preview?.src?.startsWith("data:image/")) {
          body.photoData = preview.src;
          nextInit = { ...init, body: JSON.stringify(body) };
        }
      } catch {
        // Let the original request continue so the API can return a useful validation error.
      }
    }

    const response = await nativeFetch(input, nextInit);

    if (
      sameOrigin &&
      requestUrl.pathname === "/api/entries" &&
      response.ok &&
      response.headers.get("content-type")?.includes("application/json")
    ) {
      try {
        const data = await response.clone().json();
        if (Array.isArray(data.entries)) data.entries = data.entries.map(attachCloudPhoto);
        if (data.entry) data.entry = attachCloudPhoto(data.entry);
        return rebuiltJsonResponse(response, data);
      } catch {
        return response;
      }
    }

    return response;
  };

  Storage.prototype.setItem = function strawberryMatchaSetItem(key, value) {
    originalSetItem.call(this, key, value);
    if (this === window.localStorage && key === SETTINGS_KEY && !hydratingSettings) {
      scheduleSettingsSync(value);
    }
  };

  hydrateSettings();

  document.addEventListener("DOMContentLoaded", () => {
    const settingsDescription = document.querySelector("#settingsView .settings-heading p");
    if (settingsDescription) {
      settingsDescription.textContent = "Signed-in preferences sync across devices. Guest preferences stay on this device.";
    }
  });

  function attachCloudPhoto(entry) {
    if (!entry || typeof entry !== "object") return entry;
    if (!entry.photoData && entry.photoUrl) return { ...entry, photoData: entry.photoUrl };
    return entry;
  }

  function getRequestUrl(input) {
    try {
      if (input instanceof Request) return new URL(input.url, window.location.href);
      return new URL(String(input), window.location.href);
    } catch {
      return null;
    }
  }

  function rebuiltJsonResponse(original, data) {
    const headers = new Headers(original.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(data), {
      status: original.status,
      statusText: original.statusText,
      headers
    });
  }

  async function hydrateSettings() {
    try {
      const response = await nativeFetch("/api/settings", {
        headers: { accept: "application/json" },
        cache: "no-store"
      });

      if (!response.ok) return;
      const data = await response.json();
      const remote = data?.settings && typeof data.settings === "object" ? data.settings : {};
      const local = readLocalSettings();

      if (Object.keys(remote).length === 0) {
        if (Object.keys(local).length > 0) await pushSettings(local);
        return;
      }

      const merged = { ...local, ...remote };
      if (stableJson(local) === stableJson(merged)) return;

      hydratingSettings = true;
      originalSetItem.call(window.localStorage, SETTINGS_KEY, JSON.stringify(merged));
      hydratingSettings = false;

      if (window.sessionStorage.getItem(SETTINGS_HYDRATED_KEY) !== "1") {
        window.sessionStorage.setItem(SETTINGS_HYDRATED_KEY, "1");
        window.location.reload();
      }
    } catch {
      // Settings remain usable locally when cloud sync is unavailable.
    }
  }

  function scheduleSettingsSync(serializedValue) {
    window.clearTimeout(settingsSyncTimer);
    settingsSyncTimer = window.setTimeout(() => {
      try {
        const settings = JSON.parse(serializedValue);
        if (settings && typeof settings === "object" && !Array.isArray(settings)) {
          pushSettings(settings);
        }
      } catch {
        // Ignore malformed local settings.
      }
    }, 450);
  }

  async function pushSettings(settings) {
    try {
      await nativeFetch("/api/settings", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({ settings })
      });
    } catch {
      // Local settings still work if the network request fails.
    }
  }

  function readLocalSettings() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function stableJson(value) {
    const ordered = {};
    for (const key of Object.keys(value || {}).sort()) ordered[key] = value[key];
    return JSON.stringify(ordered);
  }
})();
