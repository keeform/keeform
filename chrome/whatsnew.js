'use strict'
;(function() {
    document.getElementById('dismissBtn').addEventListener('click', function() {
        fetch(chrome.runtime.getURL('whatsnew.html'))
            .then(function(r) { return r.text() })
            .then(function(html) {
                var hash = Array.from(new TextEncoder().encode(html))
                    .reduce(function(h, b) { return (Math.imul(31, h) + b) | 0 }, 0)
                    .toString(36)
                chrome.runtime.sendMessage({action: 'saveNewsHash', hash: hash})
                window.close()
            })
    })
})()
