// example: ours, in place of echo's, which links within its router and
// keeps the language in the path. Here a link is a link.
import type { AnchorHTMLAttributes } from "react";

export const I18nLink = ({
  to,
  children,
  ...props
}: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a href={to} {...props}>
    {children}
  </a>
);
