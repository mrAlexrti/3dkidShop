import { getT } from "@/lib/i18n-server";
import { LoaderCircle } from "lucide-react";

export default async function Loading() {
  return <div className="ac-state ac-panel" role="status"><LoaderCircle size={24} aria-hidden="true" />{(await getT()).common.loading}</div>;
}
