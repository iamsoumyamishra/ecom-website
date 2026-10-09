import { proxyFor } from "@commerce/api-client/proxy";
export const runtime = "nodejs";
const proxy = proxyFor("shop");
export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
