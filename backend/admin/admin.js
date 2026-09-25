/**
 * MediShop admin — the desktop half of the app.
 *
 * Same API, same rules: X-Api-Key on every call, a login token on every write.
 * What the phone cannot do well is photos in bulk, so that is what this page is
 * built around — every thumbnail in the grid is itself a drop target and a file
 * picker, and swapping one costs a single click with no form in the way.
 *
 * No build step and no framework: this is four files dropped into public_html
 * next to the api folder.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------- config -- */

  var CONFIG = window.MEDISHOP_CONFIG || {};
  var API_BASE = String(CONFIG.API_BASE || '../api').replace(/\/+$/, '');
  var API_KEY = String(CONFIG.API_KEY || '');

  var TIMEOUT_MS = 12000;
  /** Photos travel as base64, so they need longer than a plain JSON call. */
  var UPLOAD_TIMEOUT_MS = 45000;

  /** Anything larger than this, or in a format upload.php rejects, is re-encoded. */
  var MAX_DIM = 1600;
  var RECODE_OVER_BYTES = 900 * 1024;
  /** upload.php refuses anything above 3 MB, so never send one. */
  var HARD_LIMIT_BYTES = 3 * 1024 * 1024;

  var STORE_KEY = 'medishop.admin.session';
  var LOW_STOCK = 10;
  var EXPIRING_DAYS = 60;

  /* --------------------------------------------------------------- state -- */

  var session = null;      // { token, username, expires_at }
  var items = [];
  var query = '';
  var category = '';
  var editing = null;      // the medicine being edited, or null when adding
  var draftImage = '';     // image_url as it will be saved
  var searchTimer = null;

  var view = 'products';   // 'products' | 'orders'
  var orders = [];
  var orderStatus = '';    // '' means every status

  var ORDER_STATUSES = ['new', 'ready', 'completed', 'cancelled'];
  var STATUS_LABEL = {
    new: 'New',
    ready: 'Ready',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ----------------------------------------------------------------- api -- */

  function ApiError(message, status, fields) {
    this.message = message;
    this.status = status;
    this.fields = fields || {};
  }
  ApiError.prototype = Object.create(Error.prototype);

  function request(path, init, timeoutMs) {
    init = init || {};
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || TIMEOUT_MS);

    var headers = {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
    };
    if (session && session.token) {
      // Sent twice on purpose, exactly as the app does: shared hosts running
      // PHP as CGI drop Authorization before PHP sees it, and X-Auth-Token is
      // a custom header nothing strips.
      headers.Authorization = 'Bearer ' + session.token;
      headers['X-Auth-Token'] = session.token;
    }

    return fetch(API_BASE + '/' + path, {
      method: init.method || 'GET',
      body: init.body,
      headers: headers,
      signal: controller.signal,
    }).catch(function (err) {
      var timedOut = err && err.name === 'AbortError';
      throw new ApiError(
        timedOut
          ? 'No response from ' + API_BASE + ' after ' + (timeoutMs || TIMEOUT_MS) / 1000 + 's.'
          : 'Cannot reach ' + API_BASE + '. Check API_BASE in config.js.',
        0
      );
    }).then(function (res) {
      return res.text().then(function (text) { return { res: res, text: text }; });
    }).then(function (r) {
      var json = null;
      try {
        json = JSON.parse(r.text);
      } catch (e) {
        // PHP printed a warning or an HTML error page instead of JSON.
        throw new ApiError(
          r.res.ok ? 'Server sent a malformed response.' : 'Server error (' + r.res.status + ').',
          r.res.status
        );
      }

      if (!r.res.ok || (json && json.ok === false)) {
        var aboutApiKey = String((json && json.error) || '').toLowerCase().indexOf('api key') !== -1;
        if (r.res.status === 401 && session && path.indexOf('login.php') !== 0 && !aboutApiKey) {
          signOut('Your session expired. Please sign in again.');
        }
        throw new ApiError(
          (json && json.error) || 'Request failed',
          r.res.status,
          (json && json.details) || {}
        );
      }
      return json.data;
    }).finally(function () {
      clearTimeout(timer);
    });
  }

  var api = {
    login: function (username, password) {
      return request('login.php', {
        method: 'POST',
        body: JSON.stringify({ username: username, password: password }),
      });
    },
    verify: function () { return request('login.php'); },
    list: function (q, cat) {
      var params = new URLSearchParams();
      if (q) params.set('q', q);
      if (cat) params.set('category', cat);
      params.set('limit', '200');
      var qs = params.toString();
      return request('medicines.php' + (qs ? '?' + qs : ''));
    },
    create: function (body) {
      return request('medicines.php', { method: 'POST', body: JSON.stringify(body) });
    },
    update: function (id, body) {
      return request('medicines.php?id=' + id, { method: 'PUT', body: JSON.stringify(body) });
    },
    remove: function (id) {
      return request('medicines.php?id=' + id, { method: 'DELETE' });
    },
    upload: function (base64) {
      return request(
        'upload.php',
        { method: 'POST', body: JSON.stringify({ data: base64 }) },
        UPLOAD_TIMEOUT_MS
      );
    },
    orders: function (status) {
      var params = new URLSearchParams();
      if (status) params.set('status', status);
      params.set('limit', '200');
      return request('orders.php?' + params.toString());
    },
    setOrderStatus: function (id, status) {
      return request('orders.php?id=' + id, {
        method: 'PUT',
        body: JSON.stringify({ status: status }),
      });
    },
  };

  /* ------------------------------------------------------------- session -- */

  function loadSession() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var saved = JSON.parse(raw);
      // The token carries its own expiry; drop it early rather than let the
      // first write of the day fail.
      if (!saved || !saved.token || (saved.expires_at || 0) * 1000 <= Date.now()) {
        localStorage.removeItem(STORE_KEY);
        return null;
      }
      return saved;
    } catch (e) {
      return null;
    }
  }

  function saveSession(value) {
    session = value;
    try {
      if (value) localStorage.setItem(STORE_KEY, JSON.stringify(value));
      else localStorage.removeItem(STORE_KEY);
    } catch (e) { /* private mode: the session simply lasts this tab */ }
  }

  function signOut(message) {
    saveSession(null);
    items = [];
    closeSheet();
    $('app').hidden = true;
    $('login').hidden = false;
    $('login-password').value = '';
    if (message) showLoginError(message);
  }

  /* ------------------------------------------------------------ helpers -- */

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** ₱1,234.50 — grouped thousands, always two decimals (theme.ts peso). */
  function peso(value) {
    var n = Number(value) || 0;
    try {
      return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (e) {
      return '₱' + n.toFixed(2);
    }
  }

  /**
   * Uploads are stored relative ("uploads/med_x.jpg") so they follow API_BASE
   * around; a link the admin pasted is already absolute (mobile/src/image.ts).
   */
  function imageUri(imageUrl) {
    var value = (imageUrl || '').trim();
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    return API_BASE + '/' + value.replace(/^\/+/, '');
  }

  function daysToExpiry(date) {
    if (!date) return null;
    var then = new Date(date + 'T00:00:00').getTime();
    if (isNaN(then)) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((then - today.getTime()) / 86400000);
  }

  function expiryState(date) {
    var days = daysToExpiry(date);
    return {
      days: days,
      expired: days !== null && days < 0,
      expiringSoon: days !== null && days >= 0 && days <= EXPIRING_DAYS,
    };
  }

  /** What to print under the price, admin variant of stock.ts stockLabel. */
  function stockLabel(item) {
    if (expiryState(item.expiry_date).expired) return { text: 'Expired', cls: 'bad' };
    if (item.quantity <= 0) return { text: 'Out of stock', cls: 'bad' };
    if (item.quantity <= LOW_STOCK) return { text: 'Low · ' + item.quantity + ' left', cls: 'warn' };
    return { text: item.quantity + ' in stock', cls: 'ok' };
  }

  function toast(message, kind) {
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = message;
    $('toasts').appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 260);
    }, kind === 'bad' ? 5200 : 2600);
  }

  /* -------------------------------------------------------------- photos -- */

  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(new ApiError('That file could not be read.', 0)); };
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new ApiError('That file is not an image the browser can open.', 0)); };
      img.src = dataUrl;
    });
  }

  /**
   * Gets a photo ready to send.
   *
   * A picture straight off a phone is 4–8 MB and upload.php stops at 3, so
   * anything big is drawn into a canvas at 1600px and re-encoded as JPEG. An
   * iPhone HEIC goes down the same path, which is also how it ends up in a
   * format the server accepts. Small JPG/PNG/GIF/WebP files are sent untouched,
   * so an animated GIF stays animated and a logo keeps its transparency.
   */
  function prepareImage(file) {
    if (!/^image\//i.test(file.type || '') && !/\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name || '')) {
      return Promise.reject(new ApiError('Choose an image file (JPG, PNG, GIF or WebP).', 0));
    }

    var serverReady = /^image\/(jpeg|png|gif|webp)$/i.test(file.type || '');

    return readAsDataUrl(file).then(function (dataUrl) {
      if (serverReady && file.size <= RECODE_OVER_BYTES) return dataUrl;

      return loadImage(dataUrl).then(function (img) {
        var scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        // A small-but-heavy file still gets re-encoded; that is the point.
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

        var out = canvas.toDataURL('image/jpeg', 0.85);
        // Give up on shrinking rather than send something the server refuses.
        if (out.length * 0.75 > HARD_LIMIT_BYTES) {
          out = canvas.toDataURL('image/jpeg', 0.6);
        }
        if (out.length * 0.75 > HARD_LIMIT_BYTES) {
          throw new ApiError('That photo is too large even after shrinking. Try a smaller one.', 0);
        }
        return out;
      }).catch(function (err) {
        // HEIC in a browser that cannot decode it lands here.
        if (serverReady && file.size <= HARD_LIMIT_BYTES) return dataUrl;
        throw err;
      });
    });
  }

  /** file -> shrunk -> uploaded. Resolves to the path to store in image_url. */
  function uploadFile(file) {
    return prepareImage(file).then(function (dataUrl) {
      return api.upload(dataUrl);
    }).then(function (result) {
      return result.path;
    });
  }

  /** The first image in a drop or a paste, if there is one. */
  function imageFromTransfer(dataTransfer) {
    if (!dataTransfer) return null;
    var files = dataTransfer.files;
    for (var i = 0; i < files.length; i++) {
      if (/^image\//i.test(files[i].type)) return files[i];
    }
    return files.length ? files[0] : null;
  }

  /* ---------------------------------------------------------- login view -- */

  function showLoginError(message) {
    var box = $('login-error');
    box.textContent = message;
    box.hidden = !message;
  }

  function setFieldErrors(scope, fields) {
    scope.querySelectorAll('.field').forEach(function (field) {
      var slot = field.querySelector('.field-error');
      if (!slot) return;
      var name = slot.getAttribute('data-error-for');
      var message = fields && fields[name];
      slot.textContent = message || '';
      field.classList.toggle('invalid', !!message);
    });
  }

  $('login-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var button = $('login-submit');
    var username = $('login-username').value.trim();
    var password = $('login-password').value;

    showLoginError('');
    setFieldErrors($('login-form'), {});
    button.disabled = true;
    button.textContent = 'Signing in…';

    api.login(username, password).then(function (result) {
      saveSession(result);
      $('login').hidden = true;
      $('app').hidden = false;
      $('who-name').textContent = result.username;
      $('login-password').value = '';
      refreshOrderBadge();
      return refresh();
    }).catch(function (err) {
      showLoginError(err.message);
      setFieldErrors($('login-form'), err.fields);
    }).finally(function () {
      button.disabled = false;
      button.textContent = 'Sign in';
    });
  });

  $('logout-btn').addEventListener('click', function () { signOut(''); });

  /* ---------------------------------------------------------- list view -- */

  function refresh() {
    $('list-error').hidden = true;
    if (!items.length) $('loading').hidden = false;

    return api.list(query, category).then(function (rows) {
      items = rows || [];
      renderFilters();
      renderStats();
      renderGrid();
    }).catch(function (err) {
      var box = $('list-error');
      box.textContent = err.message;
      box.hidden = false;
      renderGrid();
    }).finally(function () {
      $('loading').hidden = true;
    });
  }

  /**
   * Aisles come from whatever is in the catalogue, so the filter row and the
   * form's suggestions never drift out of step with the data. The list is kept
   * while a filter is active — filtering by one aisle would otherwise leave
   * that aisle as the only chip on screen.
   */
  var knownCategories = [];

  function renderFilters() {
    if (!category) {
      var seen = {};
      knownCategories = [];
      items.forEach(function (item) {
        var value = (item.category || '').trim();
        if (value && !seen[value]) { seen[value] = true; knownCategories.push(value); }
      });
      knownCategories.sort();
    }

    var bar = $('filters');
    bar.hidden = view === 'orders' || knownCategories.length === 0;
    bar.innerHTML = [''].concat(knownCategories).map(function (value) {
      return '<button class="chip" type="button" data-category="' + esc(value) + '"' +
        ' aria-pressed="' + (category === value) + '">' +
        esc(value || 'All aisles') + '</button>';
    }).join('');

    $('categories').innerHTML = knownCategories.map(function (value) {
      return '<option value="' + esc(value) + '">';
    }).join('');
  }

  function renderStats() {
    var lowStock = 0, outOfStock = 0, expiring = 0, value = 0;

    items.forEach(function (item) {
      var state = expiryState(item.expiry_date);
      if (item.quantity <= 0) outOfStock++;
      else if (item.quantity <= LOW_STOCK) lowStock++;
      if (state.expired || state.expiringSoon) expiring++;
      value += (Number(item.price) || 0) * (Number(item.quantity) || 0);
    });

    var tiles = [
      { label: items.length === 1 ? 'Product' : 'Products', value: items.length, cls: '' },
      { label: 'Stock value', value: peso(value), cls: '' },
      { label: 'Low stock', value: lowStock, cls: lowStock ? 'stat-warn' : '' },
      { label: 'Out of stock', value: outOfStock, cls: outOfStock ? 'stat-bad' : '' },
      { label: 'Expiring or expired', value: expiring, cls: expiring ? 'stat-bad' : '' },
    ];

    $('stats').hidden = items.length === 0;
    $('stats').innerHTML = tiles.map(function (tile) {
      return '<div class="stat ' + tile.cls + '">' +
        '<div class="stat-value">' + esc(tile.value) + '</div>' +
        '<div class="stat-label">' + esc(tile.label) + '</div></div>';
    }).join('');
  }

  function renderGrid() {
    var grid = $('grid');

    if (!items.length) {
      grid.innerHTML = '';
      var filtered = query || category;
      $('empty').hidden = false;
      $('empty-title').textContent = filtered ? 'Nothing matches' : 'No products yet';
      $('empty-text').textContent = filtered
        ? 'Try a different search, or clear the aisle filter.'
        : 'Add your first medicine to see it here.';
      return;
    }
    $('empty').hidden = true;

    grid.innerHTML = items.map(function (item) {
      var uri = imageUri(item.image_url);
      var stock = stockLabel(item);
      var state = expiryState(item.expiry_date);

      var sub = [item.brand, item.dosage, item.form].filter(Boolean).join(' · ');

      var tags = [];
      if (item.category) tags.push('<span class="tag">' + esc(item.category) + '</span>');
      if (state.expired) tags.push('<span class="tag tag-bad">Expired</span>');
      else if (state.expiringSoon) tags.push('<span class="tag tag-warn">Expires in ' + state.days + 'd</span>');
      if (!item.image_url) tags.push('<span class="tag tag-warn">No photo</span>');

      return '' +
        '<article class="card" data-id="' + item.id + '">' +
          '<div class="thumb" data-act="photo" tabindex="0" role="button"' +
               ' aria-label="Change the photo for ' + esc(item.name) + '">' +
            (uri
              ? '<img src="' + esc(uri) + '" alt="" loading="lazy">'
              : '<div class="thumb-placeholder" aria-hidden="true">💊</div>') +
            '<div class="thumb-overlay">' +
              '<span class="thumb-icon" aria-hidden="true">📷</span>' +
              '<span>' + (uri ? 'Change photo' : 'Add photo') + '</span>' +
              '<span style="font-weight:400;opacity:.8">click or drop a file</span>' +
            '</div>' +
          '</div>' +
          '<div class="card-body">' +
            '<div class="card-name">' + esc(item.name) + '</div>' +
            (sub ? '<div class="card-sub">' + esc(sub) + '</div>' : '') +
            '<div class="card-price">' + peso(item.price) + '</div>' +
            '<div class="card-stock ' + stock.cls + '">' + esc(stock.text) + '</div>' +
            (tags.length ? '<div class="tags">' + tags.join('') + '</div>' : '') +
          '</div>' +
          '<div class="card-actions">' +
            '<button class="btn" type="button" data-act="edit">Edit</button>' +
            '<button class="btn btn-danger-quiet" type="button" data-act="delete">Delete</button>' +
          '</div>' +
        '</article>';
    }).join('');
  }

  function findItem(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  /** Swaps one card's photo in place, without a full reload. */
  function replaceCardPhoto(item, file) {
    var card = $('grid').querySelector('.card[data-id="' + item.id + '"]');
    var thumb = card && card.querySelector('.thumb');
    if (thumb) {
      thumb.insertAdjacentHTML('beforeend',
        '<div class="thumb-busy"><span class="spinner spinner-light"></span></div>');
    }

    uploadFile(file).then(function (path) {
      return api.update(item.id, { image_url: path });
    }).then(function (updated) {
      var index = items.indexOf(item);
      if (index !== -1) items[index] = updated;
      renderGrid();
      toast('Photo updated for ' + updated.name, 'good');
    }).catch(function (err) {
      var busy = thumb && thumb.querySelector('.thumb-busy');
      if (busy) busy.remove();
      toast(err.message, 'bad');
    });
  }

  /* --------------------------------------------------------------- orders -- */

  /** "21 Sep 2026, 8:41 PM" from the MySQL timestamp. */
  function readableDate(value) {
    var parsed = new Date(String(value).replace(' ', 'T'));
    if (isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }

  function refreshOrders() {
    $('orders-error').hidden = true;
    if (!orders.length) $('orders-loading').hidden = false;

    return api.orders(orderStatus).then(function (rows) {
      orders = rows || [];
      renderOrderFilters();
      renderOrderStats();
      renderOrders();
      refreshOrderBadge();
    }).catch(function (err) {
      var box = $('orders-error');
      box.textContent = err.message;
      box.hidden = false;
      renderOrders();
    }).finally(function () {
      $('orders-loading').hidden = true;
    });
  }

  /**
   * The count of orders still waiting to be dealt with, on the Orders tab.
   * Asked for separately because the tab is usually not the one on screen,
   * and a status filter would otherwise hide the very thing being counted.
   */
  function refreshOrderBadge() {
    return api.orders('new').then(function (rows) {
      var badge = $('orders-badge');
      var count = (rows || []).length;
      badge.textContent = count > 99 ? '99+' : count;
      badge.hidden = count === 0;
    }).catch(function () {
      $('orders-badge').hidden = true;
    });
  }

  function renderOrderFilters() {
    $('order-filters').innerHTML = [''].concat(ORDER_STATUSES).map(function (value) {
      return '<button class="chip" type="button" data-status="' + esc(value) + '"' +
        ' aria-pressed="' + (orderStatus === value) + '">' +
        esc(value ? STATUS_LABEL[value] : 'All orders') + '</button>';
    }).join('');
  }

  function renderOrderStats() {
    var value = 0;
    var pieces = 0;
    orders.forEach(function (order) {
      // Cancelled orders are still listed, but they are not money taken.
      if (order.status !== 'cancelled') {
        value += Number(order.total) || 0;
        pieces += Number(order.item_count) || 0;
      }
    });

    var tiles = [
      { label: orders.length === 1 ? 'Order' : 'Orders', value: orders.length, cls: '' },
      { label: 'Items sold', value: pieces, cls: '' },
      { label: 'Value', value: peso(value), cls: '' },
    ];

    $('order-stats').hidden = orders.length === 0;
    $('order-stats').innerHTML = tiles.map(function (tile) {
      return '<div class="stat ' + tile.cls + '">' +
        '<div class="stat-value">' + esc(tile.value) + '</div>' +
        '<div class="stat-label">' + esc(tile.label) + '</div></div>';
    }).join('');
  }

  function renderOrders() {
    var list = $('orders-list');

    if (!orders.length) {
      list.innerHTML = '';
      $('orders-empty').hidden = false;
      $('orders-empty-title').textContent = orderStatus ? 'Nothing here' : 'No orders yet';
      $('orders-empty-text').textContent = orderStatus
        ? 'No orders have that status right now.'
        : 'Orders placed in the app land here.';
      return;
    }
    $('orders-empty').hidden = true;

    list.innerHTML = orders.map(function (order) {
      var lines = (order.items || []).map(function (line) {
        var detail = [line.brand, line.dosage, line.form].filter(Boolean).join(' · ');
        return '<div class="order-line">' +
          '<span class="order-line-qty">' + esc(line.quantity) + '×</span>' +
          '<span class="order-line-name">' + esc(line.name) +
            (detail ? '<span class="order-line-detail"> · ' + esc(detail) + '</span>' : '') +
          '</span>' +
          '<span class="order-line-total">' + peso(line.line_total) + '</span>' +
        '</div>';
      }).join('');

      var options = ORDER_STATUSES.map(function (value) {
        return '<option value="' + value + '"' +
          (order.status === value ? ' selected' : '') + '>' + STATUS_LABEL[value] + '</option>';
      }).join('');

      // A tel: link so a phone number is one click away on a laptop or a phone.
      var phone = order.phone
        ? '<a class="order-phone" href="tel:' + esc(String(order.phone).replace(/\s+/g, '')) + '">' +
          esc(order.phone) + '</a><br>'
        : '';

      return '' +
        '<article class="order" data-id="' + order.id + '">' +
          '<header class="order-head">' +
            '<div>' +
              '<div class="order-ref">' + esc(order.reference) + '</div>' +
              '<div class="order-when">' + esc(readableDate(order.created_at)) + '</div>' +
            '</div>' +
            '<div class="order-head-right">' +
              '<span class="order-total">' + peso(order.total) + '</span>' +
              '<select class="order-status status-' + esc(order.status) + '" data-act="status"' +
                ' aria-label="Status of ' + esc(order.reference) + '">' + options + '</select>' +
            '</div>' +
          '</header>' +
          '<div class="order-body">' +
            '<div>' +
              '<div class="order-label">' + esc(order.item_count) +
                (Number(order.item_count) === 1 ? ' item' : ' items') + '</div>' +
              '<div class="order-lines">' + lines + '</div>' +
            '</div>' +
            '<div>' +
              '<div class="order-label">Deliver to</div>' +
              '<div class="order-to">' +
                '<strong>' + esc(order.customer_name) + '</strong>' +
                phone +
                esc(order.address) +
                (order.note ? '<div class="order-note">' + esc(order.note) + '</div>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
        '</article>';
    }).join('');
  }

  $('orders-list').addEventListener('change', function (event) {
    var select = event.target.closest('[data-act="status"]');
    if (!select) return;

    var card = select.closest('.order');
    var id = Number(card.getAttribute('data-id'));
    var wanted = select.value;
    var previous = (orders.find(function (o) { return o.id === id; }) || {}).status;

    select.disabled = true;
    api.setOrderStatus(id, wanted).then(function (updated) {
      orders = orders.map(function (o) { return o.id === id ? updated : o; });
      // A filtered list should drop an order that no longer matches.
      if (orderStatus && updated.status !== orderStatus) {
        refreshOrders();
      } else {
        select.className = 'order-status status-' + updated.status;
        renderOrderStats();
      }
      refreshOrderBadge();
      toast(updated.reference + ' → ' + STATUS_LABEL[updated.status], 'good');
    }).catch(function (err) {
      select.value = previous || 'new';
      toast(err.message, 'bad');
    }).finally(function () {
      select.disabled = false;
    });
  });

  $('order-filters').addEventListener('click', function (event) {
    var chip = event.target.closest('[data-status]');
    if (!chip) return;
    orderStatus = chip.getAttribute('data-status');
    orders = [];
    refreshOrders();
  });

  /* ----------------------------------------------------------- switching -- */

  function showView(next) {
    view = next;
    var onOrders = next === 'orders';

    $('view-products').hidden = onOrders;
    $('view-orders').hidden = !onOrders;

    // The product search and Add button mean nothing on the orders tab.
    $('search-wrap').hidden = onOrders;
    $('add-btn').hidden = onOrders;
    $('filters').hidden = onOrders || knownCategories.length === 0;

    document.querySelectorAll('.seg').forEach(function (seg) {
      seg.setAttribute('aria-selected', String(seg.getAttribute('data-view') === next));
    });

    if (onOrders && !orders.length) refreshOrders();
  }

  document.querySelector('.segmented').addEventListener('click', function (event) {
    var seg = event.target.closest('[data-view]');
    if (seg) showView(seg.getAttribute('data-view'));
  });

  /* --------------------------------------------- list view: interactions -- */

  var quickPicker = document.createElement('input');
  quickPicker.type = 'file';
  quickPicker.accept = 'image/*';
  quickPicker.hidden = true;
  document.body.appendChild(quickPicker);
  var quickTarget = null;

  quickPicker.addEventListener('change', function () {
    var file = quickPicker.files && quickPicker.files[0];
    if (file && quickTarget) replaceCardPhoto(quickTarget, file);
    quickPicker.value = '';
    quickTarget = null;
  });

  function cardOf(node) {
    var card = node.closest('.card');
    return card ? findItem(Number(card.getAttribute('data-id'))) : null;
  }

  $('grid').addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-act]');
    if (!trigger) return;
    var item = cardOf(trigger);
    if (!item) return;

    var act = trigger.getAttribute('data-act');
    if (act === 'edit') openSheet(item);
    else if (act === 'delete') removeItem(item);
    else if (act === 'photo') { quickTarget = item; quickPicker.click(); }
  });

  $('grid').addEventListener('keydown', function (event) {
    var thumb = event.target.closest('.thumb');
    if (!thumb || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    var item = cardOf(thumb);
    if (item) { quickTarget = item; quickPicker.click(); }
  });

  // Drag a photo from the desktop straight onto a product.
  ['dragenter', 'dragover'].forEach(function (name) {
    $('grid').addEventListener(name, function (event) {
      var thumb = event.target.closest('.thumb');
      if (!thumb) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      thumb.classList.add('dragging');
    });
  });

  $('grid').addEventListener('dragleave', function (event) {
    var thumb = event.target.closest('.thumb');
    if (thumb && !thumb.contains(event.relatedTarget)) thumb.classList.remove('dragging');
  });

  $('grid').addEventListener('drop', function (event) {
    var thumb = event.target.closest('.thumb');
    if (!thumb) return;
    event.preventDefault();
    thumb.classList.remove('dragging');

    var file = imageFromTransfer(event.dataTransfer);
    var item = cardOf(thumb);
    if (file && item) replaceCardPhoto(item, file);
  });

  // The page itself must never navigate away because a drop missed a card.
  ['dragover', 'drop'].forEach(function (name) {
    window.addEventListener(name, function (event) {
      if (!event.target.closest('.thumb, .dropzone')) event.preventDefault();
    });
  });

  $('search').addEventListener('input', function (event) {
    query = event.target.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refresh, 280);
  });

  $('filters').addEventListener('click', function (event) {
    var chip = event.target.closest('[data-category]');
    if (!chip) return;
    category = chip.getAttribute('data-category');
    refresh();
  });

  $('refresh-btn').addEventListener('click', function () {
    if (view === 'orders') {
      refreshOrders().then(function () { toast('Orders reloaded'); });
    } else {
      refresh().then(function () { toast('Catalogue reloaded'); });
      refreshOrderBadge();
    }
  });

  $('add-btn').addEventListener('click', function () { openSheet(null); });

  function removeItem(item) {
    if (!window.confirm('Delete "' + item.name + '"? This cannot be undone.')) return;

    api.remove(item.id).then(function () {
      items = items.filter(function (row) { return row.id !== item.id; });
      renderStats();
      renderGrid();
      toast('Deleted ' + item.name, 'good');
    }).catch(function (err) {
      toast(err.message, 'bad');
    });
  }

  /* ---------------------------------------------------------- the editor -- */

  var FIELDS = ['name', 'brand', 'category', 'dosage', 'form', 'quantity', 'price', 'expiry_date', 'notes'];

  function openSheet(item) {
    editing = item;
    $('sheet-title').textContent = item ? 'Edit product' : 'Add product';
    $('delete-group').hidden = !item;
    $('editor-error').hidden = true;
    setFieldErrors($('editor'), {});

    FIELDS.forEach(function (name) {
      $('f-' + name).value = item && item[name] != null ? item[name] : '';
    });

    setDraftImage(item ? item.image_url || '' : '');

    $('sheet').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(function () { $('f-name').focus(); }, 60);
  }

  function closeSheet() {
    $('sheet').hidden = true;
    document.body.style.overflow = '';
    editing = null;
    setPhotoBusy(false);
  }

  /** `preview` overrides what is shown, so a local file appears before it lands. */
  function setDraftImage(value, preview) {
    draftImage = (value || '').trim();
    $('f-image_url').value = /^https?:\/\//i.test(draftImage) ? draftImage : '';

    var uri = preview || imageUri(draftImage);
    var img = $('photo-preview');
    img.hidden = !uri;
    if (uri) img.src = uri;
    $('dropzone-empty').hidden = !!uri;
    $('photo-clear').hidden = !draftImage && !preview;
  }

  function setPhotoBusy(busy, text) {
    $('dropzone-busy').hidden = !busy;
    $('dropzone-busy-text').textContent = text || 'Uploading…';
    $('save-btn').disabled = !!busy;
    $('photo-browse').disabled = !!busy;
  }

  /** Shows the file immediately, then swaps in the stored path once it lands. */
  function takePhoto(file) {
    setPhotoBusy(true, 'Preparing…');

    readAsDataUrl(file).then(function (localPreview) {
      setDraftImage(draftImage, localPreview);
      setPhotoBusy(true, 'Uploading…');
      return uploadFile(file);
    }).then(function (path) {
      setDraftImage(path);
      toast('Photo ready — press Save to keep it', 'good');
    }).catch(function (err) {
      setDraftImage(editing ? editing.image_url || '' : '');
      toast(err.message, 'bad');
    }).finally(function () {
      setPhotoBusy(false);
    });
  }

  $('photo-browse').addEventListener('click', function () { $('photo-file').click(); });
  $('dropzone').addEventListener('click', function () { $('photo-file').click(); });
  $('dropzone').addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('photo-file').click(); }
  });

  $('photo-file').addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0];
    if (file) takePhoto(file);
    event.target.value = '';
  });

  $('photo-clear').addEventListener('click', function () { setDraftImage(''); });

  ['dragenter', 'dragover'].forEach(function (name) {
    $('dropzone').addEventListener(name, function (event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      $('dropzone').classList.add('dragging');
    });
  });
  $('dropzone').addEventListener('dragleave', function (event) {
    if (!$('dropzone').contains(event.relatedTarget)) $('dropzone').classList.remove('dragging');
  });
  $('dropzone').addEventListener('drop', function (event) {
    event.preventDefault();
    $('dropzone').classList.remove('dragging');
    var file = imageFromTransfer(event.dataTransfer);
    if (file) takePhoto(file);
  });

  // A screenshot on the clipboard is the fastest way to get a photo in.
  document.addEventListener('paste', function (event) {
    if ($('sheet').hidden) return;
    var active = document.activeElement;
    if (active && /^(INPUT|TEXTAREA)$/.test(active.tagName) && active.id !== 'f-image_url') return;

    var file = imageFromTransfer(event.clipboardData);
    if (file && /^image\//i.test(file.type)) {
      event.preventDefault();
      takePhoto(file);
    }
  });

  // Typing a link is the other way in; it wins over whatever was uploaded.
  $('f-image_url').addEventListener('change', function (event) {
    var value = event.target.value.trim();
    if (value) setDraftImage(value);
    else if (/^https?:\/\//i.test(draftImage)) setDraftImage('');
  });

  $('editor').addEventListener('submit', function (event) {
    event.preventDefault();

    var body = {};
    FIELDS.forEach(function (name) { body[name] = $('f-' + name).value.trim(); });
    body.image_url = draftImage;

    // The server is the authority on what is valid; this only catches the two
    // that would otherwise cost a round trip.
    var local = {};
    if (!body.name) local.name = 'Name is required';
    if (body.quantity === '') local.quantity = 'Quantity is required';
    if (body.price === '') local.price = 'Price is required';
    if (Object.keys(local).length) {
      setFieldErrors($('editor'), local);
      return;
    }

    var button = $('save-btn');
    button.disabled = true;
    button.textContent = 'Saving…';
    $('editor-error').hidden = true;
    setFieldErrors($('editor'), {});

    var saving = editing ? api.update(editing.id, body) : api.create(body);

    saving.then(function (saved) {
      if (editing) {
        var index = items.indexOf(editing);
        if (index !== -1) items[index] = saved;
      } else {
        items.push(saved);
        items.sort(function (a, b) { return a.name.localeCompare(b.name); });
      }
      var name = saved.name;
      closeSheet();
      renderFilters();
      renderStats();
      renderGrid();
      toast('Saved ' + name, 'good');
    }).catch(function (err) {
      var box = $('editor-error');
      box.textContent = err.message;
      box.hidden = false;
      setFieldErrors($('editor'), err.fields);
      $('editor').querySelector('.sheet-body').scrollTop = 0;
    }).finally(function () {
      button.disabled = false;
      button.textContent = 'Save';
    });
  });

  $('delete-btn').addEventListener('click', function () {
    if (!editing) return;
    var item = editing;
    if (!window.confirm('Delete "' + item.name + '"? This cannot be undone.')) return;

    api.remove(item.id).then(function () {
      items = items.filter(function (row) { return row.id !== item.id; });
      closeSheet();
      renderStats();
      renderGrid();
      toast('Deleted ' + item.name, 'good');
    }).catch(function (err) {
      toast(err.message, 'bad');
    });
  });

  $('sheet').addEventListener('click', function (event) {
    if (event.target === $('sheet') || event.target.closest('[data-close]')) closeSheet();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !$('sheet').hidden) closeSheet();
    // Cmd/Ctrl+S saves, the way every editor does.
    if ((event.metaKey || event.ctrlKey) && event.key === 's' && !$('sheet').hidden) {
      event.preventDefault();
      $('save-btn').click();
    }
  });

  /* ---------------------------------------------------------------- boot -- */

  $('login-api').textContent = new URL(API_BASE, location.href).href;

  session = loadSession();

  if (!session) {
    $('login').hidden = false;
  } else {
    // Confirm the remembered token before showing a page full of buttons that
    // would each fail on it.
    api.verify().then(function (who) {
      $('app').hidden = false;
      $('who-name').textContent = who.username;
      refreshOrderBadge();
      return refresh();
    }).catch(function (err) {
      // request() deliberately leaves login.php alone, so the expired token is
      // cleared here rather than there.
      if (err.status === 401) {
        signOut('Your session expired. Please sign in again.');
        return;
      }
      // Anything else (the host is down, DNS is broken) is not a reason to
      // throw away a good login — show the page with the error on it.
      $('app').hidden = false;
      $('who-name').textContent = session.username || '';
      var box = $('list-error');
      box.textContent = err.message;
      box.hidden = false;
      $('loading').hidden = true;
    });
  }
})();
