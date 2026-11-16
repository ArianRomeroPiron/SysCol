/**
 * Transporte de la API. En el build normal habla con el backend real.
 * El build `demo` reemplaza este archivo por `transport.demo.ts`.
 */
export const DEMO = false;
export const DEMO_EMAIL = "";
export const DEMO_PASSWORD = "";
export const send = (input: string, init?: RequestInit) => fetch(input, init);
export const resetDemo = () => {};
