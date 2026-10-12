// example: ours, in place of echo's, which loads the language's messages.
// The Lingui shims need none.
import type { ReactNode } from "react";

export const I18nProvider = ({ children }: { children: ReactNode }) => <>{children}</>;
