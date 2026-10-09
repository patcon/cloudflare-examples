// example: stands in for `posthog-js`. Nothing is sent anywhere.
const posthog = {
  capture: (_event: string, _properties?: Record<string, unknown>) => {},
};
export default posthog;
