import { queryOptions } from "@tanstack/react-query";
import { smsSetup } from "./sms.functions";
export function smsQueryOptions(userId: string) {
  return queryOptions({ queryKey: ["sms", userId], queryFn: () => smsSetup(), staleTime: 30000, retry: false });
}