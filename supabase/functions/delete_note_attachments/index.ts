import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { retiredAttachmentCleanupResponse } from "./retired.ts";

// The enterprise workbench does not expose Atomic CRM notes or attachments.
// Keep the historical function name fail-closed so an old deployment route
// cannot be used to submit arbitrary service-role storage deletions.
Deno.serve((req: Request) => retiredAttachmentCleanupResponse(req.method));
