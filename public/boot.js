// Runs before the app loads. The public pages (the client's online form, the sign-in page) have no sidebar,
// so they show placeholders shaped like their own content while loading instead of the signed-in layout.
(function () {
  var path = location.pathname;
  if (path.indexOf("/forms/") === 0) document.documentElement.setAttribute("data-boot", "form");
  else if (path.indexOf("/login") === 0 || path.indexOf("/set-password/") === 0) document.documentElement.setAttribute("data-boot", "login");
})();
