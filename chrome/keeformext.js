'use strict'

;(function () {

// #region debug

var debug = {
    OFF: 0, ASSERT: 1, ERROR: 2, WARN: 3, INFO: 4, LOG: 5, DEBUG: 6,
    set loglevel(level) {
        if (level === undefined)
            level = debug.OFF

        this.assert = level >= this.ASSERT ? console.assert.bind(self.console) : function() {}
        this.error  = level >= this.ERROR  ? console.error.bind(self.console)  : function() {}
        this.warn   = level >= this.WARN   ? console.warn.bind(self.console)   : function() {}
        this.info   = level >= this.INFO   ? console.info.bind(self.console)   : function() {}
        this.debug  = level >= this.DEBUG  ? console.debug.bind(self.console)  : function() {}
        this.log    = level >= this.LOG    ? console.log.bind(self.console)    : function() {}
        this.logLevel = level
    },
    get loglevel() { return this.logLevel }
}
debug.loglevel = debug.INFO

// #endregion

var padIds = function (tabId, frameId) {
    if (frameId === undefined) { frameId = "" }
    if (tabId   === undefined) { tabId   = "" }
    return tabId.toString().padStart(4, " ") + " " + frameId.toString().padStart(4, " ") + "  "
}

var keeform = function (obj) {
    if (obj instanceof keeform) return obj
    if (!(this instanceof keeform)) return new keeform(obj)
}

// Minimum host version required for this extension version.
const MIN_HOST_VERSION = '5.0.0'

// Set to true to re-enable encryption (requires keeform_crypto.js)
// Protocol v1 = plaintext, v2 = encrypted
keeform.encrypted = false
keeform.badgeColor = [0, 0, 255, 150]  // track current badge color for restore

keeform.loginTabs = []
keeform.settings  = {}

// Legacy fields — kept for keeform_crypto.js compatibility
keeform.passphrase = ""
keeform.utf16le    = false

// #region browser detection

// Detect browser name for native messaging host.
// Uses userAgentData for Chromium browsers (Chrome, Edge, Brave, Opera).
// Falls back to userAgent string for others.
keeform.detectBrowser = function() {
    if (self.navigator.userAgentData) {
        var brands = self.navigator.userAgentData.brands
        var known  = ['Google Chrome', 'Microsoft Edge', 'Brave', 'Opera', 'Chromium', 'Vivaldi']
        for (var i = 0; i < brands.length; i++) {
            if (known.indexOf(brands[i].brand) !== -1) {
                return brands[i].brand
            }
        }
        return 'Chromium'
    }
    var ua = self.navigator.userAgent
    if (ua.indexOf('Firefox') !== -1) return 'Firefox'
    if (ua.indexOf('Edg/')    !== -1) return 'Microsoft Edge'
    if (ua.indexOf('Chrome')  !== -1) return 'Google Chrome'
    return 'Unknown'
}

// #endregion

// #region icon helpers

keeform.greenIcon = function (tabId) {
    debug.log(padIds(tabId), 'greenIcon')
    chrome.tabs.get(tabId, function(tab) {
        if (chrome.runtime.lastError || !tab) return
        chrome.action.setIcon({path: 'icons/icon19o.png', tabId: tabId}, keeform.callback.bind({caller: 'greenIcon'}))
        chrome.action.setBadgeBackgroundColor({color: [0, 0, 0, 0], tabId: tabId})
        chrome.action.setBadgeText({text: '', tabId: tabId})
    })
}

keeform.resetIcon = function (tabId) {
    debug.log(padIds(tabId), 'resetIcon')
    chrome.tabs.get(tabId, function(tab) {
        if (chrome.runtime.lastError || !tab) return
        chrome.action.setIcon({path: 'icons/icon19.png', tabId: tabId}, keeform.callback.bind({caller: 'resetIcon'}))
        chrome.action.setBadgeBackgroundColor({color: keeform.badgeColor, tabId: tabId})
        chrome.action.setBadgeText({text: ' ', tabId: tabId})
    })
}

keeform.conslog = function () {}

// #endregion

// #region version check

keeform.versionOk = function(version, minimum) {
    var v = version.split('.').map(Number)
    var m = minimum.split('.').map(Number)
    for (var i = 0; i < 3; i++) {
        if ((v[i] || 0) > (m[i] || 0)) return true
        if ((v[i] || 0) < (m[i] || 0)) return false
    }
    return true
}

keeform.showVersionWarning = function(hostVersion) {
    debug.warn('host version too old:', hostVersion, '< required:', MIN_HOST_VERSION)
    keeform.badgeColor = [255, 29, 29, 220]
    chrome.action.setBadgeBackgroundColor({color: keeform.badgeColor})
    chrome.action.setBadgeText({text: ' '})
    chrome.notifications.create('keeform-version-' + Date.now(), {
        type:     "basic",
        title:    "KeeForm — update required",
        message:  "Your KeeForm Windows application (v" + hostVersion + ") is too old.\n" +
                  "Please download the latest version from keeform.org.\n" +
                  "Required: v" + MIN_HOST_VERSION,
        iconUrl:  "icons/error96.png",
        priority: 2
    }, function() {})
}

// #endregion

// #region plaintext credentials handler (v5 protocol)

keeform.handlePlaintextCredentials = function(creds) {
    debug.log(padIds(), 'handlePlaintextCredentials', creds.url, creds.username)

    chrome.storage.local.get({
        retrydelay:  2,
        retrynumber: 4,
        timeout:     20,
        repeat:      30,
        loglevel:    0
    }, function(items) {
        keeform.settings.retrydelay  = items.retrydelay
        keeform.settings.retrynumber = items.retrynumber
        keeform.settings.timeout     = items.timeout * 1000
        keeform.settings.repeat      = items.repeat * 1000
        keeform.settings.loglevel    = items.loglevel
        debug.loglevel               = items.loglevel

        var login = {
            url:      creds.url,
            username: creds.username,
            password: creds.password
        }

        debug.log(padIds(), 'keeform login', login.url, login.username)
        chrome.notifications.create('keeform', {
            type:     "basic",
            title:    "KeeForm",
            message:  login.username + "\n" + login.url,
            iconUrl:  "icons/tile96.png"
        }, keeform.closeNotification)

        keeform.windowTop(login)
    })
}

// #endregion

keeform.error = function() {
    chrome.notifications.create('keeform', {
        type:     "basic",
        title:    "KeeForm",
        message:  "Error: Data received not valid\nPlease check your password",
        iconUrl:  "icons/error96.png"
    }, keeform.closeNotification)
}

keeform.closeNotification = function(id) {
    setTimeout(() => chrome.notifications.clear(id, keeform.conslog), 3000)
}

keeform.windowTop = function(login) {
    debug.log(padIds(), 'windowTop', login.url)

    chrome.tabs.create({url: login.url}, function(tab) {
        if (tab === undefined) {
            debug.warn('windowTop tab undefined')
            return
        }
        debug.log(padIds(tab.id), 'windowTop:', tab.windowId)
        keeform.loginTabs.unshift({login: login, id: tab.id, navigated: false})

        ;(function(login, tab) {
            var navCompleted = async function(details) {
                var unique = tab.id
                if (details.tabId != unique) {
                    debug.debug(padIds(unique), 'navCompleted skip', details.tabId)
                    return
                }
                var index = keeform.loginTabs.findIndex(t => t.id === details.tabId)
                if (index == -1) {
                    debug.debug(padIds(unique, details.tabId), 'not a keeform tab')
                    return
                }
                debug.log(padIds(unique), '_____ navCompleted', details.url.substr(0, 80))
                if (details.url == "about:blank") {
                    debug.log(padIds(tab.id), 'url is', details.url)
                    return
                }
                keeform.greenIcon(tab.id)
                login.tries   = keeform.settings.retrynumber
                login.delay   = keeform.settings.retrydelay
                await new Promise(resolve => setTimeout(resolve, 500))
                keeform.executeScripts({
                    tabId:   details.tabId,
                    frameId: details.frameId,
                    files:   ['keeform.js']
                }, function() {
                    debug.log(padIds(details.tabId, details.frameId), 'sending login data', login.url, login.username)
                    login.frameId  = details.frameId
                    login.tabId    = details.tabId
                    login.loglevel = debug.loglevel
                    chrome.tabs.sendMessage(details.tabId, login, {frameId: details.frameId}, keeform.response)
                })
            }
            debug.log(padIds(tab.id), 'adding listener', login.url.substr(0, 80))
            keeform.loginTabs[0].navCompleted = navCompleted
            chrome.webNavigation.onCompleted.addListener(navCompleted)
            setTimeout(function() {
                var tabId = tab.id
                var url   = login.url
                if (chrome.webNavigation.onCompleted.hasListener(navCompleted)) {
                    debug.info('%s %cremoveListener webNavigation timeout %d %s', padIds(tabId), "background-color: blue; color: white;", tab.id, url)
                    chrome.webNavigation.onCompleted.removeListener(navCompleted)
                }
            }, keeform.settings.timeout)
        })(login, tab)

        keeform.loginTabs[0].repeatTimer = setTimeout(function() {
            var tabId = tab.id
            debug.log(padIds(tabId), 'disable repeat for tab', tab.id)
            var index = keeform.loginTabs.findIndex(t => t.id === tab.id)
            if (index != -1) {
                keeform.loginTabs[index].login = ''
                keeform.loginTabs[index].repeatTimer = null
            }
            keeform.resetIcon(tabId)
        }, keeform.settings.repeat)

        debug.log(padIds(tab.id), 'Window to front!', tab.windowId)
        chrome.tabs.update(tab.id, {active: true}, keeform.callback.bind({caller: 'tabs.update'}))
        chrome.windows.update(tab.windowId, {focused: true}, keeform.callback.bind({caller: 'windows.update'}))
    })
}

keeform.navDetails = function(details) {
    var str, frame
    if (details.allFrames === undefined) {
        frame = details.frameId
    } else {
        frame = 'allFrames'
    }
    str = "tab " + details.tabId + " frameId " + frame + (details.url ? " url " + details.url.substr(0, 80) : "")
    return str
}

// MV3: uses chrome.scripting.executeScript instead of chrome.tabs.executeScript
keeform.executeScripts = function(scripts, cb) {
    var file, details
    file = scripts.files.shift()
    if (scripts.allFrames === undefined) {
        debug.log(padIds(scripts.tabId, scripts.frameId), 'executeScripts', file)
        details = {target: {tabId: scripts.tabId, frameIds: [scripts.frameId]}, files: [file]}
    } else {
        debug.log(padIds(scripts.tabId, scripts.frameId), 'executeScripts', file, "on tab")
        details = {target: {tabId: scripts.tabId}, files: [file]}
    }
    chrome.scripting.executeScript(details).then(function() {
        if (chrome.runtime.lastError) {
            console.log(chrome.runtime.lastError.message)
            debug.info(padIds(scripts.tabId, scripts.frameId), 'executeScript lastError:', chrome.runtime.lastError.message)
        }
        debug.log(padIds(scripts.tabId, scripts.frameId), 'executed script', file)
        if (scripts.files.length > 0) {
            keeform.executeScripts(scripts, cb)
        } else {
            cb()
        }
    }).catch(debug.info)
}

keeform.response = function(message) {
    if (chrome.runtime.lastError) {
        debug.info(padIds(), 'sent login data, but:', chrome.runtime.lastError.message)
        return
    }
    if (message === undefined) {
        debug.log(padIds(), 'sent login data. response is undefined')
        return
    }
    debug.log(padIds(), 'sent login data. response is', message)
}

keeform.callback = function(message) {
    var caller = ''
    if (this.caller !== undefined) {
        caller = this.caller
    }
    if (chrome.runtime.lastError) {
        debug.info(padIds(), caller, 'lastError:', chrome.runtime.lastError.message)
    }
    if (message !== undefined) {
        debug.log(padIds(), caller, 'message:  ', message)
    }
}

// #region message listeners

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    debug.log('keeformext received message', message, sender)
    if (message === undefined) {
        debug.warn('received undefined message')
        return
    }
    if (message.action === 'tcpNeeded') {
        sendResponse({tcpNeeded: false})
        return
    }
    // Tip overlay messages
    if (message.action === 'checkTip') {
        chrome.storage.local.get({tipShown: false}, function(items) {
            sendResponse({showTip: !items.tipShown})
        })
        return true
    }

    if (message.action === 'pauseRepeat') {
        if (sender.tab) {
            var idx = keeform.loginTabs.findIndex(t => t.id === sender.tab.id)
            if (idx !== -1 && keeform.loginTabs[idx].repeatTimer) {
                clearTimeout(keeform.loginTabs[idx].repeatTimer)
                keeform.loginTabs[idx].repeatTimer = null
                debug.log(padIds(sender.tab.id), 'repeat timer paused for tip')
            }
        }
        return
    }

    if (message.action === 'dismissTip') {
        if (message.permanent) {
            chrome.storage.local.set({tipShown: true})
            debug.log('tip permanently dismissed')
        }
        if (sender.tab) {
            var idx = keeform.loginTabs.findIndex(t => t.id === sender.tab.id)
            if (idx !== -1 && keeform.loginTabs[idx].login) {
                var tabId = sender.tab.id
                keeform.loginTabs[idx].repeatTimer = setTimeout(function() {
                    debug.log(padIds(tabId), 'repeat timeout (resumed after tip)')
                    var i = keeform.loginTabs.findIndex(t => t.id === tabId)
                    if (i !== -1) { keeform.loginTabs[i].login = ''; keeform.loginTabs[i].repeatTimer = null }
                    keeform.resetIcon(tabId)
                }, keeform.settings.repeat)
                debug.log(padIds(tabId), 'repeat timer resumed after tip dismiss')
            }
        }
        return
    }

    if (message.filled) {
        var index = keeform.loginTabs.findIndex(t => t.id === message.tabId)
        if (index != -1) {
            if (chrome.webNavigation.onCompleted.hasListener(keeform.loginTabs[index].navCompleted)) {
                debug.info('%s %cremoveListener %s', padIds(message.tabId), "background-color: green; color: white;", keeform.loginTabs[index].login.url)
                chrome.webNavigation.onCompleted.removeListener(keeform.loginTabs[index].navCompleted)
            }
        }
    }
    if (message.status === "finished") {
    }
})

chrome.action.onClicked.addListener(function(tab) {
    debug.log(padIds(tab.id), 'onclicked')
    var loginTab = keeform.loginTabs.find(t => t.id === tab.id)
    if (loginTab === undefined) {
        debug.warn(padIds(tab.id), 'did not find login data')
        return
    }
    if (!loginTab.login) {
        debug.log(padIds(tab.id), 'can not repeat, no login data')
        return
    }
    debug.log(padIds(tab.id), 'repeat login')
    ;(function(id, login) {
        login.tries   = 1
        login.delay   = 0
        login.twostep = true
        login.tabId   = id
        login.frameId = -1
        login.loglevel = debug.loglevel
        chrome.tabs.sendMessage(id, {"ping": true}, function(msg) {
            debug.log('msg', msg)
            if (chrome.runtime.lastError) {
                debug.log(padIds(id, -1), 'script did not respond', chrome.runtime.lastError)
            }
            if (!msg || !msg.status == "pong") {
                keeform.executeScripts(
                    {tabId: id, allFrames: true, files: ['keeform.js']},
                    function() { chrome.tabs.sendMessage(id, login, keeform.response) }
                )
            } else {
                debug.info(padIds(id, -1), 'script responded')
                chrome.tabs.sendMessage(id, login, keeform.response)
            }
        })
    })(loginTab.id, loginTab.login)
})

keeform.onAuthRequired = function(details) {
    var loginTab = keeform.loginTabs.find(t => t.id === details.tabId)
    if (loginTab === undefined) {
        debug.log(padIds(details.tabId), 'onAuthRequired: did not find login data')
        return
    }
    if (!loginTab.login) {
        debug.log(padIds(details.tabId), 'onAuthRequired: login data empty')
        return
    }
    debug.log(padIds(details.tabId), 'Send authCredentials')
    return {
        authCredentials: {
            username: loginTab.login.username,
            password: loginTab.login.password
        }
    }
}

chrome.webRequest.onAuthRequired.addListener(keeform.onAuthRequired, {urls: ['<all_urls>']}, ['asyncBlocking'])

chrome.runtime.onStartup.addListener(function() {
    console.info('onStartup')
})

// #endregion

// #region native messaging

console.info('keeformext.js')

keeform.badgeColor = [0, 0, 255, 150]
chrome.action.setBadgeBackgroundColor({color: keeform.badgeColor})
chrome.action.setBadgeText({text: ' '})

var host = 'org.keeform.host'
var port = null

console.info('connectNative', host)
port = chrome.runtime.connectNative(host)

port.onMessage.addListener(function(msg) {

    // Step 1: host requests settings
    if (msg == 'requestSettings') {
        debug.info('requestSettings received')
        port.postMessage({
            type:     'settings',
            browser:  keeform.detectBrowser(),
            protocol: 2,
            debug:    self.keeformloglevel !== undefined
        })
        return true
    }

    // Step 2: host signals it is ready and listening for launcher
    if (msg == 'listening') {
        debug.info('listening received — host ready')
        keeform.badgeColor = [0, 200, 83, 200]
        chrome.action.setBadgeBackgroundColor({color: keeform.badgeColor})
        chrome.action.setBadgeText({text: ' '})
        return true
    }

    if (!msg) {
        debug.warn('message empty')
        return
    }

    // Step 3: host sends version — check compatibility
    // Host version message has 'version' as a string e.g. {"version":"5.0.0"}
    // Credentials message has 'url', 'username', 'password' fields
    if (typeof msg.version === 'string') {
        debug.info('host version', msg.version)
        if (!keeform.versionOk(msg.version, MIN_HOST_VERSION)) {
            keeform.showVersionWarning(msg.version)
            return
        }
        debug.info('host version ok')
        return
    }

    // Step 4: host sends credentials — fill the form
    if (msg.url && msg.username && msg.password !== undefined) {
        debug.info('credentials received', msg.url, msg.username)
        if (keeform.encrypted) {
            keeform.error()
        } else {
            keeform.handlePlaintextCredentials(msg)
        }
        return
    }

    debug.warn('unhandled message', msg)
})

port.onDisconnect.addListener(function() {
    debug.warn('unexpected disconnect')
    keeform.badgeColor = [255, 29, 29, 220]
    chrome.action.setBadgeBackgroundColor({color: keeform.badgeColor})
    chrome.action.setBadgeText({text: ' '})
    port = null
})

// #endregion

})()
