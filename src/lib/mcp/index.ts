import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoami from "./tools/whoami";
import listSharedShifts from "./tools/list-shared-shifts";
import getSharedShift from "./tools/get-shared-shift";
import getSettings from "./tools/get-settings";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "line-check-mcp",
  title: "Line Check MCP",
  version: "0.1.0",
  instructions:
    "Tools for the Line Check app. Use `whoami` to verify connectivity, `list_shared_shifts` and `get_shared_shift` to browse the signed-in user's shared shifts, and `get_settings` to read their stations/staff/statuses/brand configuration.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoami, listSharedShifts, getSharedShift, getSettings],
});
