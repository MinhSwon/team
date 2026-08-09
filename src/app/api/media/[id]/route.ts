import { get } from "@vercel/blob";

import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";
import {
  findVisibleMediaUpload,
  type VisibleMediaUpload,
} from "@/lib/media";

type MediaGet = (
  pathname: string,
  options: {
    access: "private";
    token: string;
    useCache: false;
    abortSignal: AbortSignal;
  },
) => Promise<{
  statusCode: number;
  stream: ReadableStream<Uint8Array> | null;
  blob: { contentType: string | null; size: number | null };
} | null>;

export type MediaDependencies = {
  requireUser: () => Promise<{ id: string }>;
  findVisibleUpload: (
    viewerId: string,
    id: string,
  ) => Promise<VisibleMediaUpload | null>;
  get: MediaGet;
  token?: string;
};

function mediaNotFound(): Response {
  return Response.json(
    { error: "Media not found" },
    {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export async function handleMediaRequest(
  _request: Request,
  id: string,
  dependencies: MediaDependencies,
): Promise<Response> {
  let currentUser: { id: string };
  try {
    currentUser = await dependencies.requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: error.message },
        {
          status: 401,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
    return mediaNotFound();
  }

  if (!dependencies.token) {
    return Response.json(
      { error: "Image access is not configured" },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  const upload = await dependencies.findVisibleUpload(currentUser.id, id);
  if (!upload) return mediaNotFound();

  try {
    const blob = await dependencies.get(upload.pathname, {
      access: "private",
      token: dependencies.token,
      useCache: false,
      abortSignal: AbortSignal.timeout(30_000),
    });
    if (
      !blob ||
      blob.statusCode !== 200 ||
      !blob.stream ||
      blob.blob.size === null
    ) {
      return mediaNotFound();
    }
    return new Response(blob.stream, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Length": String(blob.blob.size),
        "Content-Type": upload.contentType,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        Vary: "Cookie",
      },
    });
  } catch {
    return mediaNotFound();
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleMediaRequest(request, id, {
    requireUser: requireCurrentUser,
    findVisibleUpload: findVisibleMediaUpload,
    get: (pathname, options) => get(pathname, options),
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}
