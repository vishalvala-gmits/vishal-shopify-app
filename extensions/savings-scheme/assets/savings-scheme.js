(function () {
  "use strict";

  function fmt(n, s) {
    return (s || "") + Number(n).toLocaleString("en-IN");
  }

  function ord(n) {
    var s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt) e.textContent = txt;
    return e;
  }

  function isGiftEligible(gift, amt) {
    if (!gift || !gift.enabled) return false;
    if (gift.minimumContributionToUnlock != null && amt < gift.minimumContributionToUnlock) return false;
    if (gift.maximumContributionToUnlock != null && amt > gift.maximumContributionToUnlock) return false;
    return true;
  }


  // Global country calling codes for the enquiry form's phone field. Region
  // is the ISO 3166-1 alpha-2 code, used both to render a flag emoji and to
  // match the browser's locale for auto-detecting a sensible default.
  var COUNTRY_CODES = [
    { region: "AF", dial: "+93", name: "Afghanistan" }, { region: "AL", dial: "+355", name: "Albania" },
    { region: "DZ", dial: "+213", name: "Algeria" }, { region: "AD", dial: "+376", name: "Andorra" },
    { region: "AO", dial: "+244", name: "Angola" }, { region: "AR", dial: "+54", name: "Argentina" },
    { region: "AM", dial: "+374", name: "Armenia" }, { region: "AU", dial: "+61", name: "Australia" },
    { region: "AT", dial: "+43", name: "Austria" }, { region: "AZ", dial: "+994", name: "Azerbaijan" },
    { region: "BH", dial: "+973", name: "Bahrain" }, { region: "BD", dial: "+880", name: "Bangladesh" },
    { region: "BY", dial: "+375", name: "Belarus" }, { region: "BE", dial: "+32", name: "Belgium" },
    { region: "BZ", dial: "+501", name: "Belize" }, { region: "BJ", dial: "+229", name: "Benin" },
    { region: "BT", dial: "+975", name: "Bhutan" }, { region: "BO", dial: "+591", name: "Bolivia" },
    { region: "BA", dial: "+387", name: "Bosnia and Herzegovina" }, { region: "BW", dial: "+267", name: "Botswana" },
    { region: "BR", dial: "+55", name: "Brazil" }, { region: "BN", dial: "+673", name: "Brunei" },
    { region: "BG", dial: "+359", name: "Bulgaria" }, { region: "BF", dial: "+226", name: "Burkina Faso" },
    { region: "KH", dial: "+855", name: "Cambodia" }, { region: "CM", dial: "+237", name: "Cameroon" },
    { region: "CA", dial: "+1", name: "Canada" }, { region: "CL", dial: "+56", name: "Chile" },
    { region: "CN", dial: "+86", name: "China" }, { region: "CO", dial: "+57", name: "Colombia" },
    { region: "CR", dial: "+506", name: "Costa Rica" }, { region: "HR", dial: "+385", name: "Croatia" },
    { region: "CU", dial: "+53", name: "Cuba" }, { region: "CY", dial: "+357", name: "Cyprus" },
    { region: "CZ", dial: "+420", name: "Czechia" }, { region: "DK", dial: "+45", name: "Denmark" },
    { region: "DO", dial: "+1", name: "Dominican Republic" }, { region: "EC", dial: "+593", name: "Ecuador" },
    { region: "EG", dial: "+20", name: "Egypt" }, { region: "SV", dial: "+503", name: "El Salvador" },
    { region: "EE", dial: "+372", name: "Estonia" }, { region: "ET", dial: "+251", name: "Ethiopia" },
    { region: "FJ", dial: "+679", name: "Fiji" }, { region: "FI", dial: "+358", name: "Finland" },
    { region: "FR", dial: "+33", name: "France" }, { region: "GE", dial: "+995", name: "Georgia" },
    { region: "DE", dial: "+49", name: "Germany" }, { region: "GH", dial: "+233", name: "Ghana" },
    { region: "GR", dial: "+30", name: "Greece" }, { region: "GT", dial: "+502", name: "Guatemala" },
    { region: "HN", dial: "+504", name: "Honduras" }, { region: "HK", dial: "+852", name: "Hong Kong" },
    { region: "HU", dial: "+36", name: "Hungary" }, { region: "IS", dial: "+354", name: "Iceland" },
    { region: "IN", dial: "+91", name: "India" }, { region: "ID", dial: "+62", name: "Indonesia" },
    { region: "IR", dial: "+98", name: "Iran" }, { region: "IQ", dial: "+964", name: "Iraq" },
    { region: "IE", dial: "+353", name: "Ireland" }, { region: "IL", dial: "+972", name: "Israel" },
    { region: "IT", dial: "+39", name: "Italy" }, { region: "JM", dial: "+1", name: "Jamaica" },
    { region: "JP", dial: "+81", name: "Japan" }, { region: "JO", dial: "+962", name: "Jordan" },
    { region: "KZ", dial: "+7", name: "Kazakhstan" }, { region: "KE", dial: "+254", name: "Kenya" },
    { region: "KW", dial: "+965", name: "Kuwait" }, { region: "KG", dial: "+996", name: "Kyrgyzstan" },
    { region: "LA", dial: "+856", name: "Laos" }, { region: "LV", dial: "+371", name: "Latvia" },
    { region: "LB", dial: "+961", name: "Lebanon" }, { region: "LY", dial: "+218", name: "Libya" },
    { region: "LI", dial: "+423", name: "Liechtenstein" }, { region: "LT", dial: "+370", name: "Lithuania" },
    { region: "LU", dial: "+352", name: "Luxembourg" }, { region: "MO", dial: "+853", name: "Macao" },
    { region: "MG", dial: "+261", name: "Madagascar" }, { region: "MY", dial: "+60", name: "Malaysia" },
    { region: "MV", dial: "+960", name: "Maldives" }, { region: "ML", dial: "+223", name: "Mali" },
    { region: "MT", dial: "+356", name: "Malta" }, { region: "MU", dial: "+230", name: "Mauritius" },
    { region: "MX", dial: "+52", name: "Mexico" }, { region: "MD", dial: "+373", name: "Moldova" },
    { region: "MC", dial: "+377", name: "Monaco" }, { region: "MN", dial: "+976", name: "Mongolia" },
    { region: "ME", dial: "+382", name: "Montenegro" }, { region: "MA", dial: "+212", name: "Morocco" },
    { region: "MZ", dial: "+258", name: "Mozambique" }, { region: "MM", dial: "+95", name: "Myanmar" },
    { region: "NA", dial: "+264", name: "Namibia" }, { region: "NP", dial: "+977", name: "Nepal" },
    { region: "NL", dial: "+31", name: "Netherlands" }, { region: "NZ", dial: "+64", name: "New Zealand" },
    { region: "NI", dial: "+505", name: "Nicaragua" }, { region: "NE", dial: "+227", name: "Niger" },
    { region: "NG", dial: "+234", name: "Nigeria" }, { region: "NO", dial: "+47", name: "Norway" },
    { region: "OM", dial: "+968", name: "Oman" }, { region: "PK", dial: "+92", name: "Pakistan" },
    { region: "PA", dial: "+507", name: "Panama" }, { region: "PG", dial: "+675", name: "Papua New Guinea" },
    { region: "PY", dial: "+595", name: "Paraguay" }, { region: "PE", dial: "+51", name: "Peru" },
    { region: "PH", dial: "+63", name: "Philippines" }, { region: "PL", dial: "+48", name: "Poland" },
    { region: "PT", dial: "+351", name: "Portugal" }, { region: "PR", dial: "+1", name: "Puerto Rico" },
    { region: "QA", dial: "+974", name: "Qatar" }, { region: "RO", dial: "+40", name: "Romania" },
    { region: "RU", dial: "+7", name: "Russia" }, { region: "RW", dial: "+250", name: "Rwanda" },
    { region: "SA", dial: "+966", name: "Saudi Arabia" }, { region: "SN", dial: "+221", name: "Senegal" },
    { region: "RS", dial: "+381", name: "Serbia" }, { region: "SG", dial: "+65", name: "Singapore" },
    { region: "SK", dial: "+421", name: "Slovakia" }, { region: "SI", dial: "+386", name: "Slovenia" },
    { region: "ZA", dial: "+27", name: "South Africa" }, { region: "KR", dial: "+82", name: "South Korea" },
    { region: "ES", dial: "+34", name: "Spain" }, { region: "LK", dial: "+94", name: "Sri Lanka" },
    { region: "SD", dial: "+249", name: "Sudan" }, { region: "SE", dial: "+46", name: "Sweden" },
    { region: "CH", dial: "+41", name: "Switzerland" }, { region: "SY", dial: "+963", name: "Syria" },
    { region: "TW", dial: "+886", name: "Taiwan" }, { region: "TJ", dial: "+992", name: "Tajikistan" },
    { region: "TZ", dial: "+255", name: "Tanzania" }, { region: "TH", dial: "+66", name: "Thailand" },
    { region: "TN", dial: "+216", name: "Tunisia" }, { region: "TR", dial: "+90", name: "Turkey" },
    { region: "TM", dial: "+993", name: "Turkmenistan" }, { region: "UG", dial: "+256", name: "Uganda" },
    { region: "UA", dial: "+380", name: "Ukraine" }, { region: "AE", dial: "+971", name: "United Arab Emirates" },
    { region: "GB", dial: "+44", name: "United Kingdom" }, { region: "US", dial: "+1", name: "United States" },
    { region: "UY", dial: "+598", name: "Uruguay" }, { region: "UZ", dial: "+998", name: "Uzbekistan" },
    { region: "VE", dial: "+58", name: "Venezuela" }, { region: "VN", dial: "+84", name: "Vietnam" },
    { region: "YE", dial: "+967", name: "Yemen" }, { region: "ZM", dial: "+260", name: "Zambia" },
    { region: "ZW", dial: "+263", name: "Zimbabwe" },
  ].sort(function (a, b) { return a.name.localeCompare(b.name); });

  function regionToFlagEmoji(region) {
    if (!region || region.length !== 2) return "";
    var A = 0x1f1e6;
    var chars = region.toUpperCase().split("").map(function (c) {
      return String.fromCodePoint(A + (c.charCodeAt(0) - 65));
    });
    return chars.join("");
  }

  function detectRegion() {
    try {
      var locales = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language];
      for (var i = 0; i < locales.length; i++) {
        var parts = String(locales[i] || "").split("-");
        if (parts[1]) {
          var region = parts[1].toUpperCase();
          if (COUNTRY_CODES.some(function (c) { return c.region === region; })) return region;
        }
      }
    } catch (e) { /* ignore */ }

    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (tz === "Asia/Calcutta" || tz === "Asia/Kolkata") return "IN";
      if (tz.indexOf("America/") === 0) return "US";
      if (tz.indexOf("Europe/London") === 0) return "GB";
      if (tz.indexOf("Asia/Dubai") === 0) return "AE";
      if (tz.indexOf("Australia/") === 0) return "AU";
    } catch (e) { /* ignore */ }

    return "IN";
  }

  function setupCountrySelect(container) {
    if (!container || container.dataset.jssPopulated) return;
    container.dataset.jssPopulated = "true";

    var trigger = container.querySelector("[data-jss-country-trigger]");
    var flagEl = container.querySelector("[data-jss-country-flag]");
    var dialEl = container.querySelector("[data-jss-country-dial]");
    var hiddenInput = container.querySelector("[data-jss-phone-code]");
    var panel = container.querySelector("[data-jss-country-panel]");
    var search = container.querySelector("[data-jss-country-search]");
    var list = container.querySelector("[data-jss-country-list]");

    function selectCountry(country) {
      hiddenInput.value = country.dial;
      flagEl.textContent = regionToFlagEmoji(country.region);
      dialEl.textContent = country.dial;
      trigger.setAttribute("data-region", country.region);
    }

    function renderList(filter) {
      var q = (filter || "").trim().toLowerCase();
      var items = !q
        ? COUNTRY_CODES
        : COUNTRY_CODES.filter(function (c) {
            return c.name.toLowerCase().indexOf(q) !== -1 || c.dial.indexOf(q) !== -1 || c.dial.replace("+", "").indexOf(q) !== -1;
          });

      list.innerHTML = "";
      if (items.length === 0) {
        list.appendChild(el("div", "jss-country-empty", "No matching country"));
        return;
      }
      items.forEach(function (c) {
        var opt = el("button", "jss-country-option");
        opt.type = "button";
        opt.setAttribute("role", "option");
        if (hiddenInput.value === c.dial && trigger.getAttribute("data-region") === c.region) {
          opt.setAttribute("data-active", "true");
        }
        opt.appendChild(el("span", "jss-country-option-flag", regionToFlagEmoji(c.region)));
        opt.appendChild(el("span", "jss-country-option-name", c.name));
        opt.appendChild(el("span", "jss-country-option-dial", c.dial));
        opt.addEventListener("click", function () {
          selectCountry(c);
          closePanel();
        });
        list.appendChild(opt);
      });
    }

    function openPanel() {
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      renderList("");
      search.value = "";
      window.setTimeout(function () { search.focus(); }, 0);
    }

    function closePanel() {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }

    trigger.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (panel.hidden) openPanel();
      else closePanel();
    });

    search.addEventListener("input", function () { renderList(search.value); });
    search.addEventListener("click", function (ev) { ev.stopPropagation(); });
    search.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { closePanel(); trigger.focus(); }
    });

    document.addEventListener("click", function (ev) {
      if (!panel.hidden && !container.contains(ev.target)) closePanel();
    });

    var detected = detectRegion();
    var match = COUNTRY_CODES.find(function (c) { return c.region === detected; }) || COUNTRY_CODES.find(function (c) { return c.region === "IN"; });
    selectCountry(match || COUNTRY_CODES[0]);
  }

  function initWidget(root) {
    var shop = root.getAttribute("data-shop");
    var prodId = root.getAttribute("data-product-id");
    var appUrl = root.getAttribute("data-app-url");
    var loadEl = root.querySelector("[data-jss-loading]");
    var contEl = root.querySelector("[data-jss-content]");
    var errEl = root.querySelector("[data-jss-error]");

    if (!appUrl) {
      loadEl.hidden = true;
      errEl.hidden = false;
      return;
    }

    var base = appUrl.replace(/\/$/, "");
    var schemeUrl = base + "/api/storefront/savings-scheme?shop=" + encodeURIComponent(shop) + (prodId ? "&productId=" + encodeURIComponent(prodId) : "");
    var enqUrl = base + "/api/storefront/savings-enquiry?shop=" + encodeURIComponent(shop);

    fetch(schemeUrl)
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (d) {
        if (!d.enabled) { root.hidden = true; return; }
        render(d.scheme);
      })
      .catch(function () {
        loadEl.hidden = true;
        errEl.hidden = false;
      });

    function render(s) {
      root.style.setProperty("--jss-primary-color", s.primaryColor || "#5C4642");
      loadEl.hidden = true;
      contEl.hidden = false;

      var sym = s.currencySymbol || "₹";
      var presets = Array.isArray(s.presetAmounts) ? s.presetAmounts : [];
      var gifts = Array.isArray(s.gifts) ? s.gifts.filter(function (g) { return g && g.enabled; }).slice(0, 2) : [];
      var pop = s.popularAmount || (presets.length >= 3 ? presets[2] : (presets[0] || s.minAmount));
      var curr = pop || (presets.length > 0 ? presets[0] : s.minAmount);

      var q = function (sel) { return contEl.querySelector(sel); };
      var amtDisp = q("[data-jss-amount-display]");
      var sld = q("[data-jss-slider]");
      var mContainer = q("[data-jss-slider-milestones]");
      var pContainer = q("[data-jss-presets]");

      sld.min = String(s.minAmount);
      sld.max = String(s.maxAmount);
      sld.step = "500";
      sld.value = String(curr);
      q("[data-jss-min-label]").textContent = "MIN " + fmt(s.minAmount, sym);
      q("[data-jss-max-label]").textContent = "MAX " + fmt(s.maxAmount, sym);
      if (s.termsText) q("[data-jss-terms-text]").textContent = s.termsText;

      var totMonthsAll = s.durationMonths + (s.bonusEnabled ? s.bonusMonths : 0);
      q("[data-jss-tenure-label]").textContent = "Fixed " + totMonthsAll + "-Month Tenure";

      var GIFT_ICON_SVG =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M20 12v10H4V12"></path><path d="M2 7h20v5H2z"></path><path d="M12 22V7"></path>' +
        '<path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>' +
        "</svg>";

      mContainer.innerHTML = "";
      var giftMarkers = gifts.map(function (gift) {
        var gt = gift.minimumContributionToUnlock != null ? gift.minimumContributionToUnlock : s.minAmount;
        var rng = s.maxAmount - s.minAmount;
        var pct = rng > 0 ? Math.min(100, Math.max(0, ((gt - s.minAmount) / rng) * 100)) : 50;
        var marker = el("div", "jss-milestone-marker");
        marker.innerHTML = GIFT_ICON_SVG;
        marker.style.left = pct + "%";
        marker.title = (gift.name || "Free Gift") + (gift.value ? " worth " + fmt(gift.value, sym) : "");
        mContainer.appendChild(marker);
        return marker;
      });

      pContainer.innerHTML = "";
      presets.forEach(function (p) {
        var w = el("div", "jss-preset-wrapper");
        if (p === pop) w.appendChild(el("span", "jss-popular-badge", "POPULAR"));
        var b = el("button", "jss-preset-btn", fmt(p, sym));
        b.type = "button";
        b.addEventListener("click", function () { upd(p); });
        w.appendChild(b);
        pContainer.appendChild(w);
      });

      // Static description of a gift's unlock range - set once here and
      // never updated again as the slider moves. This keeps the left
      // "Guaranteed Tier Privileges" cards a fixed height/text regardless
      // of the current contribution amount, so the column's spacing above
      // the CONTINUE button never shifts when eligibility changes (only
      // the right-side hero gift card and slider milestone pins are meant
      // to react live to the slider).
      function giftRangeDescription(gift) {
        var hasMin = gift.minimumContributionToUnlock != null;
        var hasMax = gift.maximumContributionToUnlock != null;
        if (hasMin && hasMax) {
          return "Available on plans from " + fmt(gift.minimumContributionToUnlock, sym) + " to " + fmt(gift.maximumContributionToUnlock, sym) + "/mo";
        }
        if (hasMin) {
          return "Available on plans from " + fmt(gift.minimumContributionToUnlock, sym) + "/mo";
        }
        if (hasMax) {
          return "Available on plans up to " + fmt(gift.maximumContributionToUnlock, sym) + "/mo";
        }
        return "Available on all plans";
      }

      var gTiersContainer = q("[data-jss-gift-tiers]");
      var gTiersLabel = q("[data-jss-gift-tiers-label]");
      var tierCards = [];
      gTiersContainer.innerHTML = "";
      if (gifts.length) {
        gTiersContainer.hidden = false;
        gTiersLabel.hidden = false;
        gifts.forEach(function (gift) {
          var card = el("div", "jss-gift-tier-card");

          var icon = el("div", "jss-gift-tier-icon");
          icon.innerHTML = GIFT_ICON_SVG;
          card.appendChild(icon);

          var body = el("div", "jss-gift-tier-body");
          var header = el("div", "jss-gift-tier-header");
          header.appendChild(el("h4", "jss-gift-tier-name", gift.name || "Free Gift"));
          header.appendChild(el("span", "jss-gift-tier-badge", gift.value ? fmt(gift.value, sym) : ""));
          body.appendChild(header);
          body.appendChild(el("p", "jss-gift-tier-status", giftRangeDescription(gift)));
          card.appendChild(body);

          gTiersContainer.appendChild(card);
          tierCards.push({ card: card, gift: gift });
        });
      } else {
        gTiersContainer.hidden = true;
        gTiersLabel.hidden = true;
      }

      var heroList = q("[data-jss-gift-card]");
      var heroListEligibleKey = null;
      function renderHeroGifts(amt) {
        var eligible = gifts.filter(function (g) { return isGiftEligible(g, amt); });
        // Rebuild the DOM only when the *set* of eligible gifts actually
        // changes (e.g. crossing an unlock threshold) - not on every slider
        // tick - so cards (and their images) don't flicker/reload while
        // dragging within an already-settled eligibility state.
        var key = eligible.map(function (g) { return g.name + "|" + g.value + "|" + g.image; }).join(",");
        if (key === heroListEligibleKey) return;
        heroListEligibleKey = key;

        heroList.innerHTML = "";
        heroList.hidden = eligible.length === 0;
        eligible.forEach(function (gift) {
          var card = el("div", "jss-hero-gift-card");

          if (gift.image) {
            var img = document.createElement("img");
            img.className = "jss-hero-gift-img";
            img.src = gift.image;
            img.alt = (gift.name || "Free gift") + " thumbnail";
            img.width = 40;
            img.height = 40;
            card.appendChild(img);
          } else {
            var badge = el("div", "jss-hero-gift-icon");
            badge.innerHTML = GIFT_ICON_SVG;
            card.appendChild(badge);
          }

          var left = el("div", "jss-hero-gift-left");
          left.appendChild(el("p", "jss-hero-gift-name", gift.name || "Free Exclusive Gift"));
          left.appendChild(el("p", "jss-hero-gift-tagline", "(Exclusive Gift just for you)"));
          card.appendChild(left);

          var right = el("div", "jss-hero-gift-right");
          right.appendChild(el("span", "jss-hero-gift-value", fmt(gift.value || 0, sym)));
          card.appendChild(right);
          heroList.appendChild(card);
        });
      }

      // --- Redemption popover: anchored above the hovered/tapped card,
      // clamped inside the redemption grid's own box so it never spills
      // into the summary card or sections above/below it.
      var popover = root.querySelector("[data-jss-redemption-popover]");
      var activeCard = null;
      var closeTimer = null;

      function cancelClose() {
        if (closeTimer) { window.clearTimeout(closeTimer); closeTimer = null; }
      }

      function scheduleClose() {
        cancelClose();
        closeTimer = window.setTimeout(closePopover, 150);
      }

      function clearActive() {
        contEl.querySelectorAll(".jss-redemption-card-active").forEach(function (c) {
          c.classList.remove("jss-redemption-card-active");
        });
      }

      function closePopover() {
        popover.hidden = true;
        clearActive();
        activeCard = null;
      }

      function positionPopover(card) {
        var cardRect = card.getBoundingClientRect();

        popover.style.visibility = "hidden";
        popover.hidden = false;
        var popRect = popover.getBoundingClientRect();

        // Always open above the card (viewport-fixed, so it's never clipped
        // by the redemption grid's own bounds) - clamp to stay on-screen if
        // the card is near the very top of the viewport.
        var top = cardRect.top - popRect.height - 10;
        top = Math.max(8, top);

        var left = cardRect.left;
        var maxLeft = Math.max(8, window.innerWidth - popRect.width - 8);
        left = Math.max(8, Math.min(left, maxLeft));

        popover.style.top = top + "px";
        popover.style.left = left + "px";
        popover.style.visibility = "";
      }

      function openPopover(card, data) {
        cancelClose();
        activeCard = card;
        clearActive();
        card.classList.add("jss-redemption-card-active");

        popover.querySelector("[data-jss-popover-title]").textContent = "Redemption in " + ord(data.month) + " month";
        popover.querySelector("[data-jss-popover-payment]").textContent = fmt(data.totalPayment, sym);
        popover.querySelector("[data-jss-popover-payment-note]").textContent = "(" + data.installments + " installment" + (data.installments === 1 ? "" : "s") + ")";
        popover.querySelector("[data-jss-popover-bonus]").textContent = fmt(data.bonusBenefit, sym);
        popover.querySelector("[data-jss-popover-bonus-note]").textContent = data.isFinalMonth
          ? "(100% of one installment value)"
          : "(pro-rated benefit for early redemption)";

        var giftRow = popover.querySelector("[data-jss-popover-gift-row]");
        if (data.giftValue > 0) {
          giftRow.hidden = false;
          popover.querySelector("[data-jss-popover-gift]").textContent = fmt(data.giftValue, sym);
          popover.querySelector("[data-jss-popover-gift-note]").textContent =
            "(" + (data.giftName ? "Free " + data.giftName : "Promotional gift") + ")";
        } else {
          giftRow.hidden = true;
        }

        popover.querySelector("[data-jss-popover-worth-label]").textContent = "You can buy jewellery worth:";
        popover.querySelector("[data-jss-popover-worth]").textContent = fmt(data.jewelleryWorth, sym) + " (after " + ord(data.month) + " month)";

        positionPopover(card);
      }

      function attachPopoverHandlers(card, data) {
        var showTimer = null;
        card.addEventListener("mouseenter", function () {
          cancelClose();
          showTimer = window.setTimeout(function () { openPopover(card, data); }, 100);
        });
        card.addEventListener("mouseleave", function () {
          if (showTimer) window.clearTimeout(showTimer);
          scheduleClose();
        });
        card.addEventListener("click", function (ev) {
          ev.stopPropagation();
          if (activeCard === card && !popover.hidden) closePopover();
          else openPopover(card, data);
        });
        card.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            openPopover(card, data);
          }
        });
      }

      popover.addEventListener("mouseenter", cancelClose);
      popover.addEventListener("mouseleave", scheduleClose);
      popover.querySelector("[data-jss-popover-close]").addEventListener("click", closePopover);
      document.addEventListener("click", function (ev) {
        if (popover.hidden || popover.contains(ev.target) || (activeCard && activeCard.contains(ev.target))) return;
        closePopover();
      });
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape" && !popover.hidden) closePopover();
      });
      window.addEventListener("resize", function () {
        if (!popover.hidden && activeCard) positionPopover(activeCard);
      });
      // Popover is viewport-fixed (so it can escape the grid's own bounds
      // and always open above the card) - on scroll it would otherwise
      // visually detach from the card, so just close it instead of
      // repositioning on every scroll frame.
      window.addEventListener("scroll", function () {
        if (!popover.hidden) closePopover();
      }, { passive: true, capture: true });

      function upd(val) {
        sld.value = String(val);
        amtDisp.textContent = fmt(val, sym);

        var fillRange = s.maxAmount - s.minAmount;
        sld.style.setProperty("--jss-fill", (fillRange > 0 ? ((val - s.minAmount) / fillRange) * 100 : 0) + "%");

        pContainer.querySelectorAll(".jss-preset-btn").forEach(function (btn, i) {
          if (presets[i] === val) btn.setAttribute("data-active", "true");
          else btn.removeAttribute("data-active");
        });

        var contrib = val * s.durationMonths;
        var bonus = s.bonusEnabled ? val * s.bonusMonths : 0;
        // Cash-only benefit (contribution + bonus month) - kept separate from
        // gift value since it also drives the early-redemption bonus pool
        // math below, which must stay cash-only.
        var benefit = contrib + bonus;
        var totMonths = s.durationMonths + (s.bonusEnabled ? s.bonusMonths : 0);

        var eligibleGiftsAtVal = gifts.filter(function (g) { return isGiftEligible(g, val); });
        var eligibleGiftValue = eligibleGiftsAtVal.reduce(function (sum, g) { return sum + (g.value || 0); }, 0);
        // Total Benefit Value shown to the customer includes any gift(s)
        // unlocked at this contribution amount, on top of the cash benefit.
        var totalBenefitWithGift = benefit + eligibleGiftValue;

        q("[data-jss-contribution]").textContent = fmt(contrib, sym);
        q("[data-jss-contribution-sub]").textContent = "(" + s.durationMonths + " monthly Payments)";
        q("[data-jss-spend]").textContent = fmt(contrib, sym);
        q("[data-jss-benefit]").textContent = fmt(totalBenefitWithGift, sym);
        q("[data-jss-benefit-sub]").textContent = "(After " + totMonths + " Months)";

        var bRow = q("[data-jss-bonus-row]");
        if (s.bonusEnabled) {
          bRow.hidden = false;
          q("[data-jss-bonus]").textContent = fmt(bonus, sym);
          q("[data-jss-bonus-sub]").textContent = "(We cover your " + ord(totMonths) + " Payment)";
        } else {
          bRow.hidden = true;
        }

        q("[data-jss-gauge-cycle]").textContent = totMonths + "-Month Cycle";
        q("[data-jss-gauge-deposit-label]").textContent = s.durationMonths + " Mo. Deposit";
        q("[data-jss-gauge-deposit]").textContent = fmt(contrib, sym);
        q("[data-jss-gauge-deposit-note]").textContent = benefit > 0 ? Math.round((contrib / benefit) * 100) + "% of Total" : "";
        var gaugeBonusBox = q("[data-jss-gauge-bonus-box]");
        var gaugePlusOp = q("[data-jss-gauge-op-plus]");
        if (s.bonusEnabled) {
          gaugeBonusBox.hidden = false;
          gaugePlusOp.hidden = false;
          q("[data-jss-gauge-bonus-label]").textContent = ord(totMonths) + " Free Mo.";
          q("[data-jss-gauge-bonus]").textContent = fmt(bonus, sym);
          q("[data-jss-gauge-bonus-note]").textContent = "100% Covered";
        } else {
          gaugeBonusBox.hidden = true;
          gaugePlusOp.hidden = true;
        }
        q("[data-jss-gauge-total]").textContent = fmt(benefit, sym);

        giftMarkers.forEach(function (marker, i) {
          var unlocked = isGiftEligible(gifts[i], val);
          marker.setAttribute("data-active", unlocked ? "true" : "false");
        });

        // Border-color-only highlight on the specific gift-tier card that
        // is currently eligible - text/size never changes here, only the
        // data-unlocked attribute the CSS keys its border color off of, so
        // this cannot reflow the column's spacing.
        tierCards.forEach(function (t) {
          var unlocked = isGiftEligible(t.gift, val);
          t.card.setAttribute("data-unlocked", unlocked ? "true" : "false");
        });

        renderHeroGifts(val);

        var rSec = q("[data-jss-redemption-section]");
        if (s.earlyRedemption && s.earlyRedemption.enabled) {
          rSec.hidden = false;
          var minM = s.earlyRedemption.minMonths || 6;
          q("[data-jss-redemption-title]").textContent = "Need Flexibility? Redeem Early After " + minM + " Months";
          var rGrid = q("[data-jss-redemption-grid]");
          closePopover();
          rGrid.querySelectorAll(".jss-redemption-card").forEach(function (c) { c.remove(); });
          for (var m = minM + 1; m <= totMonths; m++) {
            var paidMonths = Math.min(m, s.durationMonths);
            var totalPayment = paidMonths * val;
            var pool = benefit - contrib;
            var step = (m - minM) / Math.max(1, totMonths - minM);
            var bonusBenefit = Math.round(pool * Math.pow(step, 1.45));
            // Gifts are unlocked by contribution amount, not by how many
            // months have been paid - so the full eligible gift value
            // applies at every early-redemption month once unlocked.
            var jewelleryWorth = totalPayment + bonusBenefit + eligibleGiftValue;

            var c = el("div", "jss-redemption-card");
            c.tabIndex = 0;
            c.setAttribute("role", "button");
            c.setAttribute("aria-haspopup", "dialog");
            var l = el("div", "jss-redemption-card-left");
            l.appendChild(el("span", "jss-redemption-month", ord(m) + " Month"));
            l.appendChild(el("span", "jss-redemption-amount", fmt(jewelleryWorth, sym)));
            var inf = el("span", "jss-info-icon", "ⓘ");
            inf.setAttribute("aria-label", "Redemption details for " + ord(m) + " month");
            c.appendChild(l);
            c.appendChild(inf);
            rGrid.appendChild(c);

            attachPopoverHandlers(c, {
              month: m,
              totalPayment: totalPayment,
              bonusBenefit: bonusBenefit,
              isFinalMonth: m === totMonths,
              giftValue: eligibleGiftValue,
              giftName: eligibleGiftsAtVal.length === 1 ? eligibleGiftsAtVal[0].name : null,
              jewelleryWorth: jewelleryWorth,
              installments: paidMonths,
            });
          }
        } else {
          rSec.hidden = true;
          closePopover();
        }
      }

      sld.addEventListener("input", function () { upd(Number(sld.value)); });
      var terms = q("[data-jss-terms]");
      var cta = q("[data-jss-cta]");
      cta.disabled = !terms.checked;
      terms.addEventListener("change", function () { cta.disabled = !terms.checked; });

      // --- Enquiry modal: lives at the widget root (outside contEl), so
      // query it from `root` and it can overlay the whole page.
      var modal = root.querySelector("[data-jss-enquiry-modal]");
      var modalBackdrop = root.querySelector("[data-jss-enquiry-backdrop]");
      var enqForm = modal.querySelector("[data-jss-enquiry-form]");
      var successEl = modal.querySelector("[data-jss-success]");
      setupCountrySelect(modal.querySelector("[data-jss-country-select]"));

      function openModal() {
        modal.hidden = false;
        modalBackdrop.hidden = false;
        // Compensate for the vertical scrollbar this removes, so the page
        // doesn't shift/reflow horizontally by the scrollbar's width while
        // the modal is open.
        var scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        if (scrollbarWidth > 0) {
          document.body.style.paddingRight = scrollbarWidth + "px";
        }
        document.body.style.overflow = "hidden";
      }

      function closeModal() {
        modal.hidden = true;
        modalBackdrop.hidden = true;
        document.body.style.overflow = "";
        document.body.style.paddingRight = "";
      }

      cta.addEventListener("click", function () {
        if (!terms.checked) return;
        enqForm.hidden = false;
        successEl.hidden = true;

        var val = Number(sld.value);
        modal.querySelector("[data-jss-modal-plan]").textContent =
          fmt(val, sym) + " / month × " + s.durationMonths + " Mos";

        var eligibleGifts = gifts.filter(function (g) { return isGiftEligible(g, val); });
        var benefitWrap = modal.querySelector("[data-jss-modal-benefit-wrap]");
        if (eligibleGifts.length > 0) {
          var giftValueTotal = eligibleGifts.reduce(function (sum, g) { return sum + (g.value || 0); }, 0);
          benefitWrap.hidden = false;
          modal.querySelector("[data-jss-modal-benefit]").textContent = fmt(giftValueTotal, sym);
        } else {
          benefitWrap.hidden = true;
        }

        openModal();
      });

      modal.querySelector("[data-jss-enquiry-close]").addEventListener("click", closeModal);
      modal.querySelector("[data-jss-success-close]").addEventListener("click", closeModal);
      modalBackdrop.addEventListener("click", closeModal);
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape" && !modal.hidden) closeModal();
      });

      enqForm.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var fErr = modal.querySelector("[data-jss-form-error]");
        fErr.hidden = true;
        var nm = modal.querySelector("[data-jss-input-name]").value.trim();
        var phRaw = modal.querySelector("[data-jss-input-phone]").value.trim();
        var phCode = modal.querySelector("[data-jss-phone-code]").value || "+91";
        var ph = phRaw ? (phRaw.charAt(0) === "+" ? phRaw : phCode + phRaw) : "";
        var em = modal.querySelector("[data-jss-input-email]").value.trim();

        if (!nm || (!ph && !em)) {
          fErr.textContent = "Please enter your name and phone or email.";
          fErr.hidden = false;
          return;
        }

        var sBtn = modal.querySelector("[data-jss-submit]");
        sBtn.disabled = true;
        sBtn.textContent = "Submitting...";

        fetch(enqUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: prodId,
            name: nm,
            phone: ph || undefined,
            email: em || undefined,
            monthlyAmount: Number(sld.value),
            sourceUrl: window.location.href,
          }),
        })
          .then(function (res) { return res.json(); })
          .then(function (res) {
            if (!res.success) throw new Error(res.message);
            enqForm.hidden = true;
            successEl.hidden = false;
          })
          .catch(function (err) {
            fErr.textContent = err.message || "Submission failed. Please try again.";
            fErr.hidden = false;
          })
          .finally(function () {
            sBtn.disabled = false;
            sBtn.textContent = "Submit Enquiry";
          });
      });

      upd(curr);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll("[data-jss-widget]").forEach(initWidget);
    });
  } else {
    document.querySelectorAll("[data-jss-widget]").forEach(initWidget);
  }
})();
