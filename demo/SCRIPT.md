# MediShop — Midterm Demo Video Script (≈ 2:50)

**Setup before recording**
- Android emulator (or phone) running the app in Expo Go, on the **Today** tab.
- Browser open at `http://jaydee15.mooo.com/admin/`, already logged in.
- Screen recorder capturing both windows side by side (phone left, browser right).
- Play the matching `voice/NN-*.wav` clip for each scene, or read the lines yourself.

| # | Time | On screen (do this) | Voice-over (say this) |
|---|------|---------------------|------------------------|
| 1 | 0:00 – 0:15 | App open on **Today**. Slowly scroll a little. | "Hi, this is MediShop, a pharmacy shopping app built with React Native and Expo. It connects to two APIs: my own PHP and MySQL REST API hosted on Freehostia, and the public disease dot S H COVID-19 API." |
| 2 | 0:15 – 0:40 | Scroll to the **HEALTH WATCH** card. Pull down to refresh so it reloads. Point at active cases, the recovered bar, total cases, doses, and the source line. | "First, the third-party API. The Health Watch card on the Today page makes two live GET requests to disease dot S H for the Philippines. It parses the JSON and shows active cases, the recovery rate, total cases and vaccine doses, with when the data was last updated. Pulling down fetches it again." |
| 3 | 0:40 – 1:05 | Go to **Shop** tab → tap a category chip → tap a product to open the detail sheet → close → open **Search** tab and type `bio`. | "Now my own API. Read: the Shop tab calls GET medicines dot P H P and shows every product in a grid, with photos, prices and stock. I can filter by aisle, and tapping a product opens its detail screen. Search filters the same list as I type." |
| 4 | 1:05 – 1:35 | Switch to the **admin website**. Click **Add product**, press Save with the form empty to show the red validation errors. Fill in: *Name* `Vitamin C 500mg`, *Category* `Vitamins`, *Price* `12`, *Stock* `50`. Save. Back on the phone, pull to refresh on **Shop**. | "Create: products are managed from the admin website, which uses the same API. If I try to save an empty form, validation stops me and marks each field. I'll add Vitamin C, five hundred milligrams, at twelve pesos with fifty in stock. That sends a POST request. Back on the phone, one refresh and the new product is on the shelf." |
| 5 | 1:35 – 1:55 | In admin, click **Edit** on Vitamin C. Show the form is already filled in. Change *Price* to `15` and *Stock* to `40`. Save. Refresh the phone and open the product. | "Update: Edit opens the form already filled in with the saved record. I'll change the price to fifteen and the stock to forty. This sends a PUT request, and the app shows the new price right away." |
| 6 | 1:55 – 2:10 | In admin, click **Delete** on Vitamin C → the confirm dialog appears → click **OK**. Refresh the phone; it's gone. | "Delete: removing a product asks for confirmation first, because it can't be undone. After I confirm, a DELETE request removes the row from the database, and it disappears from the app." |
| 7 | 2:10 – 2:40 | On the phone: tap **BUY** on two products → **Cart** tab → tap *Place order* with an empty name to show the error → fill in name, phone, address → *Place order*. The receipt appears. Then in admin → **Orders**, set the order to *Ready*. On the phone, open **Orders** → tap the receipt; the status updates. | "The app also creates records itself. I'll add two items and check out. The form is validated here too. Placing the order POSTs to orders dot P H P, which saves it and lowers the stock in one transaction, and I get a receipt. When the admin marks it ready, opening the receipt on the phone fetches the new status." |
| 8 | 2:40 – 2:50 | Show the GitHub repo page and scroll to the README's Third-Party API section. | "The full code, the PHP backend and the third-party API URL are all in the GitHub repository. Thank you for watching." |

**Third-party API URLs (for the README)**
- `https://disease.sh/v3/covid-19/countries/Philippines?strict=true`
- `https://disease.sh/v3/covid-19/vaccine/coverage/countries/Philippines?lastdays=1`

**Tips**
- Do a test run first so no request times out on camera. Freehostia can be slow on the first hit, so open the app once before you record.
- If the video runs long, cut scene 7's admin status step. It's extra.
