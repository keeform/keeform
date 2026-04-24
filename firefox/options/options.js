'use strict'

document.addEventListener('DOMContentLoaded', function() {

    var retrydelay  = document.getElementById('retry-delay')
    var retrynumber = document.getElementById('retry-number')
    var timeout     = document.getElementById('timeout')
    var repeat      = document.getElementById('repeat')
    var loglevel    = document.getElementById('loglevel')

    // ── Tab switcher ──
    var tabs   = document.querySelectorAll('.kf-tabs li')
    var panels = document.querySelectorAll('.kf-tab-panel')

    document.getElementById('kf-tabs').addEventListener('click', function(e) {
        var link = e.target.closest('a[data-tab]')
        if (!link) return
        e.preventDefault()
        var target = link.dataset.tab
        tabs.forEach(function(li) { li.classList.remove('active') })
        panels.forEach(function(p) { p.classList.remove('active') })
        link.parentElement.classList.add('active')
        document.getElementById('tab-' + target).classList.add('active')
    })

    // ── Toast ──
    var toastEl = document.getElementById('kf-toast')
    var toastTimer = null
    function showToast(msg) {
        toastEl.textContent = msg
        toastEl.classList.add('show')
        clearTimeout(toastTimer)
        toastTimer = setTimeout(function() { toastEl.classList.remove('show') }, 2000)
    }

    // ── What's new ──
    document.getElementById('whatsnew').addEventListener('click', function() {
        chrome.storage.local.remove('lastSeenNewsHash', function() {
            chrome.tabs.create({url: chrome.runtime.getURL('whatsnew.html')})
        })
    })

    loadOptions()

    // ── Form actions ──
    document.getElementById('options').addEventListener('submit', function(e) {
        e.preventDefault()
        saveOptions()
    })

    document.getElementById('options').addEventListener('click', function(e) {
        var action = e.target.dataset.action
        if (action === 'close') closeOptions()
        if (action === 'reset') resetOptions()
    })

    function saveOptions() {
        chrome.storage.local.set({
            retrydelay:  retrydelay.value,
            retrynumber: retrynumber.value,
            timeout:     timeout.value,
            repeat:      repeat.value,
            loglevel:    loglevel.checked ? 5 : 0
        }, function() {
            showToast('✓ Options saved')
        })
    }

    function loadOptions() {
        chrome.storage.local.get({
            retrydelay:  '2',
            retrynumber: '4',
            timeout:     '20',
            repeat:      '30',
            loglevel:    0
        }, function(items) {
            retrydelay.value  = items.retrydelay
            retrynumber.value = items.retrynumber
            timeout.value     = items.timeout
            repeat.value      = items.repeat
            loglevel.checked  = items.loglevel > 0
            showToast('✓ Options loaded')
        })
    }

    function resetOptions() {
        retrydelay.value  = '2'
        retrynumber.value = '4'
        timeout.value     = '20'
        repeat.value      = '30'
        loglevel.checked  = false
    }

    function closeOptions() {
        chrome.tabs.getCurrent(function(tab) {
            chrome.tabs.remove(tab.id)
        })
    }

})
