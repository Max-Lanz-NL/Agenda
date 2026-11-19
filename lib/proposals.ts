import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const cloud = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
}) : null;

export type Proposal = {
  id: string; incoming: boolean; sender: string; day: string; start: string; end: string;
  message: string; status: 'pending' | 'accepted' | 'declined';
};

export function localBrowserKey() {
  const storageKey = 'agenda-local-browser';
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  const key = crypto.randomUUID();
  localStorage.setItem(storageKey, key);
  return key;
}

export async function proposalsRequest(body?: object) {
  const session = await cloud?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (cloud && !token) return { code: 'login' };
  const identity = token ? { Authorization: 'Bearer ' + token } : { 'x-agenda-browser': localBrowserKey() };
  const response = await fetch('/api/proposals', {
    method: body ? 'POST' : 'GET',
    headers: { ...identity, 'Content-Type': 'application/json' } as HeadersInit,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  return response.json() as Promise<{ code?: string; proposals?: Proposal[] }>;
}
