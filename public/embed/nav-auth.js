/**
 * Drop this on your marketing website (any domain):
 *
 * <a id="tf-login" href="https://app.tidyflowapp.com/login">Login</a>
 * <script
 *   src="https://app.tidyflowapp.com/embed/nav-auth.js"
 *   data-selector="#tf-login"
 *   data-login-label="Login"
 *   data-dashboard-label="Go to dashboard"
 *   async
 * ></script>
 *
 * When the visitor has an app session, the link text becomes "Go to dashboard"
 * (or "Go to billing") and href updates accordingly.
 */
;(function () {
  var script = document.currentScript
  if (!script) return

  var selector = script.getAttribute("data-selector") || "#tf-login, a[href*='/login']"
  var loginLabel = script.getAttribute("data-login-label") || "Login"
  var dashboardLabel = script.getAttribute("data-dashboard-label") || "Go to dashboard"
  var billingLabel = script.getAttribute("data-billing-label") || "Go to billing"
  var appOrigin =
    script.getAttribute("data-app-origin") ||
    (script.src ? script.src.replace(/\/embed\/nav-auth\.js.*$/, "") : "https://app.tidyflowapp.com")

  function apply(target, payload) {
    if (!target || !payload) return
    if (payload.loggedIn) {
      target.textContent =
        payload.portal === "customer" ? billingLabel : payload.label || dashboardLabel
      target.setAttribute("href", payload.href || payload.workspaceHref || appOrigin + "/login")
      target.setAttribute("data-tf-logged-in", "1")
    } else {
      target.textContent = loginLabel
      target.setAttribute("href", payload.href || appOrigin + "/login")
      target.removeAttribute("data-tf-logged-in")
    }
  }

  function targets() {
    try {
      return Array.prototype.slice.call(document.querySelectorAll(selector))
    } catch (e) {
      return []
    }
  }

  function onMessage(event) {
    if (!event || !event.data || event.data.source !== "tidyflow-nav-auth") return
    // Only accept messages from the app origin when possible
    if (event.origin && appOrigin && event.origin !== appOrigin) {
      try {
        if (new URL(event.origin).hostname !== new URL(appOrigin).hostname) return
      } catch (e) {
        return
      }
    }
    targets().forEach(function (el) {
      apply(el, event.data)
    })
  }

  window.addEventListener("message", onMessage)

  var iframe = document.createElement("iframe")
  iframe.src = appOrigin + "/embed/nav-auth"
  iframe.title = "TidyFlow auth"
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.cssText =
    "position:absolute;width:0;height:0;border:0;clip:rect(0,0,0,0);overflow:hidden;"
  document.body ? document.body.appendChild(iframe) : window.addEventListener("DOMContentLoaded", function () {
    document.body.appendChild(iframe)
  })
})()
