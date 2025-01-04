if (typeof window.katalonSmartLocator == "undefined") {
  const KatalonSmartLocator = function() {
    this.window = window
  };

  (function katalon_smart_locator_do_start() {
    window.katalonSmartLocator = new KatalonSmartLocator();
  })();

  KatalonSmartLocator.prototype.find_element_by_smart_locator = function(
    locator
  ) {
    var injectedScript = new window.katalonpw.InjectedScript(
      window,
      false,
      "javascript",
      "testId",
      1,
      "chrome",
      []
    );
    return injectedScript.querySelector(
      injectedScript.parseSelector(locator),
      document.body
    );
  }
}
