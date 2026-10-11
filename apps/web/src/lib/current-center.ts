import "server-only";
import { cookies } from "next/headers";
import { CURRENT_CENTER_COOKIE } from "@/lib/center";

/** Point the app at a center the user just created, joined or picked. */
export async function setCurrentCenter(centerId: string) {
  (await cookies()).set(CURRENT_CENTER_COOKIE, centerId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearCurrentCenter() {
  (await cookies()).delete(CURRENT_CENTER_COOKIE);
}
