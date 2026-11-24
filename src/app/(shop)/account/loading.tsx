import { getT } from "@/lib/i18n-server";

export default async function Loading() {
  return <p role="status">{(await getT()).common.loading}</p>;
}
