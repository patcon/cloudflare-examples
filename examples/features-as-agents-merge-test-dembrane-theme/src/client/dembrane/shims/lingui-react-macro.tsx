// example: stands in for `@lingui/react/macro`, so copied files keep their
// `<Trans>`. Every message is its English source text.
import type { ReactNode } from "react";
import { msg, plural, t } from "./lingui-core-macro";

export function Trans({ children }: { children?: ReactNode; id?: string; comment?: string }) {
  return <>{children}</>;
}

export function Plural({
  value,
  one,
  other,
}: {
  value: number;
  one?: ReactNode;
  other: ReactNode;
}) {
  const form = value === 1 && one !== undefined ? one : other;
  return <>{typeof form === "string" ? form.replace("#", String(value)) : form}</>;
}

export function useLingui() {
  return { t, msg, plural, i18n: { locale: "en" } };
}
