import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAuthUrl } from "@/lib/google-calendar";

export async function GET(request) {
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
  } = await supabase.auth.getUser();

  if (!user) {
    const origin = new URL(request.url).origin;
    return NextResponse.redirect(new URL("/login", origin));
  }

  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const from = requestUrl.searchParams.get("from") || "calendar";
  const state = JSON.stringify({ uid: user.id, from });
  const authUrl = getAuthUrl(state, origin);
  return NextResponse.redirect(authUrl);
}
