# MediShop — Expo storefront + PHP/MySQL admin

A small pharmacy shop in two halves.

**The app is the shopper's.** Browse the medicines on sale with photos, fill a
cart, give a name and a delivery address, and get a receipt. There is no login
in the app at all.

**The website is the admin's.** At `/admin/` on a computer: add, edit and remove
products, manage the photos, and work through the orders as they come in.

```
MEDICINE/
  backend/
    schema.sql          run once in phpMyAdmin
    api/
      config.php        DB password, API key, admin login   <-- edit this
      db.php
      helpers.php       CORS, JSON, validation
      auth.php          signs and checks admin login tokens
      login.php         POST username+password -> token
      medicines.php     the CRUD endpoint (writes need the token)
      orders.php        checkout, receipts, and the admin's order list
      upload.php        product photo upload (admin only)
      makehash.php      one-off password hashing tool, delete after use
      ping.php          health check
      uploads/          photos land here (must be writable)
      .htaccess
    admin/              the admin website (plain HTML, no build step)
      index.html        login, product grid, the add/edit sheet, orders
      admin.css         the web copy of the app's design tokens
      admin.js          all the logic: API calls, photos, orders, validation
      config.js         API_BASE + API_KEY                  <-- edit this
  mobile/               Expo app (runs in Expo Go)
    App.tsx             the tab host: holds the state, picks the screen
    src/config.ts       API_BASE + API_KEY                  <-- edit this
    src/api.ts          all HTTP: the catalogue and checkout
    src/cart.ts         cart maths, and the cart that survives a restart
    src/receipts.ts     the phone's copy of every receipt
    src/receiptHtml.ts  the receipt as a printable page (expo-print)
    src/customer.ts     the delivery details, remembered between orders
    src/screens/        Today, Shop, Cart, Orders, Search — one per tab
    src/components/     TabBar, ProductCard, ProductDetail, ReceiptSheet
  devproxy.js           serves the admin site locally + proxies the API
  admin.bat             double-click to run the admin site on Windows
```

## 1. Create the table

cp.freehostia.com → **phpMyAdmin** → database `jaymag7_students` → **SQL** tab.

> **Adding the cart to a shop that is already running?** You only need **PART
> D**, which creates the two order tables and touches nothing that exists.
> `SHOW TABLES LIKE 'orders';` returning no rows means it has not been run yet.
> Then re-upload `backend/api` so `orders.php` is on the server.

`backend/schema.sql` has two parts and you run **one** of them, not the whole
file:

- **No `medicines` table yet** — paste PART A. You get the table plus 3 sample rows.
- **The table already exists** (it did before the shop update) — uncomment and
  paste PART B. It adds the `category` and `image_url` columns and keeps your rows.

Pasting PART A over an existing table looks like it worked but adds nothing:
`CREATE TABLE IF NOT EXISTS` skips the table, then the `INSERT` fails with
`#1054 Unknown column 'category'`. That error means you wanted PART B.
`SHOW COLUMNS FROM medicines;` tells you which case you are in.

## 2. Set your secrets

`backend/api/config.php`:

- `DB_PASS` — the MySQL password you set in cPanel → MySQL Databases.
- `DB_HOST` — leave `localhost` unless cPanel shows a different host.
- `API_KEY` — a long random string; the app sends it on every request.
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — the shop admin login. **Change the
  password.**
- `AUTH_SECRET` — another long random string; it signs login tokens. Changing it
  later signs every admin out.

### Hash the admin password (recommended)

`config.php` is blocked from the web by `.htaccess`, but a hash is still safer
than plain text:

1. Open `http://your-domain/makehash.php?key=<API_KEY>&p=<your password>`
2. Copy the `define('ADMIN_PASSWORD_HASH', '...');` line it prints into `config.php`.
3. Set `ADMIN_PASSWORD` back to `''`.
4. Delete `makehash.php` from the server.

## 3. Upload the API

cPanel → **File Manager** → open `public_html` → upload everything from
`backend/api/` into it, including the `uploads` folder and its `.htaccess`. Set
the `uploads` folder permissions to **755** so PHP can write photos into it.

> **This is already done on your hosting.** `ping.php`, `login.php`,
> `medicines.php`, `upload.php` and `uploads/` are all sitting in `public_html`
> at the top level, so the API's address is the domain root rather than `/api`.
> Everything below assumes that layout, and says what to change if you ever
> move the files into a subfolder.

Then create a folder `admin` inside `public_html` and upload the four files from
`backend/admin/` into it:

```
public_html/
  login.php  medicines.php  upload.php  ping.php  uploads/   <- backend/api/
  admin/                                                     <- backend/admin/
```

`admin/config.js` is set to `API_BASE: '..'`, which is the folder above it — the
document root, where the PHP lives. Nothing else to edit. (If you later move the
PHP into `public_html/api/`, change that one value to `'../api'`.)

Check it in a browser:

```
http://jaydee15.mooo.com/ping.php
```

It prints a line per check, each saying what to do when it is not green:

| Check | What a red line means |
|---|---|
| **API files** | Some file on the server is older than this build — re-upload `backend/api` (never `config.php`). |
| **Database** / **Shop columns** | Step 1 was not run, or `DB_*` in `config.php` is wrong. |
| **Orders** | PART D of `schema.sql` has not been run, so checkout cannot work. |
| **Admin site** | `backend/admin` is not in `public_html/admin/` yet. |
| **Photo uploads** | The `uploads` folder is missing or not writable — chmod it to 755. |
| **Domain** | The A record does not point at this server. |

**Admin password** and **Token headers** are amber notes, not faults: a browser
sends no token, so "no" everywhere on that line is normal. Add `?format=json`
for the machine-readable version.

## 4. Point the app at it

`mobile/src/config.ts`:

```ts
export const API_BASE = 'http://jaydee15.mooo.com';
export const API_KEY  = 'the exact same string you put in config.php';
```

Uploaded photos are stored as a path relative to `API_BASE` (`uploads/med_x.jpg`),
so changing `API_BASE` never breaks the pictures.

## 5. Run it in Expo Go

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with **Expo Go** (Android) or the Camera app (iOS). If Wi-Fi is
awkward, run `npx expo start --tunnel`.

Printing and saving a receipt as a PDF use `expo-print` and `expo-sharing`, and
the Today card's background uses `expo-linear-gradient` — all three are built
into Expo Go, so there is nothing to compile to try them.

To look at the app in a desktop browser instead of on a phone:

```bash
npx expo start --web
```

That is what `react-dom`, `react-native-web` and `@expo/metro-runtime` in
`package.json` are for. Layout and colours are faithful; the print dialog and
the share sheet are the two things that only behave properly on a real device.

## 6. Run the admin website on the admin's computer

Sign in with the same `ADMIN_USERNAME` / `ADMIN_PASSWORD` the app uses. There is
nothing to install and nothing to build — it is four static files talking to the
same API the phone talks to, so whatever you change here shows up in the app on
the next pull-to-refresh, and the other way round.

There are two ways to get it in front of the admin. Which one you need depends
on the domain.

### A. From the hosting — nothing installed on their computer

Upload `backend/admin/` to `public_html/admin/` (step 3), then the admin just
opens a browser:

```
http://jaydee15.mooo.com/admin/
```

That is the whole thing. Any computer, any browser, no Node, no files to copy.
Bookmark it.

**The DNS is fixed, so this is the way to do it.** `jaydee15.mooo.com` now
resolves to `162.210.102.232`, which is the hosting, and `ping.php` confirms it
on the Domain line. Nothing has to run on anyone's computer any more — neither
for the admin site nor for the phone.

### B. Through devproxy.js — only if the domain breaks again

`devproxy.js` serves the admin site off the disk **and** forwards the API calls
to the hosting with the `Host` header Freehostia requires. On the admin's
computer:

1. Install [Node.js](https://nodejs.org) (the LTS installer, all defaults).
2. Copy the whole `MEDICINE` folder over — or just `devproxy.js` plus
   `backend/admin/`, keeping that folder layout.
3. Open a terminal in the `MEDICINE` folder and run:

   ```bash
   node devproxy.js
   ```

4. Open <http://localhost:8080/admin/> in the browser.

Leave that terminal window open while they work; closing it stops the site. The
page is read from disk on every request, so editing `backend/admin/` and
refreshing is enough to see a change — nothing is cached and nothing is built.

Because the page and the API are both on `localhost:8080`, they share an origin:
`config.js` needs no editing and the browser sends no CORS preflight. The same
proxy is what the phone app talks to, so one window serves both.

To make it less fiddly for a non-technical admin, put a one-line shortcut next
to the folder:

```bat
@echo off
cd /d "%~dp0"
start "" http://localhost:8080/admin/
node devproxy.js
```

Save that as `admin.bat` in the `MEDICINE` folder. Double-clicking it starts the
proxy and opens the browser.

### Working with photos

The photo is the thing a phone is worst at and a computer is best at, so the
page is built around it. Every way of getting a picture in:

- **Straight from the grid.** Hover any product's picture and it turns into a
  button — click it, pick a file, and that product's photo is replaced. No form,
  no Save.
- **Drag and drop.** Drop a file from your desktop onto a product's picture and
  it uploads on the spot. Works on the big preview in the editor too.
- **Paste.** With the editor open, `Ctrl+V` a screenshot or a copied image.
- **Choose file…** in the editor, the ordinary file picker.
- **Paste a link** into *…or paste an image link* to use a photo already on the
  web, with no upload at all.

Photos larger than about 1 MB are resized to 1600px and re-encoded in the
browser *before* they are sent, so a 5 MB picture straight off a phone lands
well under `upload.php`'s 3 MB limit instead of being rejected. Small JPG, PNG,
GIF and WebP files are sent untouched, so animated GIFs keep moving and logos
keep their transparency. An iPhone HEIC is converted on the way through.

**Remove photo** clears the picture; products without one are tagged *No photo*
in the grid so they are easy to find.

### Everything else on the page

- Search, and one chip per aisle, both of which run against the server.
- A summary strip: how many products, total stock value, how many are low, out
  of stock, or expiring within 60 days.
- Each card shows price, exact stock, and a warning tag when a product is
  expired or close to it.
- **Add product** and **Edit** open the same sheet; `Esc` closes it and
  `Ctrl+S` saves. Anything the server rejects is shown under the field it
  belongs to.
- The login is remembered for 7 days, the same as the app.

### Two things to know

1. **`admin/config.js` holds the API key in plain text**, and anyone who loads
   the page can read it — exactly like the copy compiled into the phone app. The
   key alone only allows *reading* the catalogue; adding, editing, deleting and
   uploading all still need the admin password. If you would rather not have the
   page reachable at all, put a password on the folder in cPanel →
   **Directory Privacy**, which is an Apache login in front of everything in it.
2. **Keep the admin folder one level below the PHP.** `config.js` uses the
   relative path `'..'`, which is what lets the very same files work on the live
   domain, through `devproxy.js` and on a local PHP server without being edited.
   Move the PHP into a subfolder and it becomes `'../api'`; serve the page from
   a different host than the API and it becomes that host's full URL.

## What the app does

There is **no login in the app**. Everything in it is for the shopper; running
the shop happens on the website.

The app is laid out like the App Store: **five tabs along the bottom**, large
titles, and grouped cards. Only two things are ever presented on top of a tab —
a product and a receipt — so nothing stacks more than one deep.

**Today** — the front page

- A dark story card leading on one product, picked from those with a photo and
  rotated by the date, so the page is not the same page all week.
- A strip of aisles, each with its product count, that jumps to the shelves
  filtered.
- **Almost gone** (ten or fewer left) and **Under ₱20**, both computed from the
  live catalogue, so neither is a list somebody has to maintain.
- Every row carries an **ADD** button with the price under it, so most of the
  shop is reachable without opening a single product.

**Shop** — the shelves

- Every product as a two-column grid, filtered by the aisle chips.
- **+** on any photo adds one without leaving the grid; a badge shows how many
  of that product are already in the cart.
- Tap a product for the full page: big photo, dosage, form, expiry, description
  and a quantity picker.
- Pull down to refresh.

**Search** — its own tab

- Nothing typed shows the aisles as a way in rather than a blank page.
- Results match name, brand, form, dosage or aisle, each with an ADD button.

**Cart** — with the checkout on the same screen

- A badge on the tab shows the item count from anywhere in the app.
- Quantities can never exceed what is on the shelf, and the cart survives the
  app being closed.
- The total and **Place Order** sit in a bar pinned above the tab bar.

**Checkout**

- Name, mobile number, delivery address and an optional note.
- The name, number and address are remembered for next time; the note is not,
  since it belongs to one order.
- **Place Order** sends it. The server prices the order from the shelf (never
  from the phone), takes the stock down, and writes the receipt.

**Orders** — the receipts

- Appears straight after checkout, with a reference like `MS-260921-4F2A9C31`.
- Kept on the **Orders** tab, so any past receipt reopens instantly and as often
  as you like, even with no signal — the phone keeps its own copy.
- **Print** opens the system print dialog, which is also where *Save as PDF*
  lives. **Save PDF** writes the file and hands it to the share sheet, so a
  receipt can go to Files, email or Messenger.
- The tab opens with the running **total spent** across every order, with the
  order and item counts under it. Cancelled orders are listed but left out of
  that total.
- Opening a receipt asks the pharmacy for its latest status in the background,
  so *Ready* appears as soon as the admin sets it. The check is never waited on:
  the stored receipt is already on screen, and a phone with no signal simply
  keeps showing the copy it has.

## What the admin website does

At `/admin/`, with the admin password. Two tabs:

**Products** — the grid, the add/edit sheet and all the photo handling described
above.

**Orders** — every order newest first, each showing its reference, the time, the
lines with their prices, the total, and who it goes to with a tappable phone
number and the delivery note. A dropdown moves an order through **New → Ready →
Completed**, or **Cancelled**; the tab carries a red badge with the number of
orders still marked *New*. Chips filter by status, and a summary strip totals
the orders, the items sold and the value, leaving cancelled orders out of the
money.

### How an order behaves

- **Stock comes down when the order is placed**, inside a database transaction.
  Two shoppers racing for the last box cannot both win: the second gets
  *"Only 2 left of Cefalexin"* and **nothing** is deducted for that order — the
  whole thing rolls back, not just the line that failed.
- **A receipt never changes.** `order_items` copies the name, brand, dosage and
  price at the moment of sale rather than pointing at the product, so raising a
  price tomorrow does not rewrite yesterday's receipts, and deleting a product
  leaves its old receipts reading correctly.
- **Cancelling does not put stock back.** The admin adjusts the quantity on the
  Products tab, because in practice a cancelled order may or may not have been
  packed already.

## API reference

Every request needs the header `X-Api-Key: <API_KEY>`.
Writes additionally need `Authorization: Bearer <token>` from `login.php`.

| Method | URL | Body | Needs admin |
|---|---|---|---|
| POST | `/login.php` | `{"username":"admin","password":"..."}` | — |
| GET | `/login.php` | — (checks the token is still valid) | yes |
| GET | `/medicines.php` | — (optional `?q=para&category=Allergy&limit=50&offset=0`) | — |
| GET | `/medicines.php?id=5` | — | — |
| POST | `/medicines.php` | `{"name":"Paracetamol","quantity":10,"price":3.5}` | yes |
| PUT | `/medicines.php?id=5` | any subset of fields | yes |
| DELETE | `/medicines.php?id=5` | — | yes |
| POST | `/upload.php` | `{"data":"<base64 image>"}` | yes |
| POST | `/orders.php` | `{"customer_name":"…","address":"…","phone":"…","note":"…","items":[{"id":1,"quantity":3}]}` | — |
| GET | `/orders.php?reference=MS-…` | — (the shopper's own receipt) | — |
| GET | `/orders.php` | — (optional `?status=new&limit=50`) | yes |
| GET | `/orders.php?id=5` | — | yes |
| PUT | `/orders.php?id=5` | `{"status":"ready"}` | yes |

`POST /orders.php` answers **409** when something sold out between browsing and
checking out, with `details.items` naming what. That is not a validation error —
the request was fine, the shelf moved — so the app refreshes the catalogue and
lets the shopper try again. A **422** means the form itself needs fixing.

The reference returned by a successful checkout is what lets a shopper read
their own receipt back without any login: it carries 8 random hex characters, so
it cannot be guessed or counted through.

Responses are `{"ok":true,"data":…}` or `{"ok":false,"error":"…","details":{…}}`,
where `details` holds per-field validation messages.

`login.php` returns `{"token":"…","expires_at":1234567890,"username":"admin"}`.
The token is signed with `AUTH_SECRET` and carries its own expiry, so nothing is
stored server side — there is no sessions table to clean up.

## Three things to know about the hosting

1. **Remote MySQL is blocked on Freehostia's free plan**, which is why the app
   talks to PHP instead of the database directly. Never put DB credentials in the
   app.
2. **This is plain HTTP.** The API key and the admin password both cross the
   network in the clear, so anyone sniffing the Wi-Fi can read them. Fine for a
   school project; before anything real, enable SSL on the domain and switch
   `API_BASE` to `https://`. `usesCleartextTraffic` is enabled in `app.json` so
   Android permits HTTP in a standalone build.
3. **Uploads are user files, not code.** `uploads/.htaccess` turns PHP off inside
   that folder, and `upload.php` checks the actual image bytes rather than the
   file name. Keep both.

## Not built yet

**No payment.** Orders are placed, priced and recorded, but nothing is charged —
the receipt says *payable on delivery or on pickup*. Taking card or e-wallet
money would mean a payment provider and an HTTPS domain, neither of which this
hosting has.

**No customer accounts.** Anyone can order; there is nothing to sign into. A
shopper's receipts live on their own phone and are re-read from the server by
their reference, so reinstalling the app loses the list — the shop's copy in the
`orders` table is unaffected, and the admin can always find the order there.

**No delivery fee, discounts or tax lines.** The total is simply the sum of the
lines.

**Nothing tells the admin an order arrived.** The badge on the Orders tab only
updates while the page is open and the page is reloaded. A real shop would want
an email or a push notification.
