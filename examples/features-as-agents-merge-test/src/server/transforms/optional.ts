import { defineTransform } from "@durability/transforms";

/** How long another agent has to answer, by default, before its caller goes on without it. */
const ANSWER_WITHIN_MS = 5_000;

export interface OptionalOptions {
  /** Who's being asked, for the log. */
  label: string;
  /**
   * What the call gives when there's no answer. The stub's types don't
   * change, so this should fit the method's type, or the caller's own
   * type should allow for it, as `gather`'s `T | null` does.
   */
  else: unknown;
  within?: number;
}

/**
 * A caller transform, for an answer that's nice to have: if the agent
 * throws, or doesn't answer `within` its time, the call logs it and gives
 * `else`. It only wraps the method call. Getting the stub, as
 * `getAgentByName` does with an RPC of its own, can still throw.
 *
 * @example
 * createTransformStub(stub).with(optional, { label: "Session abc", else: null }).listOutcomes()
 */
export const optional = defineTransform<object>()
  .caller(
    ({ label, else: fallback, within = ANSWER_WITHIN_MS }: OptionalOptions) =>
      async ({ method, next }) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            next(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error(`no answer in ${within}ms`)), within);
            }),
          ]);
        } catch (error) {
          console.error(`${label} didn't answer ${String(method)}: ${error}`);
          return fallback;
        } finally {
          clearTimeout(timer);
        }
      },
  )
  .callee(
    // The other half, run in the agent being called, once installed there
    // with `applyTransforms`. `optional` is the caller's choice alone, so this
    // only passes the call on, and isn't installed.
    () =>
      async ({ next }) =>
        next(),
  );
