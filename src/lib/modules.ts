import { Building2, FolderSearch, LayoutDashboard, MapPin, Route, ShieldHalf, Users } from "lucide-react";

/** The portal's modules, in navigation order. */
export const MODULES = [
  { to: "/", label: "Control", icon: LayoutDashboard },
  { to: "/operations", label: "Operations", icon: Route },
  { to: "/people", label: "People", icon: Users },
  { to: "/clients", label: "Clients", icon: Building2 },
  { to: "/risk", label: "Threat Modelling", icon: ShieldHalf },
  { to: "/intelligence", label: "Intelligence", icon: MapPin },
  { to: "/investigations", label: "Investigations", icon: FolderSearch },
] as const;

/** The module a path belongs to. */
export const moduleFor = (pathname: string) => MODULES.find((m) => (m.to === "/" ? pathname === "/" : pathname.startsWith(m.to)))?.label ?? "";
