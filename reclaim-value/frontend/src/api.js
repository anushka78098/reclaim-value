export const api = async (path, { method = 'GET', body, form } = {}) => {
  const token = localStorage.getItem('rv_token');
  const res = await fetch('/api' + path, { method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) }, body: form || (body && JSON.stringify(body)) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};
export const inr = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
