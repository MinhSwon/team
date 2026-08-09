# PlaceDecide

PlaceDecide là mạng xã hội riêng tư để bạn bè chia sẻ quán và địa điểm đáng
tin cậy. Mỗi người dùng lưu một địa điểm vào thư viện cá nhân, có thể thêm đánh
giá, bài viết, ảnh và thẻ. Mỗi lần lưu mới tạo đúng một bài đăng để toàn bộ bạn
bè đã kết nối nhìn thấy trong feed.

Sản phẩm tập trung vào câu hỏi:

> Bạn bè của tôi đã đi đâu, đánh giá thế nào, và tôi có muốn lưu địa điểm đó
> cho mình không?

## Mục lục

- [Nghiệp vụ](#nghiệp-vụ)
- [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
- [Mô hình dữ liệu](#mô-hình-dữ-liệu)
- [Pipeline nghiệp vụ](#pipeline-nghiệp-vụ)
- [API](#api)
- [Transaction và concurrency](#transaction-và-concurrency)
- [Bảo mật và quyền riêng tư](#bảo-mật-và-quyền-riêng-tư)
- [Cài đặt local](#cài-đặt-local)
- [Database và migration](#database-và-migration)
- [Background jobs](#background-jobs)
- [CI/CD và triển khai](#cicd-và-triển-khai)
- [Monitoring và vận hành](#monitoring-và-vận-hành)
- [Kiểm thử](#kiểm-thử)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Giới hạn hiện tại](#giới-hạn-hiện-tại)

## Nghiệp vụ

### Đối tượng sử dụng

- Người dùng cá nhân muốn lưu quán ăn, quán cà phê và địa điểm.
- Nhóm bạn muốn chia sẻ trải nghiệm mà không đăng công khai.
- Người dùng cần tham khảo đánh giá từ bạn bè thay vì dữ liệu cộng đồng không
  xác định.

### Quy tắc sản phẩm

1. Quan hệ xã hội là bạn bè hai chiều.
2. Nội dung chỉ hiển thị cho chủ sở hữu và bạn bè ở trạng thái `ACCEPTED`.
3. Mỗi người chỉ lưu một lần cho cùng một địa điểm chuẩn hóa.
4. Mỗi bản lưu mới tạo đúng một bài đăng.
5. Chỉnh sửa đánh giá cập nhật bài đăng hiện có, không tạo bài đăng thứ hai.
6. Xóa bạn bè có hiệu lực ngay với feed, profile, post và ảnh riêng tư.
7. Chỉ địa điểm là bắt buộc. Rating, review, tags và ảnh đều tùy chọn.
8. Người dùng có thể lưu lại địa điểm từ bài đăng của bạn bè; hệ thống giữ
   nguồn chia sẻ bằng `sourcePostId`.
9. Client không được quyết định user ID, quyền xem hoặc URL Blob.
10. Tài nguyên không tồn tại và tài nguyên không có quyền đều trả về lỗi
    not-found mơ hồ để tránh lộ dữ liệu.

### Luồng người dùng chính

#### Kết bạn

1. Tìm theo username hoặc tên.
2. Gửi lời mời.
3. Người nhận chấp nhận hoặc từ chối.
4. Khi chấp nhận, quan hệ có hiệu lực hai chiều.
5. Một trong hai bên có thể hủy kết bạn.

Hệ thống chặn tự kết bạn, lời mời trùng và cặp bạn bè trùng theo khóa
`pairKey`.

#### Thêm địa điểm

Người dùng có ba cách nhập:

- Tìm kiếm địa điểm.
- Dán Google Maps URL.
- Nhập thủ công tên và địa chỉ.

Ba cách đều đi qua cùng pipeline resolve, xác nhận và lưu. Khi Google Places
không được cấu hình hoặc provider lỗi, hệ thống dùng dữ liệu local hoặc trả về
form xác nhận thủ công; server không scrape HTML Google Maps.

#### Chia sẻ và tương tác

- Save mới tạo một `UserSavedPlace` và một `Post`.
- Bạn bè thấy post trong feed theo thời gian mới nhất.
- Bạn bè có thể like, comment hoặc save lại địa điểm.
- Like và comment tạo notification cho chủ post, trừ thao tác của chính chủ.
- Save lại giữ attribution tới post nguồn.

#### Quản lý thư viện

Người dùng có thể:

- Tìm kiếm trong địa điểm đã lưu.
- Lọc theo `SAVED`, `WANT_TO_GO`, `VISITED`.
- Chỉnh rating, review, tags, ảnh và trạng thái.
- Xóa địa điểm đã lưu; post liên quan bị xóa theo quan hệ dữ liệu.

### Phạm vi hiện tại

Đã triển khai:

- Đăng ký, đăng nhập, session bền vững.
- Profile riêng tư.
- Friend request hai chiều.
- Search, Google Maps URL và manual place.
- Feed bạn bè.
- Rating 1-5, review, tags và ảnh.
- Like, comment, resave.
- Notification trong ứng dụng.
- Saved-place search, filter, edit và delete.
- Private media proxy.
- Database rate limit, cleanup và migration verification.

Chưa thuộc phạm vi:

- Public post, follower hoặc discovery toàn thành phố.
- Group workspace, voting và recommendation engine.
- Collection.
- Direct message.
- Email, push notification.
- Admin console.
- Mobile native application.

## Kiến trúc hệ thống

### Stack

| Tầng | Công nghệ | Trách nhiệm |
| --- | --- | --- |
| Web | Next.js 16 App Router | Trang, server rendering, route handlers |
| UI | React 19, Tailwind CSS, Lucide | Giao diện responsive và accessible |
| Auth | Better Auth 1.6 | Email/password, session, auth API |
| Domain | TypeScript modules | Friendship, place, post, interaction, media |
| ORM | Prisma 7 | Schema, query, transaction, migration |
| Database | PostgreSQL | Dữ liệu chính, lock, constraint, rate limit |
| Object storage | Vercel Blob | Ảnh private và lifecycle cleanup |
| Place provider | Google Places | Search và resolve địa điểm khi có key |
| Test | `node:test`, `tsx`, Playwright Core | Unit, API, DB race, browser acceptance |

### Sơ đồ tổng thể

```mermaid
flowchart LR
    Browser[Web browser]
    Edge[Reverse proxy / platform edge]
    Next[Next.js application]
    Auth[Better Auth]
    Domain[Domain services]
    DB[(PostgreSQL)]
    Blob[(Private Vercel Blob)]
    Google[Google Places API]
    Jobs[Scheduled maintenance jobs]

    Browser -->|HTTPS| Edge
    Edge -->|Trusted client IP headers| Next
    Next --> Auth
    Next --> Domain
    Auth --> DB
    Domain --> DB
    Domain -->|Private put/get/delete| Blob
    Domain -->|Search / Place Details| Google
    Jobs --> DB
    Jobs --> Blob
```

### Biên trách nhiệm

#### App Router

`src/app` chứa:

- Route group `(auth)` cho login và register.
- Route group `(app)` cho toàn bộ trang cần session.
- `api/*` cho HTTP boundaries.

App layout kiểm tra session ở server. Người dùng chưa đăng nhập bị chuyển về
`/login`.

#### Domain services

| Module | Trách nhiệm |
| --- | --- |
| `src/lib/auth.ts` | Better Auth, policy name/username/image, auth rate limit |
| `src/lib/current-user.ts` | Lấy user từ session server |
| `src/lib/friendships.ts` | State machine kết bạn và visibility |
| `src/lib/places.ts` | Search, Maps URL, manual canonicalization |
| `src/lib/posts.ts` | Save, post, feed, place detail, image ownership |
| `src/lib/interactions.ts` | Like, comment, resave, notification |
| `src/lib/profiles.ts` | Profile read/update theo quyền |
| `src/lib/media.ts` | Query quyền xem private media |
| `src/lib/blob-uploads.ts` | Reservation, conversion, lease và cleanup |
| `src/lib/rate-limit.ts` | PostgreSQL rate-limit buckets |
| `src/lib/serializable.ts` | Retry transaction conflict `P2034` |
| `src/lib/validation.ts` | Giới hạn input dùng chung |

#### PostgreSQL

PostgreSQL không chỉ lưu dữ liệu. Database còn giữ các invariant:

- Unique friendship pair.
- Unique external place.
- Unique manual-place dedupe key.
- Unique `(userId, placeId)`.
- Một post cho một saved place.
- Unique like `(postId, userId)`.
- Unique Blob URL, pathname và image ownership.
- Row locks cho update/delete race.
- Atomic rate-limit counter.
- Lease cho Blob conversion và deletion workers.

#### External providers

Google Places và Vercel Blob là optional trong local development. Provider
failure không được làm hỏng dữ liệu cốt lõi:

- Google lỗi: dùng local result hoặc manual confirmation.
- Blob chưa cấu hình: save không ảnh vẫn hoạt động.
- Blob delete lỗi: giữ ledger để retry.
- Blob conversion lỗi: startup/readiness bị chặn cho đến khi xử lý xong.

## Mô hình dữ liệu

```mermaid
erDiagram
    User ||--o{ Session : has
    User ||--o{ Account : has
    User ||--o{ Friendship : requests
    User ||--o{ Friendship : receives
    User ||--o{ UserSavedPlace : saves
    User ||--o{ Post : authors
    User ||--o{ PostLike : likes
    User ||--o{ Comment : writes
    User ||--o{ Notification : receives
    User ||--o{ BlobUpload : owns

    Place ||--o{ UserSavedPlace : referenced_by
    UserSavedPlace ||--|| Post : publishes
    UserSavedPlace ||--o{ SavedPlaceImage : contains
    BlobUpload ||--o| SavedPlaceImage : backs
    Post ||--o{ PostLike : receives
    Post ||--o{ Comment : receives
    Post ||--o{ Notification : references
    Post ||--o{ Post : source_for
```

### Entity chính

#### `User`

Identity do Better Auth quản lý. `username` là định danh công khai duy nhất.
Email không được trả về trong user search, feed hoặc profile của bạn bè.
Avatar external bị vô hiệu hóa; UI dùng initials fallback.

#### `Friendship`

Trạng thái:

```text
PENDING -> ACCEPTED
PENDING -> REJECTED
ACCEPTED -> deleted
```

`pairKey` biểu diễn cặp user không phụ thuộc thứ tự, ngăn hai record ngược
chiều cho cùng một cặp.

#### `Place`

Địa điểm chuẩn hóa dùng:

- `externalSource + externalPlaceId` cho provider-backed place.
- `dedupeKey` cho manual place.
- `normalizedName` và `normalizedAddress` để search local.

#### `UserSavedPlace`

Là quan hệ giữa user và canonical place. Unique `(userId, placeId)` đảm bảo
một người không lưu trùng cùng địa điểm.

#### `Post`

Post không sao chép dữ liệu địa điểm. Post tham chiếu `savedPlaceId`, nên chỉnh
sửa review hoặc rating xuất hiện trên post hiện có. `sourcePostId` lưu nguồn
resave.

#### `BlobUpload`

Ledger sở hữu object storage. Lifecycle:

```mermaid
stateDiagram-v2
    [*] --> RESERVED
    RESERVED --> UPLOADED
    UPLOADED --> CLAIMED
    RESERVED --> PENDING_DELETE
    UPLOADED --> PENDING_DELETE
    CLAIMED --> PENDING_DELETE
    PENDING_PRIVATE_COPY --> CONVERTING
    CONVERTING --> PENDING_PUBLIC_DELETE
    PENDING_PUBLIC_DELETE --> CONVERTING
    CONVERTING --> CLAIMED
    PENDING_DELETE --> DELETING
    DELETING --> PENDING_DELETE
    DELETING --> [*]
```

`leaseUntil` ngăn hai worker xử lý cùng object. `sourceUrl` giữ URL public cũ
cho đến khi private copy hoàn tất và public object đã được xóa.

## Pipeline nghiệp vụ

### 1. Đăng ký và đăng nhập

```mermaid
sequenceDiagram
    participant U as User
    participant A as Next.js auth route
    participant B as Better Auth
    participant R as PostgreSQL rate limit
    participant D as PostgreSQL

    U->>A: Sign up / sign in
    A->>B: Forward request
    B->>R: Atomic consume IP + path bucket
    B->>B: Validate name, username, image policy
    B->>D: Create/read user and session
    D-->>B: User + session
    B-->>U: Secure session cookie
```

Production yêu cầu `TRUSTED_PROXY_IPS`. Nếu thiếu hoặc sai, startup/check
deployment thất bại thay vì dùng một global fallback bucket.

### 2. Kết bạn

```mermaid
sequenceDiagram
    participant A as Requester
    participant API as Friend API
    participant DB as PostgreSQL
    participant B as Addressee

    A->>API: POST /api/friends
    API->>DB: Create PENDING pair + notification
    B->>API: PATCH /api/friends/:id accept
    API->>DB: Serializable state transition
    API->>DB: Create FRIEND_ACCEPTED notification
    DB-->>A: Friendship is mutual
```

Response cạnh tranh được serialize. Chỉ addressee có thể accept/reject; cả hai
bên có thể xóa friendship đã accepted.

### 3. Resolve địa điểm

```mermaid
flowchart TD
    Input[Search, Maps URL, hoặc Manual]
    Existing{Canonical place tồn tại?}
    Provider{Google key và provider hoạt động?}
    Google[Google Text Search / Place Details]
    Local[Local PostgreSQL search]
    Confirm[Manual confirmation]
    Canonical[Canonical Place]

    Input --> Existing
    Existing -->|Có| Canonical
    Existing -->|Không| Provider
    Provider -->|Có| Google
    Provider -->|Không hoặc lỗi| Local
    Google --> Canonical
    Local -->|Tìm thấy| Canonical
    Local -->|Không đủ dữ liệu| Confirm
    Confirm --> Canonical
```

Input boundary:

- Name tối đa 160 ký tự.
- Address tối đa 500.
- Area tối đa 120.
- Query tối đa 200.
- Maps URL và website tối đa 2.048.
- Website chỉ chấp nhận HTTPS, không chứa credentials.
- Latitude `[-90, 90]`, longitude `[-180, 180]`.

### 4. Save và tự động share

```mermaid
sequenceDiagram
    participant U as User
    participant API as POST /api/saved
    participant P as Place resolver
    participant DB as PostgreSQL

    U->>API: Place + optional review/tags/upload IDs
    API->>P: Resolve canonical place
    P-->>API: placeId
    API->>DB: Check existing (userId, placeId)
    alt Already saved
        DB-->>U: Existing saved place + post
    else New save
        API->>DB: Begin transaction
        API->>DB: Claim owned BlobUpload rows
        API->>DB: Create UserSavedPlace
        API->>DB: Create exactly one Post
        API->>DB: Commit
        DB-->>U: Saved place + post
    end
```

Unique constraints xử lý duplicate hoặc concurrent request. Không tạo bản sao
post cho từng người bạn; feed query đọc trực tiếp post của các accepted friends.

### 5. Feed

Feed query chỉ chọn:

```text
authorId = currentUser
OR author has ACCEPTED friendship with currentUser
```

Thứ tự:

```text
createdAt DESC, id DESC
```

Cursor là Base64URL của `(createdAt, id)`. Mặc định 20 item, tối đa 50.
Friendship bị xóa làm post biến mất ngay ở query tiếp theo.

### 6. Like, comment và resave

- Visibility được kiểm tra bên trong transaction.
- Like nhận desired state, nên retry không đảo trạng thái ngoài ý muốn.
- Comment trim body, bắt buộc không rỗng, tối đa 1.000 ký tự.
- Resave gọi lại pipeline `saveAndSharePlace`.
- Notification và mutation nằm cùng transaction.
- Self-like/self-comment không tạo notification.
- Serializable conflict retry tối đa 3 lần.

### 7. Upload và đọc ảnh private

```mermaid
sequenceDiagram
    participant U as User
    participant API as Upload API
    participant DB as PostgreSQL
    participant Blob as Private Blob
    participant Media as Media API
    participant F as Friend

    U->>API: Multipart image
    API->>API: Size, MIME, magic-byte validation
    API->>DB: Create RESERVED ledger
    API->>Blob: Private put
    API->>DB: Mark UPLOADED
    API-->>U: /api/media/{uploadId}
    U->>DB: Save place and claim upload
    F->>Media: GET /api/media/{uploadId}
    Media->>DB: Recheck current friendship
    Media->>Blob: Authenticated private get
    Media-->>F: no-store + nosniff image stream
```

Client không nhận raw provider URL. Media request luôn kiểm tra session và
friendship hiện tại. Hủy kết bạn chặn lần đọc tiếp theo.

### 8. Blob cleanup và legacy conversion

```mermaid
flowchart TD
    Job[cleanup:blobs]
    Claim[Claim rows with SKIP LOCKED + lease]
    Convert{Legacy public source?}
    Validate[Validate host, <=5 MB, MIME, magic bytes]
    Private[Copy to private Blob]
    DeletePublic[Delete public source]
    DeleteObject[Delete pending/orphan object]
    Finish[Delete ledger or mark CLAIMED]
    Retry[Release claim and retain lastError]

    Job --> Claim
    Claim --> Convert
    Convert -->|Có| Validate
    Validate --> Private
    Private --> DeletePublic
    DeletePublic --> Finish
    Convert -->|Không| DeleteObject
    DeleteObject --> Finish
    Validate -->|Lỗi| Retry
    Private -->|Lỗi| Retry
    DeletePublic -->|Lỗi| Retry
    DeleteObject -->|Lỗi| Retry
```

Provider calls có timeout ngắn hơn lease. Conversion xử lý batch tối đa bốn
row theo thứ tự để giới hạn memory. Update/delete saved place dùng parent-row
lock trước Blob rows để tránh object mồ côi.

### 9. Deployment pipeline

```mermaid
flowchart LR
    Checkout[Checkout feature commit]
    Install[npm ci]
    Config[npm run check:deployment]
    Migrations[npm run verify:migrations]
    Tests[npm test + lint]
    Races[npm run verify:races]
    DeployDB[prisma migrate deploy]
    Convert[cleanup:blobs]
    Ready[verify:blob-conversion]
    Build[npm run build]
    Smoke[HTTP + browser acceptance]
    Release[Deploy immutable build]

    Checkout --> Install --> Config --> Migrations --> Tests --> Races
    Races --> DeployDB --> Convert --> Ready --> Build --> Smoke --> Release
```

Repo hiện cung cấp đầy đủ scripts cho pipeline trên nhưng chưa commit workflow
CI của GitHub/GitLab. Nền tảng CI phải gọi các bước theo đúng thứ tự.

## API

### Authentication

| Method | Route | Mục đích |
| --- | --- | --- |
| `GET/POST` | `/api/auth/*` | Better Auth session và credentials |

### Friends

| Method | Route | Mục đích |
| --- | --- | --- |
| `GET` | `/api/friends` | Accepted, incoming, outgoing |
| `POST` | `/api/friends` | Gửi lời mời |
| `PATCH` | `/api/friends/:id` | Accept hoặc reject |
| `DELETE` | `/api/friends/:id` | Hủy kết bạn |
| `GET` | `/api/users/search?q=` | Tìm user, không trả email |

### Places và saved places

| Method | Route | Mục đích |
| --- | --- | --- |
| `GET` | `/api/places/search?q=` | Search local và provider |
| `POST` | `/api/places/resolve` | Resolve Search/Maps/manual input |
| `POST` | `/api/uploads` | Upload một ảnh private |
| `GET` | `/api/media/:id` | Đọc ảnh sau authorization |
| `POST` | `/api/saved` | Save và tạo post |
| `PATCH` | `/api/saved/:id` | Chỉnh saved place |
| `DELETE` | `/api/saved/:id` | Xóa saved place |

### Feed và interactions

| Method | Route | Mục đích |
| --- | --- | --- |
| `GET` | `/api/feed` | Feed có cursor |
| `GET` | `/api/posts/:id` | Post detail có authorization |
| `POST` | `/api/posts/:id/like` | Đặt desired like state |
| `POST` | `/api/posts/:id/comments` | Tạo comment |
| `POST` | `/api/posts/:id/save` | Resave canonical place |

### Profile và notifications

| Method | Route | Mục đích |
| --- | --- | --- |
| `GET` | `/api/profile?username=` | Profile owner/friend |
| `PATCH` | `/api/profile` | Chỉnh profile hiện tại |
| `GET` | `/api/notifications` | 50 notification mới nhất |
| `PATCH` | `/api/notifications/read` | Đánh dấu đã đọc |

## Transaction và concurrency

### Invariant bắt buộc

- Save và post commit cùng nhau.
- Friendship transition và notification commit cùng nhau.
- Like/comment và notification commit cùng nhau.
- Blob claim và saved-image relation commit cùng nhau.
- Xóa ảnh chuyển Blob sang cleanup lifecycle trước khi xóa relation.

### Race được kiểm chứng bằng PostgreSQL thật

1. Like đồng thời với hủy kết bạn.
2. Comment đồng thời với hủy kết bạn.
3. Blob conversion đồng thời với delete.
4. Blob conversion claim đồng thời với delete intent.
5. Saved-place image replacement đồng thời với saved-place delete.

`npm run verify:races` dùng row lock và transaction thật, không chỉ mock.

### Lock order

Mutation ảnh giữ thứ tự:

```text
UserSavedPlace -> BlobUpload
```

Delete khóa parent `UserSavedPlace` bằng `SELECT ... FOR UPDATE` trước khi đọc
image IDs. Atomic lifecycle update giữ lease nếu row đang `CONVERTING` hoặc
`PENDING_DELETE`.

## Bảo mật và quyền riêng tư

### Authentication

- Better Auth quản lý password hash, session và cookie.
- Server lấy identity từ session; không nhận `userId` từ client.
- Signup/update hook chuẩn hóa username, giới hạn name và vô hiệu external
  avatar.
- Production bắt buộc secret tối thiểu 32 ký tự.

### Authorization

- Profile, feed, post, place review và media đều filter bằng current friendship.
- Pending/rejected/removed friendship không cấp quyền.
- Unauthorized và missing resource dùng cùng not-found response.
- Visibility check của write mutation nằm bên trong transaction.

### Input validation

| Input | Giới hạn |
| --- | --- |
| Rating | Integer 1-5 hoặc null |
| Review | 2.000 ký tự |
| Comment | 1.000 ký tự |
| Tags | Tối đa 10, mỗi tag tối đa 32 ký tự |
| Images/save | Tối đa 6 |
| Image | JPEG/PNG/WebP, tối đa 5 MiB |
| Image caption | 300 ký tự |
| Notification IDs | Tối đa 100 |
| User/place query | 200 ký tự |

Upload route kiểm tra `Content-Length` trước `formData()`, MIME và magic bytes.
Production proxy vẫn phải đặt request-body limit cho chunked request hoặc
request thiếu `Content-Length`.
Deployment requires a trusted proxy chain or authenticated client IP header.
Direct origin access is forbidden; request body limit must reject missing or chunked `Content-Length`.

### Private media

- Blob được upload với `access: "private"`.
- Raw Blob URL chỉ tồn tại phía server.
- Browser dùng `/api/media/{uploadId}`.
- Response đặt `Cache-Control: private, no-store`.
- Response đặt `X-Content-Type-Options: nosniff`.
- Content-Type lấy từ metadata đã xác thực, không phản chiếu provider MIME.
- Legacy source chỉ chấp nhận exact owned hosts.

### Rate limits

PostgreSQL atomic buckets hoạt động xuyên nhiều app instances:

| Action | Limit |
| --- | --- |
| Email sign-in | 5 / 15 phút / resolved IP |
| User search | 30 / 60 giây |
| Place search/resolve | 20 / 60 giây |
| Friend request | 10 / giờ |
| Comment | 20 / 60 giây |
| Upload | 10 / giờ |

Response bị giới hạn trả HTTP 429 và `Retry-After`.

### Network trust

`TRUSTED_PROXY_IPS` chỉ có ý nghĩa khi origin không thể bị client truy cập trực
tiếp. Production phải:

- Chặn public traffic tới origin.
- Chỉ cho reverse proxy/platform edge kết nối.
- Chỉ tin header IP do proxy đó ghi lại.
- Liệt kê đầy đủ proxy IP/CIDR trong `TRUSTED_PROXY_IPS`.

Application kiểm tra cú pháp config nhưng không thể tự chứng minh network
topology.

## Cài đặt local

### Yêu cầu

- Node.js tương thích Next.js 16.
- PostgreSQL.
- npm.

### 1. Cài dependencies

```powershell
npm install
```

### 2. Tạo `.env`

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/placedecide?schema=public
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
BETTER_AUTH_URL=http://localhost:3000
TRUSTED_PROXY_IPS=
LEGACY_BLOB_STORE_HOSTS=
GOOGLE_MAPS_API_KEY=
BLOB_READ_WRITE_TOKEN=
```

| Biến | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `DATABASE_URL` | Có | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Có | Secret tối thiểu 32 ký tự |
| `BETTER_AUTH_URL` | Có | Origin chính xác của ứng dụng |
| `TRUSTED_PROXY_IPS` | Production | Proxy IP hoặc CIDR, comma-separated |
| `LEGACY_BLOB_STORE_HOSTS` | Khi migrate ảnh cũ | Exact owned Blob hosts |
| `GOOGLE_MAPS_API_KEY` | Không | Google Places search/details |
| `BLOB_READ_WRITE_TOKEN` | Không | Upload và cleanup ảnh |

### 3. Apply database

```powershell
npx prisma migrate deploy
```

### 4. Chạy development

```powershell
npm run dev
```

Mở `http://localhost:3000`.

### Demo data

Demo seed bị chặn trong production và cần opt-in:

```powershell
$env:ALLOW_DEMO_SEED="1"
npm run seed:demo
```

## Database và migration

### Chính sách rollout

Baseline hiện tại là **fresh-install-only**. In-place upgrade từ schema legacy
không được hỗ trợ tự động. Nếu phát hiện mapped legacy tables như `users`,
`places`, `user_saved_places`, group hoặc import tables, migration dừng trước
khi tạo social tables.

In-place legacy upgrade is unsupported. Deploy to a new database, then export,
transform, and import data, unless the existing database already exactly matches
the social schema.

Apply migration:

```powershell
npx prisma migrate deploy
npx prisma migrate status
```

Kiểm chứng migration bằng temporary schemas:

```powershell
npm run verify:migrations
```

Verifier bao gồm:

- Fresh schema.
- Nonempty/legacy schema rejection.
- Manual-place dedupe.
- Blob ownership backfill.
- Public-to-private conversion ledger.
- Unsupported/foreign Blob rejection.
- Public reference preservation.
- Readiness failure khi conversion chưa hoàn tất.

### Legacy Blob conversion

Đối với social database có ảnh Vercel Blob cũ:

1. Xác định exact public/private store hosts.
2. Cấu hình cùng danh sách trong env và PostgreSQL setting.
3. Apply migration.
4. Chạy cleanup cho đến khi không còn lỗi.
5. Chạy readiness.
6. Sau đó mới build và cut over traffic.

Ví dụ:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/placedecide?schema=public&options=-c%20placedecide.legacy_blob_store_hosts%3Dstore-id.public.blob.vercel-storage.com%2Cstore-id.private.blob.vercel-storage.com
LEGACY_BLOB_STORE_HOSTS=store-id.public.blob.vercel-storage.com,store-id.private.blob.vercel-storage.com
```

```powershell
npm run cleanup:blobs
npm run verify:blob-conversion
```

`npm run build` và `npm start` gọi readiness check và từ chối chạy khi còn:

- Pending/failed conversion.
- `sourceUrl` chưa xóa.
- Public Blob URL.

### Unreleased migration repair

Private Blob migrations trên nhánh này chưa phát hành. Development database đã
apply checksum cũ chỉ được repair khi không có Blob/image data:

```powershell
$env:ALLOW_UNRELEASED_MIGRATION_REPAIR="1"
npm run repair:unreleased-migrations
```

Script từ chối production, unknown checksum, partial history hoặc database có
dữ liệu không thể suy luận an toàn. Khi bị từ chối, tạo lại development
database.

## Background jobs

### Blob cleanup

```powershell
npm run cleanup:blobs
```

Xử lý:

- Legacy public-to-private conversion.
- `PENDING_DELETE`.
- Reservation/upload không được claim quá 24 giờ.
- Stale `DELETING` hoặc `CONVERTING` lease.

Khuyến nghị production: chạy mỗi 5-15 phút bằng scheduler, singleton không bắt
buộc vì worker dùng `FOR UPDATE SKIP LOCKED` và lease.

### Rate-limit cleanup

```powershell
npm run cleanup:rate-limits
```

Xóa bucket hết hạn. Khuyến nghị chạy mỗi giờ.

### Job policy

- Command phải trả exit code khác 0 khi có failure.
- Scheduler phải lưu stdout/stderr và số lần retry.
- Alert khi Blob cleanup liên tục lỗi hoặc conversion readiness không đạt.
- Không chạy migration repair như recurring job.

## CI/CD và triển khai

### Trạng thái hiện tại

Repo có scripts kiểm chứng và deployment gates, nhưng chưa có workflow CI cụ
thể trong `.github/workflows`. Pipeline bên dưới là contract cần cấu hình trên
GitHub Actions, GitLab CI hoặc nền tảng tương đương.

### Pull request pipeline

```powershell
npm ci
npm run verify:migrations
npm test
npm run lint
npm run verify:races
$env:TRUSTED_PROXY_IPS="127.0.0.1/32"
npm run check:deployment
npm run build
npx react-doctor@latest --verbose --scope changed
```

Yêu cầu CI:

- PostgreSQL service riêng cho job.
- Không dùng production database.
- Không inject production Blob/Google credentials vào untrusted PR.
- Cache npm hợp lệ, không cache generated database state.
- Fail ngay khi một gate lỗi.

### Staging pipeline

1. Build immutable commit.
2. Provision/choose staging PostgreSQL.
3. `prisma migrate deploy`.
4. Chạy `cleanup:blobs` nếu có legacy conversion.
5. Chạy `verify:blob-conversion`.
6. Chạy `check:deployment`.
7. Start production build.
8. Chạy:

```powershell
npm run acceptance:social
npm run acceptance:browser
```

9. Smoke test Google Places và Vercel Blob bằng scoped staging keys.
10. Chỉ promote đúng artifact đã kiểm chứng.

### Production deployment

Thứ tự bắt buộc:

```text
Backup -> Migrate -> Blob conversion -> Readiness -> Build/Release -> Smoke
```

Không cut over khi:

- Migration lỗi.
- Blob readiness lỗi.
- Trusted proxy config lỗi.
- Acceptance staging lỗi.
- Backup chưa xác nhận.

### Rollback

Application rollback:

- Redeploy artifact trước đó nếu schema vẫn backward-compatible.
- Không tự động rollback migration bằng SQL đoán.
- Nếu migration thay đổi dữ liệu, dùng restore hoặc forward-fix đã kiểm chứng.

Blob rollback:

- Không xóa `sourceUrl` trước khi private copy được ghi bền vững.
- Cleanup failure giữ ledger và `lastError`.
- Không xóa row ledger thủ công để “bỏ qua” readiness.

## Monitoring và vận hành

Repo chưa tích hợp vendor monitoring cụ thể. Production nên thu thập:

### Metrics

- HTTP request count, latency, 4xx, 5xx.
- Auth sign-in success/failure/429.
- PostgreSQL connection pool và query latency.
- Serializable retry count.
- Feed query latency.
- Provider timeout/error rate.
- Blob lifecycle count theo trạng thái.
- Blob cleanup converted/deleted/failed.
- Rate-limit bucket count.
- Notification creation failure.

### Logs

Log có cấu trúc nên chứa:

- Request ID.
- Route và status.
- User ID đã hash hoặc internal ID khi phù hợp.
- Error code, không log password/session/token.
- Provider operation và timeout.
- Cleanup row ID, lifecycle, attempt và `lastError`.
- Migration/readiness result.

Không log:

- Password.
- Better Auth secret.
- Session cookie/token.
- Blob read-write token.
- Google API key.
- Full authorization header.

### Alerts

Tối thiểu:

- 5xx rate vượt ngưỡng.
- Database unavailable.
- Auth 429 tăng bất thường.
- Blob cleanup failure liên tiếp.
- Có `PENDING_PRIVATE_COPY`, `PENDING_PUBLIC_DELETE` hoặc stale lease quá SLA.
- Readiness check thất bại.
- Backup thất bại.

### Backup và recovery

Production cần:

- Automated PostgreSQL backups.
- Point-in-time recovery nếu provider hỗ trợ.
- Retention policy và restore drill định kỳ.
- Blob lifecycle ledger nằm trong cùng backup database.
- Không coi object storage là nguồn sự thật duy nhất.

Khuyến nghị chạy restore drill ở staging trước release lớn.

### Runbook sự cố

#### Feed lộ hoặc thiếu dữ liệu

1. Tắt mutation nếu nghi authorization regression.
2. Kiểm tra friendship state và query predicates.
3. Chạy focused authorization tests.
4. Không sửa dữ liệu hàng loạt trước khi xác định root cause.

#### Blob cleanup lỗi

1. Kiểm tra `BLOB_READ_WRITE_TOKEN`.
2. Kiểm tra `lastError`, lifecycle và lease.
3. Xác nhận exact owned hosts.
4. Chạy một cleanup batch.
5. Không xóa ledger row thủ công.

#### Rate limit khóa nhầm nhiều user

1. Kiểm tra origin isolation.
2. Kiểm tra `TRUSTED_PROXY_IPS`.
3. Kiểm tra forwarded header do edge cung cấp.
4. Prune bucket hết hạn nếu config đã sửa.

#### Migration bị chặn

1. Đọc exact migration error.
2. Kiểm tra schema/history và legacy tables.
3. Không dùng `migrate reset` trên production.
4. Restore clone để thử forward-fix hoặc migration plan.

## Kiểm thử

### Commands

| Command | Phạm vi |
| --- | --- |
| `npm test` | Unit, domain, API boundary |
| `npm run lint` | ESLint |
| `npm run build` | Prisma generate, Blob readiness, Next production build |
| `npm run verify:migrations` | Fresh/legacy/Blob migration matrix |
| `npm run verify:races` | PostgreSQL lock và concurrency |
| `npm run check:deployment` | Production env syntax |
| `npm run acceptance:social` | 12 HTTP/API business criteria |
| `npm run acceptance:browser` | 14 visible browser criteria |

### Acceptance harness

Mỗi acceptance command:

1. Yêu cầu tracked source sạch.
2. Ghi nhận Git commit trước build.
3. Tạo fresh production build trong `.next-acceptance`.
4. Start `next start` trên isolated loopback port.
5. Chạy business workflow.
6. Kiểm tra commit không đổi.
7. Dừng toàn bộ process tree.
8. Xóa build tạm và restore environment.

### Kết quả gần nhất

Tại application commit `3db9fa5`:

- Migration proofs: 8/8.
- Live PostgreSQL races: 5/5.
- Tests: 183/183.
- Lint: pass.
- Production build: pass.
- React Doctor: 100/100.
- HTTP acceptance: 12/12.
- Browser acceptance: 14/14.

Chi tiết nằm tại
[`docs/acceptance/social-place-network.md`](docs/acceptance/social-place-network.md).

## Cấu trúc thư mục

```text
.
|-- prisma/
|   |-- migrations/           # Versioned PostgreSQL migrations
|   `-- schema.prisma         # Domain schema
|-- scripts/
|   |-- acceptance-*.ts       # Fresh-build acceptance harnesses
|   |-- check-deployment.ts   # Production env gate
|   |-- cleanup-*.ts          # Scheduled maintenance
|   |-- seed-demo.ts          # Guarded local fixtures
|   |-- verify-*.ts           # Migration, readiness, race proofs
|   `-- repair-*.ts           # Pre-release-only guarded repair
|-- src/
|   |-- app/
|   |   |-- (auth)/           # Login/register
|   |   |-- (app)/            # Protected product pages
|   |   `-- api/              # HTTP boundaries
|   |-- components/           # Interactive product UI
|   `-- lib/                  # Domain and infrastructure modules
|-- docs/
|   |-- acceptance/           # Verification evidence
|   `-- superpowers/          # Product spec and implementation plan
|-- .env.example
|-- next.config.ts
`-- package.json
```

## Scripts

| Script | Mục đích |
| --- | --- |
| `npm run dev` | Next development server |
| `npm run build` | Production build có Blob readiness gate |
| `npm start` | Production start có Blob readiness gate |
| `npm test` | 183 automated tests tại lần kiểm chứng gần nhất |
| `npm run lint` | ESLint |
| `npm run seed:demo` | Guarded demo users |
| `npm run verify:migrations` | Migration matrix |
| `npm run verify:blob-conversion` | Deployment readiness |
| `npm run verify:races` | Live PostgreSQL races |
| `npm run check:deployment` | Auth/proxy deployment config |
| `npm run cleanup:blobs` | Conversion và deletion worker |
| `npm run cleanup:rate-limits` | Xóa expired buckets |
| `npm run acceptance:social` | HTTP business acceptance |
| `npm run acceptance:browser` | Browser business acceptance |

## Giới hạn hiện tại

- `GOOGLE_MAPS_API_KEY` chưa được cấu hình trong local acceptance, nên live
  Google success path cần staging smoke test.
- `BLOB_READ_WRITE_TOKEN` chưa được cấu hình trong local acceptance, nên live
  private upload/read/delete/conversion cần staging smoke test.
- CI workflow, scheduler, metrics backend và alert provider chưa được chọn;
  README mô tả contract production cần triển khai.
- Baseline migration là fresh-install-only; legacy product database cần kế
  hoạch export/transform/import riêng.

## Tài liệu liên quan

- [Product design](docs/superpowers/specs/2026-08-08-social-place-network-design.md)
- [Implementation plan](docs/superpowers/plans/2026-08-08-social-place-network.md)
- [Acceptance evidence](docs/acceptance/social-place-network.md)
