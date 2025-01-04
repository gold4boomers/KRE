try {
    importScripts(
        "content/bowser.js",
        "common/browser-polyfill.js",
        "background/background.js",
        "background/kar.js",
        "edge_chromium_variables_init.js",
        "katalon/constants.js",
        "katalon/edge_chromium_variables_default.js",
        "katalon/edge_chromium_common.js",
        "katalon/background.js"
    );
} catch (e) {
    console.log(e);
}