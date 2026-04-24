'use strict'

// #region helpers

var padIds = function (request) {
    return request.tabId.toString().padStart(4, " ") + " " + request.frameId.toString().padStart(4, " ") + "  "
}

var wait = function(seconds) {
    return new Promise(function(resolve) {
        setTimeout(resolve, seconds * 1000)
    })
}

var triggerInput = function(element, value) {
    debug.log('triggerInput', element.id || element.name || element.type)
    element.click()
    element.focus()
    element.style.filter = "initial" // Netflix
    var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
    // Type character by character for React compatibility
    element.value = ''
    if (nativeSetter && nativeSetter.set) {
        nativeSetter.set.call(element, '')
    }
    for (var i = 0; i < value.length; i++) {
        var current = value.substring(0, i + 1)
        if (nativeSetter && nativeSetter.set) {
            nativeSetter.set.call(element, current)
        } else {
            element.value = current
        }
        element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value[i], inputType: 'insertText' }))
    }
    element.dispatchEvent(new Event('change', { bubbles: true }))
    debug.log('triggerInput value after dispatch', element.id || element.name || element.type, element.value)
}

// Count DOM depth (number of ancestors)
var domDepth = function(el) {
    var depth = 0
    var node = el
    while (node.parentElement) {
        depth++
        node = node.parentElement
    }
    return depth
}

// Get ancestor at depth n (0 = parent, 1 = grandparent, etc.)
var ancestorAt = function(el, n) {
    var node = el
    for (var i = 0; i <= n; i++) {
        if (!node.parentElement) return node
        node = node.parentElement
    }
    return node
}

// Next sibling input that is inuserview — replaces jQuery nextAll('input').filter(':inuserview').first()
var nextSiblingInput = function(el) {
    var node = el.nextElementSibling
    while (node) {
        if (node.tagName === 'INPUT' && inuserview(node)) return node
        node = node.nextElementSibling
    }
    return null
}

// hide/show helpers
var hide = function(el) { el.style.display = 'none' }
var show = function(el) { el.style.display = '' }

// querySelectorAll returning array
var qsa = function(selector, root) {
    return Array.from((root || document).querySelectorAll(selector))
}

// #endregion

// #region debug

var debug = {
    OFF: 0, ASSERT: 1, ERROR: 2, WARN: 3, INFO: 4, LOG: 5, DEBUG: 6,
    set loglevel(level) {
        if (level === void 0)
            level = debug.OFF

        this.assert = level >= this.ASSERT ? console.assert.bind(window.console) : function() {}
        this.error  = level >= this.ERROR  ? console.error.bind(window.console)  : function() {}
        this.warn   = level >= this.WARN   ? console.warn.bind(window.console)   : function() {}
        this.info   = level >= this.INFO   ? console.info.bind(window.console)   : function() {}
        this.debug  = level >= this.DEBUG  ? console.debug.bind(window.console)  : function() {}
        this.log    = level >= this.LOG    ? console.log.bind(window.console)    : function() {}
        this.logLevel = level
    },
    get loglevel() { return this.logLevel }
}
debug.loglevel = debug.INFO

// #endregion

// #region visibility

// based on https://stackoverflow.com/questions/19669786/check-if-element-is-visible-in-dom/31169152#31169152
var inuserview = function(el) {
    if (!el) return false
    if (el.getClientRects().length === 0) return false
    var style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.opacity < 0.1 || (style.overflow === 'hidden' && el.clientHeight === 0)) return false
    return true
}

var isTopmost = function(el) {
    var rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return false
    var top = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
    )
    return top === el || el.contains(top)
}

// #endregion

// #region selectors

var USERNAME_SEL = 'input:not([type=button]):not([type=checkbox]):not([type=color]):not([type=date]):not([type=datetime-local]):not([type=file]):not([type=hidden]):not([type=image]):not([type=month]):not([type=password]):not([type=radio]):not([type=range]):not([type=reset]):not([type=submit]):not([type=search]):not([type=time]):not([type=url]):not([type=week]):not([readonly]):not([aria-hidden=true])'

var AUTOCOMPLETE_SEL = 'input[autocomplete~="username"]:not([readonly]):not([aria-hidden=true]), input[autocomplete~="email"]:not([readonly]):not([aria-hidden=true]), input[autocomplete~="tel"]:not([readonly]):not([aria-hidden=true])'

// #endregion

// #region twostep

var twostep = function(request) {
    var username

    debug.log(padIds(request), 'twostep')

    // First try autocomplete attributes — spec-defined, language-independent
    username = qsa(AUTOCOMPLETE_SEL).filter(inuserview)
    debug.log(padIds(request), 'twostep autocomplete candidates', username.length)

    if (!username.length) {
        var form = document.querySelector('form') || document.body

        username = qsa(USERNAME_SEL, form).filter(inuserview)

        if (!username.length) {
            debug.log(padIds(request), 'twostep did not find user 1st try')
            // Hide labels overlaying username fields
            qsa('label[for]', form).filter(inuserview).forEach(function(label) {
                var target = document.getElementById(label.htmlFor)
                if (target) hide(label)
            })
            username = qsa(USERNAME_SEL, form).filter(inuserview)
        }
    }

    if (username.length > 1) {
        // Filter by topmost visibility — exclude fields hidden behind overlays
        username = username.filter(isTopmost)
        debug.log(padIds(request), 'twostep after overlay filter', username.length)
    }

    if (username.length !== 1) {
        debug.log(padIds(request), 'twostep did not find exactly one user', username.length)
        return false
    }

    debug.log(padIds(request), 'twostep user', username[0].name || username[0].id)
    triggerInput(username[0], request.username)
    return true
}

// #endregion

// #region onestep

var onestep = function(request) {
    var password, username, form
    var shadowUsernameSel = 'input:not([type=button]):not([type=checkbox]):not([type=color]):not([type=date]):not([type=datetime-local]):not([type=file]):not([type=image]):not([type=month]):not([type=password]):not([type=radio]):not([type=range]):not([type=reset]):not([type=submit]):not([type=search]):not([type=time]):not([type=url]):not([type=week])'

    debug.log(padIds(request), 'onestep')

    password = qsa('input[type=password]').filter(inuserview)

    if (!password.length) {
        debug.log(padIds(request), 'onestep did not find password 1st try')

        // Pattern B: label overlaying the password field — hide the label, re-query
        var allPasswords = qsa('input[type=password]')
        allPasswords.forEach(function(pw) {
            if (pw.id) {
                var label = document.querySelector('label[for="' + pw.id + '"]')
                if (label) hide(label)
            }
            var parentLabel = pw.closest('label')
            if (parentLabel) hide(parentLabel)
        })
        password = qsa('input[type=password]').filter(inuserview)

        // Pattern A: real password field is hidden, with a visible hint field after it
        if (!password.length) {
            debug.log(padIds(request), 'onestep trying hidden password')
            var forms = qsa('form')
            if (forms.length) {
                var seenSignatures = []
                forms.forEach(function(formEl) {
                    var hiddenInForm = qsa('input[type=password]', formEl).filter(function(el) { return !inuserview(el) })
                    if (hiddenInForm.length === 1) {
                        var signature = qsa('input', formEl).map(function(i) { return i.name }).sort().join(',')
                        debug.log(padIds(request), 'onestep form signature', signature)
                        if (seenSignatures.indexOf(signature) !== -1) {
                            debug.log(padIds(request), 'onestep skipping duplicate form')
                            return
                        }
                        seenSignatures.push(signature)
                        var hint = nextSiblingInput(hiddenInForm[0])
                        if (hint) hide(hint)
                        show(hiddenInForm[0])
                        debug.log(padIds(request), 'onestep revealed hidden password in form')
                    }
                })
            } else {
                var hiddenPasswords = allPasswords.filter(function(el) { return !inuserview(el) })
                if (hiddenPasswords.length === 1) {
                    var hint = nextSiblingInput(hiddenPasswords[0])
                    if (hint) hide(hint)
                    show(hiddenPasswords[0])
                    debug.log(padIds(request), 'onestep revealed hidden password (no form)')
                }
            }
            password = qsa('input[type=password]').filter(inuserview)
        }

        // Pattern C: fake text password field with -webkit-text-security (always runs)
        if (!password.length) {
            var inputsWithTextSecurity = qsa('input[type=text]').filter(function(el) {
                var sec = getComputedStyle(el).webkitTextSecurity
                return sec && sec !== 'none' && sec !== ''
            })
            debug.log(padIds(request), 'found', inputsWithTextSecurity.length, 'text passwords')
            if (inputsWithTextSecurity.length === 1) {
                password = inputsWithTextSecurity
            }
        }
    }

    // Pattern D: password fields inside shadow roots (one level deep, always runs)
    var shadowFilled = 0
    var shadowSeenSignatures = []
    var autocompleteSelShadow = 'input[autocomplete~="username"]:not([readonly]):not([aria-hidden=true]), input[autocomplete~="email"]:not([readonly]):not([aria-hidden=true]), input[autocomplete~="tel"]:not([readonly]):not([aria-hidden=true])'
    document.querySelectorAll('*').forEach(function(el) {
        if (!el.shadowRoot) return
        var shadowPasswords = Array.from(el.shadowRoot.querySelectorAll('input[type=password]')).filter(inuserview)
        if (shadowPasswords.length !== 1) return
        var signature = Array.from(el.shadowRoot.querySelectorAll('input')).map(function(i) { return i.name }).sort().join(',')
        debug.log(padIds(request), 'onestep shadow DOM signature', signature)
        if (shadowSeenSignatures.indexOf(signature) !== -1) {
            debug.log(padIds(request), 'onestep shadow DOM skipping duplicate')
            return
        }
        shadowSeenSignatures.push(signature)
        // Look for username in same shadow root — autocomplete first, then generic
        var shadowUsernames = Array.from(el.shadowRoot.querySelectorAll(autocompleteSelShadow)).filter(inuserview)
        if (!shadowUsernames.length) {
            shadowUsernames = Array.from(el.shadowRoot.querySelectorAll(shadowUsernameSel)).filter(inuserview)
        }
        debug.log(padIds(request), 'onestep shadow DOM found', shadowPasswords.length, 'passwords', shadowUsernames.length, 'usernames')
        if (shadowUsernames.length) {
            triggerInput(shadowUsernames[0], request.username)
        }
        triggerInput(shadowPasswords[0], request.password)
        shadowFilled++
    })

    // Pattern D username fallback: search other shadow roots by autocomplete only (safe, specific)
    if (shadowFilled && !username) {
        document.querySelectorAll('*').forEach(function(el) {
            if (!el.shadowRoot || username) return
            var shadowUsernames = Array.from(el.shadowRoot.querySelectorAll(autocompleteSelShadow)).filter(inuserview)
            if (shadowUsernames.length === 1) {
                debug.log(padIds(request), 'onestep shadow DOM found username via autocomplete in other shadow root')
                triggerInput(shadowUsernames[0], request.username)
                username = shadowUsernames
            }
        })
    }

    if (shadowFilled) {
        debug.log(padIds(request), 'onestep shadow DOM filled', shadowFilled, 'form(s)')
    }

    // If multiple passwords found, prefer current-password over new-password
    if (password.length > 1) {
        var currentPasswords = password.filter(function(el) {
            var ac = el.getAttribute('autocomplete')
            return ac && ac.indexOf('current-password') !== -1
        })
        if (currentPasswords.length) {
            password = currentPasswords
            debug.log(padIds(request), 'onestep filtered to current-password fields', password.length)
        }
    }

    if (!password.length) {
        debug.log(padIds(request), 'onestep did not find password')
        return shadowFilled
    }
    debug.log(padIds(request), 'found password element', password[0].name || password[0].id)

    form = password[0].closest('form')
    if (!form) {
        debug.log(padIds(request), 'did not find forms. Picking ancestor(6) as form element.')
        form = ancestorAt(password[0], 6)
    }

    username = qsa(USERNAME_SEL, form).filter(inuserview)

    if (!username.length) {
        debug.log(padIds(request), 'onestep did not find user 1st try')
        // Hide labels overlaying username fields
        qsa('label[for]', form).filter(inuserview).forEach(function(label) {
            var target = document.getElementById(label.htmlFor)
            if (target) hide(label)
        })
        username = qsa(USERNAME_SEL, form).filter(inuserview)
        debug.log(padIds(request), 'onestep found', username.length, 'user 2nd try')
    }

    // Autocomplete fallback — spec-defined, language-independent
    if (!username.length) {
        username = qsa(AUTOCOMPLETE_SEL).filter(inuserview)
        debug.log(padIds(request), 'onestep autocomplete username candidates', username.length)
    }

    if (password.length === 1) {
        if (username.length) {
            var candidates = username.map(function(u) {
                return { distance: Math.abs(domDepth(password[0]) - domDepth(u)), user: u }
            })
            var min = Math.min.apply(Math, candidates.map(function(c) { return c.distance }))
            var best = candidates.find(function(c) { return c.distance === min })
            triggerInput(best.user, request.username)
        }

        // Re-query password field in case Flutter replaced the element after username fill
        var freshPassword = password[0]
        if (password[0].id) {
            try {
                freshPassword = document.querySelector('input#' + password[0].id) || password[0]
            } catch(e) {
                // ID contains characters invalid in CSS selectors (e.g. React's :r4:)
                var byId = document.getElementById(password[0].id)
                freshPassword = (byId && byId.tagName === 'INPUT') ? byId : password[0]
            }
        }
        debug.log(padIds(request), 'onestep filling password', freshPassword === password[0] ? '(same element)' : '(re-queried)')
        triggerInput(freshPassword, request.password)
    }

    if (password.length > 1) {
        password.forEach(function(passfield) {
            username.forEach(function(userfield) {
                if (Math.abs(domDepth(passfield) - domDepth(userfield)) <= 3) {
                    triggerInput(userfield, request.username)
                }
            })
            triggerInput(passfield, request.password)
        })
    }

    debug.log(padIds(request), 'onestep end')
    return password.length + shadowFilled
}

// #endregion

// #region findForm

var findForm = function(request) {
    var result

    debug.log(padIds(request), 'findForm')

    result = onestep(request)
    debug.info(padIds(request), 'onestep result', result)
    if (!result && request.twostep) {
        result = twostep(request)
        debug.info(padIds(request), 'twostep result', result)
    }

    debug.log(padIds(request), 'findForm end')
    return result
}

// #endregion

// #region message handler

chrome.runtime.onMessage.addListener(async function keeformContent(request, sender, sendResponse) {
    if (request.ping) {
        sendResponse({status: "pong"})
        debug.info('sending pong')
        return {status: "pong"}
    }

    sendResponse({status: "keeform in progress"})
    debug.loglevel = request.loglevel
    debug.info(padIds(request), 'received request from', sender.id ? sender.id : sender, request.twostep ? 'twostep' : 'onestep only')

    var result, tries, delay, frame, short

    debug.log(padIds(request), 'frame ready', document.location.href)

    short = [document.location.hostname, document.location.pathname, document.location.search.substr(0, 50)].join("")

    if (window.top === window.self) {
        frame = 'frame self'
        debug.log(padIds(request), 'frame self')
    } else {
        frame = 'frame ' + short + ' ' + window.name
        if (inuserview(document.body)) {
            debug.log(padIds(request), 'handle frame', short, window.innerHeight)
        } else {
            debug.log(padIds(request), 'skip   innerHeight', window.innerHeight)
            chrome.runtime.sendMessage({status: "finished", reason: "skipped frame", filled: 0, tabId: request.tabId, frameId: request.frameId})
            return true
        }
    }

    tries = request.tries
    delay = request.delay
    debug.log(padIds(request), 'try', tries, 'times, with delay', delay)

    while (tries--) {
        debug.log(padIds(request), '----- start round', request.tries - tries, frame)
        result = findForm(request)
        debug.info(padIds(request), '----- result round', request.tries - tries, frame, result)
        if (!result) {
            await wait(delay)
            debug.log(padIds(request), 'waited')
        } else {
            debug.info(padIds(request), 'dupli frame')
            // run findForm again after filling — some sites require this for hidden fields
            findForm(request)
            break
        }
    }

    debug.info(padIds(request), 'finished onMessage')
    chrome.runtime.sendMessage({status: "finished", reason: "end of script", filled: result, tabId: request.tabId, frameId: request.frameId})
    return true
})

// #endregion
