// utils.js
export const debounce = (fn, wait = 250) => {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
};

export const uid = (prefix = "id") =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;

const bus = new EventTarget();
export const on = (type, handler) => {
  const wrapped = (e) => handler(e.detail);
  bus.addEventListener(type, wrapped);
  return () => bus.removeEventListener(type, wrapped);
};
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

export const safeParse = (json, fallback) => {
  try { return JSON.parse(json); } catch { return fallback; }
};