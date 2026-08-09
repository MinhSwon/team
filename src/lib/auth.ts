import { prismaAdapter } from "@better-auth/prisma-adapter";
import { APIError, betterAuth } from "better-auth";

import { prisma } from "@/lib/db";
import {
  createBetterAuthRateLimitStorage,
  trustedProxyList,
} from "@/lib/rate-limit";
import { normalizeUsername } from "@/lib/validation";

const usernamePattern = /^[a-z0-9._]{3,30}$/;
const trustedProxies = trustedProxyList();

export const auth = betterAuth({
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.NODE_ENV === "production"
      ? undefined
      : "http://localhost:3000"),
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 15 * 60, max: 5 },
    },
    customStorage: createBetterAuthRateLimitStorage(),
  },
  advanced: {
    ipAddress: {
      disableIpTracking: trustedProxies.length === 0,
      ipAddressHeaders:
        trustedProxies.length > 0
          ? ["x-forwarded-for", "x-real-ip"]
          : ["x-placedecide-no-client-ip"],
      trustedProxies,
    },
  },
  user: {
    additionalFields: {
      username: {
        type: "string",
        required: true,
        input: true,
        unique: true,
      },
      bio: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const username =
            typeof user.username === "string"
              ? normalizeUsername(user.username)
              : "";

          if (!usernamePattern.test(username)) {
            throw new APIError("BAD_REQUEST", {
              message:
                "Username must be 3-30 characters using letters, numbers, dots, or underscores",
            });
          }

          return {
            data: {
              ...user,
              username,
            },
          };
        },
      },
    },
  },
});
