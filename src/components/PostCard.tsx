"use client";

import {
  Bookmark,
  Heart,
  MessageCircle,
  Repeat2,
  Star,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useRef, useState } from "react";

import type { FeedPost } from "@/lib/posts";

async function responseJson(response: Response) {
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof body.error === "string"
        ? body.error
        : "Request failed",
    );
  }
  return body as Record<string, unknown>;
}

export default function PostCard({ post }: { post: FeedPost }) {
  const image = post.savedPlace.images[0]?.url;
  const [likedOverride, setLiked] = useState<boolean | null>(null);
  const [savedOverride, setSaved] = useState<boolean | null>(null);
  const [countOverrides, setCounts] = useState<
    Partial<FeedPost["counts"]>
  >({});
  const [newComments, setComments] = useState<
    FeedPost["comments"]
  >([]);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [likePending, setLikePending] = useState(false);
  const [commentPending, setCommentPending] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [error, setError] = useState("");
  const likeLock = useRef(false);
  const commentLock = useRef(false);
  const saveLock = useRef(false);
  const liked = likedOverride ?? post.likedByCurrentUser;
  const saved = savedOverride ?? post.savedByCurrentUser;
  const counts = { ...post.counts, ...countOverrides };
  const comments = [...post.comments, ...newComments];

  async function toggleLike() {
    if (likeLock.current) return;
    likeLock.current = true;
    setLikePending(true);
    setError("");
    try {
      const body = await responseJson(
        await fetch(`/api/posts/${post.id}/like`, { method: "POST" }),
      );
      if (
        typeof body.liked !== "boolean" ||
        typeof body.count !== "number"
      ) {
        throw new Error("Invalid like response");
      }
      setLiked(body.liked);
      setCounts((current) => ({ ...current, likes: body.count as number }));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update like",
      );
    } finally {
      likeLock.current = false;
      setLikePending(false);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (commentLock.current) return;
    commentLock.current = true;
    setCommentPending(true);
    setError("");
    try {
      const body = await responseJson(
        await fetch(`/api/posts/${post.id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: commentBody }),
        }),
      );
      const comment = body.comment as FeedPost["comments"][number] | undefined;
      if (!comment || typeof body.count !== "number") {
        throw new Error("Invalid comment response");
      }
      setComments((current) =>
        post.comments.some((item) => item.id === comment.id) ||
        current.some((item) => item.id === comment.id)
          ? current
          : [...current, comment],
      );
      setCounts((current) => ({
        ...current,
        comments: body.count as number,
      }));
      setCommentBody("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not add comment",
      );
    } finally {
      commentLock.current = false;
      setCommentPending(false);
    }
  }

  async function savePlace() {
    if (saveLock.current || saved) return;
    saveLock.current = true;
    setSavePending(true);
    setError("");
    try {
      const body = await responseJson(
        await fetch(`/api/posts/${post.id}/save`, { method: "POST" }),
      );
      if (body.saved !== true || typeof body.count !== "number") {
        throw new Error("Invalid save response");
      }
      setSaved(true);
      setCounts((current) => ({
        ...current,
        reshares: body.count as number,
      }));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save place",
      );
    } finally {
      saveLock.current = false;
      setSavePending(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-md border border-slate-800 bg-slate-900">
      <header className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">
            {post.author.name}
          </p>
          <p className="truncate text-xs text-slate-500">
            @{post.author.username} -{" "}
            <time dateTime={post.createdAt.toISOString()}>
              {post.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
            </time>
          </p>
        </div>
        {post.sourcePost && (
          <p className="shrink-0 text-xs text-slate-400">
            via @{post.sourcePost.author.username}
          </p>
        )}
      </header>

      <Link
        className="group block"
        href={`/places/${post.savedPlace.place.id}`}
      >
        {image && (
          <div
            aria-label={post.savedPlace.place.name}
            className="aspect-[16/9] bg-cover bg-center"
            role="img"
            style={{ backgroundImage: `url("${image}")` }}
          />
        )}
        <div className="space-y-3 p-4">
          <div>
            <h2 className="text-lg font-bold text-white group-hover:text-amber-400">
              {post.savedPlace.place.name}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {post.savedPlace.place.address}
            </p>
          </div>

          {post.savedPlace.rating && (
            <p className="flex items-center gap-1 text-sm font-semibold text-amber-400">
              <Star className="h-4 w-4 fill-current" />
              {post.savedPlace.rating}/5
            </p>
          )}

          {post.savedPlace.review && (
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">
              {post.savedPlace.review}
            </p>
          )}

          {post.savedPlace.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {post.savedPlace.tags.map((tag) => (
                <span
                  className="rounded-sm bg-slate-800 px-2 py-1 text-xs text-slate-300"
                  key={tag}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>

      <footer className="grid grid-cols-4 border-t border-slate-800 text-xs text-slate-400">
        <button
          aria-label={liked ? "Unlike" : "Like"}
          className={`flex min-h-11 items-center justify-center gap-1.5 hover:text-white disabled:cursor-wait disabled:opacity-60 ${
            liked ? "text-rose-400" : ""
          }`}
          disabled={likePending}
          onClick={toggleLike}
          type="button"
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
          {counts.likes}
        </button>
        <button
          aria-expanded={commentOpen}
          aria-label="Add comment"
          className="flex min-h-11 items-center justify-center gap-1.5 hover:text-white"
          onClick={() => setCommentOpen((open) => !open)}
          type="button"
        >
          <MessageCircle className="h-4 w-4" />
          {counts.comments}
        </button>
        <span className="flex min-h-11 items-center justify-center gap-1.5">
          <Repeat2 className="h-4 w-4" />
          {counts.reshares}
        </span>
        <button
          aria-label="Save place"
          className="flex min-h-11 items-center justify-center gap-1.5 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={saved || savePending}
          onClick={savePlace}
          type="button"
        >
          <Bookmark className="h-4 w-4" />
          {saved ? "Saved" : "Save"}
        </button>
      </footer>

      {(comments.length > 0 || commentOpen || error) && (
        <div className="space-y-3 border-t border-slate-800 px-4 py-3">
          {comments.map((comment) => (
            <div className="text-sm" key={comment.id}>
              <span className="font-semibold text-slate-200">
                @{comment.author.username}
              </span>{" "}
              <span className="whitespace-pre-wrap text-slate-300">
                {comment.body}
              </span>
            </div>
          ))}

          {commentOpen && (
            <form className="flex gap-2" onSubmit={submitComment}>
              <label className="sr-only" htmlFor={`comment-${post.id}`}>
                Comment
              </label>
              <input
                className="min-h-11 min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-amber-400"
                disabled={commentPending}
                id={`comment-${post.id}`}
                maxLength={1000}
                onChange={(event) => setCommentBody(event.target.value)}
                placeholder="Add a comment"
                required
                value={commentBody}
              />
              <button
                className="min-h-11 rounded-md bg-amber-400 px-4 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:cursor-wait disabled:opacity-60"
                disabled={commentPending || !commentBody.trim()}
                type="submit"
              >
                Post
              </button>
            </form>
          )}

          {error && (
            <p className="text-sm text-rose-400" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
