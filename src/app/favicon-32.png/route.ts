import { serveFavicon } from "@/lib/favicon-store";

export function GET(request: Request) {
  return serveFavicon(request, 32);
}
