"use client";

import {
  Check,
  Search,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import Navigation from "@/components/Navigation";
import type {
  FriendListItem as FriendshipItem,
  FriendLists,
  FriendUser as Person,
} from "@/lib/friendships";

type ListKey = keyof FriendLists;
type ErrorKey = ListKey | "search";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data: unknown = response.status === 204 ? null : await response.json();

  if (!response.ok) {
    throw new Error(
      typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof data.error === "string"
        ? data.error
        : "Request failed",
    );
  }

  return data as T;
}

function Initials({ person }: { person: Person }) {
  const value = person.name.trim() || person.username;
  return (
    <span
      aria-hidden="true"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-800 text-sm font-bold text-amber-400"
    >
      {value.slice(0, 2).toUpperCase()}
    </span>
  );
}

function PersonRow({
  item,
  action,
}: {
  item: FriendshipItem;
  action?: ReactNode;
}) {
  return (
    <li className="flex min-h-16 items-center gap-3 border-t border-slate-800 py-3 first:border-t-0">
      <Initials person={item.user} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">
          {item.user.name}
        </p>
        <p className="truncate text-xs text-slate-400">
          @{item.user.username}
        </p>
      </div>
      {action}
    </li>
  );
}

function InlineError({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p aria-live="polite" className="mt-2 text-sm text-rose-400">
      {children}
    </p>
  );
}

export default function FriendsClient({
  initialLists,
}: {
  initialLists: FriendLists;
}) {
  const [lists, setLists] = useState<FriendLists>(initialLists);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [errors, setErrors] = useState<Partial<Record<ErrorKey, string>>>({});
  const [searching, setSearching] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);

  const setError = useCallback((key: ErrorKey, value?: string) => {
    setErrors((current) => ({ ...current, [key]: value }));
  }, []);

  const refreshLists = useCallback(
    async (keys: ListKey[]) => {
      try {
        const data = await api<FriendLists>("/api/friends");
        setLists((current) => {
          const next = { ...current };
          for (const key of keys) next[key] = data[key];
          return next;
        });
        for (const key of keys) setError(key);
      } catch (error) {
        for (const key of keys) setError(key, message(error));
      }
    },
    [setError],
  );

  async function searchUsers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (!term) {
      setResults([]);
      setError("search");
      return;
    }

    setSearching(true);
    setError("search");
    try {
      const data = await api<{ users: Person[] }>(
        `/api/users/search?q=${encodeURIComponent(term)}`,
      );
      setResults(data.users);
    } catch (error) {
      setError("search", message(error));
    } finally {
      setSearching(false);
    }
  }

  async function sendRequest(person: Person) {
    if (mutationBusy) return;
    setMutationBusy(true);
    setError("search");
    try {
      await api("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresseeId: person.id }),
      });
      setResults((current) => current.filter((user) => user.id !== person.id));
      await refreshLists(["outgoing"]);
    } catch (error) {
      setError("search", message(error));
    } finally {
      setMutationBusy(false);
    }
  }

  async function respond(id: string, action: "accept" | "reject") {
    if (mutationBusy) return;
    setMutationBusy(true);
    setError("incoming");
    try {
      await api(`/api/friends/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await refreshLists(
        action === "accept" ? ["incoming", "accepted"] : ["incoming"],
      );
    } catch (error) {
      setError("incoming", message(error));
    } finally {
      setMutationBusy(false);
    }
  }

  async function remove(id: string) {
    if (mutationBusy) return;
    setMutationBusy(true);
    setError("accepted");
    try {
      await api(`/api/friends/${id}`, { method: "DELETE" });
      await refreshLists(["accepted"]);
    } catch (error) {
      setError("accepted", message(error));
    } finally {
      setMutationBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-24 text-slate-100 md:pb-12">
      <Navigation />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-white">Friends</h1>

        <section className="mt-8 border-b border-slate-800 pb-8">
          <form className="flex gap-2" onSubmit={searchUsers}>
            <label className="sr-only" htmlFor="friend-search">
              Search people
            </label>
            <input
              id="friend-search"
              className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-400"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search username or name"
              type="search"
              value={query}
            />
            <button
              aria-label="Search"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-amber-400 text-slate-950 hover:bg-amber-300 disabled:opacity-50"
              disabled={searching}
              title="Search"
              type="submit"
            >
              <Search className="h-4 w-4" />
            </button>
          </form>
          <InlineError>{errors.search}</InlineError>
          {results.length > 0 && (
            <ul className="mt-4">
              {results.map((person) => (
                <PersonRow
                  key={person.id}
                  item={{ id: person.id, user: person }}
                  action={
                    <button
                      aria-label={`Send friend request to ${person.name}`}
                      className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-slate-800 hover:text-amber-400 disabled:opacity-50"
                      disabled={mutationBusy}
                      onClick={() => sendRequest(person)}
                      title="Send friend request"
                      type="button"
                    >
                      <UserPlus className="h-4 w-4" />
                    </button>
                  }
                />
              ))}
            </ul>
          )}
        </section>

        <div className="grid gap-10 py-8 md:grid-cols-2">
          <section>
            <h2 className="text-sm font-bold uppercase text-slate-300">
              Incoming
            </h2>
            <InlineError>{errors.incoming}</InlineError>
            {lists.incoming.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No incoming requests.
              </p>
            ) : (
              <ul className="mt-3">
                {lists.incoming.map((item) => (
                  <PersonRow
                    key={item.id}
                    item={item}
                    action={
                      <div className="flex gap-1">
                        <button
                          aria-label={`Accept ${item.user.name}`}
                          className="grid h-9 w-9 place-items-center rounded-md text-emerald-400 hover:bg-slate-800 disabled:opacity-50"
                          disabled={mutationBusy}
                          onClick={() => respond(item.id, "accept")}
                          title="Accept"
                          type="button"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          aria-label={`Reject ${item.user.name}`}
                          className="grid h-9 w-9 place-items-center rounded-md text-rose-400 hover:bg-slate-800 disabled:opacity-50"
                          disabled={mutationBusy}
                          onClick={() => respond(item.id, "reject")}
                          title="Reject"
                          type="button"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-sm font-bold uppercase text-slate-300">
              Outgoing
            </h2>
            <InlineError>{errors.outgoing}</InlineError>
            {lists.outgoing.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No outgoing requests.
              </p>
            ) : (
              <ul className="mt-3">
                {lists.outgoing.map((item) => (
                  <PersonRow
                    key={item.id}
                    item={item}
                    action={
                      <span className="text-xs font-medium text-slate-500">
                        Pending
                      </span>
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="border-t border-slate-800 pt-8">
          <h2 className="text-sm font-bold uppercase text-slate-300">
            Accepted
          </h2>
          <InlineError>{errors.accepted}</InlineError>
          {lists.accepted.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No friends yet.</p>
          ) : (
            <ul className="mt-3 grid gap-x-8 md:grid-cols-2">
              {lists.accepted.map((item) => (
                <PersonRow
                  key={item.id}
                  item={item}
                  action={
                    <button
                      aria-label={`Remove ${item.user.name}`}
                      className="grid h-9 w-9 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-rose-400 disabled:opacity-50"
                      disabled={mutationBusy}
                      onClick={() => remove(item.id)}
                      title="Remove friend"
                      type="button"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
