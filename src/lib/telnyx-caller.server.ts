// Picks the caller ID for outgoing calls: a verified/owned Saudi (+966) number first,
// because Saudi/Yemeni carriers block US VoIP numbers; falls back to the configured number.
export async function preferredCallerId(key: string): Promise<string> {
  const h = { Authorization: `Bearer ${key}` };
  const [ver, own] = await Promise.all([
    fetch("https://api.telnyx.com/v2/verified_numbers?page[size]=50", { headers: h }).then((r) => r.json()).catch(() => null),
    fetch("https://api.telnyx.com/v2/phone_numbers?page[size]=50", { headers: h }).then((r) => r.json()).catch(() => null),
  ]);
  const nums = [
    ...((ver?.data ?? []) as any[]).filter((n) => n.verified_at).map((n) => String(n.phone_number)),
    ...((own?.data ?? []) as any[]).map((n) => String(n.phone_number)),
  ];
  return nums.find((n) => n.startsWith("+966")) ?? process.env["TELNYX_FROM"] ?? process.env["TELNYX_FROM_NUMBER"] ?? nums[0] ?? "";
}
