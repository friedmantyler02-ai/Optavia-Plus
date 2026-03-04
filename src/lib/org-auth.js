import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function getSubtreeCoachIds() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored in Server Components
          }
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Unauthorized", status: 401 };
  }

  const { data: coach } = await supabaseAdmin
    .from("coaches")
    .select("id")
    .eq("email", user.email)
    .limit(1)
    .single();

  if (!coach) {
    return { error: "Coach not found", status: 404 };
  }

  const { data, error: rpcError } = await supabaseAdmin.rpc(
    "get_subtree_coach_ids",
    { root_coach_id: coach.id }
  );

  if (rpcError) {
    return { error: "Failed to fetch subtree", status: 500 };
  }

  return { coachIds: data.map((r) => r.coach_id), coachId: coach.id };
}
