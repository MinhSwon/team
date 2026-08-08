# PlaceDecide Social Place Network Design

## Goal

PlaceDecide helps friends share trusted places with each other. A user saves a
place once; that save becomes a post visible to all accepted friends. Friends
can like, comment, or save the same place to their own library.

The MVP succeeds when a new user can add a friend, save a place, and see that
place appear in the friend's feed without manual coordination.

## Product Scope

### Included

- Account registration, sign-in, sign-out, and profile editing.
- Unique username for finding friends.
- Mutual friend requests with pending, accepted, and rejected states.
- Add a place by searching, pasting a Google Maps link, or entering details
  manually.
- One saved-place record per user and place.
- Every new save automatically creates one feed post for all accepted friends.
- Optional 1-5 rating, review text, photos, and tags.
- Editing a saved place updates its existing post instead of creating another.
- Chronological friend feed.
- Likes, comments, and saving a friend's place.
- Reshare attribution when a place is saved from a friend's post.
- In-app notifications for friend requests, accepted requests, likes, and
  comments.
- Personal saved-place library and friend-visible profiles.
- Place details with aggregated ratings and reviews from friends.

### Excluded

- Public posts or followers.
- Group workspaces and voting.
- Recommendation engine and "where should we go now" workflow.
- File imports.
- Collections.
- City-wide discovery map.
- Direct messages.
- Push notifications and email notifications.

These features can return after the social graph and saved-place data are
large enough to justify them.

## Visibility Rules

- Accounts and posts are private to accepted friends.
- A user always sees their own posts and saved places.
- Pending, rejected, or removed friendships grant no content access.
- A place is shared with all current friends; the MVP has no per-post audience
  selector.
- Removing a friend immediately removes mutual feed and profile access.
- Likes and comments are visible to the post owner and accepted friends who
  can view the post.

Every API and server action enforces these rules server-side. Client-provided
user IDs never determine identity or authorization.

## Core Workflows

### Friendship

1. User searches an exact or partial username.
2. User sends a friend request.
3. Recipient accepts or rejects it.
4. Accepted friendship becomes mutual.
5. Either user may remove the friendship.

Duplicate requests, self-requests, and requests between existing friends are
rejected.

### Add And Share A Place

1. User opens the add-place flow.
2. User selects one input method:
   - Search supported place provider.
   - Paste a Google Maps URL.
   - Enter name and address manually.
3. System resolves or creates one canonical place.
4. System checks whether the user already saved it.
5. User optionally adds rating, review, photos, and tags.
6. One transaction creates the saved-place record, feed post, and friend
   notifications.

Only the place is required. Optional content may be added later.

### Save From Feed

1. User opens a friend's post and selects Save.
2. System reuses the canonical place.
3. If already saved, system returns the existing saved record without creating
   another post.
4. Otherwise, system creates the user's saved-place record and post.
5. Post records the source post and original friend's attribution.

### Review Update

1. User edits their saved place.
2. Rating, text, photos, and tags are updated.
3. Existing post reflects the new content.
4. No second post is created.

### Feed

- Feed contains posts owned by the user or accepted friends.
- Posts sort by creation time descending.
- Pagination uses a stable `(createdAt, id)` cursor.
- Deleted posts and posts from removed friends never appear.

## Screens

### Feed

- Compact composer button for adding a place.
- Chronological post list.
- Place image, name, address, rating, review, tags, and attribution.
- Like, comment, and save controls.
- Empty state that directs the user to add friends or save the first place.

### Add Place

- Tabs for Search, Google Maps Link, and Manual.
- One confirmation form after place resolution.
- Optional rating, review, photos, and tags.
- Duplicate warning with link to the existing save.

### Place Detail

- Canonical place information.
- Current user's saved state.
- Ratings and reviews from accepted friends.
- Save or edit action.

### Saved

- Current user's saved places.
- Search and simple status filter.
- Edit and remove controls.

### Friends

- Username search.
- Incoming and outgoing requests.
- Accepted friends.
- Remove-friend action.

### Notifications

- Friend request.
- Friend request accepted.
- Post liked.
- Post commented.
- Read and unread state.

### Profile

- Avatar, display name, username, and bio.
- Posts visible according to friendship rules.
- Friend action when viewing another user.

## Data Model

### User

- `id`
- `email` unique
- `username` unique, case-insensitive
- `name`
- `passwordHash`
- `avatar`
- `bio`
- timestamps

### Session

- `id`
- `userId`
- hashed session token
- expiry
- timestamps

### Friendship

- `id`
- `requesterId`
- `addresseeId`
- status: `PENDING`, `ACCEPTED`, `REJECTED`
- timestamps

Database constraints prevent self-friendship and duplicate unordered user
pairs.

### Place

- Existing place identity and location fields.
- `externalSource`
- `externalPlaceId`
- normalized name and address fields for duplicate detection.

An external place ID is authoritative when present. Manual places use
normalized name, normalized address, and nearby coordinates for duplicate
review.

### UserSavedPlace

- `userId`
- `placeId`
- optional rating
- optional review
- optional source post
- saved status
- timestamps

Unique constraint: `(userId, placeId)`.

### Post

- `id`
- `authorId`
- `savedPlaceId` unique
- optional `sourcePostId`
- timestamps
- soft-delete timestamp

### PostLike

- `postId`
- `userId`
- timestamp

Unique constraint: `(postId, userId)`.

### Comment

- `id`
- `postId`
- `authorId`
- body
- timestamps
- soft-delete timestamp

### SavedPlaceImage

- `id`
- `savedPlaceId`
- URL
- caption
- sort order

### Notification

- `id`
- `recipientId`
- `actorId`
- type
- optional post, comment, or friendship reference
- read timestamp
- created timestamp

## Architecture

- Keep Next.js App Router, TypeScript, Prisma, and PostgreSQL.
- Use server-side route handlers for mutations and reads.
- Use a proven authentication library; do not implement password/session
  cryptography in application code.
- Store uploaded images in object storage and persist only URLs and metadata.
- Use Google Places API for search and supported Maps-link resolution.
- A pasted link that cannot be resolved falls back to the manual confirmation
  form; the server does not scrape arbitrary Google Maps HTML.
- Place-save, post creation, and notification creation run in one database
  transaction.
- Keep recommendation and import modules outside active navigation rather than
  extending them during this MVP.

## API Boundaries

- Authentication derives current user from the server session.
- Input schemas reject malformed IDs, oversized text, invalid ratings, unsafe
  image metadata, unsupported URLs, and oversized pagination limits.
- Read endpoints return only content authorized by friendship checks.
- Mutation endpoints verify post visibility before allowing likes, comments,
  or saves.
- User search returns limited public profile fields and excludes email.
- Rate limits apply to sign-in attempts, username search, friend requests,
  comments, and provider lookups.

## Error Handling

- Duplicate save returns the existing saved place and does not create side
  effects.
- Concurrent friend requests resolve through database uniqueness constraints.
- Failed image upload does not create a broken saved-place record.
- Provider lookup failure preserves entered data and offers manual completion.
- Transaction failure creates neither post nor partial notification records.
- Deleted or unauthorized resources return not found to avoid leaking
  existence.

## Testing

Minimum automated coverage:

- Friendship state transitions and duplicate/self-request rejection.
- Feed visibility before acceptance, after acceptance, and after removal.
- One save creates exactly one post.
- Repeated and concurrent saves do not duplicate posts.
- Saving from a friend's post records attribution.
- Non-friends cannot read, like, comment on, or save private posts.
- Rating and review validation.
- Place duplicate matching using external IDs.
- Transaction rollback for failed save/post creation.
- Feed cursor ordering.

Browser checks cover registration, friendship acceptance, place creation by all
three methods, feed appearance, like, comment, resave, and notification state.

## Delivery Order

1. Replace mock identity with real authentication and sessions.
2. Update Prisma schema and migrations.
3. Implement friendship workflows and authorization helpers.
4. Implement canonical place resolution for search, link, and manual input.
5. Implement transactional saved-place and post creation.
6. Implement feed and place-detail reads.
7. Implement likes, comments, resaves, and notifications.
8. Replace existing mock-driven screens with the social product screens.
9. Remove inactive navigation items and mock fallbacks.
10. Run database, unit, build, and browser verification.

## Success Criteria

- Two registered users can become friends.
- Saving a place automatically creates one post.
- The accepted friend sees the post; a non-friend cannot retrieve it.
- A friend can like, comment, and save the same canonical place.
- All three place-entry methods reach the same save-and-share flow.
- Reloading or restarting the app preserves all data.
- Production build completes without mock-data fallback.
