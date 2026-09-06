import { PART as A } from "./registry-a.js";
import { PART as B } from "./registry-b.js";
export const TOOLS = A.concat(B);
export function getTool(id) {
  return TOOLS.find((t) => t.id === id) || null;
}
