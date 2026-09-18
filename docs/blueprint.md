# VideoSellerBot — Bot specification

**Archetype:** commerce

**Voice:** warm and concise — write every user-facing message, button label, error, and empty state in this voice.

A compact Russian-language Telegram shop that lists two seeded short videos, accepts buyer payment via Telegram Stars, persists orders, delivers the purchased video automatically (direct file or secure expiring link), and notifies the owner/admin of each successful sale.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Telegram followers who want to buy short digital videos
- Small creators selling single-video digital products inside Telegram

## Success criteria

- Users can open /start and browse a polished catalog of seeded products with thumbnails, descriptions, and prices.
- A user can purchase a product using a Telegram Stars invoice and complete payment inside Telegram.
- On successful payment the bot marks the Order paid, delivers the video file to the buyer (or an expiring secure link), and sends a sale notification to ADMIN_CHAT_ID.
- Orders, minimal buyer records, and product metadata are persisted so admins can re-deliver files for troubleshooting.

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main product menu with seeded product cards and support button
  - outputs: menu_message (cards + inline keyboard)
- **Buy** (button, actor: user, callback: product:buy:<product_id>) — Begin checkout for the selected product (opens Telegram invoice)
  - inputs: product_id
  - outputs: created Order (pending), Telegram invoice shown
- **Details** (button, actor: user, callback: product:details:<product_id>) — Show full product description and Buy button
  - inputs: product_id
  - outputs: detailed product message
- **Support** (button, actor: user, callback: support:contact) — Show owner contact info and quick FAQ; offer 'Contact owner' button that opens a PM or sends a support message to admin
  - outputs: support_message, option to open chat or send support request to admin
- **/help** (command, actor: user, command: /help) — Show brief help and how to buy or contact support
  - outputs: help_message

## Flows

### Browse catalog
_Trigger:_ /start or menu button

1. Send polished menu message with seeded product cards (thumbnail, title, short description, price) and inline buttons: Details, Buy
2. Include bottom-row buttons: Support and /menu (refresh)

_Data touched:_ Product

### View product details
_Trigger:_ callback product:details:<product_id>

1. Respond to callback with a message containing fuller description, file size hint, thumbnail, and Buy button
2. If user clicks Buy, trigger Buy flow

_Data touched:_ Product

### Purchase via Stars (checkout)
_Trigger:_ callback product:buy:<product_id>

1. Create Order record with status = pending, store buyer id + product id
2. Send Telegram invoice configured to use Telegram Stars for the product price and name (localized RU)
3. Wait for Telegram successful_payment webhook/event

_Data touched:_ Order, Buyer, Product

### Payment confirmation and delivery
_Trigger:_ Telegram successful_payment webhook / message

1. Validate webhook and match to pending Order; mark Order status = paid
2. Attempt to send the video file directly to buyer in chat with a thank-you caption and a Download button
3. If direct upload fails (file size limit) produce a secure expiring download link and send it instead with access expiry metadata
4. Send admin notification to ADMIN_CHAT_ID with sale details (buyer, product, price, order id, timestamp)
5. Update Order with delivery method and delivery timestamp

_Data touched:_ Order, Buyer, Product

### Support contact & re-delivery
_Trigger:_ callback support:contact or admin command

1. Show quick FAQ and a 'Contact owner' button which opens a private chat or sends a support message to ADMIN_CHAT_ID
2. Admin may use an owner-only command to look up orders by buyer or order id and trigger re-delivery of video file
3. Log re-delivery attempts in the Order record

_Data touched:_ Order, Buyer

### Admin notification handling
_Trigger:_ order paid

1. Send structured notification to ADMIN_CHAT_ID with order_id, product title, buyer username/id, Stars amount, and delivery status
2. If admin not configured, log warning and fall back to storing a pending-notification flag

_Data touched:_ Order

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Telegram chat id where new successful sale notifications and support messages are sent
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **Product** _(retention: persistent)_ — A purchasable video item displayed in the catalog
  - fields: id, title, short_description, full_description, thumbnail_file_id_or_url, price_stars, video_file_id_or_url, file_size_bytes, delivery_method_preference (direct|link)
- **Order** _(retention: persistent)_ — Represents a buyer's purchase attempt and its lifecycle
  - fields: id, buyer_telegram_id, buyer_username, product_id, status (pending|paid|delivered|failed), created_at, paid_at, delivered_at, delivery_method (direct_upload|expiring_link), admin_notified (bool), notes (admin)
- **Buyer** _(retention: persistent)_ — Minimal record of a purchasing user for re-deliveries and support
  - fields: telegram_id, username, first_name, last_name, last_order_id
- **AdminNotificationLog** _(retention: persistent)_ — Log of notifications sent to admin for audit
  - fields: id, order_id, sent_at, deliverable_payload

## Integrations

- **Telegram** (required) — Bot API messaging and inline keyboards; user interactions
- **Telegram Payments (Stars)** (required) — Accept payment from buyers via Telegram Stars and receive successful_payment events
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Seed or edit Products (title, descriptions, thumbnail, price in Stars, upload/attach video file or provide hosted URL)
- Set/replace ADMIN_CHAT_ID (owner/admin target)
- View sales list and individual Order records
- Trigger manual re-delivery for an order
- Update product prices and toggle product visibility
- Download/export orders for a date range
- Turn maintenance mode on/off (disable purchases)

## Notifications

- Buyer: invoice message (Telegram invoice), payment success acknowledgement, file (or expiring link) delivery message with Download button
- Owner (ADMIN_CHAT_ID): structured notification on each successful sale with buyer, product, price, order id, and delivery status
- Owner: optional periodic sales summary (configurable later)

## Permissions & privacy

- The bot stores only minimal buyer profile (telegram id, username, name) and order metadata; payment method details are handled by Telegram and are not stored by the bot.
- Video files or URLs are stored/linked for delivery and re-delivery; owner must ensure they have rights to sell the content.
- Admin_CHAT_ID is required so the owner consents to receiving sale notifications.
- Retention is persistent for orders and products to support troubleshooting and re-delivery; owners should purge if required by policy.

## Edge cases

- Payment completes but delivery fails due to file-size or transient Telegram upload error → bot sends expiring hosted link if available and marks Order accordingly.
- File hosting for large videos is not configured → bot must notify admin and buyer that manual delivery is required; order marked paid but undelivered.
- Duplicate successful_payment events → idempotent handling to avoid double-delivery and double-notification.
- ADMIN_CHAT_ID missing or invalid → store notifications and surface owner-facing warning; disallow purchases if owner requires it.
- Buyer blocked the bot or bot banned by buyer → admin is notified that delivery could not be completed.
- Refunds/cancellations are not automated; admin must handle off-band.

## Required tests

- Dialog-level acceptance: /start -> view product details -> Buy -> invoice shown -> simulate successful_payment -> Order marked paid and delivered, buyer receives file or expiring link, admin receives notification
- Large-file delivery: simulate video file exceeding Telegram upload limits -> bot creates expiring download link and sends to buyer; Order.delivery_method reflects expiring_link
- Idempotency: duplicate successful_payment webhook does not create duplicate deliveries or duplicate admin notifications
- Admin flows: admin can lookup an order and trigger manual re-delivery; re-delivery logged
- Missing ADMIN_CHAT_ID: verify the bot warns owner and stores pending notifications instead of silently failing

## Assumptions

- Bot UI/messages will be localized in Russian.
- Owner will either upload product video files to the bot (via admin UI) or provide hosted URLs; placeholders are used until owner-supplied files are provided.
- Telegram Stars are available and configured for the bot/account to accept payments in the target region.
- Seeded products are the two named items; owner can edit them after install.
