import { Building2, LayoutDashboard, MapPin, Phone, Route, UserPlus, Users, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  route: Route,
  "user-plus": UserPlus,
  users: Users,
  "building-2": Building2,
  "map-pin": MapPin,
  phone: Phone,
};

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const Cmp = ICONS[name];
  if (!Cmp) return null;
  return <Cmp size={size} strokeWidth={2} aria-hidden />;
}
