import { useCallback, useEffect, useState } from 'react';
import { getProfile } from '../api/projectMentorApi';
import { useAuth } from './AuthContext';

// The signed-in student's profile (photo, badge, progress), shared by the navbar, community and profile page.
let cache = null;
let cacheFor = '';
const listeners = new Set();

export function setMe(profile) {
  cache = profile;
  listeners.forEach(l => l(profile));
}

export function useMe() {
  const { token, user } = useAuth();
  const [me, setLocal] = useState(cacheFor === user?.userId ? cache : null);

  const reload = useCallback(async () => {
    if (!token) return null;
    const p = await getProfile(token);
    cacheFor = p.id;
    setMe(p);
    return p;
  }, [token]);

  useEffect(() => {
    listeners.add(setLocal);
    if (token && (cacheFor !== user?.userId || !cache)) reload().catch(() => {});
    return () => listeners.delete(setLocal);
  }, [token, user?.userId, reload]);

  return { me: token ? me : null, reload };
}
