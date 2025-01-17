var CONNECTING_ERROR_MESSAGE = "Cannot connect to Katalon Server. Make sure you have started Object Spy on Katalon application."

var registeredRequest = false;
var requestId = 0;
var katalonServer;
var clientId = -1;
var REQUEST_SEPARATOR = "_|_";

var clientSocket = null;
var runMode = RUN_MODE_IDLE;
var runData = {};

var curTabID = 0;
var curWinID = 0;

var version = null;

chrome.tabs.onActivated.addListener(function(activeInfo) {
    if (clientSocket !== null) {
        return;
    }
    curTabID = activeInfo.tabId;
    curWinID = activeInfo.windowId;
});

chrome.windows.onFocusChanged.addListener(function (windowId) {
    if (clientSocket !== null || windowId === chrome.windows.WINDOW_ID_NONE) {
        return;
    }
    curWinID = windowId;
});

chrome.windows.onCreated.addListener(function () {
    setCurrentWindow();
})

var injectIntoTab = function (tab, scripts) {
    browser.scripting.executeScript({
        target: { tabId: tab.id },
        files: scripts
    });
}

function processXHTTPAction(request, callback) {
    if (!clientSocket) {
        return;
    }
    console.log(request.data);
    var object = request.data.obj;
    var keyword = request.data.keyword;
    var mode = request.data.mode;

    if(mode == 'INSPECT'){

        clientSocket.send(keyword + "=" +  encodeURIComponent(JSON.stringify(object)));

    }else if (mode == 'RECORD'){

        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if(tabs && tabs[0] && tabs[0].id){
                object['action']['windowId'] = tabs[0].id;
                clientSocket.send(keyword + "=" +  encodeURIComponent(JSON.stringify(object)));
            }
        });        
    }

    callback();
}

function findElementInTab(xpathExpression, callbackWhenSuccess) {
    var found = false;

    chrome.tabs.query({}, function (tabs) {
        for (i = 0; i < tabs.length && found == false; ++i) {
            var tabUrl = tabs[i].url;
            if (tabUrl == null || (tabUrl.indexOf('http') != 0 && tabUrl.indexOf('file') != 0)) {
                continue;
            }
            var tabId = tabs[i].id;
            chrome.tabs.sendMessage(tabId, {
                srcTabId: tabId,
                request: 'KATALON_FIND_OBJECT',
                xpath: xpathExpression
            }, function (response) {
                if (response != undefined && response.found) {
                    callbackWhenSuccess(response.tabId);
                }
            });
        }
    });
}

function activeBrowserAndFlashElement(tabResult, xpathExpression) {
    chrome.tabs.update(tabResult, {
        highlighted: true
    }, function (tab) {
        chrome.tabs.get(tabResult, function (tab) {
            chrome.windows.update(tab.windowId, {
                focused: true
            }, function () {
                chrome.tabs.sendMessage(tabResult, {
                    request: 'KATALON_FLASH_OBJECT',
                    xpath: xpathExpression
                });
            });
        });
    });
}

function highlightObject(xpathExpression) {
    findElementInTab(xpathExpression, function (tabResult) {
        activeBrowserAndFlashElement(tabResult, xpathExpression);
    });
}

function findObject(xpathExpression) {
    findElementInTab(xpathExpression, function (tabId) {
        sendRequest("FOUND", true);
    });

}

function startSendRequest(request) {
    if (registeredRequest) {
        return;
    }
    registeredRequest = true;
    katalonServer = request.url;
    setInterval(function () {
        sendRequest("GET_REQUEST", true);
    }, 200);
}

function sendRequest(request, waitAnswer) {
    try {
        var xhttp = new XMLHttpRequest();

        if (waitAnswer) {
            xhttp.onerror = function () {
                clientId = -1;
                requestId = -1;
            }
            xhttp.onreadystatechange = function () {
                if (xhttp.readyState == 4 && xhttp.status == 200 && xhttp.responseText != "NO_REQUEST") {
                    var requestParts = xhttp.responseText.split(REQUEST_SEPARATOR)

                    if (clientId == -1 || isNaN(clientId)) {
                        clientId = parseInt(xhttp.responseText);
                        return;
                    }
                    if (requestParts.lenngth < 3) {
                        return;
                    }
                    requestId = parseInt(requestParts[0]);
                    var requestType = requestParts[1];
                    var requestData = (requestParts[2]);
                    processRequest(requestType, requestData);
                }
            };
        }

        if (clientId == -1 || isNaN(clientId)) {
            clientId = -1;
            request = "GET_CLIENT_ID";
        }
        if (isNaN(requestId)) {
            requestId = -1;
        }

        xhttp.open("POST", katalonServer, true);
        xhttp.send(request + "=" + clientId + REQUEST_SEPARATOR + requestId);
    } catch (ex) {
        console.log(ex);
    }
}

function processRequest(requestType, requestData) {
    if (requestType == "FIND_TEST_OBJECT") {
        findObject(requestData);
    } else if (requestType == "HIGHLIGHT_TEST_OBJECT") {
        highlightObject(requestData);
    }
}

chrome.runtime.onMessage.addListener(function (request, sender, callback) {
    if (request.action == XHTTP_ACTION) {
        processXHTTPAction(request, callback);
    } else if (request.action == "GET_REQUEST") {
        // startSendRequest(request);
    } else if (request.action == CHECK_ADDON_START_STATUS) {
        callback({
            runMode: runMode,
            data: runData,
            version: version
        })
    }
    return true; // prevents the callback from being called too early on

});

function waitForConnection() {
    if (clientSocket) {
        return;
    }
    tryToConnect();
}

function tryToConnect() {
    getKatalonServerPort(function (port) {
        var socketUrl = "ws://localhost:" + port + "/";
        console.log("Try to connect to Katalon Studio at " + socketUrl);
        try {
            var tempSocket = new WebSocket(socketUrl);
            tempSocket.onmessage = function (event) {
                console.log("Received message from Katalon Studio: \"" + event.data + "\"");
                handleServerMessage(event.data);
            }
            tempSocket.onopen = function (event) {
                console.log("Connected to Katalon Studio");
                clientSocket = tempSocket;
                clientSocket.onclose = function (event) {
                    console.log("Connection closed - Try to connect again...");
                    clientSocket = null;
                    stopAddon();
                    setTimeout(tryToConnect, 300);
                }
            }
            tempSocket.onerror = function (event) {
                console.log("Error Connecting - Try again...");
                setTimeout(tryToConnect, 300);
            }
        } catch (e) {
            console.log("Error Initializing - Try again... ");
            setTimeout(tryToConnect, 300);
        }

    });
}

function handleServerMessage(message) {
    if (clientSocket == null || !message) {
        return;
    }
    var jsonMessage = JSON.parse(message);
    var a = null;

    switch (jsonMessage.command) {
        case REQUEST_BROWSER_INFO:
            console.log("Sending browser info");
            var message = {
                command: BROWSER_INFO,
                data: {
                    browserName : bowser.name,
                    version: (jsonMessage.data && jsonMessage.data.currentVersionString) ? jsonMessage.data.currentVersionString : ""
                }
            }

            version = (jsonMessage.data && jsonMessage.data.currentVersionString) ? jsonMessage.data.currentVersionString : "";
            
            clientSocket.send(JSON.stringify(message));
            clientSocket.send(SELENIUM_SOCKET + "=true");
            break;
        case START_INSPECT:
            startAddon(RUN_MODE_OBJECT_SPY, jsonMessage.data, version);
            createMenus(RUN_MODE_OBJECT_SPY);
            break;
        case START_RECORD:
            startAddon(RUN_MODE_RECORDER, jsonMessage.data, version);
            createMenus(RUN_MODE_RECORDER);
            break;
        case HIGHLIGHT_OBJECT:
            if (!jsonMessage.data) {
                break;
            }
            highlightObject(jsonMessage.data);
            break;
    }

}

function startAddon(newRunMode, data, vers) {
    runMode = newRunMode;
    runData = data;
    chrome.tabs.query({}, function (tabs) {
        for (i = 0; i < tabs.length; ++i) {
            chrome.tabs.sendMessage(tabs[i].id, {
                action: START_ADDON,
                runMode: newRunMode,
                data: data,
                version: vers
            }, function () {
                // nothing here
            });
        }
    });
    focusOnWindow();
}

function setCurrentWindow() {
    chrome.windows.getCurrent(function (window) {
        curWinID = window.id;
    });
}

function focusOnWindow() {
    chrome.windows.update(curWinID, {
        focused: true
    });
}

function stopAddon() {
    runMode = RUN_MODE_IDLE;
    runData = {};
    version = null;
    chrome.tabs.query({}, function (tabs) {
        for (i = 0; i < tabs.length; ++i) {
            chrome.tabs.sendMessage(tabs[i].id, {
                action: STOP_ADDON
            }, function () {
                // nothing here
            });
        }
    });
}

chrome.runtime.onStartup.addListener(function () {
    setCurrentWindow();
    waitForConnection();
});

chrome.runtime.onInstalled.addListener(function (details) {
    waitForConnection();    
});

function createMenus(mode) {
    function createContextMenu (id, title, action) {
        browser.contextMenus.create ({
            id: id,
            title: title,
            documentUrlPatterns: ["<all_urls>"],
            contexts: ["all"],
        });
    }

    function createSeparator () {
        browser.contextMenus.create ({
            type: SEPARATOR,
            documentUrlPatterns: ["<all_urls>"],
            contexts: ["all"],
        });
    }

    if (mode === RUN_MODE_OBJECT_SPY) {
        createContextMenu(CAPTURE_OBJECT_ID, CAPTURE_OBJECT_STRING);
    } else if (mode === RUN_MODE_RECORDER) {
        createContextMenu(MOUSE_OVER_ID, MOUSE_OVER_STRING);

        createSeparator();

        createContextMenu(VERIFY_ELEMENT_TEXT_ID, VERIFY_ELEMENT_TEXT_STRING);
        createContextMenu(VERIFY_ELEMENT_PRESENT_ID, VERIFY_ELEMENT_PRESENT_STRING);
        createContextMenu(VERIFY_ELEMENT_NOT_PRESENT_ID, VERIFY_ELEMENT_NOT_PRESENT_STRING);
        createContextMenu(VERIFY_ELEMENT_VISIBLE_ID, VERIFY_ELEMENT_VISIBLE_STRING);
        createContextMenu(VERIFY_ELEMENT_NOT_VISIBLE_ID, VERIFY_ELEMENT_NOT_VISIBLE_STRING);
        createContextMenu(VERIFY_ELEMENT_CLICKABLE_ID, VERIFY_ELEMENT_CLICKABLE_STRING);
        createContextMenu(VERIFY_ELEMENT_NOT_CLICKABLE_ID, VERIFY_ELEMENT_NOT_CLICKABLE_STRING);

        createSeparator();

        createContextMenu(WAIT_FOR_ELEMENT_PRESENT_ID, WAIT_FOR_ELEMENT_PRESENT_STRING);
        createContextMenu(WAIT_FOR_ELEMENT_NOT_PRESENT_ID, WAIT_FOR_ELEMENT_NOT_PRESENT_STRING);
        createContextMenu(WAIT_FOR_ELEMENT_VISIBLE_ID, WAIT_FOR_ELEMENT_VISIBLE_STRING);
        createContextMenu(WAIT_FOR_ELEMENT_NOT_VISIBLE_ID, WAIT_FOR_ELEMENT_NOT_VISIBLE_STRING);
    }

}