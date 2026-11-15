import Link from "next/link";
import type { ComponentProps, ButtonHTMLAttributes } from "react";

/**
 * LAND VIEW private-control contract.
 *
 * Never style a new button by combining arbitrary .primary / .active CSS.
 * Pair its background and text with the variant mapped by
 * app/private-control-system.css. This component is render-only and works in
 * server or client components; it does not alter action handlers or routing.
 */
export type LVControlVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "soft"
  | "success"
  | "success-solid"
  | "danger"
  | "danger-solid"
  | "warning"
  | "tab-active";

export type LVButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: LVControlVariant;
};

export function LVButton({
  variant = "secondary",
  type = "button",
  ...props
}: LVButtonProps) {
  return <button {...props} type={type} data-lv-button={variant} />;
}

export type LVButtonLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  variant?: LVControlVariant;
};

export function LVButtonLink({
  variant = "secondary",
  ...props
}: LVButtonLinkProps) {
  return <Link {...props} data-lv-button={variant} />;
}
