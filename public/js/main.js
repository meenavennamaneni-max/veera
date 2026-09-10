/* Microsoft PowerPoint — C3-A landing page
   Scroll reveals · nav state · hero 3D tilt (all guarded, progressive) */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---------- scroll reveal ---------- */
  var els = Array.prototype.slice.call(document.querySelectorAll(".reveal"));

  if (reduced || !("IntersectionObserver" in window)) {
    els.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -36px 0px" }
    );
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- nav: solidify after scroll ---------- */
  var nav = document.getElementById("nav");
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle("scrolled", window.scrollY > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- hero: pointer tilt on the slide stack ---------- */
  var stack = document.getElementById("stack");
  var stage = document.querySelector(".hero__stage");

  if (stack && stage && finePointer && !reduced) {
    var ticking = false;

    window.addEventListener(
      "pointermove",
      function (e) {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () {
          ticking = false;
          var nx = e.clientX / window.innerWidth - 0.5;  // -0.5 … 0.5
          var ny = e.clientY / window.innerHeight - 0.5;
          var ry = -14 + nx * 10; // deg
          var rx = 9 - ny * 10;
          stack.style.setProperty("--ry", ry.toFixed(2) + "deg");
          stack.style.setProperty("--rx", rx.toFixed(2) + "deg");
        });
      },
      { passive: true }
    );
  }
})();
