// example: stands in for `@lingui/core/macro`, so copied files keep their
// `t` calls. Every message is its English source text.

type Descriptor = { id?: string; message?: string; comment?: string };

/** `t\`Close\``, `t\`${n} left\`` or `t({ message: "Close" })`. */
export function t(strings: TemplateStringsArray | Descriptor, ...values: unknown[]): string {
  if (!Array.isArray(strings)) {
    const d = strings as Descriptor;
    return d.message ?? d.id ?? "";
  }
  return strings.reduce((out, s, i) => out + s + (i < values.length ? String(values[i]) : ""), "");
}

/** Lazy messages read the same here. */
export const msg = t;

export function plural(
  value: number,
  forms: { one?: string; other: string; [n: `=${number}`]: string },
): string {
  const exact = forms[`=${value}` as `=${number}`];
  const form = exact ?? (value === 1 && forms.one ? forms.one : forms.other);
  return form.replace("#", String(value));
}
