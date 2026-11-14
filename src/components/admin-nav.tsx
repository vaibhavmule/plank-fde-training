"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";

const links = [
  { href: "/admin", label: "Overview" },
  { href: "/requests", label: "Requests" },
  { href: "/dashboards", label: "Dashboards" },
  { href: "/admin/assistant", label: "Assistant" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin navigation" className="flex flex-col gap-1">
      {links.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={buttonVariants({
              variant: active ? "secondary" : "ghost",
              className: "justify-start",
            })}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
