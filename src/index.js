export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/auth/google") {
      return new Response("Google OAuth route is ready for configuration.", {
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }

    if (url.pathname === "/auth/callback") {
      return new Response("Google OAuth callback route is ready for configuration.", {
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }

    return env.ASSETS.fetch(request);
  }
};
