// example: ours, in place of echo's, which loads a workspace's own logo.
// Here there's none, so the dembrane logo shows.
export const useWhitelabelLogo = (): { logoUrl: string | null | undefined } => ({
  logoUrl: null,
});
