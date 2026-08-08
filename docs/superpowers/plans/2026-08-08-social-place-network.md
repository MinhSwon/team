# Social Place Network Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock group-decision demo with a persistent private social network where friends save, review, and share places.

**Architecture:** Keep Next.js App Router, Prisma, and PostgreSQL. Better Auth owns email/password users and database sessions; application route handlers derive identity server-side and use shared friendship authorization helpers. A canonical `Place` feeds one saved-place record and one post per user, while likes, comments, and notifications remain explicit relational records.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma 7, PostgreSQL, Better Auth, Vercel Blob, Google Places API, `node:test` through `tsx`

## Global Constraints

- Posts are visible only to their author and accepted friends.
- Every new saved place creates exactly one post in the same database transaction.
- Each user may save a canonical place only once.
- Search, Google Maps URL, and manual entry all reach the same confirmation and save flow.
- Only a place is required; rating, review, tags, and photos are optional.
- Feed ordering is `createdAt DESC, id DESC`.
- No groups, voting, recommendation engine, file import, collections, public posts, direct messages, or push/email notifications in active MVP navigation.
- Client-provided user IDs never establish identity or authorization.
- External provider failure must fall back to local search or manual confirmation.

---

### Task 1: Dependencies, Environment, And Database Schema

**Files:**
- Modify: `package.json`
- Modify: `prisma/schema.prisma`
- Create: `.env.example`
- Create: `src/lib/validation.ts`
- Create: `src/lib/validation.test.ts`

**Interfaces:**
- Produces: `normalizeUsername(value: string): string`
- Produces: `normalizePlaceText(value: string): string`
- Produces: `assertRating(value: unknown): number | null`
- Produces: Prisma models used by every later task

- [ ] **Step 1: Install runtime and test dependencies**

Run:

```powershell
npm install better-auth @better-auth/prisma-adapter @vercel/blob
npm install -D tsx
```

Expected: `package.json` and `package-lock.json` contain the four packages.

- [ ] **Step 2: Add the test script**

Add to `package.json`:

```json
"test": "tsx --test \"src/**/*.test.ts\""
```

- [ ] **Step 3: Replace the Prisma schema with the social domain**

Keep the PostgreSQL datasource and Prisma client generator. Define:

```prisma
enum FriendshipStatus {
  PENDING
  ACCEPTED
  REJECTED
}

enum NotificationType {
  FRIEND_REQUEST
  FRIEND_ACCEPTED
  POST_LIKED
  POST_COMMENTED
}

model User {
  id            String         @id
  name          String
  email         String         @unique
  emailVerified Boolean        @default(false)
  image         String?
  username      String         @unique
  bio           String?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  sessions      Session[]
  accounts      Account[]
  requestsSent  Friendship[]   @relation("FriendRequester")
  requestsIn    Friendship[]   @relation("FriendAddressee")
  savedPlaces   UserSavedPlace[]
  posts         Post[]
  likes         PostLike[]
  comments      Comment[]
  notifications Notification[] @relation("NotificationRecipient")
  actions        Notification[] @relation("NotificationActor")
}

model Session {
  id        String   @id
  expiresAt DateTime
  token     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                 String
  user                   User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken            String?
  refreshToken           String?
  idToken                String?
  accessTokenExpiresAt   DateTime?
  refreshTokenExpiresAt  DateTime?
  scope                   String?
  password                String?
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
  @@unique([providerId, accountId])
}

model Verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model Friendship {
  id          String           @id @default(uuid())
  requesterId String
  addresseeId String
  pairKey     String           @unique
  status      FriendshipStatus @default(PENDING)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  requester   User             @relation("FriendRequester", fields: [requesterId], references: [id], onDelete: Cascade)
  addressee   User             @relation("FriendAddressee", fields: [addresseeId], references: [id], onDelete: Cascade)
  @@index([requesterId, status])
  @@index([addresseeId, status])
}

model Place {
  id                String             @id @default(uuid())
  name              String
  normalizedName    String
  address           String
  normalizedAddress String
  area              String?
  latitude          Float?
  longitude         Float?
  externalSource    String?
  externalPlaceId   String?
  website           String?
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt
  savedBy           UserSavedPlace[]
  @@unique([externalSource, externalPlaceId])
  @@index([normalizedName, normalizedAddress])
}

model UserSavedPlace {
  id           String            @id @default(uuid())
  userId       String
  placeId      String
  rating       Int?
  review       String?
  tags         String[]
  sourcePostId String?
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
  user         User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  place        Place             @relation(fields: [placeId], references: [id], onDelete: Cascade)
  sourcePost   Post?             @relation("PostReshares", fields: [sourcePostId], references: [id], onDelete: SetNull)
  post         Post?
  images       SavedPlaceImage[]
  @@unique([userId, placeId])
  @@index([userId, createdAt])
}

model SavedPlaceImage {
  id           String         @id @default(uuid())
  savedPlaceId String
  url          String
  caption      String?
  sortOrder    Int            @default(0)
  savedPlace   UserSavedPlace @relation(fields: [savedPlaceId], references: [id], onDelete: Cascade)
  @@index([savedPlaceId, sortOrder])
}

model Post {
  id           String         @id @default(uuid())
  authorId     String
  savedPlaceId String         @unique
  sourcePostId String?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  deletedAt    DateTime?
  author       User           @relation(fields: [authorId], references: [id], onDelete: Cascade)
  savedPlace   UserSavedPlace @relation(fields: [savedPlaceId], references: [id], onDelete: Cascade)
  sourcePost   Post?          @relation("PostSources", fields: [sourcePostId], references: [id], onDelete: SetNull)
  reshares     Post[]         @relation("PostSources")
  sourcedSaves UserSavedPlace[] @relation("PostReshares")
  likes        PostLike[]
  comments     Comment[]
  notifications Notification[]
  @@index([authorId, createdAt, id])
}

model PostLike {
  postId    String
  userId    String
  createdAt DateTime @default(now())
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([postId, userId])
}

model Comment {
  id        String   @id @default(uuid())
  postId    String
  authorId  String
  body      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  notifications Notification[]
  @@index([postId, createdAt])
}

model Notification {
  id           String           @id @default(uuid())
  recipientId  String
  actorId      String
  type         NotificationType
  postId       String?
  commentId    String?
  friendshipId String?
  readAt       DateTime?
  createdAt    DateTime         @default(now())
  recipient    User             @relation("NotificationRecipient", fields: [recipientId], references: [id], onDelete: Cascade)
  actor        User             @relation("NotificationActor", fields: [actorId], references: [id], onDelete: Cascade)
  post         Post?            @relation(fields: [postId], references: [id], onDelete: Cascade)
  comment      Comment?         @relation(fields: [commentId], references: [id], onDelete: Cascade)
  @@index([recipientId, readAt, createdAt])
}
```

- [ ] **Step 4: Add environment documentation**

Create `.env.example`:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/placedecide?schema=public
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_MAPS_API_KEY=
BLOB_READ_WRITE_TOKEN=
```

- [ ] **Step 5: Write validation tests**

Test username trimming/lowercasing, Vietnamese place normalization, valid
ratings `1` and `5`, optional null rating, and rejection of `0`, `6`, strings,
and decimals.

- [ ] **Step 6: Implement validation helpers**

Use `String.prototype.normalize("NFD")`, remove combining marks, lowercase,
trim, and collapse whitespace. `assertRating` returns `null` for absent values
and throws `ValidationError` for non-integers outside 1-5.

- [ ] **Step 7: Verify**

Run:

```powershell
npm test
npx prisma format
npx prisma generate
npm run lint
```

Expected: tests pass, schema formats, Prisma client generates, lint passes.

- [ ] **Step 8: Commit**

```powershell
git add package.json package-lock.json prisma/schema.prisma .env.example src/lib/validation.ts src/lib/validation.test.ts
git commit -m "feat: define social network data model"
```

---

### Task 2: Authentication And Protected App Shell

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/auth-client.ts`
- Create: `src/lib/current-user.ts`
- Create: `src/app/api/auth/[...all]/route.ts`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/register/page.tsx`
- Create: `src/components/AuthForm.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/Navigation.tsx`
- Test: `src/lib/current-user.test.ts`

**Interfaces:**
- Produces: `auth` Better Auth instance
- Produces: `getCurrentUser(): Promise<User | null>`
- Produces: `requireCurrentUser(): Promise<User>`
- Consumes: Prisma `User`, `Session`, `Account`, `Verification`

- [ ] **Step 1: Configure Better Auth**

Create `src/lib/auth.ts` with `betterAuth`, `prismaAdapter(prisma, {
provider: "postgresql" })`, `emailAndPassword.enabled = true`, and a database
hook that normalizes and validates `username` before user creation.

- [ ] **Step 2: Mount auth routes and client**

Route:

```ts
import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"

export const { GET, POST } = toNextJsHandler(auth)
```

Client:

```ts
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient()
```

- [ ] **Step 3: Add server identity helpers**

`getCurrentUser` calls `auth.api.getSession({ headers: await headers() })`.
`requireCurrentUser` throws `UnauthorizedError` when no session exists.

- [ ] **Step 4: Write auth helper tests**

Mock session lookup and verify `requireCurrentUser` returns the authenticated
user and rejects an anonymous request.

- [ ] **Step 5: Build registration and login screens**

`AuthForm` uses `authClient.signUp.email` with `name`, `email`, `password`, and
`username`; login uses `authClient.signIn.email`. Successful requests navigate
to `/feed`. Show exact server error text and preserve entered email/username.

- [ ] **Step 6: Protect active pages**

The app shell calls `getCurrentUser`; anonymous users redirect to `/login`.
Navigation contains Feed, Add, Saved, Friends, Notifications, Profile, and
sign-out. Remove links to discover, decide, groups, and import.

- [ ] **Step 7: Verify**

Run:

```powershell
npm test
npm run lint
npm run build
```

Expected: all pass; auth routes compile.

- [ ] **Step 8: Commit**

```powershell
git add src/lib/auth.ts src/lib/auth-client.ts src/lib/current-user.ts src/app/api/auth src/app/\(auth\) src/components/AuthForm.tsx src/app/layout.tsx src/components/Navigation.tsx
git commit -m "feat: add persistent authentication"
```

---

### Task 3: Friendship Domain And Authorization

**Files:**
- Create: `src/lib/friendships.ts`
- Create: `src/lib/friendships.test.ts`
- Create: `src/app/api/friends/route.ts`
- Create: `src/app/api/friends/[id]/route.ts`
- Create: `src/app/api/users/search/route.ts`
- Replace: `src/app/groups/page.tsx` with `src/app/friends/page.tsx`

**Interfaces:**
- Produces: `friendPairKey(a: string, b: string): string`
- Produces: `areFriends(a: string, b: string): Promise<boolean>`
- Produces: `canViewUser(viewerId: string, ownerId: string): Promise<boolean>`
- Produces: `assertCanViewPost(viewerId: string, postId: string): Promise<Post>`

- [ ] **Step 1: Write domain tests**

Cover deterministic unordered pair keys, self-request rejection, duplicate
request rejection, mutual acceptance, rejection, removal, and visibility
before/after acceptance.

- [ ] **Step 2: Implement friendship helpers**

Use sorted IDs joined by `:` for `pairKey`. Mutations use the database unique
constraint and verify the current user is requester or addressee as required.

- [ ] **Step 3: Add API routes**

- `GET /api/friends`: accepted, incoming, outgoing lists.
- `POST /api/friends`: `{ addresseeId }`.
- `PATCH /api/friends/:id`: `{ action: "accept" | "reject" }`.
- `DELETE /api/friends/:id`: remove accepted friendship.
- `GET /api/users/search?q=`: username/name results excluding email and current
  user, limit 20.

Create `FRIEND_REQUEST` and `FRIEND_ACCEPTED` notifications in the same
transaction as state changes.

- [ ] **Step 4: Build Friends screen**

Use one search input, incoming request list, outgoing list, and accepted friend
list. Actions refresh only affected lists and display API errors inline.

- [ ] **Step 5: Verify**

Run:

```powershell
npm test
npm run lint
npm run build
```

Expected: all friendship tests and application build pass.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/friendships.ts src/lib/friendships.test.ts src/app/api/friends src/app/api/users/search src/app/friends src/app/groups
git commit -m "feat: add mutual friendships"
```

---

### Task 4: Canonical Place Resolution And Image Upload

**Files:**
- Create: `src/lib/places.ts`
- Create: `src/lib/places.test.ts`
- Create: `src/app/api/places/search/route.ts`
- Create: `src/app/api/places/resolve/route.ts`
- Create: `src/app/api/uploads/route.ts`
- Replace: `src/components/AddPlaceModal.tsx`
- Create: `src/app/add/page.tsx`

**Interfaces:**
- Produces: `resolvePlace(input: PlaceInput): Promise<Place>`
- Produces: `searchPlaces(query: string): Promise<PlaceCandidate[]>`
- Produces: `PlaceInput` discriminated union for `search`, `mapsUrl`, `manual`

- [ ] **Step 1: Write place tests**

Cover external ID deduplication, normalized manual duplicate lookup, unresolved
Google Maps URL fallback, invalid URL rejection, and provider failure fallback
to local database search.

- [ ] **Step 2: Implement canonical resolver**

`search` uses Google Places Text Search when `GOOGLE_MAPS_API_KEY` exists and
merges local DB matches. `mapsUrl` accepts only `google.com/maps`,
`maps.app.goo.gl`, and `goo.gl/maps`; it resolves supported place IDs or returns
manual confirmation fields. `manual` requires name and address.

- [ ] **Step 3: Add image upload**

`POST /api/uploads` accepts one image under 5 MB, permits JPEG/PNG/WebP, writes
through `@vercel/blob`, and returns `{ url }`. Reject missing
`BLOB_READ_WRITE_TOKEN` with a clear configuration error; saving without an
image remains valid.

- [ ] **Step 4: Build unified Add Place page**

Use segmented tabs Search, Maps Link, Manual. Every path fills the same
confirmation form with name, address, rating, review, tags, and optional image
uploads. Submission target arrives in Task 5.

- [ ] **Step 5: Verify**

Run:

```powershell
npm test
npm run lint
npm run build
```

Expected: provider tests pass with mocked fetch; build passes without API keys.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/places.ts src/lib/places.test.ts src/app/api/places/search src/app/api/places/resolve src/app/api/uploads src/components/AddPlaceModal.tsx src/app/add
git commit -m "feat: resolve places from search links and manual input"
```

---

### Task 5: Transactional Save, Post, Feed, And Place Detail

**Files:**
- Create: `src/lib/posts.ts`
- Create: `src/lib/posts.test.ts`
- Create: `src/app/api/saved/route.ts`
- Create: `src/app/api/saved/[id]/route.ts`
- Create: `src/app/api/feed/route.ts`
- Create: `src/app/api/posts/[id]/route.ts`
- Replace: `src/app/page.tsx`
- Create: `src/app/feed/page.tsx`
- Replace: `src/app/saved/page.tsx`
- Create: `src/app/places/[id]/page.tsx`
- Replace: `src/components/PlaceCard.tsx`
- Create: `src/components/PostCard.tsx`

**Interfaces:**
- Produces: `saveAndSharePlace(userId, input): Promise<{ savedPlace; post }>`
- Produces: `getFeed(userId, cursor?, limit?): Promise<FeedPage>`
- Consumes: `resolvePlace`, `assertCanViewPost`, current user

- [ ] **Step 1: Write save and feed tests**

Cover exactly one post per save, repeated/concurrent save idempotency, reshare
attribution, update without new post, transaction rollback, friend-only feed,
removed-friend exclusion, and stable cursor order.

- [ ] **Step 2: Implement transactional save**

Resolve canonical place first, then one Prisma transaction:

```ts
const savedPlace = await tx.userSavedPlace.create({ data })
const post = await tx.post.create({
  data: { authorId: userId, savedPlaceId: savedPlace.id, sourcePostId }
})
return { savedPlace, post }
```

Catch Prisma unique conflicts and return the existing saved place and post.
Create no per-friend post copies.

- [ ] **Step 3: Implement feed query**

Fetch posts where `authorId = userId` or author has one accepted friendship
pair with the user. Include author, place, saved content, first image, counts,
current-user like, and current-user save. Limit 20 by default, maximum 50.

- [ ] **Step 4: Add saved-place and post routes**

- `POST /api/saved`: resolve, save, create post.
- `PATCH /api/saved/:id`: author-only review/rating/tags/images update.
- `DELETE /api/saved/:id`: author-only delete; cascade removes post.
- `GET /api/feed`: cursor page.
- `GET /api/posts/:id`: friendship-authorized detail.

- [ ] **Step 5: Replace main screens**

`/` redirects to `/feed`. Feed uses `PostCard`; Saved uses place cards backed
only by DB; Place Detail shows current user save plus accepted-friend reviews.
Delete mock fallback behavior from active routes.

- [ ] **Step 6: Wire Add Place submission**

The confirmation form posts to `/api/saved`, then navigates to the created post
or existing saved-place page.

- [ ] **Step 7: Verify**

Run:

```powershell
npm test
npm run lint
npm run build
```

Expected: all save/feed authorization and idempotency tests pass.

- [ ] **Step 8: Commit**

```powershell
git add src/lib/posts.ts src/lib/posts.test.ts src/app/api/saved src/app/api/feed src/app/api/posts src/app/page.tsx src/app/feed src/app/saved src/app/places src/components/PlaceCard.tsx src/components/PostCard.tsx src/app/add
git commit -m "feat: share saved places in friend feed"
```

---

### Task 6: Likes, Comments, Resaves, And Notifications

**Files:**
- Create: `src/app/api/posts/[id]/like/route.ts`
- Create: `src/app/api/posts/[id]/comments/route.ts`
- Create: `src/app/api/posts/[id]/save/route.ts`
- Create: `src/app/api/notifications/route.ts`
- Create: `src/app/api/notifications/read/route.ts`
- Create: `src/app/notifications/page.tsx`
- Modify: `src/components/PostCard.tsx`
- Test: `src/lib/interactions.test.ts`

**Interfaces:**
- Consumes: `assertCanViewPost`, `saveAndSharePlace`
- Produces: authenticated like toggle, comment creation, resave, notification
  listing and read mutation

- [ ] **Step 1: Write interaction tests**

Cover non-friend rejection, idempotent like toggle, trimmed non-empty comments
up to 1,000 characters, self-action notification suppression, resave
attribution, duplicate resave behavior, and recipient-only notification reads.

- [ ] **Step 2: Implement interaction routes**

- Like `POST` toggles unique `(postId, userId)`.
- Comment `POST` creates comment after visibility check.
- Save `POST` calls `saveAndSharePlace` with source post.
- Like/comment create notification only when actor differs from post author.

- [ ] **Step 3: Implement notifications**

List newest 50 notifications with actor and referenced post/comment. `PATCH`
accepts `{ ids?: string[], all?: boolean }` and updates only the current user's
records.

- [ ] **Step 4: Wire PostCard**

Keep counts stable during requests, disable duplicate submits, show inline
comments, and update saved state from API response.

- [ ] **Step 5: Verify**

Run:

```powershell
npm test
npm run lint
npm run build
```

Expected: interaction authorization and notification tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/app/api/posts src/app/api/notifications src/app/notifications src/components/PostCard.tsx src/lib/interactions.test.ts
git commit -m "feat: add social interactions and notifications"
```

---

### Task 7: Profiles, Responsive Product UI, And Mock Removal

**Files:**
- Create: `src/app/profile/[username]/page.tsx`
- Create: `src/app/settings/profile/page.tsx`
- Create: `src/app/api/profile/route.ts`
- Modify: `src/components/Navigation.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Delete: `src/app/discover/page.tsx`
- Delete: `src/app/decide/page.tsx`
- Delete: `src/app/import/page.tsx`
- Delete: `src/app/groups/page.tsx`
- Delete: `src/app/api/decide/route.ts`
- Delete: `src/app/api/groups/route.ts`
- Delete: `src/app/api/imports/route.ts`
- Delete: `src/lib/recommendation/engine.ts`
- Delete: `src/lib/import/parser.ts`
- Delete: `src/lib/import/categorizer.ts`
- Delete: `src/lib/mockData.ts`
- Delete: `src/components/MapView.tsx`

**Interfaces:**
- Consumes: friendship visibility and authenticated user
- Produces: friend-visible profile and owner-only profile editing

- [ ] **Step 1: Add profile API and pages**

Profile read exposes username, name, avatar, bio, friendship state, and visible
posts. Profile update permits name, username, bio, and avatar URL with server
validation and unique username handling.

- [ ] **Step 2: Finish navigation and responsive states**

Desktop uses compact top navigation; mobile uses stable bottom navigation with
Feed, Add, Saved, Friends, Notifications. Icon buttons include accessible
labels and tooltips where text is absent.

- [ ] **Step 3: Remove inactive product**

Delete group, decision, import, mock, and map code listed above. Remove unused
dependencies `csv-parse`, `leaflet`, `mammoth`, `pdf-parse`, `xlsx`, and their
unused types.

- [ ] **Step 4: Update metadata and README**

Describe PlaceDecide as a private social place network. Document PostgreSQL,
Better Auth secret, optional Google Places, optional Blob uploads, migration,
test, build, and dev commands.

- [ ] **Step 5: Verify dead-code removal**

Run:

```powershell
rg -n "INITIAL_MOCK|/decide|/groups|/import|recommendation|MapView" src
npm test
npm run lint
npm run build
```

Expected: `rg` returns no active references; all checks pass.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "feat: complete private social place experience"
```

---

### Task 8: Database And Browser Acceptance Verification

**Files:**
- Create: `scripts/seed-demo.ts`
- Create: `docs/acceptance/social-place-network.md`
- Modify: `package.json`

**Interfaces:**
- Produces: repeatable two-user demo data
- Verifies: every success criterion in the design spec

- [ ] **Step 1: Add seed script**

Create two users through Better Auth's server API, create one accepted
friendship, and leave place/post creation to the acceptance flow. Add:

```json
"seed:demo": "tsx scripts/seed-demo.ts"
```

- [ ] **Step 2: Apply schema**

Run against configured PostgreSQL:

```powershell
npx prisma migrate dev --name social_place_network
npm run seed:demo
```

Expected: migration succeeds and two demo users exist.

- [ ] **Step 3: Run automated verification**

```powershell
npm test
npm run lint
npm run build
```

Expected: all exit 0.

- [ ] **Step 4: Start application**

```powershell
npm run dev
```

Expected: app serves on an available local URL.

- [ ] **Step 5: Run browser acceptance**

Verify:

1. Register or sign in as two users.
2. Send and accept a friend request.
3. Save one manual place and confirm one feed post.
4. Save one search result and one Maps-link result.
5. Confirm accepted friend sees all posts.
6. Confirm unrelated user cannot retrieve post URL.
7. Like, comment, and save friend's place.
8. Confirm reshare attribution and no duplicate second save.
9. Edit rating/review and confirm existing post updates.
10. Confirm notifications and read state.
11. Remove friendship and confirm mutual feed/profile access disappears.
12. Reload app and confirm data persists.

- [ ] **Step 6: Record evidence**

Write exact commands, test totals, build result, local URL, and acceptance
results to `docs/acceptance/social-place-network.md`.

- [ ] **Step 7: Commit**

```powershell
git add scripts/seed-demo.ts package.json package-lock.json docs/acceptance/social-place-network.md prisma/migrations
git commit -m "test: verify social place network acceptance"
```
