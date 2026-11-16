/** Transporte del build `demo`: la API vive en el navegador (ver demo/demo-api.ts). */
export const DEMO = true;
export {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  demoFetch as send,
  resetDemo,
} from "./demo/demo-api";
