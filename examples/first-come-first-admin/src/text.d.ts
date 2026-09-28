// The pages, bundled as text by the "rules" in wrangler.jsonc.
declare module "*.html" {
  const text: string;
  export default text;
}
declare module "*.css" {
  const text: string;
  export default text;
}
