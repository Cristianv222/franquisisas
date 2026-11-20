// Tokens compartidos por origen (mismo host:puerto) entre las dos SPAs.
export function setTokens(access, refresh) {
  if (access) localStorage.setItem("access", access);
  if (refresh) localStorage.setItem("refresh", refresh);
}
export function getAccess() {
  return localStorage.getItem("access");
}
export function getRefresh() {
  return localStorage.getItem("refresh");
}
export function logout() {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
}
export function claims() {
  const t = getAccess();
  if (!t) return null;
  try {
    return JSON.parse(atob(t.split(".")[1]));
  } catch {
    return null;
  }
}
export function role() {
  return claims()?.role || null;
}
export function franquiciaId() {
  return claims()?.franquicia_id ?? null;
}
