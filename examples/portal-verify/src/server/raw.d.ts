// Vite's `?raw` imports a file as a string, such as a prompt template.
declare module "*?raw" {
  const text: string;
  export default text;
}
