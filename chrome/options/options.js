'use strict'

document.addEventListener('DOMContentLoaded', function() {

    var retrydelay  = document.getElementById('retry-delay')
    var retrynumber = document.getElementById('retry-number')
    var timeout     = document.getElementById('timeout')
    var repeat      = document.getElementById('repeat')
    var loglevel    = document.getElementById('loglevel')
    var tipshown    = document.getElementById('tipshown')

    loadOptions()

    document.getElementById('password-button-group').addEventListener('click', function(e) {
        var action = e.target.dataset.action
        if (!action) return

        if (action === 'close') {
            closeOptions()
        } else if (action === 'save') {
            if (!document.getElementById('options').checkValidity()) {
                document.getElementById('save').click()
                return
            }
            e.target.blur()
            e.preventDefault()
            saveOptions()
        } else if (action === 'reset') {
            resetOptions()
        }
    })

    function saveOptions() {
        chrome.storage.local.set({
            retrydelay:  retrydelay.value,
            retrynumber: retrynumber.value,
            timeout:     timeout.value,
            repeat:      repeat.value,
            loglevel:    loglevel.checked ? 5 : 0,
            tipShown:    !tipshown.checked
        }, function() {
            UIkit.notification("<i class='uk-icon-check'></i> Saved options", {
                timeout: 2000,
                pos: 'top-center',
                status: 'success'
            })
        })
    }

    function loadOptions() {
        chrome.storage.local.get({
            retrydelay:  '2',
            retrynumber: '4',
            timeout:     '20',
            repeat:      '30',
            loglevel:    0,
            tipShown:    false
        }, function(items) {
            retrydelay.value  = items.retrydelay
            retrynumber.value = items.retrynumber
            timeout.value     = items.timeout
            repeat.value      = items.repeat
            loglevel.checked  = items.loglevel > 0
            tipshown.checked  = !items.tipShown

            UIkit.notification("<i class='uk-icon-check'></i> Loaded options", {
                timeout: 2000,
                pos: 'top-center',
                status: 'success'
            })
        })
    }

    function resetOptions() {
        retrydelay.value  = '2'
        retrynumber.value = '4'
        timeout.value     = '20'
        repeat.value      = '30'
        loglevel.checked  = false
        tipshown.checked  = true
    }

    function closeOptions() {
        chrome.tabs.getCurrent(function(tab) {
            chrome.tabs.remove(tab.id)
        })
    }

})
