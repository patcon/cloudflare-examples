// example: ours, in place of echo's, which explains each API error in a toast.
import { toast } from "@/components/common/Toaster";

export const notifyError = async (error: unknown) => {
  toast.error(error instanceof Error ? error.message : "Something went wrong.");
};
