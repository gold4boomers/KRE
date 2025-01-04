try {
    importScripts(
        "content/bowser.js",
        "common/browser-polyfill.js",
        "background/background.js",
        "background/kar.js",
        "chrome_variables_init.js",
        "katalon/constants.js",
        "katalon/chrome_variables_default.js",
        "katalon/chrome_common.js",
        "katalon/background.js"
    );
} catch (e) {
    console.log(e);
}