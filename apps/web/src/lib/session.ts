import type { SessionOptions } from "iron-session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { config } from "./config";

export interface SessionData {
  userId: string;
  role: "user" | "author" | "admin";
}

export const sessionOptions: SessionOptions = {
  password: config.SESSION_PASSWORD,
  cookieName: "secondseat-session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
