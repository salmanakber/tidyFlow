/**
 * Lightweight embed loader — same booking page as /book/{slug}?embed=1
 * Usage:
 * <div data-tidyflow-book="your-slug"></div>
 * <script src="https://your-app/embed/book.js" async></script>
 */
;(function () {
  function mount() {
    var nodes = document.querySelectorAll("[data-tidyflow-book]")
    nodes.forEach(function (el) {
      if (el.getAttribute("data-mounted") === "1") return
      var slug = el.getAttribute("data-tidyflow-book")
      if (!slug) return
      var origin = (document.currentScript && document.currentScript.src
        ? new URL(document.currentScript.src).origin
        : window.location.origin)
      var iframe = document.createElement("iframe")
      iframe.src = origin + "/book/" + encodeURIComponent(slug) + "?embed=1"
      iframe.title = "Book online"
      iframe.setAttribute("loading", "lazy")
      iframe.style.width = "100%"
      iframe.style.minHeight = el.getAttribute("data-height") || "780px"
      iframe.style.border = "0"
      iframe.style.borderRadius = "16px"
      iframe.style.display = "block"
      el.appendChild(iframe)
      el.setAttribute("data-mounted", "1")
    })
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount)
  } else {
    mount()
  }
})()
