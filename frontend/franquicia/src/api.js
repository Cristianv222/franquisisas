import { getAccess, getRefresh, setTokens, logout } from "./auth";

const BASE = "/api";

// Refresh single-flight: un solo refresh a la vez, aunque varias peticiones
// reciban 401 al mismo tiempo (evita la carrera con la rotación de tokens).
let refreshPromise = null;

function refrescarToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(BASE + "/auth/refresh/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: getRefresh() }),
    })
      .then(async (r) => {
        if (r.ok) {
          const d = await r.json();
          setTokens(d.access, d.refresh);
          return true;
        }
        return false;
      })
      .catch(() => false)
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function request(path, { method = "GET", body, form } = {}) {
  const build = () => {
    const headers = {};
    const access = getAccess();
    if (access) headers["Authorization"] = "Bearer " + access;
    const opts = { method, headers };
    if (form) {
      opts.body = form; // el navegador pone el Content-Type con boundary
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return opts;
  };

  let res = await fetch(BASE + path, build());
  if (res.status === 401 && getRefresh()) {
    const ok = await refrescarToken();
    if (ok) {
      res = await fetch(BASE + path, build());
    } else {
      logout();
      window.location.replace("/");
    }
  }
  return res;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: "POST", body }),
  postForm: (p, form) => request(p, { method: "POST", form }),
  patch: (p, body) => request(p, { method: "PATCH", body }),
  del: (p) => request(p, { method: "DELETE" }),
};
