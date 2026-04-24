'use strict'
;(function() {
    var params = new URLSearchParams(window.location.search)
    var hostVersion    = params.get('host')     || 'unknown'
    var requiredVersion = params.get('required') || 'unknown'
    var manifest = chrome.runtime.getManifest()
    document.getElementById('versionMeta').textContent =
        'Detected host version:  ' + hostVersion + '\n' +
        'Required minimum:       ' + requiredVersion
    document.getElementById('extensionInfo').textContent =
        'Opened by KeeForm extension v' + manifest.version + '.'

})()
