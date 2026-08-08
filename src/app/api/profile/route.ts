import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import {
  getProfile,
  ProfileError,
  updateProfile,
} from "@/lib/profiles";

export type ProfileRouteDependencies = {
  requireUser: () => Promise<{ id: string }>;
  getProfile: typeof getProfile;
  updateProfile: typeof updateProfile;
};

const dependencies: ProfileRouteDependencies = {
  requireUser: requireCurrentUser,
  getProfile,
  updateProfile,
};

function errorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ProfileError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  return Response.json({ error: "Could not update profile" }, { status: 500 });
}

export async function handleProfileGet(
  request: Request,
  profileDependencies: ProfileRouteDependencies,
) {
  try {
    const currentUser = await profileDependencies.requireUser();
    const username = new URL(request.url).searchParams.get("username");
    if (!username?.trim()) {
      return Response.json(
        { error: "username is required" },
        { status: 400 },
      );
    }
    return Response.json(
      await profileDependencies.getProfile(currentUser.id, username),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleProfilePatch(
  request: Request,
  profileDependencies: ProfileRouteDependencies,
) {
  try {
    const currentUser = await profileDependencies.requireUser();
    return Response.json(
      await profileDependencies.updateProfile(
        currentUser.id,
        await request.json(),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export function GET(request: Request) {
  return handleProfileGet(request, dependencies);
}

export function PATCH(request: Request) {
  return handleProfilePatch(request, dependencies);
}
