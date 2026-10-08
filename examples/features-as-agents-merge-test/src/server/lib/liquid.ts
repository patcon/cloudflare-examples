import { Liquid } from "liquidjs";

/**
 * Renders the original's Jinja prompt templates with LiquidJS, whose `{{ }}`
 * and `{% if %}` match the Jinja they use. Nunjucks, which the original
 * uses, compiles templates with `new Function`, which Workers don't allow.
 */

// No HTML escaping, as Jinja doesn't escape .jinja files: transcripts
// go in as written.
const liquid = new Liquid();

/** Parses a template once, and renders it as Jinja would. */
export function template(source: string) {
  const parsed = liquid.parse(source);
  // Jinja drops one trailing newline from each template.
  return (vars: Record<string, unknown> = {}) => liquid.renderSync(parsed, vars).replace(/\n$/, "");
}
