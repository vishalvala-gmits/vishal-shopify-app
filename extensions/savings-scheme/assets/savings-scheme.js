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

  function amountToUnlock(gift, amt) {
    if (isGiftEligible(gift, amt) || gift.minimumContributionToUnlock == null) return 0;
    return Math.max(0, gift.minimumContributionToUnlock - amt);
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

      mContainer.innerHTML = "";
      var giftMarkers = gifts.map(function (gift) {
        var gt = gift.minimumContributionToUnlock != null ? gift.minimumContributionToUnlock : s.minAmount;
        var rng = s.maxAmount - s.minAmount;
        var pct = rng > 0 ? Math.min(100, Math.max(0, ((gt - s.minAmount) / rng) * 100)) : 50;
        var marker = el("div", "jss-milestone-marker", "🎁");
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

      var gTiersContainer = q("[data-jss-gift-tiers]");
      var tierEls = [];
      gTiersContainer.innerHTML = "";
      if (gifts.length) {
        gTiersContainer.hidden = false;
        gifts.forEach(function (gift, i) {
          var card = el("div", "jss-gift-tier-card");
          var header = el("div", "jss-gift-tier-header");
          header.appendChild(el("span", "jss-gift-tier-icon", "🎁"));
          header.appendChild(el("span", "jss-gift-tier-title", (gift.name || "Free Gift") + (gift.value ? " Worth " + fmt(gift.value, sym) : "")));
          var status = el("span", "jss-gift-tier-status");
          card.appendChild(header);
          card.appendChild(status);
          gTiersContainer.appendChild(card);
          tierEls.push({ card: card, status: status, gift: gift, marker: giftMarkers[i] });
        });
      } else {
        gTiersContainer.hidden = true;
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
          var left = el("div", "jss-hero-gift-left");
          left.appendChild(el("p", "jss-hero-gift-name", gift.name || "Free Exclusive Gift"));
          left.appendChild(el("p", "jss-hero-gift-tagline", "(Exclusive Gift just for you)"));
          card.appendChild(left);
          if (gift.image) {
            var center = el("div", "jss-hero-gift-center");
            var img = document.createElement("img");
            img.className = "jss-hero-gift-img";
            img.src = gift.image;
            img.alt = (gift.name || "Free gift") + " thumbnail";
            img.width = 40;
            img.height = 40;
            center.appendChild(img);
            card.appendChild(center);
          }
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
        var grid = card.parentElement;
        var gridRect = grid.getBoundingClientRect();
        var cardRect = card.getBoundingClientRect();

        popover.style.visibility = "hidden";
        popover.hidden = false;
        var popRect = popover.getBoundingClientRect();

        var top = cardRect.top - gridRect.top - popRect.height - 10;
        if (top < 0) top = cardRect.bottom - gridRect.top + 10;

        var left = cardRect.left - gridRect.left;
        var maxLeft = Math.max(0, gridRect.width - popRect.width);
        left = Math.max(0, Math.min(left, maxLeft));

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
        popover.querySelector("[data-jss-popover-bonus-note]").textContent = "(pro-rated benefit for early redemption)";
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
        // Gift value is a promotional benefit only, never folded into totalBenefit.
        var benefit = contrib + bonus;
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

        tierEls.forEach(function (t) {
          var unlocked = isGiftEligible(t.gift, val);
          t.card.setAttribute("data-unlocked", unlocked ? "true" : "false");
          if (unlocked) {
            t.status.textContent = "Included in your plan";
          } else if (t.gift.maximumContributionToUnlock != null && val > t.gift.maximumContributionToUnlock) {
            t.status.textContent = "Only available up to " + fmt(t.gift.maximumContributionToUnlock, sym) + "/mo";
          } else {
            t.status.textContent = "Add " + fmt(amountToUnlock(t.gift, val), sym) + " to unlock";
          }
          if (t.marker) t.marker.setAttribute("data-active", unlocked ? "true" : "false");
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
            var jewelleryWorth = totalPayment + bonusBenefit;

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

      function openModal() {
        modal.hidden = false;
        modalBackdrop.hidden = false;
        document.body.style.overflow = "hidden";
      }

      function closeModal() {
        modal.hidden = true;
        modalBackdrop.hidden = true;
        document.body.style.overflow = "";
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
        var ph = phRaw ? (phRaw.charAt(0) === "+" ? phRaw : "+91" + phRaw) : "";
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
