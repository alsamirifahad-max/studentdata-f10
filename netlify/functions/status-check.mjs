import { checkAll } from "../lib/status.mjs";

// فحص دوري لحالة المنصات كل 10 دقائق
export default async () => { await checkAll(); };
export const config = { schedule: "*/10 * * * *" };
