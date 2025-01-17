/*
 * Copyright 2005 Shinya Kasatani
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */



//only implement if no native implementation is available
if (!Array.isArray) {
    Array.isArray = function (obj) {
        return Object.prototype.toString.call(obj) === '[object Array]';
    }
};


function KULocatorBuilders(window) {
    this.window = window;
    //this.log = new Log("LocatorBuilders");
}

KULocatorBuilders.prototype.detach = function() {
    if (this.window._locator_pageBot) {
        //this.log.debug(this.window);
        this.window._locator_pageBot = undefined;
        // Firefox 3 (beta 5) throws "Security Manager vetoed action" when we use delete operator like this:
        // delete this.window._locator_pageBot;
    }
};

KULocatorBuilders.prototype.pageBot = function() {
    var pageBot = this.window._locator_pageBot;
    if (pageBot == null) {
        //pageBot = BrowserBot.createForWindow(this.window);
        pageBot = new MozillaBrowserBot(this.window);
        var self = this;
        pageBot.getCurrentWindow = function() {
            return self.window;
        };
        this.window._locator_pageBot = pageBot;
    }
    return pageBot;
};

KULocatorBuilders.prototype.buildWith = function(name, e, opt_contextNode) {
    return KULocatorBuilders.builderMap[name].call(this, e, opt_contextNode);
};

KULocatorBuilders.prototype.elementEquals = function(name, e, locator) {
    var fe = this.findElement(locator);
    //TODO: add match function to the ui locator builder, note the inverted parameters
    return (e == fe) || (KULocatorBuilders.builderMap[name] && KULocatorBuilders.builderMap[name].match && KULocatorBuilders.builderMap[name].match(e, fe));
};

KULocatorBuilders.prototype.build = function(e) {
    var locators = this.buildAll(e);
    if (locators.length > 0) {
        return locators[0][0];
    } else {
        return "LOCATOR_DETECTION_FAILED";
    }
};

KULocatorBuilders.prototype.buildAll = function(el) {
    var e = core.firefox.unwrap(el); //Samit: Fix: Do the magic to get it to work in Firefox 4
    var xpathLevel = 0;
    var maxLevel = 10;
    var buildWithResults;
    var locators = {};
    //this.log.debug("getLocator for element " + e);
    var coreLocatorStrategies = this.pageBot().locationStrategies;
    for (var i = 0; i < KULocatorBuilders.order.length; i++) {
        var finderName = KULocatorBuilders.order[i];
        var locatorResults = []; // Array to hold buildWith results
        //this.log.debug("trying " + finderName);
        try {
            buildWithResults = this.buildWith(finderName, e);

            // If locator is an array then dump its element in a new array
            if (Array.isArray(buildWithResults)) {
                for (var j = 0; j < buildWithResults.length; j++) {
                    locatorResults.push(buildWithResults[j]);
                }
            } else {
                locatorResults.push(buildWithResults);
            }

            for (var j = 0; j < locatorResults.length; j++) {
                var thisLocator = locatorResults[j];

                if (thisLocator) {
                    thisLocator = String(thisLocator);
                    //this.log.debug("locator=" + locator);        
                    // test the locator. If a is_fuzzy_match() heuristic function is
                    // defined for the location strategy, use it to determine the
                    // validity of the locator's results. Otherwise, maintain existing
                    // behavior.
                    //      try {
                    //        //alert(PageBot.prototype.locateElementByUIElement);
                    //        //Samit: The is_fuzzy_match stuff is buggy - comparing builder name with a locator name usually results in an exception :(
                    //        var is_fuzzy_match = this.pageBot().locationStrategies[finderName].is_fuzzy_match;
                    //        if (is_fuzzy_match) {
                    //          if (is_fuzzy_match(this.findElement(locator), e)) {
                    //            locators.push([ locator, finderName ]);
                    //          }
                    //        }
                    //        else {
                    //          if (e == this.findElement(locator)) {
                    //            locators.push([ locator, finderName ]);
                    //          }
                    //        }
                    //      }
                    //      catch (exception) {
                    //        if (e == this.findElement(locator)) {
                    //          locators.push([ locator, finderName ]);
                    //        }
                    //      }

                    //Samit: The following is a quickfix for above commented code to stop exceptions on almost every locator builder
                    //TODO: the builderName should NOT be used as a strategy name, create a feature to allow locatorBuilders to specify this kind of behaviour
                    //TODO: Useful if a builder wants to capture a different element like a parent. Use the this.elementEquals
                    if (el.getRootNode() instanceof ShadowRoot) {
                        if(!locators[finderName]) {
                            locators[finderName] = [];
                        }
                        locators[finderName].push(thisLocator);
                    }
                    else if (finderName != 'tac') {
                        var fe = this.findElement(thisLocator);
                        if ((e == fe) || (coreLocatorStrategies[finderName] && coreLocatorStrategies[finderName].is_fuzzy_match 
                            && coreLocatorStrategies[finderName].is_fuzzy_match(fe, e))) {                            
                            if(!locators[finderName]){
                                locators[finderName] = [];
                            }
                            locators[finderName].push(thisLocator);
                        }
                    }
                }
            }
        } catch (e) {
            // TODO ignore the buggy locator builder for now
            //this.log.debug("locator exception: " + e);
        }
    }
    return locators;
};

KULocatorBuilders.prototype.findElement = function(locator) {
    try {
        return this.pageBot().findElement(locator);
    } catch (error) {
        //this.log.debug("findElement failed: " + error + ", locator=" + locator);
        return null;
    }
};

/*
 * Class methods
 */

KULocatorBuilders.order = [];

KULocatorBuilders.builderMap = {};
KULocatorBuilders._preferredOrder = [];

// NOTE: for some reasons we does not use this part
// classObservable(LocatorBuilders);

KULocatorBuilders.add = function(name, finder) {
    if (this.order.indexOf(name) < 0) {
        this.order.push(name);
    }
    this.builderMap[name] = finder;
    this._orderChanged();
};

/**
 * Call when the order or preferred order changes
 */
KULocatorBuilders._orderChanged = function() {
    var changed = this._ensureAllPresent(this.order, this._preferredOrder);
    this._sortByRefOrder(this.order, this._preferredOrder);
    if (changed) {
        // NOTE: for some reasons we does not use this part 
        // this.notify('preferredOrderChanged', this._preferredOrder);
    }
};

/**
 * Set the preferred order of the locator builders
 *
 * @param preferredOrder can be an array or a comma separated string of names
 */
KULocatorBuilders.setPreferredOrder = function(preferredOrder) {
    if (typeof preferredOrder === 'string') {
        this._preferredOrder = preferredOrder.split(',');
    } else {
        this._preferredOrder = preferredOrder;
    }
    this._orderChanged();
};

/**
 * Returns the locator builders preferred order as an array
 */
KULocatorBuilders.getPreferredOrder = function() {
    return this._preferredOrder;
};

/**
 * Sorts arrayToSort in the order of elements in sortOrderReference
 * @param arrayToSort
 * @param sortOrderReference
 */
KULocatorBuilders._sortByRefOrder = function(arrayToSort, sortOrderReference) {
    var raLen = sortOrderReference.length;
    arrayToSort.sort(function(a, b) {
        var ai = sortOrderReference.indexOf(a);
        var bi = sortOrderReference.indexOf(b);
        return (ai > -1 ? ai : raLen) - (bi > -1 ? bi : raLen);
    });
};

/**
 * Function to add to the bottom of destArray elements from source array that do not exist in destArray
 * @param sourceArray
 * @param destArray
 */
KULocatorBuilders._ensureAllPresent = function(sourceArray, destArray) {
    var changed = false;
    sourceArray.forEach(function(e) {
        if (destArray.indexOf(e) == -1) {
            destArray.push(e);
            changed = true;
        }
    });
    return changed;
};

/*
 * Utility function: Encode XPath attribute value.
 */
KULocatorBuilders.prototype.attributeValue = function(value) {
    if (value.indexOf("'") < 0) {
        return "'" + value + "'";
    } else if (value.indexOf('"') < 0) {
        return '"' + value + '"';
    } else {
        var result = 'concat(';
        var part = "";
        while (true) {
            var apos = value.indexOf("'");
            var quot = value.indexOf('"');
            if (apos < 0) {
                result += "'" + value + "'";
                break;
            } else if (quot < 0) {
                result += '"' + value + '"';
                break;
            } else if (quot < apos) {
                part = value.substring(0, apos);
                result += "'" + part + "'";
                value = value.substring(part.length);
            } else {
                part = value.substring(0, quot);
                result += '"' + part + '"';
                value = value.substring(part.length);
            }
            result += ',';
        }
        result += ')';
        return result;
    }
};

KULocatorBuilders.prototype.xpathHtmlElement = function(name) {
    if (this.window.document.contentType == 'application/xhtml+xml') {
        // "x:" prefix is required when testing XHTML pages
        return "x:" + name;
    } else {
        return name;
    }
};

KULocatorBuilders.prototype.relativeXPathFromParent = function(current) {
    var index = this.getNodeNbr(current);
    var currentPath = '/' + this.xpathHtmlElement(current.nodeName.toLowerCase());
    if (index > 0) {
        currentPath += '[' + (index + 1) + ']';
    }
    return currentPath;
};

KULocatorBuilders.prototype.getNodeNbr = function(current) {
    var childNodes = current.parentNode.childNodes;
    var total = 0;
    var index = -1;
    for (var i = 0; i < childNodes.length; i++) {
        var child = childNodes[i];
        if (child.nodeName == current.nodeName) {
            if (child == current) {
                index = total;
            }
            total++;
        }
    }
    return index;
};

KULocatorBuilders.prototype.getCSSSubPath = function(e) {
    var css_attributes = ['id', 'name', 'class', 'type', 'alt', 'title', 'value'];
    for (var i = 0; i < css_attributes.length; i++) {
        var attr = css_attributes[i];
        var value = e.getAttribute(attr);
        value = value ? value.trim() : value;
        if (value) {
            if (attr == 'id')
                return '#' + value;
            if (attr == 'class')
                return e.nodeName.toLowerCase() + '.' + value.replace(/\s+/g, ".").replace("..", ".");
            return e.nodeName.toLowerCase() + '[' + attr + '="' + value + '"]';
        }
    }
    if (this.getNodeNbr(e)) {
        var index = this.getNodeNbr(e) + 1;
        return e.nodeName.toLowerCase() + ':nth-of-type(' + index + ')';
    } else {
        return e.nodeName.toLowerCase();
    }
};

KULocatorBuilders.prototype.preciseXPath = function(xpath, e) {
    //only create more precise xpath if needed
    if (this.findElement(xpath) != e) {
        var result = e.ownerDocument.evaluate(xpath, e.ownerDocument, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        //skip first element (result:0 xpath index:1)
        for (var i = 0, len = result.snapshotLength; i < len; i++) {
            var newPath = 'xpath=(' + xpath + ')[' + (i + 1) + ']';
            if (this.findElement(newPath) == e) {
                return newPath;
            }
        }
    }
    return xpath;
}

KULocatorBuilders.prototype.generateSmartLocator = function(element) {
    try {
        var injectedScript = new window.katalonpw.InjectedScript(
            window,
            false,
            "javascript",
            "testId",
            1,
            "chrome",
            []
        );
        var selector = injectedScript.generateSelector(element);
        return selector;
    } catch (e) {
        console.log(e);
        return null;
    }
}

/*
 * ===== builders =====
 */

KULocatorBuilders.add('ui', function(pageElement) {
    return UIMap.getInstance().getUISpecifierString(pageElement,
        this.window.document);
});

KULocatorBuilders.add('id', function(e) {
    if (e.id) {
        return 'id=' + e.id;
    }
    return null;
});

KULocatorBuilders.add('link', function(e) {
    if (e.nodeName == 'A') {
        var text = e.textContent;
        if (!text.match(/^\s*$/)) {
            return "link=" + exactMatchPattern(text.replace(/\xA0/g, " ").replace(/^\s*(.*?)\s*$/, "$1"));
        }
    }
    return null;
});

KULocatorBuilders.add('name', function(e) {
    if (e.name) {
        return 'name=' + e.name;
    }
    return null;
});

/*
 * This function is called from DOM locatorBuilders
 */
KULocatorBuilders.prototype.findDomFormLocator = function(form) {
    if (form.hasAttribute('name')) {
        var name = form.getAttribute('name');
        var locator = "document." + name;
        if (this.findElement(locator) == form) {
            return locator;
        }
        locator = "document.forms['" + name + "']";
        if (this.findElement(locator) == form) {
            return locator;
        }
    }
    var forms = this.window.document.forms;
    for (var i = 0; i < forms.length; i++) {
        if (form == forms[i]) {
            return "document.forms[" + i + "]";
        }
    }
    return null;
};

KULocatorBuilders.add('dom:name', function(e) {
    if (e.form && e.name) {
        var formLocator = this.findDomFormLocator(e.form);
        if (formLocator) {
            var candidates = [formLocator + "." + e.name,
            formLocator + ".elements['" + e.name + "']"
            ];
            for (var c = 0; c < candidates.length; c++) {
                var locator = candidates[c];
                var found = this.findElement(locator);
                if (found) {
                    if (found == e) {
                        return locator;
                    } else if (found instanceof NodeList) {
                        // multiple elements with same name
                        for (var i = 0; i < found.length; i++) {
                            if (found[i] == e) {
                                return locator + "[" + i + "]";
                            }
                        }
                    }
                }
            }
        }
    }
    return null;
});

KULocatorBuilders.add('xpath:link', function(e) {
    if (e.nodeName == 'A') {
        var text = e.textContent;
        if (!text.match(/^\s*$/)) {
            return this.preciseXPath("//" + this.xpathHtmlElement("a") + "[contains(text(),'" + text.replace(/^\s+/, '').replace(/\s+$/, '') + "')]", e);
        }
    }
    return null;
});

KULocatorBuilders.add('xpath:img', function(e) {
    if (e.nodeName == 'IMG') {
        if (e.alt != '') {
            return this.preciseXPath("//" + this.xpathHtmlElement("img") + "[@alt=" + this.attributeValue(e.alt) + "]", e);
        } else if (e.title != '') {
            return this.preciseXPath("//" + this.xpathHtmlElement("img") + "[@title=" + this.attributeValue(e.title) + "]", e);
        } else if (e.src != '') {
            return this.preciseXPath("//" + this.xpathHtmlElement("img") + "[contains(@src," + this.attributeValue(e.src) + ")]", e);
        }
    }
    return null;
});

KULocatorBuilders.add('xpath:attributes', function(e) {
    const PREFERRED_ATTRIBUTES = ['id', 'name', 'value', 'type', 'action', 'onclick'];
    var i = 0;

    function attributesXPath(name, attNames, attributes) {
        var locator = "//" + this.xpathHtmlElement(name) + "[";
        for (i = 0; i < attNames.length; i++) {
            if (i > 0) {
                locator += " and ";
            }
            var attName = attNames[i];
            locator += '@' + attName + "=" + this.attributeValue(attributes[attName]);
        }
        locator += "]";
        return this.preciseXPath(locator, e);
    }

    if (e.attributes) {
        var atts = e.attributes;
        var attsMap = {};
        for (i = 0; i < atts.length; i++) {
            var att = atts[i];
            attsMap[att.name] = att.value;
        }
        var names = [];
        // try preferred attributes
        for (i = 0; i < PREFERRED_ATTRIBUTES.length; i++) {
            var name = PREFERRED_ATTRIBUTES[i];
            if (attsMap[name] != null) {
                names.push(name);
                var locator = attributesXPath.call(this, e.nodeName.toLowerCase(), names, attsMap);
                if (e == this.findElement(locator)) {
                    return locator;
                }
            }
        }
    }
    return null;
});

KULocatorBuilders.add('xpath:idRelative', function(e) {
    var path = '';
    var current = e;
    while (current != null) {
        if (current.parentNode != null) {
            path = this.relativeXPathFromParent(current) + path;
            if (1 == current.parentNode.nodeType && // ELEMENT_NODE
                current.parentNode.getAttribute("id")) {
                return this.preciseXPath("//" + this.xpathHtmlElement(current.parentNode.nodeName.toLowerCase()) +
                    "[@id=" + this.attributeValue(current.parentNode.getAttribute('id')) + "]" +
                    path, e);
            }
        } else {
            return null;
        }
        current = current.parentNode;
    }
    return null;
});

KULocatorBuilders.add('xpath:href', function(e) {
    if (e.attributes && e.hasAttribute("href")) {
        href = e.getAttribute("href");
        if (href.search(/^http?:\/\//) >= 0) {
            return this.preciseXPath("//" + this.xpathHtmlElement("a") + "[@href=" + this.attributeValue(href) + "]", e);
        } else {
            // use contains(), because in IE getAttribute("href") will return absolute path
            return this.preciseXPath("//" + this.xpathHtmlElement("a") + "[contains(@href, " + this.attributeValue(href) + ")]", e);
        }
    }
    return null;
});

KULocatorBuilders.add('dom:index', function(e) {
    if (e.form) {
        var formLocator = this.findDomFormLocator(e.form);
        if (formLocator) {
            var elements = e.form.elements;
            for (var i = 0; i < elements.length; i++) {
                if (elements[i] == e) {
                    return formLocator + ".elements[" + i + "]";
                }
            }
        }
    }
    return null;
});

KULocatorBuilders.add('xpath:position', function(e, opt_contextNode) {
    //this.log.debug("positionXPath: e=" + e);
    var path = '';
    var current = e;
    while (current != null && current != opt_contextNode) {
        var currentPath;
        if (current.parentNode != null) {
            currentPath = this.relativeXPathFromParent(current);
        } else {
            currentPath = '/' + this.xpathHtmlElement(current.nodeName.toLowerCase());
        }
        path = currentPath + path;
        var locator = '/' + path;
        if (e == this.findElement(locator)) {
            return locator;
        }
        current = current.parentNode;
        //this.log.debug("positionXPath: current=" + current);
    }
    return null;
});

KULocatorBuilders.add('css', function (e) {
    var current = e;
    var sub_path = this.getCSSSubPath(e);
    while (current.parentElement && this.findElement("css=" + sub_path) != e && current.nodeName.toLowerCase() != 'html') {
        sub_path = this.getCSSSubPath(current.parentElement) + ' > ' + sub_path;
        current = current.parentElement;
    }
    return "css=" + sub_path;
});

KULocatorBuilders._preferredOrder = ['xpath:neighbor'];

KULocatorBuilders.add('xpath:neighbor', function (e){
    // Because Record/Spy always display instruction so sometimes think instruction is neighbor. This is reason we remove it
    var neighborXpaths = neighborXpathsGenerator.getXpathsByNeighbors(e, true);
    // Regex for Record
    const recordObjectReg = new RegExp(/.*=concat.*/);
    // Regex for Spy
    const captureObjectReg = new RegExp(/.*Capture object:.*/);
    const altReg = new RegExp(/.*'Alt'.*/);
    var newNeighborXpaths = []
    neighborXpaths.forEach((neighbor) => {
        if (!recordObjectReg.test(neighbor) && !captureObjectReg.test(neighbor) && !altReg.test(neighbor)) {
            newNeighborXpaths.push(neighbor);
        }
    })
    return newNeighborXpaths;
});

// For common.js to use
var ku_locatorbuilders = new KULocatorBuilders(window);