'use strict'
;(function() {
    var manifest = chrome.runtime.getManifest()
    document.getElementById('extensionInfo').textContent =
        'Opened by KeeForm extension v' + manifest.version + '.'
})()
