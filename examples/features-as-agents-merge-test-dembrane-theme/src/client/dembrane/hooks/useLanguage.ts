// example: ours, in place of echo's, which reads the language from the path
// and loads its messages. Here it's English.
export const useLanguage = () => ({
  language: "en-US",
  iso639_1: "en",
  changeLanguage: (_language: string) => {},
});
