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
    var schemeUrl = base + "/api/storefront/savings-scheme?shop=" + encodeURIComponent(shop) + "&productId=" + encodeURIComponent(prodId);
    var enqUrl = base + "/api/storefront/savings-enquiry?shop=" + encodeURIComponent(shop);

    fetch(schemeUrl)
      .then(function (r) {
        if (!r.ok) throw new Error();
        return r.json();
      })
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
      var pop = s.popularAmount || (presets.length >= 3 ? presets[2] : (presets[0] || s.minAmount));
      var curr = pop || (presets.length > 0 ? presets[0] : s.minAmount);

      var q = function (sel) { return contEl.querySelector(sel); };
      var amtDisp = q("[data-jss-amount-display]");
      var sld = q("[data-jss-slider]");
      var mContainer = q("[data-jss-slider-milestones]");
      var pContainer = q("[data-jss-presets]");

      sld.min = String(s.minAmount);
      sld.max = String(s.maxAmount);
      sld.value = String(curr);
      q("[data-jss-min-label]").textContent = "MIN " + fmt(s.minAmount, sym);
      q("[data-jss-max-label]").textContent = "MAX " + fmt(s.maxAmount, sym);
      if (s.termsText) q("[data-jss-terms-text]").textContent = s.termsText;

      var GIFT_ICON_SVG =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path d="M20 12v9H4v-9M2 7h20v5H2V7zm10 0V5a2 2 0 1 0-2 2h2zm0 0V5a2 2 0 1 1 2 2h-2zm0 0v14" ' +
        'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
        "</svg>";

      mContainer.innerHTML = "";
      var giftMarker = null;
      if (s.gift && s.gift.enabled) {
        var gt = s.gift.minAmount || s.minAmount;
        var rng = s.maxAmount - s.minAmount;
        var pct = rng > 0 ? Math.min(100, Math.max(0, ((gt - s.minAmount) / rng) * 100)) : 50;
        giftMarker = el("div", "jss-milestone-marker");
        giftMarker.innerHTML = GIFT_ICON_SVG;
        giftMarker.style.left = pct + "%";
        giftMarker.title = (s.gift.name || "Free Gift") + (s.gift.value ? " worth " + fmt(s.gift.value, sym) : "");
        mContainer.appendChild(giftMarker);
      }

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

      function upd(val) {
        sld.value = String(val);
        amtDisp.textContent = fmt(val, sym);

        var fillRange = s.maxAmount - s.minAmount;
        var fillPct = fillRange > 0 ? ((val - s.minAmount) / fillRange) * 100 : 0;
        sld.style.setProperty("--jss-fill", fillPct + "%");

        pContainer.querySelectorAll(".jss-preset-btn").forEach(function (btn, i) {
          if (presets[i] === val) btn.setAttribute("data-active", "true");
          else btn.removeAttribute("data-active");
        });

        var gUnlocked = !s.gift || !s.gift.enabled || !s.gift.minAmount || val >= s.gift.minAmount;
        var contrib = val * s.durationMonths;
        var bonus = s.bonusEnabled ? val * s.bonusMonths : 0;
        var gVal = s.gift && s.gift.enabled && gUnlocked && s.gift.value ? s.gift.value : 0;
        var benefit = contrib + bonus + gVal;
        var totMonths = s.durationMonths + (s.bonusEnabled ? s.bonusMonths : 0);

        q("[data-jss-contribution]").textContent = fmt(contrib, sym);
        q("[data-jss-contribution-sub]").textContent = "(" + s.durationMonths + " monthly Payments)";
        q("[data-jss-spend]").textContent = fmt(contrib, sym);
        q("[data-jss-benefit]").textContent = fmt(benefit, sym);
        q("[data-jss-benefit-sub]").textContent = "(After " + totMonths + " Months)";

        var bRow = q("[data-jss-bonus-row]");
        if (s.bonusEnabled) {
          bRow.hidden = false;
          q("[data-jss-bonus]").textContent = fmt(bonus, sym);
          q("[data-jss-bonus-sub]").textContent = "(We cover your " + ord(totMonths) + " Payment)";
        } else {
          bRow.hidden = true;
        }

        var hCard = q("[data-jss-gift-card]");
        var gTiers = q("[data-jss-gift-tiers]");
        if (s.gift && s.gift.enabled) {
          hCard.hidden = false;
          q("[data-jss-gift-name]").textContent = s.gift.name || "Free Exclusive Gift";
          q("[data-jss-gift-value]").textContent = fmt(s.gift.value || 0, sym);
          var imgWrap = q("[data-jss-gift-img-wrap]");
          if (s.gift.imageUrl) {
            imgWrap.hidden = false;
            q("[data-jss-gift-img]").src = s.gift.imageUrl;
          } else {
            imgWrap.hidden = true;
          }
          gTiers.hidden = false;
          q("[data-jss-gift-tier-title]").textContent = (s.gift.name || "Free Gift") + (s.gift.value ? " Worth " + fmt(s.gift.value, sym) : "");
          var tCard = q("[data-jss-gift-tier-card]");
          tCard.setAttribute("data-unlocked", gUnlocked ? "true" : "false");
          q("[data-jss-gift-tier-status]").textContent = gUnlocked ? "Included in your plan" : "Unlocks at " + fmt(s.gift.minAmount, sym) + "/mo";
          if (giftMarker) giftMarker.setAttribute("data-active", gUnlocked ? "true" : "false");
        } else {
          hCard.hidden = true;
          gTiers.hidden = true;
        }

        var rSec = q("[data-jss-redemption-section]");
        if (s.earlyRedemption && s.earlyRedemption.enabled) {
          rSec.hidden = false;
          var minM = s.earlyRedemption.minMonths || 6;
          q("[data-jss-redemption-title]").textContent = "Need Flexibility? Redeem Early After " + minM + " Months";
          var rGrid = q("[data-jss-redemption-grid]");
          rGrid.innerHTML = "";
          for (var m = minM + 1; m <= totMonths; m++) {
            var c = el("div", "jss-redemption-card");
            var l = el("div", "jss-redemption-card-left");
            l.appendChild(el("span", "jss-redemption-month", ord(m) + " Month"));

            var dep = Math.min(m, s.durationMonths) * val;
            var pool = benefit - contrib;
            var step = (m - minM) / Math.max(1, totMonths - minM);
            var rVal = dep + Math.round(pool * Math.pow(step, 1.45));
            l.appendChild(el("span", "jss-redemption-amount", fmt(rVal, sym)));

            var inf = el("span", "jss-info-icon", "ⓘ");
            inf.title = "Early redemption at " + ord(m) + " month includes contributions and pro-rated benefits.";
            c.appendChild(l);
            c.appendChild(inf);
            rGrid.appendChild(c);
          }
        } else {
          rSec.hidden = true;
        }
      }

      sld.addEventListener("input", function () { upd(Number(sld.value)); });
      var terms = q("[data-jss-terms]");
      var cta = q("[data-jss-cta]");
      terms.addEventListener("change", function () { cta.disabled = !terms.checked; });

      var enqForm = q("[data-jss-enquiry-form]");
      cta.addEventListener("click", function () {
        if (!terms.checked) return;
        enqForm.hidden = false;
        cta.hidden = true;
      });

      enqForm.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var fErr = q("[data-jss-form-error]");
        fErr.hidden = true;
        var nm = q("[data-jss-input-name]").value.trim();
        var ph = q("[data-jss-input-phone]").value.trim();
        var em = q("[data-jss-input-email]").value.trim();

        if (!nm || (!ph && !em)) {
          fErr.textContent = "Please enter your name and phone or email.";
          fErr.hidden = false;
          return;
        }

        var sBtn = q("[data-jss-submit]");
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
            q("[data-jss-success]").hidden = false;
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
