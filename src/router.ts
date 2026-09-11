// Hash 路由（自写 useHashRoute，不引 react-router）：#/accounts/3 → { page: 'accounts', id: 3 }
import { useEffect, useState } from 'react';

export interface Route {
  page: string;
  id?: number;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [page, idStr] = raw.split('/');
  const id = idStr && /^\d+$/.test(idStr) ? Number(idStr) : undefined;
  return { page: page || 'dashboard', id };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(to: string) {
  window.location.hash = to.startsWith('#') ? to : `#${to}`;
}
