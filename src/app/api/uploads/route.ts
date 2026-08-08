import { put } from "@vercel/blob";

import {
  requireCurrentUser,
  UnauthorizedError,
} from "@/lib/current-user";

export type UploadPut = (
  pathname: string,
  body: File,
  options: {
    access: "public";
    addRandomSuffix: true;
    contentType: string;
    token: string;
  },
) => Promise<{ url: string }>;

export type UploadDependencies = {
  requireUser: () => Promise<{ id: string }>;
  put: UploadPut;
  token?: string;
};

const maxImageBytes = 5 * 1024 * 1024;
const imageExtensions = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function uploadPath(userId: string, file: File): string {
  const base =
    file.name
      .replace(/\.[^.]+$/, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "place";

  return `places/${userId}/${base}.${imageExtensions.get(file.type)}`;
}

export async function handleUpload(
  request: Request,
  dependencies: UploadDependencies,
): Promise<Response> {
  try {
    const currentUser = await dependencies.requireUser();

    if (!dependencies.token) {
      return Response.json(
        { error: "Image uploads are not configured" },
        { status: 503 },
      );
    }

    const form = await request.formData();
    const images = form.getAll("image");
    if (images.length !== 1 || !(images[0] instanceof File)) {
      return Response.json(
        { error: "One image is required" },
        { status: 400 },
      );
    }

    const file = images[0];
    if (!imageExtensions.has(file.type)) {
      return Response.json(
        { error: "Image must be JPEG, PNG, or WebP" },
        { status: 415 },
      );
    }
    if (file.size === 0) {
      return Response.json({ error: "Image is empty" }, { status: 400 });
    }
    if (file.size > maxImageBytes) {
      return Response.json(
        { error: "Image must be 5 MB or smaller" },
        { status: 413 },
      );
    }

    const blob = await dependencies.put(
      uploadPath(currentUser.id, file),
      file,
      {
        access: "public",
        addRandomSuffix: true,
        contentType: file.type,
        token: dependencies.token,
      },
    );

    return Response.json({ url: blob.url }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof TypeError) {
      return Response.json(
        { error: "Invalid multipart form data" },
        { status: 400 },
      );
    }
    return Response.json({ error: "Image upload failed" }, { status: 502 });
  }
}

export function POST(request: Request): Promise<Response> {
  return handleUpload(request, {
    requireUser: requireCurrentUser,
    put: (pathname, body, options) => put(pathname, body, options),
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}
