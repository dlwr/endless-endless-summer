export function isDashboardPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

export function isFollowingPath(pathname: string): boolean {
  return pathname === "/following" || pathname.startsWith("/following/");
}

export function onRouteChange(callback: () => void): void {
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method].bind(history);
    history[method] = (...args: Parameters<History["pushState"]>) => {
      original(...args);
      callback();
    };
  }
  window.addEventListener("popstate", callback);
}
