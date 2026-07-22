import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/shared-shift/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = params.id;
        // Validate UUID format to avoid arbitrary queries
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
          return new Response(JSON.stringify({ error: "Invalid id" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("shared_shifts")
          .select("id, date, shift, member, brand_name, payload, updated_at")
          .eq("id", id)
          .maybeSingle();

        if (error) {
          console.error("[shared-shift] fetch failed", error.message);
          return new Response(JSON.stringify({ error: "Fetch failed" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        if (!data) {
          return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
