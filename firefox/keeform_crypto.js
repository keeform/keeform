'use strict'

//
// keeform_crypto.js
//
// Encryption/decryption functions for the KeeForm protocol.
// Currently dormant — encryption between launcher and host was removed in v5.
// Kept here so it can be re-enabled by setting keeform.encrypted = true
// and loading this file in keeformext.html.
//
// Protocol v1 = plaintext (current)
// Protocol v2 = encrypted (future, re-enable this file)
//

keeform.hexs2String = function (hexs) {
    var string = ''
    for (var i = 0; i < hexs.length; i += 2)
        string += String.fromCharCode(parseInt(hexs.substr(i, 2), 16))
    return string
}

keeform.bytes2String = function (bytes) {
    return String.fromCharCode.apply(null, new Uint8Array(bytes))
}

keeform.string2Bytes = function (string) {
    var bytes = new Uint8Array(string.length)
    for (var i = 0; i < string.length; i++) {
        bytes[i] = (string.charCodeAt(i))
    }
    return bytes
}

keeform.hexs2Bytes = function (hexs) {
    if (hexs.length % 2 != 0)
        return []
    var bytes = new Uint8Array(hexs.length / 2)
    for (var i = 0; i < hexs.length; i += 2) {
        var byte = parseInt(hexs.substr(i, 2), 16)
        if (byte == NaN)
            return []
        bytes[i/2] = byte
    }
    return bytes
}

keeform.bytes2Hexs = function (bytes) {
    if (!bytes)
        return null
    bytes = new Uint8Array(bytes)
    var hexs = []
    for (var i = 0; i < bytes.length; ++i) {
        var hex = bytes[i].toString(16)
        if (hex.length < 2)
            hex = "0" + hex
        hexs.push(hex)
    }
    return hexs.join("").toUpperCase()
}

keeform.jsonize = function (str) {
    var _jsonize_token = /[^,:{}\[\]]+/g,
        _jsonize_quote = /^['"](.*)['"]$/,
        _jsonize_escap = /(["])/g

    str = str.trim()

    return str.replace(_jsonize_token, function (a) {
        a = a.trim()
        if ('' === a ||
            'true' === a || 'false' === a || 'null' === a ||
            (!isNaN(parseFloat(a)) && isFinite(a))) {
            return a
        }
        else {
            return '"'
                + a.replace(_jsonize_quote, '$1')
                   .replace(_jsonize_escap, '\\$1')
                + '"'
        }
    })
}

keeform.sha512 = function(msg) {
    return crypto.subtle.digest({name: 'SHA-512'}, keeform.string2Bytes(msg.key)).then(function(result) {
        msg.key     = keeform.bytes2Hexs(result).substring(0,64)
        msg.keyhmac = keeform.bytes2Hexs(result).substring(64)
        return msg
    })
}

keeform.hmac = function(msg) {
    var method = {name: 'HMAC', hash: {name: 'SHA-256'}}
    var algorithm = {name: 'HMAC'}
    var usage = ["sign", "verify"]
    var promise = new Promise(function(resolve, reject) {
        crypto.subtle.importKey("raw", keeform.hexs2Bytes(msg.keyhmac), method, false, usage).then(function(result) {
            crypto.subtle.verify(algorithm, result, keeform.hexs2Bytes(msg.hmac), keeform.string2Bytes(msg.iv + msg.login)).then(function(result) {
                if (result) {
                    resolve(msg)
                } else {
                    reject(msg)
                }
            })
        })
    })
    return promise
}

keeform.decryptData = function(msg) {
    var key    = keeform.hexs2Bytes(msg.key)
    var iv     = keeform.hexs2Bytes(msg.iv)
    var cipher = keeform.hexs2Bytes(msg.login)

    return crypto.subtle.importKey("raw", key, {name: 'AES-CBC', length:256}, true, ["encrypt", "decrypt"]).then(function(result) {
        return crypto.subtle.decrypt({name: "AES-CBC", iv: iv}, result, cipher).then(function(result) {
            var text = String.fromCharCode.apply(null, new Uint8Array(new Uint8Array(result)))
            msg.login = keeform.getSegments(text)
            return msg
        })
    })
}

keeform.getSegments = function (data) {
    var keeformData = data.split("/")
    debug.log("found", keeformData.length, "segments")
    return keeformData
}

keeform.decryptSegments = function(msg) {
    var promises = msg.login.map(function(cipher) {
        return keeform.decrypt(msg.key, msg.iv, cipher)
    })
    return Promise.all(promises)
}

keeform.decrypt = function(key, iv, cipher) {
    var keyBytes    = keeform.hexs2Bytes(key)
    var ivBytes     = keeform.hexs2Bytes(iv)
    var cipherBytes = keeform.hexs2Bytes(cipher)
    return crypto.subtle.importKey("raw", keyBytes, {name: 'AES-CBC', length:256}, true, ["encrypt", "decrypt"]).then(function(result) {
        return crypto.subtle.decrypt({name: "AES-CBC", iv: ivBytes}, result, cipherBytes).then(function(result) {
            var text
            if (keeform.utf16le) {
                text = String.fromCharCode.apply(null, new Uint16Array(new Uint16Array(result)))
            } else {
                text = String.fromCharCode.apply(null, new Uint8Array(new Uint8Array(result)))
            }
            return text
        })
    })
}

// Encrypted message handler — replaces keeform.handlePlaintextCredentials
// when keeform.encrypted = true
keeform.handleEncryptedMessage = function(data) {
    debug.log(padIds(), 'handleEncryptedMessage')
    chrome.storage.local.get({
        key: 'keeform',
        retrydelay: 2, retrynumber: 4,
        timeout: 20, repeat: 30,
        twostep: false,
        unhidepassword: false,
        inputswithtextsecurity: false
    }, function(items) {
        var msg = {
            key:      'keeform',
            keyhmac:  '',
            hmac:     data.substring(0, 64),
            iv:       data.substring(64, 96),
            login:    data.substring(96)
        }
        if (items.key) {
            msg.key = items.key
        }
        if (keeform.passphrase) {
            msg.key = keeform.passphrase
        }
        keeform.settings.retrydelay             = items.retrydelay
        keeform.settings.retrynumber            = items.retrynumber
        keeform.settings.timeout                = items.timeout * 1000
        keeform.settings.repeat                 = items.repeat * 1000
        keeform.settings.twostep                = items.twostep
        keeform.settings.unhidepassword         = items.unhidepassword
        keeform.settings.inputswithtextsecurity = items.inputswithtextsecurity
        Promise.resolve(msg)
            .then(keeform.sha512)
            .then(keeform.hmac)
            .then(keeform.decryptData)
            .then(keeform.decryptSegments)
            .then(keeform.login)
            .catch(keeform.error)
    })
}
