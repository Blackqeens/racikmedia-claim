# Supabase article curation and Astra sync

## Newsletter subscribers

Apply `supabase/migrations/20261009150000_newsletter_subscribers.sql` to create the
monthly newsletter subscriber list and its public sign-up RPC. The homepage stores
only the normalized email address and subscription/consent timestamps; readers must
explicitly consent before subscribing. Anonymous visitors can register but cannot
read the list. Only signed-in `admin` and `master_admin` users can read it.

To prepare a tabloid mailing list, open **Supabase Dashboard → Table Editor →
newsletter_subscribers**, filter `status` to `active`, and export the rows as CSV.
This project records subscribers but does not send newsletter emails; use an
approved mailing service to distribute each monthly tabloid and manage opt-outs.

## Apply the database migration

Use the project's Supabase SQL Editor or Supabase CLI. Apply `database/supabase-core.sql` to a fresh project first, then apply `database/migrations/20261002_master_article_curation.sql`. Do not apply the legacy `database/schema.sql` first: it defines a separate `users`-based article model.

The migration creates `content_articles`, master-admin RLS, the four-headline RPC, the public `article-covers` Storage bucket, and a private Astra sync outbox. It does not copy the old browser mock articles into Supabase.

## Configure and deploy the Edge Function

Set the Astra connection values as Supabase Edge Function secrets; never add the Astra token or Supabase service-role key to browser files or commit them:

- `ASTRA_DB_API_ENDPOINT`: the HTTPS base endpoint shown for the Astra database.
- `ASTRA_DB_APPLICATION_TOKEN`: an Astra application token with the minimum required collection access.
- `ASTRA_DB_KEYSPACE`: `default_keyspace`, unless the collection is in another keyspace.
- `ASTRA_DB_COLLECTION`: `media_contents_collection`.
- `APP_ALLOWED_ORIGINS`: comma-separated HTTP(S) origins where the app is hosted, including the local development origin when needed.

The function also uses the Supabase URL, anon key, and service-role key available to Supabase Edge Functions. Deploy `sync-astra-articles` with the Supabase CLI after linking the local project. Keep JWT verification enabled.

### Automatic page translation

The public `translate-page` function allows HTTP loopback origins (`localhost`, `127.0.0.1`, and `[::1]`) for local development. For production, set `APP_ALLOWED_ORIGINS` to the exact HTTPS origin(s) serving the site—scheme and host, with no page path. Multiple origins can be comma-separated. Do not use `*`.

```sh
supabase secrets set OPENROUTER_API_KEY=<openrouter-api-key>
supabase secrets set APP_ALLOWED_ORIGINS=https://dapper-bienenstitch-b63263.netlify.app
supabase functions deploy translate-page
supabase secrets unset GEMINI_API_KEY GEMINI_TRANSLATION_MODEL
```

After deployment, test the function from the actual site origin. Browser `file://` pages are not supported. OpenRouter credentials must be kept as server-side Supabase secrets and never placed in HTML or browser JavaScript.
The function uses only the OpenRouter Chat Completions API and the server-side `OPENROUTER_API_KEY`. It defaults to the `openrouter/free` router; override `OPENROUTER_MODEL` only when needed. Free models can have usage limits and availability constraints, so the service is not guaranteed to be continuously available. Transient OpenRouter HTTP 502/503/504 responses are retried with bounded backoff. The browser translates only rendered text within the current viewport and requests more as the reader scrolls; it does not crawl or translate other pages. It groups up to 20 strings (or 8,000 characters) per request and caches translations in browser storage to reduce repeated provider usage. Automatic retries pause after a failure until the reader explicitly retries or changes language. Valid `Retry-After` headers are forwarded when supplied by OpenRouter. Set `APP_SITE_URL` to the actual public site origin if OpenRouter attribution should include an `HTTP-Referer` header. The `GEMINI_API_KEY` and `GEMINI_TRANSLATION_MODEL` secrets are not used and can be removed with the `secrets unset` command above.
It translates only text supplied in the POST body; it does not fetch the website URL. The browser sends `{ "lang": "en", "texts": ["..."] }`. For direct callers, a single text string or `{ "text": "..." }` is also accepted and defaults to English.

The Astra document mapping is:

| Astra field  | Supabase source                                 |
| ------------ | ----------------------------------------------- |
| `content_id` | `media-art-` plus the article UUID              |
| `title`      | article title                                   |
| `content`    | article body, used by the collection vectorizer |
| `category`   | article category                                |
| `author_id`  | Supabase profile UUID                           |
| `media_url`  | article cover URL                               |
| `tags`       | article tag array                               |

Published, non-archived articles are upserted. Draft/rejected/archived articles are removed from the Astra collection. The outbox keeps failed items for retry; the Master Admin page's **Coba sync** button retries pending work.

## Verify in staging

1. Sign in as a user whose `profiles.role` is `master_admin`.
2. Open the headline curation page over HTTP(S), not `file://`.
3. Confirm Supabase and Astra status checks succeed.
4. Create or edit an article, then verify its mapped document in Astra.
5. Archive the article and verify its Astra document is deleted; restore it and verify it is indexed again.
6. Confirm a non-master-admin user cannot read unpublished records or write to the editorial table.

The legacy `api/articles.js` and commerce mock flows are not replaced by this curation migration.

## Article reader features and Supabase Auth

The public article list, detail page, author profile, comments, likes, and bookmarks use the active `content_articles` and `profiles` tables. First apply the core and article-curation SQL above. Then apply the timestamped migrations in `supabase/migrations` with Supabase CLI:

```sh
supabase link --project-ref <project-ref>
supabase db push
```

This installs the B2B, article-engagement, and admin reporting/audit migrations. The article migration adds RLS-protected comments and per-user likes/bookmarks plus safe RPCs for aggregate counts and public author profile details. Comments and reactions require a signed-in Supabase user; published articles and public comments remain readable without login. The public list is at `pages/main/articles.html`, detail at `pages/main/article-detail.html`, author page at `pages/main/author-profile.html`, and saved items at `pages/main/bookmarks.html`.

The login client uses Supabase Auth sessions and validates the current JWT with `auth.getUser()` before route checks; role access is read from `profiles` and enforced by database RLS. The `bob_profile_hint` value in `sessionStorage` is only a UI display cache and is not an authentication or authorization source. Passwords are stored and hashed by Supabase Auth; this application does not store password hashes itself.

In **Supabase Dashboard → Authentication → URL Configuration**, set the production Site URL and allow the deployed callback URLs for `pages/auth/email-confirmed.html` and `pages/auth/update-password.html` (include the local development equivalents when testing). Enable email confirmations in **Authentication → Providers → Email** if accounts must verify before signing in. Configure SMTP for production delivery, and review the project's Auth rate limits and password policy in the dashboard; their actual values are project configuration and cannot be verified from this repository. The UI includes resend-confirmation and forgot/update-password flows.

The migration also creates an append-only article change history from `content_articles` and the admin-only financial summary RPC. View them at `pages/admin/moderation-audit.html` and `pages/admin/financial-report.html`. Finance reports summarize marketplace order and B2B invoice statuses only; they are not a cash ledger, payout report, or payment reconciliation. Audit history begins when the audit migration is applied and does not backfill prior changes.

## Verify article features in staging

1. Sign in as two regular users and confirm the Supabase session remains valid after reloading.
2. Open the article list and filter by a category and a tag; confirm pagination and query-string links show matching published articles only.
3. Open an article, post a comment, like it, and bookmark it; verify the counts and active states update.
4. Confirm the second user can see the comment and public like count but cannot read or change the first user's bookmark/reaction rows.
5. Open a writer profile from the article byline and confirm only safe public profile fields and published articles are shown.
6. Sign out and confirm posting comments, liking, and bookmarking prompts the reader to sign in.

## Deploy the B2B portal

The B2B portal uses the active `public.profiles` Supabase schema; do not apply the legacy `database/schema-b2b.sql` schema. Ensure the core and article-curation SQL above are already installed, then link the project and apply the B2B migration:

```sh
supabase link --project-ref <project-ref>
supabase db push
supabase functions deploy b2b-invoice-pdf
```

The invoice function uses the Supabase URL, anon key, and service-role key supplied to Edge Functions. Keep JWT verification enabled and never expose the service-role key in browser code. Seller documents and invoice PDFs are stored in private buckets; access is granted through short-lived signed URLs.

The admin B2B page reviews corporate clients and seller verification documents, issues invoices, and creates agreements linked to those invoices. Buyers and sellers record their agreement decision from their respective portals. This is a basic digital-approval record, not a certified electronic signature.

## Deploy seller service management

Seller service listings in `pages/seller/seller-dashboard.html` are stored in `public.catalog_services`; incoming booking details are read through the seller-scoped `get_seller_service_bookings()` RPC. Apply the core schema first if `catalog_services` or `service_bookings` does not exist, then apply the new migration:

```sh
supabase link --project-ref <project-ref>
supabase db push
```

Deploy the updated static site after the migration. Service create/edit/delete and activation changes use the signed-in seller's Supabase session and row-level security. Booking status is shown separately from payment status because `service_bookings` does not currently contain payment data. The existing public service listings and customer booking page are still demo/local flows; they must be integrated with the catalog and a trusted booking API before these listings are visible in the public catalog and new customer bookings appear in this dashboard.

## Verify B2B in staging

1. Apply the migration and deploy `b2b-invoice-pdf`.
2. Sign in as a regular user, submit a corporate-client application, and confirm it remains pending.
3. Submit seller legal, identity, and selfie documents; confirm the private files are visible only to their owner and admins.
4. Sign in as an admin, verify the client and seller, issue an invoice, and create an agreement linked to that invoice.
5. Confirm the buyer can generate/open the PDF and both buyer and seller can approve or decline the agreement.
6. Confirm unrelated authenticated users cannot read either party's records or access private files.

## Verify authentication, financial reports, and audit history

1. Test registration with email confirmation enabled, follow the message link, and confirm it returns to `pages/auth/email-confirmed.html`; test resend from `pages/auth/verify-email.html`.
2. Request a password reset from `pages/auth/forgot-password.html`, open the email link, set a new password at `pages/auth/update-password.html`, and verify the old password no longer works.
3. As an admin or master admin, open the transaction report and compare the selected date range against the underlying `buyer_orders` and `b2b_invoices` statuses. Confirm non-admin roles receive an authorization error from the report RPC.
4. As an admin or master admin, create/edit/archive a `content_articles` row and confirm the before/after snapshot appears in the moderation audit viewer. Confirm a regular authenticated user cannot read or write audit rows.
5. Remember that the audit migration captures changes after deployment only. The legacy `pages/admin/moderation.html` currently contains mock moderation data; changes made only in that mock page do not generate database audit entries.
