import type { Bootstrap } from './types';

export async function fetchBootstrap(): Promise<Bootstrap> {
  const res = await fetch('/api/bootstrap');
  if (!res.ok) throw new Error(`bootstrap failed: ${res.status}`);
  return res.json() as Promise<Bootstrap>;
}
