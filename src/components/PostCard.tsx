import {
  Bookmark,
  Heart,
  MessageCircle,
  Repeat2,
  Star,
} from "lucide-react";
import Link from "next/link";

import type { FeedPost } from "@/lib/posts";

const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function PostCard({ post }: { post: FeedPost }) {
  const image = post.savedPlace.images[0]?.url;

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
              {dateFormat.format(post.createdAt)}
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
        <span className="flex min-h-11 items-center justify-center gap-1.5">
          <Heart className="h-4 w-4" />
          {post.counts.likes}
        </span>
        <span className="flex min-h-11 items-center justify-center gap-1.5">
          <MessageCircle className="h-4 w-4" />
          {post.counts.comments}
        </span>
        <span className="flex min-h-11 items-center justify-center gap-1.5">
          <Repeat2 className="h-4 w-4" />
          {post.counts.reshares}
        </span>
        <span className="flex min-h-11 items-center justify-center gap-1.5">
          <Bookmark className="h-4 w-4" />
          {post.savedByCurrentUser ? "Saved" : "Save"}
        </span>
      </footer>
    </article>
  );
}
