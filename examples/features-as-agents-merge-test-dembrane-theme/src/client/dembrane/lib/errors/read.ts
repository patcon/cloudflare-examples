// example: ours, in place of echo's, which reads its API's error codes.
// Here the only one the copied files check is Verify's "no new feedback".
import { NO_NEW_FEEDBACK } from "../../../../shared/features/verify/rules";

export const errorCode = (error: unknown): string | undefined =>
  error instanceof Error && error.message.includes(NO_NEW_FEEDBACK)
    ? "verify.no_new_feedback"
    : undefined;
