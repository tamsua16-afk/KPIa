// GENERATED FILE. DO NOT EDIT.
(function (global, factory) {
  function preferDefault(exports) {
    return exports.default || exports;
  }
  if (typeof define === "function" && define.amd) {
    define(["crypto"], function (_crypto) {
      var exports = {};
      factory(exports, _crypto);
      return preferDefault(exports);
    });
  } else if (typeof exports === "object") {
    factory(exports, require("crypto"));
    if (typeof module === "object") module.exports = preferDefault(exports);
  } else {
    (function () {
      var exports = {};
      factory(exports, global.crypto);
      global.bcrypt = preferDefault(exports);
    })();
  }
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof self !== "undefined"
      ? self
      : this,
  function (_exports, _crypto) {
    "use strict";

    Object.defineProperty(_exports, "__esModule", {
      value: true,
    });
    _exports.compare = compare;
    _exports.compareSync = compareSync;
    _exports.decodeBase64 = decodeBase64;
    _exports.default = void 0;
    _exports.encodeBase64 = encodeBase64;
    _exports.genSalt = genSalt;
    _exports.genSaltSync = genSaltSync;
    _exports.getRounds = getRounds;
    _exports.getSalt = getSalt;
    _exports.hash = hash;
    _exports.hashSync = hashSync;
    _exports.setRandomFallback = setRandomFallback;
    _exports.truncates = truncates;
    _crypto = _interopRequireDefault(_crypto);
    function _interopRequireDefault(e) {
      return e && e.__esModule ? e : { default: e };
    }
    /*
   Copyright (c) 2012 Nevins Bartolomeo <nevins.bartolomeo@gmail.com>
   Copyright (c) 2012 Shane Girish <shaneGirish@gmail.com>
   Copyright (c) 2025 Daniel Wirtz <dcode@dcode.io>
  
   Redistribution and use in source and binary forms, with or without
   modification, are permitted provided that the following conditions
   are met:
   1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
   2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.
   3. The name of the author may not be used to endorse or promote products
   derived from this software without specific prior written permission.
  
   THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR
   IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
   OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
   IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT,
   INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
   NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
   DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
   THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
   (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
   THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   */

    // The Node.js crypto module is used as a fallback for the Web Crypto API. When
    // building for the browser, inclusion of the crypto module should be disabled,
    // which the package hints at in its package.json for bundlers that support it.

    /**
     * The random implementation to use as a fallback.
     * @type {?function(number):!Array.<number>}
     * @inner
     */
    var randomFallback = null;

    /**
     * Generates cryptographically secure random bytes.
     * @function
     * @param {number} len Bytes length
     * @returns {!Array.<number>} Random bytes
     * @throws {Error} If no random implementation is available
     * @inner
     */
    function randomBytes(len) {
      // Web Crypto API. Globally available in the browser and in Node.js >=23.
      try {
        return crypto.getRandomValues(new Uint8Array(len));
      } catch {}
      // Node.js crypto module for non-browser environments.
      try {
        return _crypto.default.randomBytes(len);
      } catch {}
      // Custom fallback specified with `setRandomFallback`.
      if (!randomFallback) {
        throw Error(
          "Neither WebCryptoAPI nor a crypto module is available. Use bcrypt.setRandomFallback to set an alternative",
        );
      }
      return randomFallback(len);
    }

    /**
     * Sets the pseudo random number generator to use as a fallback if neither node's `crypto` module nor the Web Crypto
     *  API is available. Please note: It is highly important that the PRNG used is cryptographically secure and that it
     *  is seeded properly!
     * @param {?function(number):!Array.<number>} random Function taking the number of bytes to generate as its
     *  sole argument, returning the corresponding array of cryptographically secure random byte values.
     * @see http://nodejs.org/api/crypto.html
     * @see http://www.w3.org/TR/WebCryptoAPI/
     */
    function setRandomFallback(random) {
      randomFallback = random;
    }

    /**
     * Synchronously generates a salt.
     * @param {number=} rounds Number of rounds to use, defaults to 10 if omitted
     * @param {number=} seed_length Not supported.
     * @returns {string} Resulting salt
     * @throws {Error} If a random fallback is required but not set
     */
    function genSaltSync(rounds, seed_length) {
      rounds = rounds || GENSALT_DEFAULT_LOG2_ROUNDS;
      if (typeof rounds !== "number")
        throw Error(
          "Illegal arguments: " + typeof rounds + ", " + typeof seed_length,
        );
      if (rounds < 4) rounds = 4;
      else if (rounds > 31) rounds = 31;
      var salt = [];
      salt.push("$2b$");
      if (rounds < 10) salt.push("0");
      salt.push(rounds.toString());
      salt.push("$");
      salt.push(base64_encode(randomBytes(BCRYPT_SALT_LEN), BCRYPT_SALT_LEN)); // May throw
      return salt.join("");
    }

    /**
     * Asynchronously generates a salt.
     * @param {(number|function(Error, string=))=} rounds Number of rounds to use, defaults to 10 if omitted
     * @param {(number|function(Error, string=))=} seed_length Not supported.
     * @param {function(Error, string=)=} callback Callback receiving the error, if any, and the resulting salt
     * @returns {!Promise} If `callback` has been omitted
     * @throws {Error} If `callback` is present but not a function
     */
    function genSalt(rounds, seed_length, callback) {
      if (typeof seed_length === "function")
        (callback = seed_length), (seed_length = undefined); // Not supported.
      if (typeof rounds === "function")
        (callback = rounds), (rounds = undefined);
      if (typeof rounds === "undefined") rounds = GENSALT_DEFAULT_LOG2_ROUNDS;
      else if (typeof rounds !== "number")
        throw Error("illegal arguments: " + typeof rounds);
      function _async(callback) {
        nextTick(function () {
          // Pretty thin, but salting is fast enough
          try {
            callback(null, genSaltSync(rounds));
          } catch (err) {
            callback(err);
          }
        });
      }
      if (callback) {
        if (typeof callback !== "function")
          throw Error("Illegal callback: " + typeof callback);
        _async(callback);
      } else
        return new Promise(function (resolve, reject) {
          _async(function (err, res) {
            if (err) {
              reject(err);
              return;
            }
            resolve(res);
          });
        });
    }

    /**
     * Synchronously generates a hash for the given password.
     * @param {string} password Password to hash
     * @param {(number|string)=} salt Salt length to generate or salt to use, default to 10
     * @returns {string} Resulting hash
     */
    function hashSync(password, salt) {
      if (typeof salt === "undefined") salt = GENSALT_DEFAULT_LOG2_ROUNDS;
      if (typeof salt === "number") salt = genSaltSync(salt);
      if (typeof password !== "string" || typeof salt !== "string")
        throw Error(
          "Illegal arguments: " + typeof password + ", " + typeof salt,
        );
      return _hash(password, salt);
    }

    /**
     * Asynchronously generates a hash for the given password.
     * @param {string} password Password to hash
     * @param {number|string} salt Salt length to generate or salt to use
     * @param {function(Error, string=)=} callback Callback receiving the error, if any, and the resulting hash
     * @param {function(number)=} progressCallback Callback successively called with the percentage of rounds completed
     *  (0.0 - 1.0), maximally once per `MAX_EXECUTION_TIME = 100` ms.
     * @returns {!Promise} If `callback` has been omitted
     * @throws {Error} If `callback` is present but not a function
     */
    function hash(password, salt, callback, progressCallback) {
      function _async(callback) {
        if (typeof password === "string" && typeof salt === "number")
          genSalt(salt, function (err, salt) {
            _hash(password, salt, callback, progressCallback);
          });
        else if (typeof password === "string" && typeof salt === "string")
          _hash(password, salt, callback, progressCallback);
        else
          nextTick(
            callback.bind(
              this,
              Error(
                "Illegal arguments: " + typeof password + ", " + typeof salt,
              ),
            ),
          );
      }
      if (callback) {
        if (typeof callback !== "function")
          throw Error("Illegal callback: " + typeof callback);
        _async(callback);
      } else
        return new Promise(function (resolve, reject) {
          _async(function (err, res) {
            if (err) {
              reject(err);
              return;
            }
            resolve(res);
          });
        });
    }

    /**
     * Compares two strings of the same length in constant time.
     * @param {string} known Must be of the correct length
     * @param {string} unknown Must be the same length as `known`
     * @returns {boolean}
     * @inner
     */
    function safeStringCompare(known, unknown) {
      var diff = known.length ^ unknown.length;
      for (var i = 0; i < known.length; ++i) {
        diff |= known.charCodeAt(i) ^ unknown.charCodeAt(i);
      }
      return diff === 0;
    }

    /**
     * Synchronously tests a password against a hash.
     * @param {string} password Password to compare
     * @param {string} hash Hash to test against
     * @returns {boolean} true if matching, otherwise false
     * @throws {Error} If an argument is illegal
     */
    function compareSync(password, hash) {
      if (typeof password !== "string" || typeof hash !== "string")
        throw Error(
          "Illegal arguments: " + typeof password + ", " + typeof hash,
        );
      if (hash.length !== 60) return false;
      return safeStringCompare(
        hashSync(password, hash.substring(0, hash.length - 31)),
        hash,
      );
    }

    /**
     * Asynchronously tests a password against a hash.
     * @param {string} password Password to compare
     * @param {string} hashValue Hash to test against
     * @param {function(Error, boolean)=} callback Callback receiving the error, if any, otherwise the result
     * @param {function(number)=} progressCallback Callback successively called with the percentage of rounds completed
     *  (0.0 - 1.0), maximally once per `MAX_EXECUTION_TIME = 100` ms.
     * @returns {!Promise} If `callback` has been omitted
     * @throws {Error} If `callback` is present but not a function
     */
    function compare(password, hashValue, callback, progressCallback) {
      function _async(callback) {
        if (typeof password !== "string" || typeof hashValue !== "string") {
          nextTick(
            callback.bind(
              this,
              Error(
                "Illegal arguments: " +
                  typeof password +
                  ", " +
                  typeof hashValue,
              ),
            ),
          );
          return;
        }
        if (hashValue.length !== 60) {
          nextTick(callback.bind(this, null, false));
          return;
        }
        hash(
          password,
          hashValue.substring(0, 29),
          function (err, comp) {
            if (err) callback(err);
            else callback(null, safeStringCompare(comp, hashValue));
          },
          progressCallback,
        );
      }
      if (callback) {
        if (typeof callback !== "function")
          throw Error("Illegal callback: " + typeof callback);
        _async(callback);
      } else
        return new Promise(function (resolve, reject) {
          _async(function (err, res) {
            if (err) {
              reject(err);
              return;
            }
            resolve(res);
          });
        });
    }

    /**
     * Gets the number of rounds used to encrypt the specified hash.
     * @param {string} hash Hash to extract the used number of rounds from
     * @returns {number} Number of rounds used
     * @throws {Error} If `hash` is not a string
     */
    function getRounds(hash) {
      if (typeof hash !== "string")
        throw Error("Illegal arguments: " + typeof hash);
      return parseInt(hash.split("$")[2], 10);
    }

    /**
     * Gets the salt portion from a hash. Does not validate the hash.
     * @param {string} hash Hash to extract the salt from
     * @returns {string} Extracted salt part
     * @throws {Error} If `hash` is not a string or otherwise invalid
     */
    function getSalt(hash) {
      if (typeof hash !== "string")
        throw Error("Illegal arguments: " + typeof hash);
      if (hash.length !== 60)
        throw Error("Illegal hash length: " + hash.length + " != 60");
      return hash.substring(0, 29);
    }

    /**
     * Tests if a password will be truncated when hashed, that is its length is
     * greater than 72 bytes when converted to UTF-8.
     * @param {string} password The password to test
     * @returns {boolean} `true` if truncated, otherwise `false`
     */
    function truncates(password) {
      if (typeof password !== "string")
        throw Error("Illegal arguments: " + typeof password);
      return utf8Length(password) > 72;
    }

    /**
     * Continues with the callback after yielding to the event loop.
     * @function
     * @param {function(...[*])} callback Callback to execute
     * @inner
     */
    var nextTick =
      typeof setImmediate === "function"
        ? setImmediate
        : typeof scheduler === "object" &&
            typeof scheduler.postTask === "function"
          ? scheduler.postTask.bind(scheduler)
          : setTimeout;

    /** Calculates the byte length of a string encoded as UTF8. */
    function utf8Length(string) {
      var len = 0,
        c = 0;
      for (var i = 0; i < string.length; ++i) {
        c = string.charCodeAt(i);
        if (c < 128) len += 1;
        else if (c < 2048) len += 2;
        else if (
          (c & 0xfc00) === 0xd800 &&
          (string.charCodeAt(i + 1) & 0xfc00) === 0xdc00
        ) {
          ++i;
          len += 4;
        } else len += 3;
      }
      return len;
    }

    /** Converts a string to an array of UTF8 bytes. */
    function utf8Array(string) {
      var offset = 0,
        c1,
        c2;
      var buffer = new Array(utf8Length(string));
      for (var i = 0, k = string.length; i < k; ++i) {
        c1 = string.charCodeAt(i);
        if (c1 < 128) {
          buffer[offset++] = c1;
        } else if (c1 < 2048) {
          buffer[offset++] = (c1 >> 6) | 192;
          buffer[offset++] = (c1 & 63) | 128;
        } else if (
          (c1 & 0xfc00) === 0xd800 &&
          ((c2 = string.charCodeAt(i + 1)) & 0xfc00) === 0xdc00
        ) {
          c1 = 0x10000 + ((c1 & 0x03ff) << 10) + (c2 & 0x03ff);
          ++i;
          buffer[offset++] = (c1 >> 18) | 240;
          buffer[offset++] = ((c1 >> 12) & 63) | 128;
          buffer[offset++] = ((c1 >> 6) & 63) | 128;
          buffer[offset++] = (c1 & 63) | 128;
        } else {
          buffer[offset++] = (c1 >> 12) | 224;
          buffer[offset++] = ((c1 >> 6) & 63) | 128;
          buffer[offset++] = (c1 & 63) | 128;
        }
      }
      return buffer;
    }

    // A base64 implementation for the bcrypt algorithm. This is partly non-standard.

    /**
     * bcrypt's own non-standard base64 dictionary.
     * @type {!Array.<string>}
     * @const
     * @inner
     **/
    var BASE64_CODE =
      "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split(
        "",
      );

    /**
     * @type {!Array.<number>}
     * @const
     * @inner
     **/
    var BASE64_INDEX = [
      -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 1, 54, 55, 56, 57, 58, 59, 60,
      61, 62, 63, -1, -1, -1, -1, -1, -1, -1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
      12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, -1, -1,
      -1, -1, -1, -1, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41,
      42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, -1, -1, -1, -1, -1,
    ];

    /**
     * Encodes a byte array to base64 with up to len bytes of input.
     * @param {!Array.<number>} b Byte array
     * @param {number} len Maximum input length
     * @returns {string}
     * @inner
     */
    function base64_encode(b, len) {
      var off = 0,
        rs = [],
        c1,
        c2;
      if (len <= 0 || len > b.length) throw Error("Illegal len: " + len);
      while (off < len) {
        c1 = b[off++] & 0xff;
        rs.push(BASE64_CODE[(c1 >> 2) & 0x3f]);
        c1 = (c1 & 0x03) << 4;
        if (off >= len) {
          rs.push(BASE64_CODE[c1 & 0x3f]);
          break;
        }
        c2 = b[off++] & 0xff;
        c1 |= (c2 >> 4) & 0x0f;
        rs.push(BASE64_CODE[c1 & 0x3f]);
        c1 = (c2 & 0x0f) << 2;
        if (off >= len) {
          rs.push(BASE64_CODE[c1 & 0x3f]);
          break;
        }
        c2 = b[off++] & 0xff;
        c1 |= (c2 >> 6) & 0x03;
        rs.push(BASE64_CODE[c1 & 0x3f]);
        rs.push(BASE64_CODE[c2 & 0x3f]);
      }
      return rs.join("");
    }

    /**
     * Decodes a base64 encoded string to up to len bytes of output.
     * @param {string} s String to decode
     * @param {number} len Maximum output length
     * @returns {!Array.<number>}
     * @inner
     */
    function base64_decode(s, len) {
      var off = 0,
        slen = s.length,
        olen = 0,
        rs = [],
        c1,
        c2,
        c3,
        c4,
        o,
        code;
      if (len <= 0) throw Error("Illegal len: " + len);
      while (off < slen - 1 && olen < len) {
        code = s.charCodeAt(off++);
        c1 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
        code = s.charCodeAt(off++);
        c2 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
        if (c1 == -1 || c2 == -1) break;
        o = (c1 << 2) >>> 0;
        o |= (c2 & 0x30) >> 4;
        rs.push(String.fromCharCode(o));
        if (++olen >= len || off >= slen) break;
        code = s.charCodeAt(off++);
        c3 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
        if (c3 == -1) break;
        o = ((c2 & 0x0f) << 4) >>> 0;
        o |= (c3 & 0x3c) >> 2;
        rs.push(String.fromCharCode(o));
        if (++olen >= len || off >= slen) break;
        code = s.charCodeAt(off++);
        c4 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
        o = ((c3 & 0x03) << 6) >>> 0;
        o |= c4;
        rs.push(String.fromCharCode(o));
        ++olen;
      }
      var res = [];
      for (off = 0; off < olen; off++) res.push(rs[off].charCodeAt(0));
      return res;
    }

    /**
     * @type {number}
     * @const
     * @inner
     */
    var BCRYPT_SALT_LEN = 16;

    /**
     * @type {number}
     * @const
     * @inner
     */
    var GENSALT_DEFAULT_LOG2_ROUNDS = 10;

    /**
     * @type {number}
     * @const
     * @inner
     */
    var BLOWFISH_NUM_ROUNDS = 16;

    /**
     * @type {number}
     * @const
     * @inner
     */
    var MAX_EXECUTION_TIME = 100;

    /**
     * @type {Array.<number>}
     * @const
     * @inner
     */
    var P_ORIG = [
      0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344, 0xa4093822, 0x299f31d0,
      0x082efa98, 0xec4e6c89, 0x452821e6, 0x38d01377, 0xbe5466cf, 0x34e90c6c,
      0xc0ac29b7, 0xc97c50dd, 0x3f84d5b5, 0xb5470917, 0x9216d5d9, 0x8979fb1b,
    ];

    /**
     * @type {Array.<number>}
     * @const
     * @inner
     */
    var S_ORIG = [
      0xd1310ba6, 0x98dfb5ac, 0x2ffd72db, 0xd01adfb7, 0xb8e1afed, 0x6a267e96,
      0xba7c9045, 0xf12c7f99, 0x24a19947, 0xb3916cf7, 0x0801f2e2, 0x858efc16,
      0x636920d8, 0x71574e69, 0xa458fea3, 0xf4933d7e, 0x0d95748f, 0x728eb658,
      0x718bcd58, 0x82154aee, 0x7b54a41d, 0xc25a59b5, 0x9c30d539, 0x2af26013,
      0xc5d1b023, 0x286085f0, 0xca417918, 0xb8db38ef, 0x8e79dcb0, 0x603a180e,
      0x6c9e0e8b, 0xb01e8a3e, 0xd71577c1, 0xbd314b27, 0x78af2fda, 0x55605c60,
      0xe65525f3, 0xaa55ab94, 0x57489862, 0x63e81440, 0x55ca396a, 0x2aab10b6,
      0xb4cc5c34, 0x1141e8ce, 0xa15486af, 0x7c72e993, 0xb3ee1411, 0x636fbc2a,
      0x2ba9c55d, 0x741831f6, 0xce5c3e16, 0x9b87931e, 0xafd6ba33, 0x6c24cf5c,
      0x7a325381, 0x28958677, 0x3b8f4898, 0x6b4bb9af, 0xc4bfe81b, 0x66282193,
      0x61d809cc, 0xfb21a991, 0x487cac60, 0x5dec8032, 0xef845d5d, 0xe98575b1,
      0xdc262302, 0xeb651b88, 0x23893e81, 0xd396acc5, 0x0f6d6ff3, 0x83f44239,
      0x2e0b4482, 0xa4842004, 0x69c8f04a, 0x9e1f9b5e, 0x21c66842, 0xf6e96c9a,
      0x670c9c61, 0xabd388f0, 0x6a51a0d2, 0xd8542f68, 0x960fa728, 0xab5133a3,
      0x6eef0b6c, 0x137a3be4, 0xba3bf050, 0x7efb2a98, 0xa1f1651d, 0x39af0176,
      0x66ca593e, 0x82430e88, 0x8cee8619, 0x456f9fb4, 0x7d84a5c3, 0x3b8b5ebe,
      0xe06f75d8, 0x85c12073, 0x401a449f, 0x56c16aa6, 0x4ed3aa62, 0x363f7706,
      0x1bfedf72, 0x429b023d, 0x37d0d724, 0xd00a1248, 0xdb0fead3, 0x49f1c09b,
      0x075372c9, 0x80991b7b, 0x25d479d8, 0xf6e8def7, 0xe3fe501a, 0xb6794c3b,
      0x976ce0bd, 0x04c006ba, 0xc1a94fb6, 0x409f60c4, 0x5e5c9ec2, 0x196a2463,
      0x68fb6faf, 0x3e6c53b5, 0x1339b2eb, 0x3b52ec6f, 0x6dfc511f, 0x9b30952c,
      0xcc814544, 0xaf5ebd09, 0xbee3d004, 0xde334afd, 0x660f2807, 0x192e4bb3,
      0xc0cba857, 0x45c8740f, 0xd20b5f39, 0xb9d3fbdb, 0x5579c0bd, 0x1a60320a,
      0xd6a100c6, 0x402c7279, 0x679f25fe, 0xfb1fa3cc, 0x8ea5e9f8, 0xdb3222f8,
      0x3c7516df, 0xfd616b15, 0x2f501ec8, 0xad0552ab, 0x323db5fa, 0xfd238760,
      0x53317b48, 0x3e00df82, 0x9e5c57bb, 0xca6f8ca0, 0x1a87562e, 0xdf1769db,
      0xd542a8f6, 0x287effc3, 0xac6732c6, 0x8c4f5573, 0x695b27b0, 0xbbca58c8,
      0xe1ffa35d, 0xb8f011a0, 0x10fa3d98, 0xfd2183b8, 0x4afcb56c, 0x2dd1d35b,
      0x9a53e479, 0xb6f84565, 0xd28e49bc, 0x4bfb9790, 0xe1ddf2da, 0xa4cb7e33,
      0x62fb1341, 0xcee4c6e8, 0xef20cada, 0x36774c01, 0xd07e9efe, 0x2bf11fb4,
      0x95dbda4d, 0xae909198, 0xeaad8e71, 0x6b93d5a0, 0xd08ed1d0, 0xafc725e0,
      0x8e3c5b2f, 0x8e7594b7, 0x8ff6e2fb, 0xf2122b64, 0x8888b812, 0x900df01c,
      0x4fad5ea0, 0x688fc31c, 0xd1cff191, 0xb3a8c1ad, 0x2f2f2218, 0xbe0e1777,
      0xea752dfe, 0x8b021fa1, 0xe5a0cc0f, 0xb56f74e8, 0x18acf3d6, 0xce89e299,
      0xb4a84fe0, 0xfd13e0b7, 0x7cc43b81, 0xd2ada8d9, 0x165fa266, 0x80957705,
      0x93cc7314, 0x211a1477, 0xe6ad2065, 0x77b5fa86, 0xc75442f5, 0xfb9d35cf,
      0xebcdaf0c, 0x7b3e89a0, 0xd6411bd3, 0xae1e7e49, 0x00250e2d, 0x2071b35e,
      0x226800bb, 0x57b8e0af, 0x2464369b, 0xf009b91e, 0x5563911d, 0x59dfa6aa,
      0x78c14389, 0xd95a537f, 0x207d5ba2, 0x02e5b9c5, 0x83260376, 0x6295cfa9,
      0x11c81968, 0x4e734a41, 0xb3472dca, 0x7b14a94a, 0x1b510052, 0x9a532915,
      0xd60f573f, 0xbc9bc6e4, 0x2b60a476, 0x81e67400, 0x08ba6fb5, 0x571be91f,
      0xf296ec6b, 0x2a0dd915, 0xb6636521, 0xe7b9f9b6, 0xff34052e, 0xc5855664,
      0x53b02d5d, 0xa99f8fa1, 0x08ba4799, 0x6e85076a, 0x4b7a70e9, 0xb5b32944,
      0xdb75092e, 0xc4192623, 0xad6ea6b0, 0x49a7df7d, 0x9cee60b8, 0x8fedb266,
      0xecaa8c71, 0x699a17ff, 0x5664526c, 0xc2b19ee1, 0x193602a5, 0x75094c29,
      0xa0591340, 0xe4183a3e, 0x3f54989a, 0x5b429d65, 0x6b8fe4d6, 0x99f73fd6,
      0xa1d29c07, 0xefe830f5, 0x4d2d38e6, 0xf0255dc1, 0x4cdd2086, 0x8470eb26,
      0x6382e9c6, 0x021ecc5e, 0x09686b3f, 0x3ebaefc9, 0x3c971814, 0x6b6a70a1,
      0x687f3584, 0x52a0e286, 0xb79c5305, 0xaa500737, 0x3e07841c, 0x7fdeae5c,
      0x8e7d44ec, 0x5716f2b8, 0xb03ada37, 0xf0500c0d, 0xf01c1f04, 0x0200b3ff,
      0xae0cf51a, 0x3cb574b2, 0x25837a58, 0xdc0921bd, 0xd19113f9, 0x7ca92ff6,
      0x94324773, 0x22f54701, 0x3ae5e581, 0x37c2dadc, 0xc8b57634, 0x9af3dda7,
      0xa9446146, 0x0fd0030e, 0xecc8c73e, 0xa4751e41, 0xe238cd99, 0x3bea0e2f,
      0x3280bba1, 0x183eb331, 0x4e548b38, 0x4f6db908, 0x6f420d03, 0xf60a04bf,
      0x2cb81290, 0x24977c79, 0x5679b072, 0xbcaf89af, 0xde9a771f, 0xd9930810,
      0xb38bae12, 0xdccf3f2e, 0x5512721f, 0x2e6b7124, 0x501adde6, 0x9f84cd87,
      0x7a584718, 0x7408da17, 0xbc9f9abc, 0xe94b7d8c, 0xec7aec3a, 0xdb851dfa,
      0x63094366, 0xc464c3d2, 0xef1c1847, 0x3215d908, 0xdd433b37, 0x24c2ba16,
      0x12a14d43, 0x2a65c451, 0x50940002, 0x133ae4dd, 0x71dff89e, 0x10314e55,
      0x81ac77d6, 0x5f11199b, 0x043556f1, 0xd7a3c76b, 0x3c11183b, 0x5924a509,
      0xf28fe6ed, 0x97f1fbfa, 0x9ebabf2c, 0x1e153c6e, 0x86e34570, 0xeae96fb1,
      0x860e5e0a, 0x5a3e2ab3, 0x771fe71c, 0x4e3d06fa, 0x2965dcb9, 0x99e71d0f,
      0x803e89d6, 0x5266c825, 0x2e4cc978, 0x9c10b36a, 0xc6150eba, 0x94e2ea78,
      0xa5fc3c53, 0x1e0a2df4, 0xf2f74ea7, 0x361d2b3d, 0x1939260f, 0x19c27960,
      0x5223a708, 0xf71312b6, 0xebadfe6e, 0xeac31f66, 0xe3bc4595, 0xa67bc883,
      0xb17f37d1, 0x018cff28, 0xc332ddef, 0xbe6c5aa5, 0x65582185, 0x68ab9802,
      0xeecea50f, 0xdb2f953b, 0x2aef7dad, 0x5b6e2f84, 0x1521b628, 0x29076170,
      0xecdd4775, 0x619f1510, 0x13cca830, 0xeb61bd96, 0x0334fe1e, 0xaa0363cf,
      0xb5735c90, 0x4c70a239, 0xd59e9e0b, 0xcbaade14, 0xeecc86bc, 0x60622ca7,
      0x9cab5cab, 0xb2f3846e, 0x648b1eaf, 0x19bdf0ca, 0xa02369b9, 0x655abb50,
      0x40685a32, 0x3c2ab4b3, 0x319ee9d5, 0xc021b8f7, 0x9b540b19, 0x875fa099,
      0x95f7997e, 0x623d7da8, 0xf837889a, 0x97e32d77, 0x11ed935f, 0x16681281,
      0x0e358829, 0xc7e61fd6, 0x96dedfa1, 0x7858ba99, 0x57f584a5, 0x1b227263,
      0x9b83c3ff, 0x1ac24696, 0xcdb30aeb, 0x532e3054, 0x8fd948e4, 0x6dbc3128,
      0x58ebf2ef, 0x34c6ffea, 0xfe28ed61, 0xee7c3c73, 0x5d4a14d9, 0xe864b7e3,
      0x42105d14, 0x203e13e0, 0x45eee2b6, 0xa3aaabea, 0xdb6c4f15, 0xfacb4fd0,
      0xc742f442, 0xef6abbb5, 0x654f3b1d, 0x41cd2105, 0xd81e799e, 0x86854dc7,
      0xe44b476a, 0x3d816250, 0xcf62a1f2, 0x5b8d2646, 0xfc8883a0, 0xc1c7b6a3,
      0x7f1524c3, 0x69cb7492, 0x47848a0b, 0x5692b285, 0x095bbf00, 0xad19489d,
      0x1462b174, 0x23820e00, 0x58428d2a, 0x0c55f5ea, 0x1dadf43e, 0x233f7061,
      0x3372f092, 0x8d937e41, 0xd65fecf1, 0x6c223bdb, 0x7cde3759, 0xcbee7460,
      0x4085f2a7, 0xce77326e, 0xa6078084, 0x19f8509e, 0xe8efd855, 0x61d99735,
      0xa969a7aa, 0xc50c06c2, 0x5a04abfc, 0x800bcadc, 0x9e447a2e, 0xc3453484,
      0xfdd56705, 0x0e1e9ec9, 0xdb73dbd3, 0x105588cd, 0x675fda79, 0xe3674340,
      0xc5c43465, 0x713e38d8, 0x3d28f89e, 0xf16dff20, 0x153e21e7, 0x8fb03d4a,
      0xe6e39f2b, 0xdb83adf7, 0xe93d5a68, 0x948140f7, 0xf64c261c, 0x94692934,
      0x411520f7, 0x7602d4f7, 0xbcf46b2e, 0xd4a20068, 0xd4082471, 0x3320f46a,
      0x43b7d4b7, 0x500061af, 0x1e39f62e, 0x97244546, 0x14214f74, 0xbf8b8840,
      0x4d95fc1d, 0x96b591af, 0x70f4ddd3, 0x66a02f45, 0xbfbc09ec, 0x03bd9785,
      0x7fac6dd0, 0x31cb8504, 0x96eb27b3, 0x55fd3941, 0xda2547e6, 0xabca0a9a,
      0x28507825, 0x530429f4, 0x0a2c86da, 0xe9b66dfb, 0x68dc1462, 0xd7486900,
      0x680ec0a4, 0x27a18dee, 0x4f3ffea2, 0xe887ad8c, 0xb58ce006, 0x7af4d6b6,
      0xaace1e7c, 0xd3375fec, 0xce78a399, 0x406b2a42, 0x20fe9e35, 0xd9f385b9,
      0xee39d7ab, 0x3b124e8b, 0x1dc9faf7, 0x4b6d1856, 0x26a36631, 0xeae397b2,
      0x3a6efa74, 0xdd5b4332, 0x6841e7f7, 0xca7820fb, 0xfb0af54e, 0xd8feb397,
      0x454056ac, 0xba489527, 0x55533a3a, 0x20838d87, 0xfe6ba9b7, 0xd096954b,
      0x55a867bc, 0xa1159a58, 0xcca92963, 0x99e1db33, 0xa62a4a56, 0x3f3125f9,
      0x5ef47e1c, 0x9029317c, 0xfdf8e802, 0x04272f70, 0x80bb155c, 0x05282ce3,
      0x95c11548, 0xe4c66d22, 0x48c1133f, 0xc70f86dc, 0x07f9c9ee, 0x41041f0f,
      0x404779a4, 0x5d886e17, 0x325f51eb, 0xd59bc0d1, 0xf2bcc18f, 0x41113564,
      0x257b7834, 0x602a9c60, 0xdff8e8a3, 0x1f636c1b, 0x0e12b4c2, 0x02e1329e,
      0xaf664fd1, 0xcad18115, 0x6b2395e0, 0x333e92e1, 0x3b240b62, 0xeebeb922,
      0x85b2a20e, 0xe6ba0d99, 0xde720c8c, 0x2da2f728, 0xd0127845, 0x95b794fd,
      0x647d0862, 0xe7ccf5f0, 0x5449a36f, 0x877d48fa, 0xc39dfd27, 0xf33e8d1e,
      0x0a476341, 0x992eff74, 0x3a6f6eab, 0xf4f8fd37, 0xa812dc60, 0xa1ebddf8,
      0x991be14c, 0xdb6e6b0d, 0xc67b5510, 0x6d672c37, 0x2765d43b, 0xdcd0e804,
      0xf1290dc7, 0xcc00ffa3, 0xb5390f92, 0x690fed0b, 0x667b9ffb, 0xcedb7d9c,
      0xa091cf0b, 0xd9155ea3, 0xbb132f88, 0x515bad24, 0x7b9479bf, 0x763bd6eb,
      0x37392eb3, 0xcc115979, 0x8026e297, 0xf42e312d, 0x6842ada7, 0xc66a2b3b,
      0x12754ccc, 0x782ef11c, 0x6a124237, 0xb79251e7, 0x06a1bbe6, 0x4bfb6350,
      0x1a6b1018, 0x11caedfa, 0x3d25bdd8, 0xe2e1c3c9, 0x44421659, 0x0a121386,
      0xd90cec6e, 0xd5abea2a, 0x64af674e, 0xda86a85f, 0xbebfe988, 0x64e4c3fe,
      0x9dbc8057, 0xf0f7c086, 0x60787bf8, 0x6003604d, 0xd1fd8346, 0xf6381fb0,
      0x7745ae04, 0xd736fccc, 0x83426b33, 0xf01eab71, 0xb0804187, 0x3c005e5f,
      0x77a057be, 0xbde8ae24, 0x55464299, 0xbf582e61, 0x4e58f48f, 0xf2ddfda2,
      0xf474ef38, 0x8789bdc2, 0x5366f9c3, 0xc8b38e74, 0xb475f255, 0x46fcd9b9,
      0x7aeb2661, 0x8b1ddf84, 0x846a0e79, 0x915f95e2, 0x466e598e, 0x20b45770,
      0x8cd55591, 0xc902de4c, 0xb90bace1, 0xbb8205d0, 0x11a86248, 0x7574a99e,
      0xb77f19b6, 0xe0a9dc09, 0x662d09a1, 0xc4324633, 0xe85a1f02, 0x09f0be8c,
      0x4a99a025, 0x1d6efe10, 0x1ab93d1d, 0x0ba5a4df, 0xa186f20f, 0x2868f169,
      0xdcb7da83, 0x573906fe, 0xa1e2ce9b, 0x4fcd7f52, 0x50115e01, 0xa70683fa,
      0xa002b5c4, 0x0de6d027, 0x9af88c27, 0x773f8641, 0xc3604c06, 0x61a806b5,
      0xf0177a28, 0xc0f586e0, 0x006058aa, 0x30dc7d62, 0x11e69ed7, 0x2338ea63,
      0x53c2dd94, 0xc2c21634, 0xbbcbee56, 0x90bcb6de, 0xebfc7da1, 0xce591d76,
      0x6f05e409, 0x4b7c0188, 0x39720a3d, 0x7c927c24, 0x86e3725f, 0x724d9db9,
      0x1ac15bb4, 0xd39eb8fc, 0xed545578, 0x08fca5b5, 0xd83d7cd3, 0x4dad0fc4,
      0x1e50ef5e, 0xb161e6f8, 0xa28514d9, 0x6c51133c, 0x6fd5c7e7, 0x56e14ec4,
      0x362abfce, 0xddc6c837, 0xd79a3234, 0x92638212, 0x670efa8e, 0x406000e0,
      0x3a39ce37, 0xd3faf5cf, 0xabc27737, 0x5ac52d1b, 0x5cb0679e, 0x4fa33742,
      0xd3822740, 0x99bc9bbe, 0xd5118e9d, 0xbf0f7315, 0xd62d1c7e, 0xc700c47b,
      0xb78c1b6b, 0x21a19045, 0xb26eb1be, 0x6a366eb4, 0x5748ab2f, 0xbc946e79,
      0xc6a376d2, 0x6549c2c8, 0x530ff8ee, 0x468dde7d, 0xd5730a1d, 0x4cd04dc6,
      0x2939bbdb, 0xa9ba4650, 0xac9526e8, 0xbe5ee304, 0xa1fad5f0, 0x6a2d519a,
      0x63ef8ce2, 0x9a86ee22, 0xc089c2b8, 0x43242ef6, 0xa51e03aa, 0x9cf2d0a4,
      0x83c061ba, 0x9be96a4d, 0x8fe51550, 0xba645bd6, 0x2826a2f9, 0xa73a3ae1,
      0x4ba99586, 0xef5562e9, 0xc72fefd3, 0xf752f7da, 0x3f046f69, 0x77fa0a59,
      0x80e4a915, 0x87b08601, 0x9b09e6ad, 0x3b3ee593, 0xe990fd5a, 0x9e34d797,
      0x2cf0b7d9, 0x022b8b51, 0x96d5ac3a, 0x017da67d, 0xd1cf3ed6, 0x7c7d2d28,
      0x1f9f25cf, 0xadf2b89b, 0x5ad6b472, 0x5a88f54c, 0xe029ac71, 0xe019a5e6,
      0x47b0acfd, 0xed93fa9b, 0xe8d3c48d, 0x283b57cc, 0xf8d56629, 0x79132e28,
      0x785f0191, 0xed756055, 0xf7960e44, 0xe3d35e8c, 0x15056dd4, 0x88f46dba,
      0x03a16125, 0x0564f0bd, 0xc3eb9e15, 0x3c9057a2, 0x97271aec, 0xa93a072a,
      0x1b3f6d9b, 0x1e6321f5, 0xf59c66fb, 0x26dcf319, 0x7533d928, 0xb155fdf5,
      0x03563482, 0x8aba3cbb, 0x28517711, 0xc20ad9f8, 0xabcc5167, 0xccad925f,
      0x4de81751, 0x3830dc8e, 0x379d5862, 0x9320f991, 0xea7a90c2, 0xfb3e7bce,
      0x5121ce64, 0x774fbe32, 0xa8b6e37e, 0xc3293d46, 0x48de5369, 0x6413e680,
      0xa2ae0810, 0xdd6db224, 0x69852dfd, 0x09072166, 0xb39a460a, 0x6445c0dd,
      0x586cdecf, 0x1c20c8ae, 0x5bbef7dd, 0x1b588d40, 0xccd2017f, 0x6bb4e3bb,
      0xdda26a7e, 0x3a59ff45, 0x3e350a44, 0xbcb4cdd5, 0x72eacea8, 0xfa6484bb,
      0x8d6612ae, 0xbf3c6f47, 0xd29be463, 0x542f5d9e, 0xaec2771b, 0xf64e6370,
      0x740e0d8d, 0xe75b1357, 0xf8721671, 0xaf537d5d, 0x4040cb08, 0x4eb4e2cc,
      0x34d2466a, 0x0115af84, 0xe1b00428, 0x95983a1d, 0x06b89fb4, 0xce6ea048,
      0x6f3f3b82, 0x3520ab82, 0x011a1d4b, 0x277227f8, 0x611560b1, 0xe7933fdc,
      0xbb3a792b, 0x344525bd, 0xa08839e1, 0x51ce794b, 0x2f32c9b7, 0xa01fbac9,
      0xe01cc87e, 0xbcc7d1f6, 0xcf0111c3, 0xa1e8aac7, 0x1a908749, 0xd44fbd9a,
      0xd0dadecb, 0xd50ada38, 0x0339c32a, 0xc6913667, 0x8df9317c, 0xe0b12b4f,
      0xf79e59b7, 0x43f5bb3a, 0xf2d519ff, 0x27d9459c, 0xbf97222c, 0x15e6fc2a,
      0x0f91fc71, 0x9b941525, 0xfae59361, 0xceb69ceb, 0xc2a86459, 0x12baa8d1,
      0xb6c1075e, 0xe3056a0c, 0x10d25065, 0xcb03a442, 0xe0ec6e0e, 0x1698db3b,
      0x4c98a0be, 0x3278e964, 0x9f1f9532, 0xe0d392df, 0xd3a0342b, 0x8971f21e,
      0x1b0a7441, 0x4ba3348c, 0xc5be7120, 0xc37632d8, 0xdf359f8d, 0x9b992f2e,
      0xe60b6f47, 0x0fe3f11d, 0xe54cda54, 0x1edad891, 0xce6279cf, 0xcd3e7e6f,
      0x1618b166, 0xfd2c1d05, 0x848fd2c5, 0xf6fb2299, 0xf523f357, 0xa6327623,
      0x93a83531, 0x56cccd02, 0xacf08162, 0x5a75ebb5, 0x6e163697, 0x88d273cc,
      0xde966292, 0x81b949d0, 0x4c50901b, 0x71c65614, 0xe6c6c7bd, 0x327a140a,
      0x45e1d006, 0xc3f27b9a, 0xc9aa53fd, 0x62a80f00, 0xbb25bfe2, 0x35bdd2f6,
      0x71126905, 0xb2040222, 0xb6cbcf7c, 0xcd769c2b, 0x53113ec0, 0x1640e3d3,
      0x38abbd60, 0x2547adf0, 0xba38209c, 0xf746ce76, 0x77afa1c5, 0x20756060,
      0x85cbfe4e, 0x8ae88dd8, 0x7aaaf9b0, 0x4cf9aa7e, 0x1948c25c, 0x02fb8a8c,
      0x01c36ae4, 0xd6ebe1f9, 0x90d4f869, 0xa65cdea0, 0x3f09252d, 0xc208e69f,
      0xb74e6132, 0xce77e25b, 0x578fdfe3, 0x3ac372e6,
    ];

    /**
     * @type {Array.<number>}
     * @const
     * @inner
     */
    var C_ORIG = [
      0x4f727068, 0x65616e42, 0x65686f6c, 0x64657253, 0x63727944, 0x6f756274,
    ];

    /**
     * @param {Array.<number>} lr
     * @param {number} off
     * @param {Array.<number>} P
     * @param {Array.<number>} S
     * @returns {Array.<number>}
     * @inner
     */
    function _encipher(lr, off, P, S) {
      // This is our bottleneck: 1714/1905 ticks / 90% - see profile.txt
      var n,
        l = lr[off],
        r = lr[off + 1];
      l ^= P[0];

      /*
      for (var i=0, k=BLOWFISH_NUM_ROUNDS-2; i<=k;)
          // Feistel substitution on left word
          n  = S[l >>> 24],
          n += S[0x100 | ((l >> 16) & 0xff)],
          n ^= S[0x200 | ((l >> 8) & 0xff)],
          n += S[0x300 | (l & 0xff)],
          r ^= n ^ P[++i],
          // Feistel substitution on right word
          n  = S[r >>> 24],
          n += S[0x100 | ((r >> 16) & 0xff)],
          n ^= S[0x200 | ((r >> 8) & 0xff)],
          n += S[0x300 | (r & 0xff)],
          l ^= n ^ P[++i];
      */

      //The following is an unrolled version of the above loop.
      //Iteration 0
      n = S[l >>> 24];
      n += S[0x100 | ((l >> 16) & 0xff)];
      n ^= S[0x200 | ((l >> 8) & 0xff)];
      n += S[0x300 | (l & 0xff)];
      r ^= n ^ P[1];
      n = S[r >>> 24];
      n += S[0x100 | ((r >> 16) & 0xff)];
      n ^= S[0x200 | ((r >> 8) & 0xff)];
      n += S[0x300 | (r & 0xff)];
      l ^= n ^ P[2];
      //Iteration 1
      n = S[l >>> 24];
      n += S[0x100 | ((l >> 16) & 0xff)];
      n ^= S[0x200 | ((l >> 8) & 0xff)];
      n += S[0x300 | (l & 0xff)];
      r ^= n ^ P[3];
      n = S[r >>> 24];
      n += S[0x100 | ((r >> 16) & 0xff)];
      n ^= S[0x200 | ((r >> 8) & 0xff)];
      n += S[0x300 | (r & 0xff)];
      l ^= n ^ P[4];
      //Iteration 2
      n = S[l >>> 24];
      n += S[0x100 | ((l >> 16) & 0xff)];
      n ^= S[0x200 | ((l >> 8) & 0xff)];
      n += S[0x300 | (l & 0xff)];
      r ^= n ^ P[5];
      n = S[r >>> 24];
      n += S[0x100 | ((r >> 16) & 0xff)];
      n ^= S[0x200 | ((r >> 8) & 0xff)];
      n += S[0x300 | (r & 0xff)];
      l ^= n ^ P[6];
      //Iteration 3
      n = S[l >>> 24];
      n += S[0x100 | ((l >> 16) & 0xff)];
      n ^= S[0x200 | ((l >> 8) & 0xff)];
      n += S[0x300 | (l & 0xff)];
      r ^= n ^ P[7];
      n = S[r >>> 24];
      n += S[0x100 | ((r >> 16) & 0xff)];
      n ^= S[0x200 | ((r >> 8) & 0xff)];
      n += S[0x300 | (r & 0xff)];
      l ^= n ^ P[8];
      //Iteration 4
      n = S[l >>> 24];
      n += S[0x100 | ((l >> 16) & 0xff)];
      n ^= S[0x200 | ((l >> 8) & 0xff)];
      n += S[0x300 | (l & 0xff)];
      r ^= n ^ P[9];
      n = S[r >>> 24];
      n += S[0x100 | ((r >> 16) & 0xff)];
      n ^= S[0x200 | ((r >> 8) & 0xff)];
      n += S[0x300 | (r & 0xff)];
      l ^= n ^ P[10];
      //Iteration 5
      n = S[l >>> 24];
      n += S[0x100 | ((l >> 16) & 0xff)];
      n ^= S[0x200 | ((l >> 8) & 0xff)];
      n += S[0x300 | (l & 0xff)];
      r ^= n ^ P[11];
      n = S[r >>> 24];
      n += S[0x100 | ((r >> 16) & 0xff)];
      n ^= S[0x200 | ((r >> 8) & 0xff)];
      n += S[0x300 | (r & 0xff)];
      l ^= n ^ P[12];
      //Iteration 6
      n = S[l >>> 24];
      n += S[0x100 | ((l >> 16) & 0xff)];
      n ^= S[0x200 | ((l >> 8) & 0xff)];
      n += S[0x300 | (l & 0xff)];
      r ^= n ^ P[13];
      n = S[r >>> 24];
      n += S[0x100 | ((r >> 16) & 0xff)];
      n ^= S[0x200 | ((r >> 8) & 0xff)];
      n += S[0x300 | (r & 0xff)];
      l ^= n ^ P[14];
      //Iteration 7
      n = S[l >>> 24];
      n += S[0x100 | ((l >> 16) & 0xff)];
      n ^= S[0x200 | ((l >> 8) & 0xff)];
      n += S[0x300 | (l & 0xff)];
      r ^= n ^ P[15];
      n = S[r >>> 24];
      n += S[0x100 | ((r >> 16) & 0xff)];
      n ^= S[0x200 | ((r >> 8) & 0xff)];
      n += S[0x300 | (r & 0xff)];
      l ^= n ^ P[16];
      lr[off] = r ^ P[BLOWFISH_NUM_ROUNDS + 1];
      lr[off + 1] = l;
      return lr;
    }

    /**
     * @param {Array.<number>} data
     * @param {number} offp
     * @returns {{key: number, offp: number}}
     * @inner
     */
    function _streamtoword(data, offp) {
      for (var i = 0, word = 0; i < 4; ++i)
        (word = (word << 8) | (data[offp] & 0xff)),
          (offp = (offp + 1) % data.length);
      return {
        key: word,
        offp: offp,
      };
    }

    /**
     * @param {Array.<number>} key
     * @param {Array.<number>} P
     * @param {Array.<number>} S
     * @inner
     */
    function _key(key, P, S) {
      var offset = 0,
        lr = [0, 0],
        plen = P.length,
        slen = S.length,
        sw;
      for (var i = 0; i < plen; i++)
        (sw = _streamtoword(key, offset)),
          (offset = sw.offp),
          (P[i] = P[i] ^ sw.key);
      for (i = 0; i < plen; i += 2)
        (lr = _encipher(lr, 0, P, S)), (P[i] = lr[0]), (P[i + 1] = lr[1]);
      for (i = 0; i < slen; i += 2)
        (lr = _encipher(lr, 0, P, S)), (S[i] = lr[0]), (S[i + 1] = lr[1]);
    }

    /**
     * Expensive key schedule Blowfish.
     * @param {Array.<number>} data
     * @param {Array.<number>} key
     * @param {Array.<number>} P
     * @param {Array.<number>} S
     * @inner
     */
    function _ekskey(data, key, P, S) {
      var offp = 0,
        lr = [0, 0],
        plen = P.length,
        slen = S.length,
        sw;
      for (var i = 0; i < plen; i++)
        (sw = _streamtoword(key, offp)),
          (offp = sw.offp),
          (P[i] = P[i] ^ sw.key);
      offp = 0;
      for (i = 0; i < plen; i += 2)
        (sw = _streamtoword(data, offp)),
          (offp = sw.offp),
          (lr[0] ^= sw.key),
          (sw = _streamtoword(data, offp)),
          (offp = sw.offp),
          (lr[1] ^= sw.key),
          (lr = _encipher(lr, 0, P, S)),
          (P[i] = lr[0]),
          (P[i + 1] = lr[1]);
      for (i = 0; i < slen; i += 2)
        (sw = _streamtoword(data, offp)),
          (offp = sw.offp),
          (lr[0] ^= sw.key),
          (sw = _streamtoword(data, offp)),
          (offp = sw.offp),
          (lr[1] ^= sw.key),
          (lr = _encipher(lr, 0, P, S)),
          (S[i] = lr[0]),
          (S[i + 1] = lr[1]);
    }

    /**
     * Internaly crypts a string.
     * @param {Array.<number>} b Bytes to crypt
     * @param {Array.<number>} salt Salt bytes to use
     * @param {number} rounds Number of rounds
     * @param {function(Error, Array.<number>=)=} callback Callback receiving the error, if any, and the resulting bytes. If
     *  omitted, the operation will be performed synchronously.
     *  @param {function(number)=} progressCallback Callback called with the current progress
     * @returns {!Array.<number>|undefined} Resulting bytes if callback has been omitted, otherwise `undefined`
     * @inner
     */
    function _crypt(b, salt, rounds, callback, progressCallback) {
      var cdata = C_ORIG.slice(),
        clen = cdata.length,
        err;

      // Validate
      if (rounds < 4 || rounds > 31) {
        err = Error("Illegal number of rounds (4-31): " + rounds);
        if (callback) {
          nextTick(callback.bind(this, err));
          return;
        } else throw err;
      }
      if (salt.length !== BCRYPT_SALT_LEN) {
        err = Error(
          "Illegal salt length: " + salt.length + " != " + BCRYPT_SALT_LEN,
        );
        if (callback) {
          nextTick(callback.bind(this, err));
          return;
        } else throw err;
      }
      rounds = (1 << rounds) >>> 0;
      var P,
        S,
        i = 0,
        j;

      //Use typed arrays when available - huge speedup!
      if (typeof Int32Array === "function") {
        P = new Int32Array(P_ORIG);
        S = new Int32Array(S_ORIG);
      } else {
        P = P_ORIG.slice();
        S = S_ORIG.slice();
      }
      _ekskey(salt, b, P, S);

      /**
       * Calcualtes the next round.
       * @returns {Array.<number>|undefined} Resulting array if callback has been omitted, otherwise `undefined`
       * @inner
       */
      function next() {
        if (progressCallback) progressCallback(i / rounds);
        if (i < rounds) {
          var start = Date.now();
          for (; i < rounds; ) {
            i = i + 1;
            _key(b, P, S);
            _key(salt, P, S);
            if (Date.now() - start > MAX_EXECUTION_TIME) break;
          }
        } else {
          for (i = 0; i < 64; i++)
            for (j = 0; j < clen >> 1; j++) _encipher(cdata, j << 1, P, S);
          var ret = [];
          for (i = 0; i < clen; i++)
            ret.push(((cdata[i] >> 24) & 0xff) >>> 0),
              ret.push(((cdata[i] >> 16) & 0xff) >>> 0),
              ret.push(((cdata[i] >> 8) & 0xff) >>> 0),
              ret.push((cdata[i] & 0xff) >>> 0);
          if (callback) {
            callback(null, ret);
            return;
          } else return ret;
        }
        if (callback) nextTick(next);
      }

      // Async
      if (typeof callback !== "undefined") {
        next();

        // Sync
      } else {
        var res;
        while (true)
          if (typeof (res = next()) !== "undefined") return res || [];
      }
    }

    /**
     * Internally hashes a password.
     * @param {string} password Password to hash
     * @param {?string} salt Salt to use, actually never null
     * @param {function(Error, string=)=} callback Callback receiving the error, if any, and the resulting hash. If omitted,
     *  hashing is performed synchronously.
     *  @param {function(number)=} progressCallback Callback called with the current progress
     * @returns {string|undefined} Resulting hash if callback has been omitted, otherwise `undefined`
     * @inner
     */
    function _hash(password, salt, callback, progressCallback) {
      var err;
      if (typeof password !== "string" || typeof salt !== "string") {
        err = Error("Invalid string / salt: Not a string");
        if (callback) {
          nextTick(callback.bind(this, err));
          return;
        } else throw err;
      }

      // Validate the salt
      var minor, offset;
      if (salt.charAt(0) !== "$" || salt.charAt(1) !== "2") {
        err = Error("Invalid salt version: " + salt.substring(0, 2));
        if (callback) {
          nextTick(callback.bind(this, err));
          return;
        } else throw err;
      }
      if (salt.charAt(2) === "$")
        (minor = String.fromCharCode(0)), (offset = 3);
      else {
        minor = salt.charAt(2);
        if (
          (minor !== "a" && minor !== "b" && minor !== "y") ||
          salt.charAt(3) !== "$"
        ) {
          err = Error("Invalid salt revision: " + salt.substring(2, 4));
          if (callback) {
            nextTick(callback.bind(this, err));
            return;
          } else throw err;
        }
        offset = 4;
      }

      // Extract number of rounds
      if (salt.charAt(offset + 2) > "$") {
        err = Error("Missing salt rounds");
        if (callback) {
          nextTick(callback.bind(this, err));
          return;
        } else throw err;
      }
      var r1 = parseInt(salt.substring(offset, offset + 1), 10) * 10,
        r2 = parseInt(salt.substring(offset + 1, offset + 2), 10),
        rounds = r1 + r2,
        real_salt = salt.substring(offset + 3, offset + 25);
      password += minor >= "a" ? "\x00" : "";
      var passwordb = utf8Array(password),
        saltb = base64_decode(real_salt, BCRYPT_SALT_LEN);

      /**
       * Finishes hashing.
       * @param {Array.<number>} bytes Byte array
       * @returns {string}
       * @inner
       */
      function finish(bytes) {
        var res = [];
        res.push("$2");
        if (minor >= "a") res.push(minor);
        res.push("$");
        if (rounds < 10) res.push("0");
        res.push(rounds.toString());
        res.push("$");
        res.push(base64_encode(saltb, saltb.length));
        res.push(base64_encode(bytes, C_ORIG.length * 4 - 1));
        return res.join("");
      }

      // Sync
      if (typeof callback == "undefined")
        return finish(_crypt(passwordb, saltb, rounds));
      // Async
      else {
        _crypt(
          passwordb,
          saltb,
          rounds,
          function (err, bytes) {
            if (err) callback(err, null);
            else callback(null, finish(bytes));
          },
          progressCallback,
        );
      }
    }

    /**
     * Encodes a byte array to base64 with up to len bytes of input, using the custom bcrypt alphabet.
     * @function
     * @param {!Array.<number>} bytes Byte array
     * @param {number} length Maximum input length
     * @returns {string}
     */
    function encodeBase64(bytes, length) {
      return base64_encode(bytes, length);
    }

    /**
     * Decodes a base64 encoded string to up to len bytes of output, using the custom bcrypt alphabet.
     * @function
     * @param {string} string String to decode
     * @param {number} length Maximum output length
     * @returns {!Array.<number>}
     */
    function decodeBase64(string, length) {
      return base64_decode(string, length);
    }
    var _default = (_exports.default = {
      setRandomFallback,
      genSaltSync,
      genSalt,
      hashSync,
      hash,
      compareSync,
      compare,
      getRounds,
      getSalt,
      truncates,
      encodeBase64,
      decodeBase64,
    });
  },
);

const bcrypt=globalThis.bcrypt;
(function(root){
  const levels=['IID','Bộ phận','Cá nhân'];
  const months=q=>Array.from({length:3},(_,i)=>(q-1)*3+i+1);
  function migrate(s){
    const x=JSON.parse(JSON.stringify(s)); x.version=2; x.history=x.history||[];x.actions=x.actions||[];x.archive=x.archive||[];
    x.kpis.forEach(k=>{k.mode=k.mode||'last';k.plan=k.plan||'annual';k.targets=k.targets||{};k.updates=k.updates||{};});
    for(let [old,r]of Object.entries(x.reviews)){let bar=old.indexOf('|');if(bar<0)continue;let part;try{part=JSON.parse(old.slice(bar+1))}catch{continue}if(part[0]!=='Cá nhân')continue;let candidates=x.kpis.filter(k=>k.level==='Cá nhân'&&k.team===part[1]&&k.owner===part[2]);let mapped=[...new Set(candidates.map(key))];if(mapped.length===1){let next=old.slice(0,bar+1)+mapped[0];if(next!==old&&!x.reviews[next]){x.reviews[next]=r;delete x.reviews[old];}}}return x;
  }
  const key=k=>JSON.stringify(k.level==='IID'?['IID']:k.level==='Bộ phận'?['Bộ phận',k.team]:['Cá nhân',k.team,k.ownerEmail||k.owner]);
  const label=ks=>ks[0].level==='IID'?'Toàn khối IID':ks[0].level==='Bộ phận'?ks[0].team:ks[0].owner+' · '+ks[0].team;
  function target(k,m){if(k.targets[m]!=null)return k.targets[m];return k.plan==='linear'?k.target*m/12:k.plan==='monthly'?k.target/12:k.target;}
  function attainment(actual,t,direction){if(actual==null||t==null)return null;if(direction==='down')return actual===0?120:t/actual*100;return t===0?(actual===0?100:120):actual/t*100;}
  function measure(k,period){let ms=period.type==='quarter'?months(period.value):[period.value];let values=ms.map(m=>k.updates[m]?.actual),targets=ms.map(m=>target(k,m));let coverage=values.filter(a=>a!=null).length;let aggregate=a=>k.mode==='sum'?a.reduce((s,v)=>s+v,0):k.mode==='average'?a.reduce((s,v)=>s+v,0)/a.length:a.at(-1);let needed=k.mode==='last'?values.at(-1)!=null:coverage===ms.length;let a=needed?aggregate(values):null,t=aggregate(targets);return{actual:a,target:t,score:attainment(a,t,k.direction),coverage,total:ms.length};}
  function groups(ks){let out={};ks.forEach(k=>(out[key(k)]??=[]).push(k));return out;}
  function weighted(ks,p){if(!ks.length||Math.abs(ks.reduce((s,k)=>s+k.weight,0)-100)>.01)return null;let results=ks.map(k=>measure(k,p).score);return results.some(v=>v==null)?null:results.reduce((s,v,i)=>s+Math.min(120,v)*ks[i].weight/100,0);}
  function composite(s,ks,p){let own=weighted(ks,p);if(ks[0].level==='IID')return own;let iid=weighted(s.kpis.filter(k=>k.level==='IID'),p),dept=weighted(s.kpis.filter(k=>k.level==='Bộ phận'&&k.team===ks[0].team),p);let vals=ks[0].level==='Cá nhân'?[iid,dept,own]:[iid,own],mix=s.mix[ks[0].level==='Cá nhân'?'personal':'department'];return vals.some(v=>v==null)?null:vals.reduce((sum,v,i)=>sum+v*mix[i]/100,0);}
  function primaryGroup(groupsObj,user){
    const entries=Object.values(groupsObj);if(!entries.length)return null;
    if(!user||user.role==='admin'||user.role==='leader')return entries.find(ks=>ks[0].level==='IID')||entries[0];
    if(user.role==='manager')return entries.find(ks=>ks[0].level==='Bộ phận'&&ks[0].team===user.team)||entries[0];
    return entries.find(ks=>ks[0].level==='Cá nhân'&&(ks[0].ownerEmail?.toLowerCase()===user.email?.toLowerCase()||ks[0].owner===user.name))||entries[0];
  }
  function validate(s){if(!s||!Array.isArray(s.kpis)||!s.reviews||!s.mix)throw Error('Thiếu cấu trúc dữ liệu KPI.');let ids=new Set();for(let k of s.kpis){if(!k||typeof k.id!=='string'||ids.has(k.id)||!levels.includes(k.level)||!['up','down'].includes(k.direction)||!Number.isFinite(k.target)||k.target<=0||!Number.isFinite(k.weight)||k.weight<0||k.weight>100||!k.updates||['name','owner','team','unit','source','frequency'].some(n=>typeof k[n]!=='string'))throw Error('KPI không hợp lệ.');ids.add(k.id);if(k.mode&&!['sum','average','last'].includes(k.mode)||k.plan&&!['annual','linear','monthly'].includes(k.plan))throw Error('Cách tính kỳ không hợp lệ.');for(let [m,u]of Object.entries(k.updates))if(!/^([1-9]|1[0-2])$/.test(m)||!u||!Number.isFinite(u.actual)||u.actual<0||typeof u.note!=='string')throw Error('Kết quả tháng không hợp lệ.');for(let[m,t]of Object.entries(k.targets||{}))if(!/^([1-9]|1[0-2])$/.test(m)||!Number.isFinite(t)||t<0)throw Error('Mục tiêu tháng không hợp lệ.');}
    for(let k of s.kpis){if(k.ownerEmail!=null&&(typeof k.ownerEmail!=='string'||k.ownerEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k.ownerEmail)))throw Error('Email người được giao không hợp lệ.');if(k.level!=='IID'&&!s.kpis.some(p=>p.id===k.parent&&p.level===(k.level==='Bộ phận'?'IID':'Bộ phận')&&(k.level!=='Cá nhân'||p.team===k.team)))throw Error('Liên kết cấp trên phải đúng cấp và cùng bộ phận.');}
    for(let [n,b]of [['department',[[30,70],[30,70]]],['personal',[[20,40],[30,50],[20,40]]]]){let a=s.mix[n];if(!Array.isArray(a)||a.length!==b.length||a.some((v,i)=>!Number.isFinite(v)||v<b[i][0]||v>b[i][1])||Math.abs(a.reduce((x,y)=>x+y,0)-100)>.01)throw Error('Cơ cấu trọng số không hợp lệ.');}
    if(s.actions&&!Array.isArray(s.actions)||s.history&&!Array.isArray(s.history)||s.archive&&!Array.isArray(s.archive))throw Error('Dữ liệu quản lý không hợp lệ.');
    for(let a of s.actions||[])if(!a||['id','title','owner','due','status'].some(n=>typeof a[n]!=='string')||!['Mới','Đang làm','Hoàn tất'].includes(a.status)||!/^\d{4}-\d{2}-\d{2}$/.test(a.due)||a.priority!=null&&!['Cao','Trung bình','Thấp'].includes(a.priority)||a.kpiId!=null&&typeof a.kpiId!=='string'||a.note!=null&&typeof a.note!=='string')throw Error('Hành động không hợp lệ.');
    for(let r of Object.values(s.reviews))if(!r||typeof r.note!=='string'||!['Nháp','Đã đánh giá'].includes(r.status))throw Error('Đánh giá không hợp lệ.');return true;
  }
  root.KPI={migrate,months,key,label,target,attainment,measure,groups,weighted,composite,primaryGroup,validate};if(typeof module!=='undefined')module.exports=root.KPI;
})(typeof window!=='undefined'?window:globalThis);

const OWNER='ngocvietai@gmail.com',ADMIN='tamsua16@gmail.com';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const mail=s=>String(s||'').trim().toLowerCase();
async function readBody(request){let text=await request.text();if(text.length>2000000)fail('Dữ liệu quá lớn.',413);try{return JSON.parse(text)}catch{fail('Dữ liệu không hợp lệ.');}}

function scopeOf(u){return u.role==='admin'?'all':u.role==='leader'?'iid':u.role==='manager'?'department':u.role==='contributor'?'personal':u.scope_level||'personal';}
function canReadKpi(u,k){const scope=scopeOf(u);return scope==='all'||scope==='iid'&&k.level==='IID'||scope==='department'&&k.level!=='IID'&&k.team===u.team||scope==='personal'&&k.level==='Cá nhân'&&mail(k.ownerEmail)===u.email;}
function canReadAction(u,a){let scope=scopeOf(u);return scope==='all'||scope==='iid'&&a.level==='IID'||scope==='department'&&a.team===u.team&&a.level!=='IID'||scope==='personal'&&mail(a.ownerEmail)===u.email;}
function scopedState(s,u){if(!s)return null;s=KPI.migrate(s);if(u.role==='admin')return s;let x=KPI.migrate(s),visible=s.kpis.filter(k=>canReadKpi(u,k)),ids=new Set(visible.map(k=>k.id));x.kpis=visible;x.actions=s.actions.filter(a=>canReadAction(u,a));x.archive=['leader','manager'].includes(u.role)?s.archive.filter(k=>canReadKpi(u,k)):[];x.history=[];let refIds=new Set();for(let k of visible){let cur=s.kpis.find(p=>p.id===k.parent);while(cur){if(!ids.has(cur.id))refIds.add(cur.id);cur=s.kpis.find(p=>p.id===cur.parent);}}x.references=s.kpis.filter(k=>refIds.has(k.id)).map(k=>({id:k.id,name:k.name,team:k.team,level:k.level,parent:k.parent,weight:k.weight}));x.reviews={};let groups=KPI.groups(s.kpis),scores={},ownScores={};for(let [key,ks]of Object.entries(groups)){if(!ks.every(k=>ids.has(k.id)))continue;for(let q=1;q<=4;q++){let r=s.reviews[q+'|'+key];if(r){r=JSON.parse(JSON.stringify(r));if(r.snapshot)r.snapshot.kpis=r.snapshot.kpis.filter(k=>ids.has(k.id));x.reviews[q+'|'+key]=r;}}for(let m=1;m<=12;m++){scores['month|'+m+'|'+key]=KPI.composite(s,ks,{type:'month',value:m});ownScores['month|'+m+'|'+key]=KPI.weighted(ks,{type:'month',value:m});}for(let q=1;q<=4;q++){scores['quarter|'+q+'|'+key]=KPI.composite(s,ks,{type:'quarter',value:q});ownScores['quarter|'+q+'|'+key]=KPI.weighted(ks,{type:'quarter',value:q});}}x.scopeScores=scores;x.ownScores=ownScores;return x;}

const COOKIE='__Host-iid_session';
const COST=12;
const publicUser=u=>({email:u.email,role:u.role,team:u.team,name:u.name,scope_level:scopeOf(u),mustChange:!!u.must_change,passwordReady:!!u.password_hash,disabled:!!u.disabled});
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
function passwordPolicy(p){if(typeof p!=='string'||p.length<15||new TextEncoder().encode(p).length>72)fail('Mật khẩu phải có ít nhất 15 ký tự và tối đa 72 byte UTF-8.');}
function cookie(token,age=43200){return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;}
async function sessionUser(request,env){let token=request.headers.get('Cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;let row=await env.DB.prepare('SELECT m.* FROM sessions s JOIN members m ON m.email=s.email WHERE s.token_hash=? AND s.expires_at>? AND m.disabled=0').bind(await digest(token),Date.now()).first();return row||null;}
async function issueSession(env,u){let token=randomToken();await env.DB.prepare('INSERT INTO sessions(token_hash,email,expires_at) VALUES(?,?,?)').bind(await digest(token),u.email,Date.now()+43200000).run();return token;}
async function authRate(env,key,max){let now=Date.now();await env.DB.prepare('INSERT INTO auth_attempts(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END').bind(key,now+900000,now,now).run();let r=await env.DB.prepare('SELECT count FROM auth_attempts WHERE key=?').bind(key).first();if(r.count>max)fail('Quá nhiều lần thử. Vui lòng thử lại sau 15 phút.',429);}
async function auditAuth(env,email,operation,details={}){await env.DB.prepare('INSERT INTO audit(actor,operation,details,at) VALUES(?,?,?,?)').bind(email,operation,JSON.stringify(details),new Date().toISOString()).run();}
async function adminBootstrap(request,env){let email=mail(request.headers.get('oai-authenticated-user-email'));if(!request.headers.get('oai-authenticated-user-id')||![OWNER,ADMIN].includes(email))return null;let u=await env.DB.prepare('SELECT * FROM members WHERE email=?').bind(email).first();if(!u){await env.DB.prepare('INSERT OR IGNORE INTO members(email,role,team,name,scope_level) VALUES(?,?,?,?,?)').bind(email,'admin','',email,'all').run();u=await env.DB.prepare('SELECT * FROM members WHERE email=?').bind(email).first();}return u.role==='admin'&&!u.password_hash&&!u.disabled?u:null;}
async function auth(request,env){let path=new URL(request.url).pathname;if(!env.DB)fail('Kho tài khoản chưa sẵn sàng.',503);if(request.method!=='GET'&&request.headers.get('Origin')!==new URL(request.url).origin)fail('Nguồn yêu cầu không hợp lệ.',403);
  if(path==='/auth/me'){let u=await sessionUser(request,env);if(u)return json({user:publicUser(u)});let setup=await adminBootstrap(request,env);return json({user:null,setupEmail:setup?.email||null});}
  if(request.method!=='POST')fail('Phương thức không hỗ trợ.',405);let body=await readBody(request);
  if(path==='/auth/login'){let email=mail(body.email);await authRate(env,'ip:'+await digest(request.headers.get('CF-Connecting-IP')||'unknown'),60);await authRate(env,'email:'+email,10);let u=await env.DB.prepare('SELECT * FROM members WHERE email=?').bind(email).first();let hash=u?.password_hash||'$2b$12$ooooooooooooooooooooou1d.pHdMd.2DaDnYPgrEjGNMDTy1Qia';let valid=typeof body.password==='string'&&new TextEncoder().encode(body.password).length<=72&&await bcrypt.compare(body.password,hash);if(!u||u.disabled||!u.password_hash||!valid)fail('Email hoặc mật khẩu không đúng.',401);await env.DB.prepare('DELETE FROM auth_attempts WHERE key=?').bind('email:'+email).run();await auditAuth(env,email,'login');return new Response(JSON.stringify({user:publicUser(u)}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':cookie(await issueSession(env,u))}});}
  if(path==='/auth/setup'){let u=await adminBootstrap(request,env);if(!u)fail('Thiết lập ban đầu cần xác thực tài khoản quản trị hiện có.',403);passwordPolicy(body.password);await authRate(env,'setup:'+u.email,5);let hash=await bcrypt.hash(body.password,COST);let r=await env.DB.prepare('UPDATE members SET password_hash=?,must_change=0 WHERE email=? AND password_hash IS NULL').bind(hash,u.email).run();if(!r.meta.changes)fail('Tài khoản đã được thiết lập. Hãy đăng nhập.',409);u.password_hash=hash;await auditAuth(env,u.email,'password_setup');return new Response(JSON.stringify({user:publicUser(u)}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':cookie(await issueSession(env,u))}});}
  let u=await sessionUser(request,env);if(!u)fail('Phiên đăng nhập hết hạn.',401);
  if(path==='/auth/logout'){let token=request.headers.get('Cookie').split(';').map(c=>c.trim()).find(c=>c.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':cookie('',0)}});}
  if(path==='/auth/change-password'){passwordPolicy(body.newPassword);await authRate(env,'change:'+u.email,10);if(typeof body.currentPassword!=='string'||new TextEncoder().encode(body.currentPassword).length>72||!await bcrypt.compare(body.currentPassword,u.password_hash))fail('Mật khẩu hiện tại không đúng.',400);if(await bcrypt.compare(body.newPassword,u.password_hash))fail('Mật khẩu mới phải khác mật khẩu hiện tại.');let hash=await bcrypt.hash(body.newPassword,COST);let r=await env.DB.batch([env.DB.prepare('UPDATE members SET password_hash=?,must_change=0 WHERE email=? AND password_hash=?').bind(hash,u.email,u.password_hash),env.DB.prepare('DELETE FROM sessions WHERE email=?').bind(u.email)]);if(!r[0].meta.changes)fail('Mật khẩu vừa thay đổi. Hãy đăng nhập lại.',409);u.password_hash=hash;u.must_change=0;await auditAuth(env,u.email,'password_change');return new Response(JSON.stringify({user:publicUser(u)}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':cookie(await issueSession(env,u))}});}
  if(path==='/auth/reset-password'){if(u.role!=='admin'||u.must_change)fail('Chỉ quản trị được cấp lại mật khẩu.',403);let target=await env.DB.prepare('SELECT * FROM members WHERE email=?').bind(mail(body.email)).first();if(!target||target.email===u.email)fail('Dùng chức năng tự đổi mật khẩu cho tài khoản của bạn.');let temp=randomToken().slice(0,24),hash=await bcrypt.hash(temp,COST);await env.DB.batch([env.DB.prepare('UPDATE members SET password_hash=?,must_change=1 WHERE email=?').bind(hash,target.email),env.DB.prepare('DELETE FROM sessions WHERE email=?').bind(target.email)]);await auditAuth(env,u.email,'password_reset',{email:target.email});return json({temporaryPassword:temp,email:target.email});}
  fail('Không tìm thấy chức năng tài khoản.',404);
}

function hasScope(user,k){return user.role==='admin'||user.role==='leader'&&k.level==='IID'||user.role==='manager'&&k.level!=='IID'&&user.team===k.team||user.role==='contributor'&&k.level==='Cá nhân'&&mail(k.ownerEmail)===user.email;}
function unlocked(s,m){if(Object.entries(s.reviews).some(([key,r])=>key.startsWith(Math.ceil(m/3)+'|')&&r.status==='Đã đánh giá'))fail('Quý này đã chốt đánh giá. Quản trị cần mở lại trước khi sửa dữ liệu.',423);}
function applyOperation(s,op,user){
  if(user.role==='viewer')fail('Tài khoản chỉ có quyền xem.',403);
  if(op.type==='replace'){if(user.role!=='admin')fail('Chỉ quản trị được nhập toàn bộ dữ liệu.',403);if(Object.values(s.reviews).some(r=>r.status==='Đã đánh giá'))fail('Mở lại các quý đã chốt trước khi nhập dữ liệu.',423);KPI.validate(op.state);return KPI.migrate(op.state);}
  if(op.type==='kpi'){let k=op.kpi,old=s.kpis.find(x=>x.id===k.id);if(user.role==='leader'&&(k.level!=='IID'||old&&old.level!=='IID'))fail('Cấp IID chỉ quản lý KPI IID.',403);if(!['admin','leader','manager'].includes(user.role)||user.role==='manager'&&(k.level==='IID'||k.team!==user.team||old&&old.team!==user.team))fail('Không có quyền quản lý KPI này.',403);if(Object.values(s.reviews).some(r=>r.status==='Đã đánh giá'))fail('Mở các quý đã chốt trước khi thay đổi định nghĩa KPI.',423);if(old&&old.level!==k.level&&s.kpis.some(x=>x.parent===k.id))fail('KPI còn mục tiêu con.');k.updates=old?.updates||{};if(old)s.kpis[s.kpis.indexOf(old)]=k;else s.kpis.push(k);}
  else if(op.type==='delete'){let k=s.kpis.find(x=>x.id===op.id);if(!k||!['admin','leader','manager'].includes(user.role)||!hasScope(user,k))fail('Không có quyền xóa KPI.',403);if(Object.values(s.reviews).some(r=>r.status==='Đã đánh giá'))fail('Mở các quý đã chốt trước khi xóa KPI.',423);if(s.kpis.some(x=>x.parent===k.id))fail('KPI còn mục tiêu con.');s.archive.push({...k,archivedAt:new Date().toISOString()});s.kpis=s.kpis.filter(x=>x.id!==k.id);}
  else if(op.type==='restore'){let k=s.archive.find(x=>x.id===op.id);if(!k||!['admin','leader','manager'].includes(user.role)||!hasScope(user,k))fail('Không có quyền khôi phục KPI.',403);if(Object.values(s.reviews).some(r=>r.status==='Đã đánh giá'))fail('Mở các quý đã chốt trước khi khôi phục KPI.',423);let {archivedAt,...restored}=k;s.archive=s.archive.filter(x=>x.id!==op.id);s.kpis.push(restored);}
  else if(op.type==='update'){let k=s.kpis.find(x=>x.id===op.id);if(!k||!hasScope(user,k))fail('Bạn chỉ được cập nhật KPI được giao hoặc thuộc bộ phận quản lý.',403);if(!Number.isInteger(op.month)||op.month<1||op.month>12||!Number.isFinite(op.actual)||op.actual<0||typeof op.note!=='string')fail('Kết quả không hợp lệ.');unlocked(s,op.month);k.updates[op.month]={actual:op.actual,note:op.note,by:user.email,at:new Date().toISOString()};}
  else if(op.type==='mix'){if(user.role!=='admin')fail('Chỉ quản trị được đổi cơ cấu.',403);if(Object.values(s.reviews).some(r=>r.status==='Đã đánh giá'))fail('Mở các quý đã chốt trước khi đổi cơ cấu.',423);s.mix=op.mix;}
  else if(op.type==='review'){let ks=KPI.groups(s.kpis)[op.group];if(!ks||user.role==='leader'&&ks[0].level!=='IID'||!['admin','leader','manager'].includes(user.role)||user.role==='manager'&&(ks[0].level==='IID'||ks[0].team!==user.team))fail('Không có quyền đánh giá nhóm này.',403);if(!Number.isInteger(op.quarter)||op.quarter<1||op.quarter>4||typeof op.note!=='string')fail('Đánh giá không hợp lệ.');let key=op.quarter+'|'+op.group,old=s.reviews[key];if(old?.status==='Đã đánh giá'&&op.status!=='Nháp')fail('Mở lại đánh giá trước khi sửa.',423);if(old?.status==='Đã đánh giá'&&user.role!=='admin')fail('Chỉ quản trị được mở lại đánh giá.',403);if(!['Nháp','Đã đánh giá'].includes(op.status))fail('Trạng thái không hợp lệ.');let p={type:'quarter',value:op.quarter},score=KPI.composite(s,ks,p);if(op.status==='Đã đánh giá'&&score==null)fail('Chưa đủ kết quả hoặc trọng số để chốt quý.');s.reviews[key]={note:op.note,status:op.status,by:user.email,at:new Date().toISOString(),snapshot:op.status==='Đã đánh giá'?{score,kpis:ks.map(k=>({...k,result:KPI.measure(k,p)}))}:null};}
  else if(op.type==='action'){let a=op.action,old=s.actions.find(x=>x.id===a.id);if(!canReadAction(user,a)||old&&!canReadAction(user,old))fail('Công việc ngoài phạm vi của bạn.',403);if(old)s.actions[s.actions.indexOf(old)]=a;else s.actions.push(a);}
  else if(op.type==='delete_action'){let old=s.actions.find(x=>x.id===op.id);if(!old||!canReadAction(user,old))fail('Không có quyền xóa công việc này.',403);s.actions=s.actions.filter(x=>x.id!==op.id);}
  else fail('Thao tác không hỗ trợ.');KPI.validate(s);return s;
}
async function api(request,env){try{
  const url=new URL(request.url);if(url.pathname.startsWith('/auth/'))return await auth(request,env);if(!env.DB)fail('Kho dữ liệu chưa sẵn sàng.',503);
  if(request.method!=='GET'&&request.headers.get('Origin')!==url.origin)fail('Nguồn yêu cầu không hợp lệ.',403);
  let member=await sessionUser(request,env);if(!member)fail('Vui lòng đăng nhập bằng email và mật khẩu.',401);if(member.must_change)fail('Bạn cần đổi mật khẩu tạm trước khi sử dụng.',428);
  const email=member.email;if(url.pathname==='/api/session')return json(publicUser(member));
  if(url.pathname==='/api/members'){
    if(member.role!=='admin')fail('Chỉ quản trị được quản lý tài khoản.',403);
    if(request.method==='GET'){let rows=(await env.DB.prepare('SELECT * FROM members ORDER BY email').all()).results;return json(rows.map(publicUser));}
    if(request.method!=='POST')fail('Phương thức không hỗ trợ.',405);let x=await readBody(request);x.email=mail(x.email);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email)||!['admin','leader','manager','contributor','viewer'].includes(x.role)||typeof x.team!=='string'||typeof x.name!=='string'||!['all','iid','department','personal'].includes(x.scope_level||'personal')||['manager','contributor'].includes(x.role)&&!x.team.trim()||x.role==='viewer'&&x.scope_level==='department'&&!x.team.trim())fail('Thông tin tài khoản không hợp lệ.');if(x.email===OWNER&&(x.role!=='admin'||x.disabled))fail('Chủ sở hữu phải giữ quyền quản trị.');if(x.email===email&&x.disabled)fail('Không thể khóa tài khoản đang dùng.');if(x.role==='viewer'&&x.scope_level==='all')fail('Người xem phải có cấp IID, bộ phận hoặc cá nhân.');let old=await env.DB.prepare('SELECT * FROM members WHERE email=?').bind(x.email).first(),temp=null;
    let scope=scopeOf(x),hash=old?.password_hash||null;if(!old){temp=randomToken().slice(0,24);hash=await bcrypt.hash(temp,COST);}
    await env.DB.batch([env.DB.prepare('INSERT INTO members(email,role,team,name,password_hash,must_change,disabled,scope_level) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role,team=excluded.team,name=excluded.name,disabled=excluded.disabled,scope_level=excluded.scope_level').bind(x.email,x.role,x.team.trim(),x.name.trim(),hash,old?old.must_change:1,x.disabled?1:0,scope),env.DB.prepare('DELETE FROM sessions WHERE email=?').bind(x.email),env.DB.prepare('INSERT INTO audit(actor,operation,details,at) VALUES(?,?,?,?)').bind(email,'member',JSON.stringify({email:x.email,role:x.role,team:x.team,scope,disabled:!!x.disabled}),new Date().toISOString())]);return json({ok:true,email:x.email,temporaryPassword:temp});
  }
  if(url.pathname==='/api/audit'){if(member.role!=='admin')fail('Không có quyền xem nhật ký.',403);return json((await env.DB.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 100').all()).results);}
  if(url.pathname!=='/api/workspace')fail('Không tìm thấy API.',404);let row=await env.DB.prepare('SELECT version,data FROM workspace WHERE id=1').first();
  if(request.method==='GET')return json({version:row?.version||0,state:scopedState(row?JSON.parse(row.data):null,member)});
  if(request.method!=='POST')fail('Phương thức không hỗ trợ.',405);let b=await readBody(request);if(!Number.isInteger(b.version)||!b.op)fail('Yêu cầu không hợp lệ.');
  if(!row){if(member.role!=='admin'||b.op.type!=='replace')fail('Quản trị cần khởi tạo kho chung.',403);KPI.validate(b.op.state);let state=KPI.migrate(b.op.state);let result=await env.DB.prepare('INSERT OR IGNORE INTO workspace(id,version,data) VALUES(1,1,?)').bind(JSON.stringify(state)).run();if(!result.meta.changes)fail('Kho chung vừa được khởi tạo. Hãy tải lại.',409);await env.DB.prepare('INSERT INTO audit(actor,operation,details,at) VALUES(?,?,?,?)').bind(email,'initialize','{}',new Date().toISOString()).run();return json({version:1,state});}
  if(row.version!==b.version)fail('Dữ liệu vừa được cập nhật. Hãy Đồng bộ trước khi lưu.',409);let full=KPI.migrate(JSON.parse(row.data));
  if(b.op.type==='kpi'&&member.role==='manager'){let old=full.kpis.find(k=>k.id===b.op.kpi.id),allowed=new Set(scopedState(full,member).references.map(r=>r.id));if(b.op.kpi.level==='Bộ phận'&&!allowed.has(b.op.kpi.parent)&&old?.parent!==b.op.kpi.parent)fail('Quản trị cần gắn mục tiêu IID cho bộ phận trước.',403);}
  let state=applyOperation(full,b.op,member);state.history=[];let result=await env.DB.batch([env.DB.prepare('UPDATE workspace SET data=?,version=version+1 WHERE id=1 AND version=?').bind(JSON.stringify(state),b.version),env.DB.prepare('INSERT INTO audit(actor,operation,details,at) SELECT ?,?,?,? WHERE changes()=1').bind(email,b.op.type,JSON.stringify({id:b.op.id||b.op.kpi?.id||b.op.action?.id,group:b.op.group,month:b.op.month,quarter:b.op.quarter}),new Date().toISOString())]);if(!result[0].meta.changes)fail('Có cập nhật đồng thời. Tải lại và thử lưu lại.',409);return json({version:row.version+1,state:scopedState(state,member)});
}catch(e){return json({error:e.status?e.message:'Không thể xử lý dữ liệu. Vui lòng thử lại.'},e.status||500);}}


const assets={"/index.html":"<!doctype html><html lang=\"vi\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>IID · KPI 2027</title><link rel=\"stylesheet\" href=\"style.css\"></head><body><aside><div class=\"brand\"><span>↗</span> IID<span class=\"year\">2027</span></div><small>PERFORMANCE WORKSPACE</small><nav><button data-view=\"overview\" class=\"active\">◫ &nbsp; Tổng quan</button><button data-view=\"kpis\">◎ &nbsp; Sổ KPI</button><button data-view=\"cascade\">⊞ &nbsp; Liên kết mục tiêu</button><button data-view=\"review\">▤ &nbsp; Đánh giá quý</button><button data-view=\"members\">♧ &nbsp; Thành viên & quyền</button><button data-view=\"actions\">✓ &nbsp; Kế hoạch hành động</button><button data-view=\"trend\">↗ &nbsp; Tiến độ 12 tháng</button><button data-view=\"account\">⚿ &nbsp; Tài khoản & mật khẩu</button><button data-view=\"guide\">◇ &nbsp; Nguyên tắc & hướng dẫn</button></nav><div class=\"sidebottom\"><span class=\"dot\"></span> Kho dữ liệu chung<p>Đăng nhập và kiểm tra quyền</p><button id=\"backup\">↓ Xuất bản sao JSON</button><label class=\"import\">↑ Nhập bản sao<input type=\"file\" id=\"import\" accept=\"application/json\" hidden></label></div></aside><main><header><div class=\"headleft\"><strong>KHỐI IID</strong><span>/</span>Quản trị hiệu suất 2027</div><div class=\"headright\"><button id=\"refresh\" title=\"Tải dữ liệu mới nhất từ máy chủ\">↻ Đồng bộ</button><select id=\"periodType\" aria-label=\"Loại kỳ\"><option value=\"month\">Tháng</option><option value=\"quarter\">Quý</option></select><select id=\"month\" aria-label=\"Tháng\"></select><button id=\"export\" title=\"Xuất báo cáo CSV theo kỳ đang chọn\">↓ Xuất CSV</button><span class=\"avatar\">ID</span><button id=\"logout\">Đăng xuất</button></div></header><section id=\"app\"></section><footer>KPI 2027 · Cùng hướng mục tiêu chung <span>IID → Bộ phận → Cá nhân</span></footer></main><dialog id=\"editor\"><form id=\"form\"><div class=\"dialogtitle\"><h2 id=\"formtitle\">Tạo KPI</h2><button type=\"button\" id=\"close\">×</button></div><div class=\"fields\"><label>Tên KPI<input name=\"name\" required maxlength=\"120\" placeholder=\"VD: Doanh thu khách hàng mới\"></label><label>Cấp KPI<select name=\"level\"><option>IID</option><option>Bộ phận</option><option>Cá nhân</option></select></label><label>Bộ phận / nhóm<input name=\"team\" required placeholder=\"VD: Kinh doanh\"></label><label>Chủ sở hữu<input name=\"owner\" required placeholder=\"Họ tên người phụ trách\"></label><label>Email nhân viên được giao<input name=\"ownerEmail\" type=\"email\" placeholder=\"email tài khoản nhân viên\"></label><label>Cách tổng hợp quý<select name=\"mode\"><option value=\"last\">Giá trị cuối quý / lũy kế</option><option value=\"sum\">Cộng kết quả các tháng</option><option value=\"average\">Trung bình 3 tháng</option></select></label><label>Phân bổ mục tiêu<select name=\"plan\"><option value=\"annual\">Giữ mức mục tiêu năm</option><option value=\"linear\">Lũy kế đều theo tháng</option><option value=\"monthly\">Chia đều cho 12 tháng</option></select></label><label>Mục tiêu cấp trên<select name=\"parent\"></select></label><label>Trọng số (%) <small id=\"weighthint\" class=\"mini\"></small><input name=\"weight\" type=\"number\" min=\"0\" max=\"100\" step=\"0.1\" required></label><label>Mục tiêu năm<input name=\"target\" type=\"number\" min=\"0.000001\" step=\"any\" required></label><label>Đơn vị<input name=\"unit\" required placeholder=\"VD: tỷ VNĐ, %, KH\"></label><label>Chiều đánh giá<select name=\"direction\"><option value=\"up\">Càng cao càng tốt (↑)</option><option value=\"down\">Càng thấp càng tốt (↓)</option></select></label><label>Nguồn dữ liệu<input name=\"source\" required placeholder=\"VD: Báo cáo tài chính, CRM\"></label><label>Tần suất<select name=\"frequency\"><option>Hàng tháng</option><option>Hàng quý</option></select></label></div><p class=\"hint\">Trọng số được kiểm tra theo từng cấp, nhóm và chủ sở hữu (tổng = 100%). KPI bộ phận/cá nhân phải liên kết trực tiếp với cấp trên.</p><button class=\"primary\" type=\"submit\">Lưu KPI</button></form></dialog><dialog id=\"update\"><form id=\"updateform\"><div class=\"dialogtitle\"><h2>Cập nhật kết quả</h2><button type=\"button\" onclick=\"document.querySelector('#update').close()\">×</button></div><p id=\"updatename\"></p><div id=\"updatehistory\" class=\"monthstrip\"></div><label>Kết quả thực tế trong kỳ<input name=\"actual\" type=\"number\" min=\"0\" step=\"any\" required></label><label>Mục tiêu tháng riêng (để trống dùng phân bổ mặc định)<input name=\"periodTarget\" type=\"number\" min=\"0\" step=\"any\"></label><label>Ghi chú / minh chứng<textarea name=\"note\" rows=\"3\" placeholder=\"Link báo cáo, giải trình nguyên nhân tăng/giảm...\"></textarea></label><p class=\"hint\">Kết quả được so với mục tiêu tháng. Chỉ tiêu lũy kế nhập giá trị lũy kế; chỉ tiêu cộng hoặc trung bình nhập kết quả riêng của tháng.</p><button class=\"primary\">Lưu kết quả</button></form></dialog><div id=\"toast\" role=\"status\"></div><script src=\"core.js\"></script><script src=\"seed.js\"></script><script src=\"main.js\"></script><script src=\"accounts.js\"></script></body></html>\n\r\n\r\n\r\n\r\n","/style.css":":root{--ink:#16312d;--green:#18795e;--muted:#788982;--line:#e4eae5;--warn:#c88719;--bad:#c44d3b}*{box-sizing:border-box}body{margin:0;background:#f5f7f3;color:var(--ink);font:14px 'Segoe UI',system-ui,-apple-system,sans-serif}button,input,select,textarea{font:inherit}button,select,.import{cursor:pointer}button{border:1px solid var(--line);background:white;border-radius:8px;padding:9px 14px;color:var(--ink);transition:all .15s ease}button:hover:not(:disabled){border-color:var(--green);background:#f0f7f2}button.danger:hover:not(:disabled){border-color:var(--bad);background:#fce9e5;color:var(--bad)}aside{position:fixed;width:248px;inset:0 auto 0 0;background:#102f28;color:#d3e3da;padding:28px 20px;display:flex;flex-direction:column;overflow-y:auto;z-index:20}.brand{font-size:28px;font-weight:700;letter-spacing:1.5px;color:white;display:flex;align-items:center}.brand>span:first-child{background:#b9e581;color:#193a2b;border-radius:10px;padding:2px 8px;margin-right:10px;font-size:22px}.year{font-size:11px;letter-spacing:0;background:#25483c;padding:4px 7px;border-radius:6px;margin-left:10px;color:#b9e581}aside>small{font-size:9px;letter-spacing:2px;margin-top:14px;color:#829e90}nav{margin-top:24px;display:grid;gap:4px}nav button{text-align:left;border:0;background:transparent;color:#afc6ba;padding:11px 12px;border-radius:8px;font-size:13.5px}nav button.active,nav button:hover{background:#244b3c;color:#d7f0af;font-weight:600}.sidebottom{margin-top:auto;padding-top:20px;font-size:12px;color:#aec5b8}.sidebottom p{color:#77988a;margin:4px 0 10px}.sidebottom button,.import{display:block;background:transparent;color:#aec5b8;border:1px solid #365648;margin:7px 0;width:100%;text-align:left;padding:9px 11px;border-radius:7px;font-size:12px}.sidebottom button:hover,.import:hover{background:#1b4337;color:#fff;border-color:#527a68}.dot{display:inline-block;width:7px;height:7px;background:#b9e581;border-radius:50%;margin-right:6px;box-shadow:0 0 6px #b9e581}main{margin-left:248px}header{min-height:72px;height:auto;padding:12px 38px;display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid var(--line);background:#fff;font-size:13px;position:sticky;top:0;z-index:10}.headleft{white-space:nowrap;color:var(--muted)}.headleft strong{color:var(--ink);font-weight:700;letter-spacing:.5px}header span{margin:0 10px;color:#93a19a}.headright{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.headright button,.headright select{padding:7px 11px;font-size:12.5px;height:36px}select,input,textarea{border:1px solid #d8e2db;border-radius:8px;background:white;color:var(--ink);padding:9px 11px;width:100%}select:focus,input:focus,textarea:focus{outline:2px solid #18795e33;border-color:var(--green)}.headright select{width:auto;max-width:165px}.avatar{background:#e9efdf;color:#2c583b;font-weight:600;border-radius:8px;padding:7px 11px;margin:0;font-size:11.5px;white-space:nowrap}#app{padding:32px 38px;min-height:calc(100vh - 130px)}.eyebrow{font-size:11px;letter-spacing:1.6px;color:var(--green);font-weight:700;text-transform:uppercase}h1{font-size:28px;margin:6px 0 8px;letter-spacing:-.5px}h2{font-size:17px;margin:0}h3{font-size:14.5px;margin:0 0 10px}p{line-height:1.55;color:var(--muted)}.titlebar{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:24px}.titlebar p{margin:0}.primary{background:var(--green);border-color:var(--green);color:white;font-weight:600}.primary:hover:not(:disabled){background:#115b45;border-color:#115b45;color:white}.hero{background:linear-gradient(135deg,#e9efdd 0%,#dfead2 100%);border:1px solid #d5e3c4;border-radius:14px;padding:24px 28px;display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}.hero h2{font-size:22px;margin-top:4px}.hero p{color:#556b46;margin:6px 0 0}.hero .art{font-size:52px;color:#689449;margin-right:12px;line-height:1}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}.card,.panel{background:white;border:1px solid var(--line);border-radius:12px;padding:20px 22px;box-shadow:0 2px 6px rgba(22,49,45,.02)}.card small{color:var(--muted);font-weight:600;font-size:11px;letter-spacing:.5px}.number{font-size:30px;font-weight:700;margin:10px 0 6px;color:var(--ink)}.card p{margin:0;font-size:12px}.panels{display:grid;grid-template-columns:1.5fr 1fr;gap:20px}.paneltitle{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}.paneltitle small{color:var(--muted)}.progressrow{display:grid;grid-template-columns:190px 1fr 64px;gap:14px;align-items:center;margin:16px 0}.progressrow strong{text-align:right;font-size:13.5px}.track{height:8px;background:#eef2ec;border-radius:8px;overflow:hidden}.fill{height:100%;background:var(--green);border-radius:8px;transition:width .25s ease}.fill.warn{background:var(--warn)}.fill.bad{background:var(--bad)}.badge{font-size:11px;font-weight:600;display:inline-block;border-radius:6px;padding:4px 8px;background:#e6f2e9;color:#25693f}.badge.warn{background:#fff2da;color:#9a6810}.badge.bad{background:#fce9e5;color:#b44938}.badge.neutral{background:#eef2ef;color:#5c6f66}.alert{border-left:3px solid #cba057;background:#fbf6ec;padding:12px 14px;margin:10px 0;font-size:12.5px;line-height:1.5;border-radius:0 8px 8px 0}.alert.ok{border-left-color:var(--green);background:#eff7f2;color:#1c4f3d}.toolbar{display:flex;gap:10px;margin:18px 0;flex-wrap:wrap;align-items:center}.toolbar input{flex:1;min-width:200px}.toolbar select{width:165px}.pills{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.pill{padding:6px 12px;font-size:12px;border-radius:20px;background:#fff;border:1px solid var(--line);color:var(--muted)}.pill.active{background:var(--ink);color:#fff;border-color:var(--ink);font-weight:600}.tablewrap{overflow:auto;background:white;border:1px solid var(--line);border-radius:12px;box-shadow:0 2px 6px rgba(22,49,45,.02)}table{border-collapse:collapse;width:100%;white-space:nowrap;font-size:12.5px}th{text-align:left;background:#fafbf8;color:#6f8074;font-size:10.5px;font-weight:700;letter-spacing:.6px;padding:14px 16px;border-bottom:1px solid var(--line)}td{border-top:1px solid #edf0eb;padding:14px 16px;vertical-align:middle}tr:hover td{background:#fafcf9}td strong{font-size:13px;color:var(--ink)}td small{display:block;color:var(--muted);margin-top:4px;font-size:11.5px}td button{font-size:11.5px;padding:6px 10px;margin-right:4px}td .track{width:95px;margin-top:6px;height:5px}.sectionspace{margin-top:24px}.tree{border-left:2px solid #b8d1bc;margin:12px 0 6px 18px;padding-left:20px}.treeitem{background:white;border:1px solid var(--line);padding:14px 16px;border-radius:10px;margin:10px 0}.cascaderow{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.cascademeta{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted)}.cascademeta .track{width:80px;height:6px}.empty{text-align:center;padding:38px 20px;color:var(--muted);background:#fff;border:1px dashed var(--line);border-radius:12px}footer{padding:18px 38px;color:#87988d;font-size:11.5px;border-top:1px solid var(--line)}footer span{float:right}dialog{border:0;border-radius:16px;box-shadow:0 24px 90px rgba(16,47,40,.28);padding:26px 28px;width:640px;max-width:95vw;max-height:92vh;overflow-y:auto}dialog::backdrop{background:rgba(16,44,40,.45);backdrop-filter:blur(2px)}.dialogtitle{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.dialogtitle button{padding:4px 10px;font-size:18px;line-height:1}.fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}label{display:block;font-size:12px;font-weight:600;color:var(--ink)}label input,label select,label textarea{display:block;margin-top:6px;font-weight:400}#update label{margin:14px 0}.monthstrip{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:12px 0;background:#f7f9f6;padding:10px;border-radius:10px;border:1px solid var(--line)}.monthcell{padding:6px 8px;border-radius:6px;background:#fff;border:1px solid #e6ece7;font-size:11px;text-align:center;cursor:pointer}.monthcell.active{border-color:var(--green);background:#eaf4ee;font-weight:700}.monthcell small{display:block;color:var(--muted);font-size:10px;margin-top:2px}.hint{font-size:12px;margin:12px 0}.guidegrid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}.reviewcard{margin:16px 0}.reviewcard textarea{margin:12px 0}.reviewcard select{width:auto;margin-right:10px}.subtable{margin:12px 0;border:1px solid var(--line);border-radius:8px;overflow:auto}.subtable table{font-size:12px}.subtable th,.subtable td{padding:9px 12px}#toast{position:fixed;bottom:24px;right:24px;background:#13382c;color:white;padding:13px 20px;border-radius:10px;display:none;z-index:100;box-shadow:0 10px 30px rgba(0,0,0,.18);font-size:13px}.mini{font-size:11.5px;color:var(--muted);font-weight:400}.flexbetween{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}.actionmeta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}@media(max-width:1080px){aside{width:210px}main{margin-left:210px}.stats{grid-template-columns:repeat(2,1fr)}.panels{grid-template-columns:1fr}#app{padding:24px}header{padding:12px 24px}}@media(max-width:700px){aside{position:static;width:100%;padding:16px}aside>small,.sidebottom{display:none}nav{margin-top:12px;display:flex;overflow:auto;gap:4px}nav button{white-space:nowrap;padding:9px 11px}.brand{font-size:22px}main{margin:0}header{padding:12px 16px;position:static}.headleft{display:none}.headright{width:100%;justify-content:space-between}h1{font-size:22px}.titlebar{flex-direction:column}.hero .art{display:none}.toolbar select{width:48%}.fields,.guidegrid{grid-template-columns:1fr}.progressrow{grid-template-columns:120px 1fr 48px}.monthstrip{grid-template-columns:repeat(4,1fr)}footer span{display:none}}\n[hidden]{display:none!important}\n.fields button{align-self:end}input:disabled,textarea:disabled,select:disabled{background:#f5f6f2;color:#697b71}button:disabled{opacity:.5;cursor:default}@media(max-height:820px){aside{padding:20px 16px}nav button{padding:9px 10px}.sidebottom{font-size:11px}}@media print{aside,header,footer,button,.toolbar,.pills{display:none!important}main{margin:0}#app{padding:0}.panel,.card,.tablewrap{break-inside:avoid;box-shadow:none}}\nbody.signedout aside,body.signedout header,body.signedout footer{display:none}body.signedout main{margin:0}body.signedout #app{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#e5eee3,#f8faf5)}.loginbox{background:white;border:1px solid var(--line);padding:40px;width:480px;max-width:100%;border-radius:18px;box-shadow:0 12px 70px #1231}.loginbox label{margin:20px 0}.loginbox button.primary{width:100%;margin-top:10px}.loginbox #loginerror{color:#b33}.check{display:flex;align-items:center;gap:10px}.check input{width:auto}.temporary input{font:18px monospace}\r\n","/seed.js":"const seed=[['Revenue','IID','Toàn khối','Giám đốc IID',null,40,120,'tỷ VNĐ','up','Báo cáo tài chính',96],['Gross Profit','IID','Toàn khối','Giám đốc IID',null,30,36,'tỷ VNĐ','up','Báo cáo tài chính',31],['Gross Margin','IID','Toàn khối','Giám đốc IID',null,15,30,'%','up','Báo cáo tài chính',28],['NRR','IID','Toàn khối','Giám đốc IID',null,15,110,'%','up','CRM',106],['Doanh thu khách hàng mới','Bộ phận','Kinh doanh','Trưởng phòng kinh doanh','k0',60,48,'tỷ VNĐ','up','CRM',39],['Tỷ lệ gia hạn','Bộ phận','Kinh doanh','Trưởng phòng kinh doanh','k3',40,95,'%','up','CRM',88],['Biên lợi nhuận dịch vụ','Bộ phận','Vận hành','Trưởng phòng vận hành','k2',50,32,'%','up','Báo cáo vận hành',30],['Churn khách hàng','Bộ phận','Vận hành','Trưởng phòng vận hành','k3',50,5,'%','down','CRM',6.2],['Doanh thu danh mục phụ trách','Cá nhân','Kinh doanh','Nguyễn Minh Anh','k4',60,12,'tỷ VNĐ','up','CRM',9.5],['Gia hạn khách hàng phụ trách','Cá nhân','Kinh doanh','Nguyễn Minh Anh','k5',40,95,'%','up','CRM',92]].map((r,i)=>({id:'k'+i,name:r[0],level:r[1],team:r[2],owner:r[3],parent:r[4],weight:r[5],target:r[6],unit:r[7],direction:r[8],source:r[9],frequency:'Hàng tháng',updates:{10:{actual:r[10],note:'Số liệu mẫu minh họa'}}}));\r\n","/core.js":"(function(root){\n  const levels=['IID','Bộ phận','Cá nhân'];\n  const months=q=>Array.from({length:3},(_,i)=>(q-1)*3+i+1);\n  function migrate(s){\n    const x=JSON.parse(JSON.stringify(s)); x.version=2; x.history=x.history||[];x.actions=x.actions||[];x.archive=x.archive||[];\n    x.kpis.forEach(k=>{k.mode=k.mode||'last';k.plan=k.plan||'annual';k.targets=k.targets||{};k.updates=k.updates||{};});\n    for(let [old,r]of Object.entries(x.reviews)){let bar=old.indexOf('|');if(bar<0)continue;let part;try{part=JSON.parse(old.slice(bar+1))}catch{continue}if(part[0]!=='Cá nhân')continue;let candidates=x.kpis.filter(k=>k.level==='Cá nhân'&&k.team===part[1]&&k.owner===part[2]);let mapped=[...new Set(candidates.map(key))];if(mapped.length===1){let next=old.slice(0,bar+1)+mapped[0];if(next!==old&&!x.reviews[next]){x.reviews[next]=r;delete x.reviews[old];}}}return x;\n  }\n  const key=k=>JSON.stringify(k.level==='IID'?['IID']:k.level==='Bộ phận'?['Bộ phận',k.team]:['Cá nhân',k.team,k.ownerEmail||k.owner]);\n  const label=ks=>ks[0].level==='IID'?'Toàn khối IID':ks[0].level==='Bộ phận'?ks[0].team:ks[0].owner+' · '+ks[0].team;\n  function target(k,m){if(k.targets[m]!=null)return k.targets[m];return k.plan==='linear'?k.target*m/12:k.plan==='monthly'?k.target/12:k.target;}\n  function attainment(actual,t,direction){if(actual==null||t==null)return null;if(direction==='down')return actual===0?120:t/actual*100;return t===0?(actual===0?100:120):actual/t*100;}\n  function measure(k,period){let ms=period.type==='quarter'?months(period.value):[period.value];let values=ms.map(m=>k.updates[m]?.actual),targets=ms.map(m=>target(k,m));let coverage=values.filter(a=>a!=null).length;let aggregate=a=>k.mode==='sum'?a.reduce((s,v)=>s+v,0):k.mode==='average'?a.reduce((s,v)=>s+v,0)/a.length:a.at(-1);let needed=k.mode==='last'?values.at(-1)!=null:coverage===ms.length;let a=needed?aggregate(values):null,t=aggregate(targets);return{actual:a,target:t,score:attainment(a,t,k.direction),coverage,total:ms.length};}\n  function groups(ks){let out={};ks.forEach(k=>(out[key(k)]??=[]).push(k));return out;}\n  function weighted(ks,p){if(!ks.length||Math.abs(ks.reduce((s,k)=>s+k.weight,0)-100)>.01)return null;let results=ks.map(k=>measure(k,p).score);return results.some(v=>v==null)?null:results.reduce((s,v,i)=>s+Math.min(120,v)*ks[i].weight/100,0);}\n  function composite(s,ks,p){let own=weighted(ks,p);if(ks[0].level==='IID')return own;let iid=weighted(s.kpis.filter(k=>k.level==='IID'),p),dept=weighted(s.kpis.filter(k=>k.level==='Bộ phận'&&k.team===ks[0].team),p);let vals=ks[0].level==='Cá nhân'?[iid,dept,own]:[iid,own],mix=s.mix[ks[0].level==='Cá nhân'?'personal':'department'];return vals.some(v=>v==null)?null:vals.reduce((sum,v,i)=>sum+v*mix[i]/100,0);}\n  function primaryGroup(groupsObj,user){\n    const entries=Object.values(groupsObj);if(!entries.length)return null;\n    if(!user||user.role==='admin'||user.role==='leader')return entries.find(ks=>ks[0].level==='IID')||entries[0];\n    if(user.role==='manager')return entries.find(ks=>ks[0].level==='Bộ phận'&&ks[0].team===user.team)||entries[0];\n    return entries.find(ks=>ks[0].level==='Cá nhân'&&(ks[0].ownerEmail?.toLowerCase()===user.email?.toLowerCase()||ks[0].owner===user.name))||entries[0];\n  }\n  function validate(s){if(!s||!Array.isArray(s.kpis)||!s.reviews||!s.mix)throw Error('Thiếu cấu trúc dữ liệu KPI.');let ids=new Set();for(let k of s.kpis){if(!k||typeof k.id!=='string'||ids.has(k.id)||!levels.includes(k.level)||!['up','down'].includes(k.direction)||!Number.isFinite(k.target)||k.target<=0||!Number.isFinite(k.weight)||k.weight<0||k.weight>100||!k.updates||['name','owner','team','unit','source','frequency'].some(n=>typeof k[n]!=='string'))throw Error('KPI không hợp lệ.');ids.add(k.id);if(k.mode&&!['sum','average','last'].includes(k.mode)||k.plan&&!['annual','linear','monthly'].includes(k.plan))throw Error('Cách tính kỳ không hợp lệ.');for(let [m,u]of Object.entries(k.updates))if(!/^([1-9]|1[0-2])$/.test(m)||!u||!Number.isFinite(u.actual)||u.actual<0||typeof u.note!=='string')throw Error('Kết quả tháng không hợp lệ.');for(let[m,t]of Object.entries(k.targets||{}))if(!/^([1-9]|1[0-2])$/.test(m)||!Number.isFinite(t)||t<0)throw Error('Mục tiêu tháng không hợp lệ.');}\n    for(let k of s.kpis){if(k.ownerEmail!=null&&(typeof k.ownerEmail!=='string'||k.ownerEmail&&!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(k.ownerEmail)))throw Error('Email người được giao không hợp lệ.');if(k.level!=='IID'&&!s.kpis.some(p=>p.id===k.parent&&p.level===(k.level==='Bộ phận'?'IID':'Bộ phận')&&(k.level!=='Cá nhân'||p.team===k.team)))throw Error('Liên kết cấp trên phải đúng cấp và cùng bộ phận.');}\n    for(let [n,b]of [['department',[[30,70],[30,70]]],['personal',[[20,40],[30,50],[20,40]]]]){let a=s.mix[n];if(!Array.isArray(a)||a.length!==b.length||a.some((v,i)=>!Number.isFinite(v)||v<b[i][0]||v>b[i][1])||Math.abs(a.reduce((x,y)=>x+y,0)-100)>.01)throw Error('Cơ cấu trọng số không hợp lệ.');}\n    if(s.actions&&!Array.isArray(s.actions)||s.history&&!Array.isArray(s.history)||s.archive&&!Array.isArray(s.archive))throw Error('Dữ liệu quản lý không hợp lệ.');\n    for(let a of s.actions||[])if(!a||['id','title','owner','due','status'].some(n=>typeof a[n]!=='string')||!['Mới','Đang làm','Hoàn tất'].includes(a.status)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(a.due)||a.priority!=null&&!['Cao','Trung bình','Thấp'].includes(a.priority)||a.kpiId!=null&&typeof a.kpiId!=='string'||a.note!=null&&typeof a.note!=='string')throw Error('Hành động không hợp lệ.');\n    for(let r of Object.values(s.reviews))if(!r||typeof r.note!=='string'||!['Nháp','Đã đánh giá'].includes(r.status))throw Error('Đánh giá không hợp lệ.');return true;\n  }\n  root.KPI={migrate,months,key,label,target,attainment,measure,groups,weighted,composite,primaryGroup,validate};if(typeof module!=='undefined')module.exports=root.KPI;\n})(typeof window!=='undefined'?window:globalThis);\n","/main.js":"const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c])),num=n=>n==null?'—':Number(n).toLocaleString('vi-VN',{maximumFractionDigits:1});\nlet state=null,version=0,user=null,view='overview',period={type:'month',value:10},editing=null,updating=null,editingAction=null,showArchive=false,busy=false,stale=false;\nconst roleNames={admin:'Quản trị',leader:'Cấp IID',manager:'Quản lý bộ phận',contributor:'Nhân viên',viewer:'Người xem'},modeNames={last:'Giá trị cuối kỳ',sum:'Cộng các tháng',average:'Trung bình các tháng'},planNames={annual:'Giữ mức năm',linear:'Lũy kế đều',monthly:'Chia đều 12 tháng'};\nfunction toast(t){$('#toast').textContent=t;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',4500)}\nasync function req(url,method='GET',body){let r=await fetch(url,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});let x=await r.json();if(!r.ok)throw Object.assign(Error(x.error||'Lỗi kết nối'),{status:r.status});return x}\nasync function sync(){try{let x=await req('/api/workspace');state=x.state?KPI.migrate(x.state):null;version=x.version;stale=false;render();toast('Đã tải dữ liệu mới nhất')}catch(e){toast(e.message)}}\nasync function mutate(op){if(busy){toast('Đang lưu, vui lòng chờ.');return false}if(stale){toast('Có thay đổi từ người khác. Hãy bấm Đồng bộ trước khi lưu.');return false}busy=true;try{let x=await req('/api/workspace','POST',{version,op});state=KPI.migrate(x.state);version=x.version;render();toast('Đã lưu vào kho chung');return true}catch(e){if(e.status===409)stale=true;toast(e.message);return false}finally{busy=false}}\nconst manage=k=>user&&(user.role==='admin'||user.role==='leader'&&k.level==='IID'||user.role==='manager'&&k.level!=='IID'&&k.team===user.team),write=k=>manage(k)||user?.role==='contributor'&&k.ownerEmail?.toLowerCase()===user.email;\nconst result=k=>KPI.measure(k,period),score=k=>result(k).score,titlePeriod=()=>period.type==='month'?`Tháng ${period.value}/2027`:`Quý ${period.value}/2027`;\nconst fillClass=n=>n==null?'':n<80?'bad':n<100?'warn':'';\nconst isOverdue=a=>a.status!=='Hoàn tất'&&a.due<new Date().toISOString().slice(0,10);\nfunction head(title,desc,create=false){return `<div class=\"titlebar\"><div><div class=\"eyebrow\">KHO KPI CHUNG · ${esc(titlePeriod())} · PHIÊN BẢN ${version}</div><h1>${title}</h1><p>${desc}</p></div>${create&&['admin','leader','manager'].includes(user.role)?'<button class=\"primary\" onclick=\"openEditor()\">+ Tạo KPI mới</button>':''}</div>`}\nfunction badge(k,p=period){let n=KPI.measure(k,p).score;return `<span class=\"badge ${n==null||n<100?'warn':''} ${n!=null&&n<80?'bad':''}\">${n==null?'Chưa đủ dữ liệu':n>=100?'Đạt mục tiêu':n<80?'Cần chú ý':'Đang theo dõi'}</span>`}\nfunction warning(){return Object.values(KPI.groups(state.kpis)).filter(ks=>Math.abs(ks.reduce((s,k)=>s+k.weight,0)-100)>.01).map(ks=>`<div class=\"alert\"><strong>${esc(KPI.label(ks))}</strong>: tổng trọng số hiện tại là ${num(ks.reduce((s,k)=>s+k.weight,0))}%, cần điều chỉnh về đúng 100% để tính điểm.</div>`).join('')}\nfunction rows(ks){return !ks.length?'<div class=\"empty\">Không có KPI phù hợp với bộ lọc hiện tại.</div>':`<div class=\"tablewrap\"><table><thead><tr><th>KPI / NGƯỜI PHỤ TRÁCH</th><th>CẤP / BỘ PHẬN</th><th>TRỌNG SỐ</th><th>MỤC TIÊU KỲ</th><th>KẾT QUẢ</th><th>HOÀN THÀNH</th><th>THAO TÁC</th></tr></thead><tbody>${ks.map(k=>{let r=result(k),note=period.type==='month'?k.updates[period.value]?.note:'';return `<tr><td><strong>${esc(k.name)}</strong><small>${esc(k.owner)} · ${esc(k.ownerEmail||'Chưa gán email')}</small><small>Nguồn: ${esc(k.source)}</small></td><td><span class=\"badge neutral\">${esc(k.level)}</span><small>${esc(k.team)}</small></td><td><strong>${num(k.weight)}%</strong></td><td>${num(r.target)} ${esc(k.unit)}<small>${esc(modeNames[k.mode])} · ${k.direction==='down'?'↓ Giảm tốt':'↑ Tăng tốt'}</small></td><td><strong>${num(r.actual)}</strong> ${r.actual!=null?esc(k.unit):''}<small>${r.coverage}/${r.total} tháng có dữ liệu${note?' · '+esc(note.slice(0,36)):''}</small></td><td>${badge(k)}<small><strong>${num(r.score)}%</strong></small><div class=\"track\"><div class=\"fill ${fillClass(r.score)}\" style=\"width:${Math.min(100,r.score||0)}%\"></div></div></td><td>${write(k)?`<button onclick=\"openUpdate(${JSON.stringify(k.id).replaceAll('\"','&quot;')})\">Cập nhật</button>`:''}${manage(k)?`<button onclick=\"openEditor(${JSON.stringify(k.id).replaceAll('\"','&quot;')})\">Sửa</button><button class=\"danger\" onclick=\"removeKpi(${JSON.stringify(k.id).replaceAll('\"','&quot;')})\">Lưu trữ</button>`:''}</td></tr>`}).join('')}</tbody></table></div>`}\nfunction render(){\n  applyMenus();if(view==='account'||user?.mustChange){renderAccount();return}if(view==='members'){renderMembers();return}\n  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));if(!user)return;\n  if(!state){$('#app').innerHTML=head('Khởi tạo kho KPI chung','Chọn dữ liệu để bắt đầu. Dữ liệu cũ trên trình duyệt được giữ lại.')+(user.role==='admin'?`<div class=\"guidegrid\"><div class=\"panel\"><h2>Chuyển dữ liệu phiên bản cũ</h2><p>Dùng dữ liệu KPI đang lưu trên trình duyệt này để tạo kho chung.</p><button onclick=\"initialize('local')\">Chuyển dữ liệu cũ</button></div><div class=\"panel\"><h2>Bắt đầu mới</h2><p>Kho trống để nhập KPI thực tế, hoặc bộ KPI minh họa có sẵn.</p><button class=\"primary\" onclick=\"initialize('empty')\">Tạo kho trống</button> <button onclick=\"initialize('sample')\">Dùng dữ liệu mẫu</button></div></div>`:'<div class=\"panel\">Quản trị cần khởi tạo kho chung trước.</div>');return}\n  let ks=state.kpis,groups=KPI.groups(ks),primary=KPI.primaryGroup(groups,user),primaryScore=primary?totalScore(primary,period):null,overdueCount=state.actions.filter(isOverdue).length;\n  if(view==='overview')$('#app').innerHTML=head('Tổng quan hiệu suất','Cùng một nguồn dữ liệu. Rõ mục tiêu, rõ trách nhiệm.',true)+`<div class=\"hero\"><div><div class=\"eyebrow\">IID · WORKSPACE 2027</div><h2>Mỗi đóng góp kết nối với mục tiêu chung.</h2><p>${esc(user.name||user.email)} (${esc(user.email)}) · ${esc(roleNames[user.role])}${user.team?' · '+esc(user.team):''}</p></div><div class=\"art\">↗</div></div><div class=\"stats\"><div class=\"card\"><small>ĐIỂM TRONG PHẠM VI</small><div class=\"number\">${num(primaryScore)}%</div><p>${primary?esc(KPI.label(primary)):'Chưa có nhóm KPI'} · Trần 120%</p></div><div class=\"card\"><small>KPI ĐANG QUẢN LÝ</small><div class=\"number\">${ks.length}</div><p>${Object.keys(groups).length} nhóm mục tiêu${state.archive?.length?` · ${state.archive.length} lưu trữ`:''}</p></div><div class=\"card\"><small>CÓ ĐỦ KẾT QUẢ KỲ</small><div class=\"number\">${ks.filter(k=>score(k)!=null).length}/${ks.length}</div><p>${ks.length?Math.round(ks.filter(k=>score(k)!=null).length/ks.length*100):0}% hoàn thành nhập liệu</p></div><div class=\"card\"><small>CẦN CHÚ Ý</small><div class=\"number\">${ks.filter(k=>score(k)!=null&&score(k)<80).length}</div><p>Dưới 80% mục tiêu kỳ${overdueCount?` · ${overdueCount} việc quá hạn`:''}</p></div></div>${warning()}<div class=\"panels\"><div class=\"panel\"><div class=\"paneltitle\"><h2>Điểm tổng hợp theo nhóm</h2><small>${esc(titlePeriod())}</small></div>${Object.values(groups).map(a=>{let n=totalScore(a,period),own=ownScore(a,period);return `<div class=\"progressrow\"><span><strong>${esc(KPI.label(a))}</strong><small class=\"mini\"><br>${esc(a[0].level)} · Điểm riêng: ${num(own)}%</small></span><div class=\"track\"><div class=\"fill ${fillClass(n)}\" style=\"width:${Math.min(100,n||0)}%\"></div></div><strong>${num(n)}%</strong></div>`}).join('')||'<p>Hãy tạo KPI đầu tiên.</p>'}<p class=\"mini\">Điểm tổng hợp kết hợp IID, Bộ phận và Cá nhân theo cơ cấu trọng số; chỉ tính khi nhóm đủ dữ liệu và tổng trọng số = 100%.</p></div><div class=\"panel\"><h2>Nhịp quản trị & cảnh báo</h2>${ks.filter(k=>score(k)==null).length?`<div class=\"alert\">${ks.filter(k=>score(k)==null).length} KPI chưa đủ kết quả trong ${esc(titlePeriod())}.</div>`:'<div class=\"alert ok\">Tất cả KPI đã có dữ liệu trong kỳ.</div>'}${ks.filter(k=>score(k)!=null&&score(k)<80).map(k=>`<div class=\"alert\"><strong>${esc(k.name)}</strong> (${esc(k.owner)}): đạt ${num(score(k))}% mục tiêu kỳ.</div>`).slice(0,3).join('')}<div class=\"alert\">${state.actions.filter(a=>a.status!=='Hoàn tất').length} công việc đang mở${overdueCount?` (<strong>${overdueCount} việc quá hạn</strong>)`:''}.</div><p>Chọn Tháng để cập nhật số liệu; chọn Quý để rà soát và chốt đánh giá.</p><div class=\"flexbetween\"><button onclick=\"view='review';render()\">Đánh giá quý →</button><button onclick=\"view='actions';render()\">Kế hoạch hành động →</button></div></div></div><div class=\"sectionspace\">${rows(ks)}</div>`;\n  if(view==='kpis'){\n    let archived=state.archive||[];\n    $('#app').innerHTML=head('Sổ KPI','Mục tiêu theo kỳ, email người được giao và kết quả dùng chung.',true)+warning()+`<div class=\"toolbar\"><input id=\"search\" placeholder=\"Tìm KPI, tên, email hoặc nguồn dữ liệu…\"><select id=\"filterLevel\"><option value=\"\">Tất cả cấp</option><option>IID</option><option>Bộ phận</option><option>Cá nhân</option></select><select id=\"filterTeam\"><option value=\"\">Tất cả bộ phận</option>${[...new Set(ks.map(k=>k.team))].map(t=>`<option>${esc(t)}</option>`).join('')}</select><select id=\"filterStatus\"><option value=\"\">Tất cả trạng thái</option><option value=\"achieved\">Đạt mục tiêu (≥100%)</option><option value=\"tracking\">Đang theo dõi (80–99%)</option><option value=\"risk\">Cần chú ý (&lt;80%)</option><option value=\"missing\">Chưa đủ dữ liệu</option></select></div><div id=\"results\"></div>`+(archived.length?`<div class=\"sectionspace\"><div class=\"paneltitle\"><h2>Kho lưu trữ KPI (${archived.length})</h2><button onclick=\"showArchive=!showArchive;render()\">${showArchive?'Ẩn kho lưu trữ':'Xem KPI đã lưu trữ'}</button></div>${showArchive?`<div class=\"tablewrap\"><table><thead><tr><th>KPI ĐÃ LƯU TRỮ</th><th>CẤP / BỘ PHẬN</th><th>TRỌNG SỐ</th><th>MỤC TIÊU NĂM</th><th>THỜI GIAN LƯU TRỮ</th><th>THAO TÁC</th></tr></thead><tbody>${archived.map(k=>`<tr><td><strong>${esc(k.name)}</strong><small>${esc(k.owner)} · ${esc(k.ownerEmail||'')}</small></td><td>${esc(k.level)}<small>${esc(k.team)}</small></td><td>${num(k.weight)}%</td><td>${num(k.target)} ${esc(k.unit)}</td><td>${k.archivedAt?esc(new Date(k.archivedAt).toLocaleString('vi-VN')):'—'}</td><td>${manage(k)?`<button onclick=\"restoreKpi(${JSON.stringify(k.id).replaceAll('\"','&quot;')})\">↺ Khôi phục</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:''}</div>`:'');\n    let filter=()=>{let q=$('#search').value.toLowerCase(),lv=$('#filterLevel').value,tm=$('#filterTeam').value,st=$('#filterStatus').value;$('#results').innerHTML=rows(ks.filter(k=>{let s=score(k);return [k.name,k.owner,k.ownerEmail,k.team,k.source].join(' ').toLowerCase().includes(q)&&(!lv||k.level===lv)&&(!tm||k.team===tm)&&(!st||st==='achieved'&&s>=100||st==='tracking'&&s>=80&&s<100||st==='risk'&&s!=null&&s<80||st==='missing'&&s==null)}))};\n    ['search','filterLevel','filterTeam','filterStatus'].forEach(id=>$('#'+id).oninput=filter);filter();\n  }\n  if(view==='cascade')renderCascadeView();\n  if(view==='review'){\n    let q=period.type==='quarter'?period.value:Math.ceil(period.value/3),p={type:'quarter',value:q};\n    $('#app').innerHTML=head('Đánh giá quý '+q,'Dữ liệu cả quý được tổng hợp theo cách tính của từng KPI.')+`<div class=\"alert\">Cộng / trung bình cần đủ 3 tháng (${KPI.months(q).map(m=>'T'+m).join(', ')}); giá trị cuối kỳ cần kết quả tháng ${q*3}. Chốt quý sẽ khóa cập nhật dữ liệu các tháng trong quý và lưu bản chụp (snapshot) kết quả tại thời điểm chốt.</div>`+Object.entries(groups).map(([key,a],i)=>{\n      let r=state.reviews[q+'|'+key]||{},n=totalScore(a,p),own=ownScore(a,p),allowed=user.role==='admin'||user.role==='leader'&&a[0].level==='IID'||user.role==='manager'&&a[0].level!=='IID'&&a[0].team===user.team;\n      let snapKpis=r.snapshot?.kpis||a.map(k=>({...k,result:KPI.measure(k,p)}));\n      return `<div class=\"panel reviewcard\"><div class=\"paneltitle\"><div><h2>${esc(KPI.label(a))}</h2><p class=\"mini\" style=\"margin:4px 0 0\">${a.length} KPI · Điểm KPI riêng: <strong>${num(own)}%</strong> · Điểm tổng hợp: <strong>${num(r.snapshot?.score??n)}%</strong> · ${r.at?'Lưu lúc '+esc(new Date(r.at).toLocaleString('vi-VN'))+' bởi '+esc(r.by):'Chưa lưu đánh giá'}</p></div><div><span class=\"badge ${r.status==='Đã đánh giá'?'':'warn'}\">${esc(r.status||'Nháp')} · ${num(r.snapshot?.score??n)}%</span></div></div><div class=\"subtable\"><table><thead><tr><th>KPI TRONG NHÓM</th><th>CÁCH TÍNH QUÝ</th><th>TRỌNG SỐ</th><th>MỤC TIÊU QUÝ</th><th>THỰC TẾ QUÝ</th><th>HOÀN THÀNH</th></tr></thead><tbody>${snapKpis.map(k=>{let res=k.result||KPI.measure(k,p);return `<tr><td><strong>${esc(k.name)}</strong></td><td>${esc(modeNames[k.mode||'last'])}</td><td>${num(k.weight)}%</td><td>${num(res.target)} ${esc(k.unit)}</td><td>${num(res.actual)} ${res.actual!=null?esc(k.unit):''} <small style=\"display:inline\">(${res.coverage}/${res.total} tháng)</small></td><td><span class=\"badge ${res.score==null?'warn':res.score<80?'bad':res.score<100?'warn':''}\">${num(res.score)}%</span></td></tr>`}).join('')}</tbody></table></div><label>Nhận xét đánh giá & định hướng quý tiếp theo<textarea id=\"review${i}\" rows=\"3\" placeholder=\"Ghi nhận kết quả nổi bật, nguyên nhân chênh lệch và giải pháp cải thiện…\" aria-label=\"Nhận xét ${esc(KPI.label(a))}\" ${!allowed||r.status==='Đã đánh giá'?'disabled':''}>${esc(r.note||'')}</textarea></label><div class=\"flexbetween\"><div>${allowed&&r.status!=='Đã đánh giá'?`<button onclick=\"reviewSave(${i},${q},'${encodeURIComponent(key).replaceAll(\"'\",\"%27\")}','Nháp')\">Lưu nháp</button> <button class=\"primary\" onclick=\"reviewSave(${i},${q},'${encodeURIComponent(key).replaceAll(\"'\",\"%27\")}','Đã đánh giá')\">Chốt đánh giá</button>`:''}${r.status==='Đã đánh giá'&&user.role==='admin'?`<button onclick=\"reviewSave(${i},${q},'${encodeURIComponent(key).replaceAll(\"'\",\"%27\")}','Nháp')\">Mở lại quý</button>`:''}</div>${user.role!=='viewer'?`<button onclick=\"quickActionFromReview(${JSON.stringify(a[0].team).replaceAll('\"','&quot;')},${JSON.stringify(a[0].owner).replaceAll('\"','&quot;')},${JSON.stringify(a[0].ownerEmail||user.email).replaceAll('\"','&quot;')})\">+ Tạo việc cần làm</button>`:''}</div></div>`;\n    }).join('');\n  }\n  if(view==='trend'){\n    $('#app').innerHTML=head('Tiến độ 12 tháng','So sánh kết quả từng tháng với mục tiêu đã phân bổ. Bấm vào ô tháng để cập nhật nhanh.')+`<div class=\"toolbar\"><input id=\"trendSearch\" placeholder=\"Tìm KPI hoặc người phụ trách…\"><select id=\"trendLevel\"><option value=\"\">Tất cả cấp</option><option>IID</option><option>Bộ phận</option><option>Cá nhân</option></select><select id=\"trendTeam\"><option value=\"\">Tất cả bộ phận</option>${[...new Set(ks.map(k=>k.team))].map(t=>`<option>${esc(t)}</option>`).join('')}</select></div><div id=\"trendTable\"></div>`;\n    let renderTrend=()=>{\n      let q=($('#trendSearch')?.value||'').toLowerCase(),lv=$('#trendLevel')?.value||'',tm=$('#trendTeam')?.value||'';\n      let list=ks.filter(k=>[k.name,k.owner,k.team].join(' ').toLowerCase().includes(q)&&(!lv||k.level===lv)&&(!tm||k.team===tm));\n      $('#trendTable').innerHTML=!list.length?'<div class=\"empty\">Không có KPI phù hợp.</div>':`<div class=\"tablewrap\"><table><thead><tr><th>KPI / PHÂN BỔ</th>${Array.from({length:12},(_,i)=>`<th>T${i+1}</th>`).join('')}</tr></thead><tbody>${list.map(k=>`<tr><td><strong>${esc(k.name)}</strong><small>${esc(k.owner)} · ${esc(modeNames[k.mode])}</small></td>${Array.from({length:12},(_,i)=>{let m=i+1,r=KPI.measure(k,{type:'month',value:m}),canClick=write(k);return `<td ${canClick?`style=\"cursor:pointer\" title=\"Bấm để cập nhật Tháng ${m}\" onclick=\"openUpdateMonth(${JSON.stringify(k.id).replaceAll('\"','&quot;')},${m})\"`:''}><span class=\"badge ${r.score==null?'neutral':r.score<80?'bad':r.score<100?'warn':''}\">${num(r.score)}%</span><small>${num(r.actual)} / ${num(r.target)}</small></td>`}).join('')}</tr>`).join('')}</tbody></table></div>`;\n    };\n    ['trendSearch','trendLevel','trendTeam'].forEach(id=>$('#'+id).oninput=renderTrend);renderTrend();\n  }\n  if(view==='actions')renderActionsView();\n  if(view==='guide')$('#app').innerHTML=head('Quy tắc & hướng dẫn','Quản trị KPI 2027 dùng chung trong khối IID.')+`<div class=\"guidegrid\"><div class=\"panel\"><h2>01 · Quyền thao tác & Bảo mật</h2><p><strong>Quản trị (Admin):</strong> Toàn bộ KPI, cơ cấu trọng số, tài khoản và chốt/mở lại quý.<br><strong>Cấp IID (Leader):</strong> Quản lý KPI cấp IID, đánh giá quý IID và kế hoạch hành động IID.<br><strong>Quản lý (Manager):</strong> KPI, kết quả, đánh giá và công việc thuộc bộ phận của mình.<br><strong>Nhân viên (Contributor):</strong> Cập nhật kết quả KPI và công việc giao đúng email của mình.<br><strong>Người xem (Viewer):</strong> Chỉ đọc trong phạm vi cấp được giao.</p></div><div class=\"panel\"><h2>02 · Điểm & Dữ liệu kỳ</h2><p>Tháng đối chiếu với mục tiêu tháng (mặc định theo phân bổ hoặc đặt riêng từng tháng). Quý tổng hợp theo cấu hình KPI: <em>Giá trị cuối kỳ</em>, <em>Cộng 3 tháng</em> hoặc <em>Trung bình 3 tháng</em>. Nhóm thiếu dữ liệu bắt buộc hoặc tổng trọng số khác 100% sẽ chưa tính điểm. Trần điểm thành phần và tổng hợp là 120%.</p></div><div class=\"panel\"><h2>03 · Liên kết 3 tầng & Trọng số</h2><p>Mục tiêu liên kết chặt chẽ từ <strong>IID → Bộ phận → Cá nhân</strong>. Cơ cấu điểm tổng hợp mặc định: Bộ phận (50% IID + 50% Bộ phận), Cá nhân (30% IID + 40% Bộ phận + 30% Cá nhân). Khi xóa KPI không còn dùng, hệ thống đưa vào <em>Kho lưu trữ</em> để bảo toàn lịch sử và có thể khôi phục khi cần.</p></div><div class=\"panel\"><h2>04 · Dữ liệu dùng chung & Kiểm toán</h2><p>Mọi thay đổi lưu tập trung trên máy chủ với cơ chế kiểm soát phiên bản (chống ghi đè khi nhiều người cùng sửa). Nhật ký kiểm toán (Audit Log) ghi nhận đầy đủ người thực hiện, thao tác và thời gian. Có thể xuất bản sao JSON hoặc báo cáo CSV bất kỳ lúc nào.</p></div></div>`;\n}\nfunction renderCascadeNode(k,all,depth=0){\n  let isVisible=state.kpis.some(x=>x.id===k.id),r=isVisible?result(k):null,children=all.filter(c=>c.parent===k.id);\n  return `<div class=\"treeitem\"><div class=\"cascaderow\"><div><span class=\"badge ${depth===0?'':depth===1?'warn':'neutral'}\">${esc(k.level)}</span> <strong>${esc(k.name)}</strong><small class=\"mini\" style=\"display:block;margin-top:4px\">${esc(k.team)}${k.owner?' · '+esc(k.owner):''}${k.weight!=null?' · Trọng số: '+num(k.weight)+'%':''}</small></div>${isVisible?`<div class=\"cascademeta\"><span>${num(r.actual)} / ${num(r.target)} ${esc(k.unit)}</span><div class=\"track\"><div class=\"fill ${fillClass(r.score)}\" style=\"width:${Math.min(100,r.score||0)}%\"></div></div><span class=\"badge ${r.score==null?'warn':r.score<80?'bad':r.score<100?'warn':''}\">${num(r.score)}%</span></div>`:'<span class=\"badge neutral\">Mục tiêu cấp trên liên kết</span>'}</div>${children.length?`<div class=\"tree\">${children.map(c=>renderCascadeNode(c,all,depth+1)).join('')}</div>`:''}</div>`;\n}\nfunction renderCascadeView(){\n  let all=[...(state.references||[]),...state.kpis],roots=all.filter(k=>k.level==='IID'||!k.parent||!all.some(p=>p.id===k.parent));\n  $('#app').innerHTML=head('Liên kết mục tiêu','Kết nối xuyên suốt IID → Bộ phận → Cá nhân',true)+`<div class=\"panel\"><h2>Cơ cấu điểm tổng hợp</h2><p class=\"mini\">Điểm đánh giá của Bộ phận và Cá nhân là sự kết hợp giữa kết quả chung của Khối IID, Bộ phận và kết quả KPI trực tiếp theo tỷ lệ dưới đây.</p><div class=\"guidegrid\">${mixForm('department','Cơ cấu cấp Bộ phận',['IID','Bộ phận'],[[30,70],[30,70]])}${mixForm('personal','Cơ cấu cấp Cá nhân',['IID','Bộ phận','Cá nhân'],[[20,40],[30,50],[20,40]])}</div></div><div class=\"sectionspace\">${roots.map(r=>renderCascadeNode(r,all,0)).join('')||'<div class=\"empty\">Chưa có KPI trong phạm vi.</div>'}</div>`;\n}\nfunction renderActionsView(){\n  let can=user.role!=='viewer',acts=state.actions||[],openCount=acts.filter(a=>a.status!=='Hoàn tất').length,overCount=acts.filter(isOverdue).length,doneCount=acts.filter(a=>a.status==='Hoàn tất').length;\n  let editObj=acts.find(a=>a.id===editingAction);\n  $('#app').innerHTML=head('Kế hoạch hành động','Biến phản hồi đánh giá thành công việc cụ thể có người phụ trách, KPI liên kết và thời hạn.')+`<div class=\"stats\"><div class=\"card\"><small>TỔNG CÔNG VIỆC</small><div class=\"number\">${acts.length}</div><p>Trong phạm vi hiển thị</p></div><div class=\"card\"><small>ĐANG MỞ</small><div class=\"number\">${openCount}</div><p>Mới hoặc đang thực hiện</p></div><div class=\"card\"><small>QUÁ HẠN</small><div class=\"number\" style=\"color:${overCount?'var(--bad)':'inherit'}\">${overCount}</div><p>Cần ưu tiên xử lý</p></div><div class=\"card\"><small>HOÀN TẤT</small><div class=\"number\" style=\"color:var(--green)\">${doneCount}</div><p>${acts.length?Math.round(doneCount/acts.length*100):0}% tỷ lệ hoàn thành</p></div></div>`+(can?`<form id=\"actionform\" class=\"panel\"><div class=\"paneltitle\"><h2>${editObj?'Cập nhật công việc':'Thêm công việc mới'}</h2>${editObj?'<button type=\"button\" onclick=\"editingAction=null;render()\">Hủy sửa</button>':''}</div><div class=\"fields\"><label>Việc cần làm<input name=\"title\" required value=\"${esc(editObj?.title||'')}\"></label><label>KPI liên quan<select name=\"kpiId\"><option value=\"\">— Chung / Không gắn KPI riêng —</option>${state.kpis.map(k=>`<option value=\"${esc(k.id)}\" ${editObj?.kpiId===k.id?'selected':''}>${esc(k.name)} (${esc(k.team)})</option>`).join('')}</select></label><label>Người phụ trách<input name=\"owner\" required value=\"${esc(editObj?.owner??(user.name||''))}\"></label><label>Email phụ trách<input name=\"ownerEmail\" type=\"email\" required value=\"${esc(editObj?.ownerEmail??user.email)}\"></label><label>Bộ phận<input name=\"team\" required value=\"${esc(editObj?.team??(user.team||'Toàn khối'))}\"></label><label>Cấp hành động<select name=\"level\">${['IID','Bộ phận','Cá nhân'].filter(l=>user.role==='admin'||user.role==='leader'&&l==='IID'||user.role==='manager'&&l!=='IID'||user.role==='contributor'&&l==='Cá nhân').map(l=>`<option ${editObj?.level===l?'selected':''}>${l}</option>`).join('')}</select></label><label>Mức ưu tiên<select name=\"priority\">${['Cao','Trung bình','Thấp'].map(p=>`<option ${(editObj?.priority||'Trung bình')===p?'selected':''}>${p}</option>`).join('')}</select></label><label>Hạn hoàn thành<input name=\"due\" type=\"date\" required value=\"${esc(editObj?.due||'')}\"></label></div><label style=\"margin-top:12px\">Ghi chú / Kết quả thực hiện<input name=\"note\" value=\"${esc(editObj?.note||'')}\" placeholder=\"Mô tả chi tiết hoặc link kết quả đầu ra…\"></label><p style=\"margin:14px 0 0\"><button class=\"primary\">${editObj?'Lưu cập nhật':'+ Thêm việc cần làm'}</button></p></form>`:'')+`<div class=\"toolbar\"><input id=\"actSearch\" placeholder=\"Tìm công việc, người phụ trách hoặc bộ phận…\"><select id=\"actStatus\"><option value=\"\">Tất cả trạng thái</option><option value=\"open\">Đang mở (Mới & Đang làm)</option><option value=\"overdue\">Quá hạn</option><option value=\"Mới\">Mới</option><option value=\"Đang làm\">Đang làm</option><option value=\"Hoàn tất\">Hoàn tất</option></select><select id=\"actPriority\"><option value=\"\">Tất cả mức ưu tiên</option><option>Cao</option><option>Trung bình</option><option>Thấp</option></select></div><div id=\"actionList\" class=\"sectionspace\"></div>`;\n  if(can)$('#actionform').onsubmit=async e=>{e.preventDefault();let d=Object.fromEntries(new FormData(e.target));let action={...editObj,...d,id:editObj?.id||crypto.randomUUID(),ownerEmail:d.ownerEmail.toLowerCase().trim(),status:editObj?.status||'Mới'};if(await mutate({type:'action',action})){editingAction=null;render()}};\n  let filterActions=()=>{\n    let q=($('#actSearch')?.value||'').toLowerCase(),st=$('#actStatus')?.value||'',pr=$('#actPriority')?.value||'';\n    let list=acts.filter(a=>[a.title,a.owner,a.ownerEmail,a.team,a.note||''].join(' ').toLowerCase().includes(q)&&(!st||st==='open'&&a.status!=='Hoàn tất'||st==='overdue'&&isOverdue(a)||a.status===st)&&(!pr||(a.priority||'Trung bình')===pr));\n    $('#actionList').innerHTML=!list.length?'<div class=\"empty\">Không có công việc phù hợp.</div>':list.map(a=>{\n      let canEdit=user.role==='admin'||user.role==='leader'&&a.level==='IID'||user.role==='manager'&&a.team===user.team&&a.level!=='IID'||user.role==='contributor'&&a.ownerEmail?.toLowerCase()===user.email;\n      let linkedKpi=a.kpiId?state.kpis.find(k=>k.id===a.kpiId):null,overdue=isOverdue(a),prio=a.priority||'Trung bình';\n      return `<div class=\"panel reviewcard\"><div class=\"paneltitle\"><h2>${esc(a.title)}</h2><div class=\"actionmeta\"><span class=\"badge ${prio==='Cao'?'bad':prio==='Thấp'?'neutral':'warn'}\">Ưu tiên: ${esc(prio)}</span>${overdue?'<span class=\"badge bad\">Quá hạn</span>':''}<span class=\"badge ${a.status==='Hoàn tất'?'':a.status==='Đang làm'?'warn':'neutral'}\">${esc(a.status)}</span></div></div><p style=\"margin:6px 0\"><strong>${esc(a.owner)}</strong> (${esc(a.ownerEmail||'')}) · ${esc(a.team)} · Cấp ${esc(a.level||'Cá nhân')} · Hạn: <strong>${esc(a.due)}</strong>${linkedKpi?` · KPI: <strong>${esc(linkedKpi.name)}</strong>`:''}</p>${a.note?`<p class=\"mini\" style=\"margin:6px 0\">Ghi chú: ${esc(a.note)}</p>`:''}${canEdit?`<div style=\"margin-top:12px\"><select aria-label=\"Trạng thái ${esc(a.title)}\" onchange=\"changeAction('${encodeURIComponent(a.id).replaceAll(\"'\",\"%27\")}',this.value)\">${['Mới','Đang làm','Hoàn tất'].map(s=>`<option ${s===a.status?'selected':''}>${s}</option>`).join('')}</select><button onclick=\"editingAction=${JSON.stringify(a.id).replaceAll('\"','&quot;')};render();window.scrollTo({top:0,behavior:'smooth'})\">Sửa</button> <button class=\"danger\" onclick=\"deleteAction('${encodeURIComponent(a.id).replaceAll(\"'\",\"%27\")}')\">Xóa</button></div>`:''}</div>`;\n    }).join('');\n  };\n  ['actSearch','actStatus','actPriority'].forEach(id=>$('#'+id).oninput=filterActions);filterActions();\n}\nfunction quickActionFromReview(team,owner,ownerEmail){view='actions';editingAction=null;render();let f=$('#actionform');if(f){f.elements.team.value=team||'';f.elements.owner.value=owner||'';f.elements.ownerEmail.value=ownerEmail||user.email;f.elements.title.focus()}}\nasync function initialize(kind){let s;if(kind==='local'){try{s=JSON.parse(localStorage.getItem('iid-kpi-v1'));if(!s)throw Error()}catch{return toast('Trình duyệt này chưa có dữ liệu cũ. Hãy nhập file JSON hoặc dùng dữ liệu mẫu.')}}else s={kpis:kind==='sample'?seed:[],reviews:{},mix:{department:[50,50],personal:[30,40,30]}};try{KPI.validate(s);await mutate({type:'replace',state:KPI.migrate(s)})}catch(e){toast(e.message)}}\nfunction updateWeightHint(){\n  if(!state)return;let f=$('#form'),l=f.elements.level.value,tm=f.elements.team.value.trim(),ow=f.elements.owner.value.trim(),em=f.elements.ownerEmail.value.trim().toLowerCase();\n  let probeKey=KPI.key({level:l,team:tm,owner:ow,ownerEmail:em});\n  let others=state.kpis.filter(k=>k.id!==editing&&KPI.key(k)===probeKey);\n  let sumOthers=others.reduce((s,k)=>s+k.weight,0),rem=Math.max(0,Math.round((100-sumOthers)*10)/10);\n  $('#weighthint').textContent=`(Nhóm đã có ${num(sumOthers)}% · Còn lại ${num(rem)}%)`;\n  return rem;\n}\nfunction parentOptions(){let f=$('#form'),l=f.elements.level.value;f.elements.parent.innerHTML='<option value=\"\">Không có</option>'+[...state.kpis,...(state.references||[])].filter(k=>k.id!==editing&&l!=='IID'&&k.level===(l==='Cá nhân'?'Bộ phận':'IID')&&(l!=='Cá nhân'||k.team===f.elements.team.value)).map(k=>`<option value=\"${esc(k.id)}\">${esc(k.name)} · ${esc(k.team)}</option>`).join('');f.elements.parent.required=l!=='IID';updateWeightHint()}\nfunction openEditor(id){editing=id||null;$('#form').reset();let k=state.kpis.find(k=>k.id===id);$('#formtitle').textContent=k?'Sửa KPI':'Tạo KPI';if(k)for(let n of ['name','level','team','owner','ownerEmail','weight','target','unit','direction','source','frequency','mode','plan'])$('#form').elements[n].value=k[n]??'';else{if(user.role==='manager'){$('#form').elements.level.value='Bộ phận';$('#form').elements.team.value=user.team}else if(user.role==='leader'){$('#form').elements.level.value='IID';$('#form').elements.team.value='Toàn khối'}}parentOptions();if(k)$('#form').elements.parent.value=k.parent||'';else{let rem=updateWeightHint();if(rem>0&&rem<=100)$('#form').elements.weight.value=rem}$('#editor').showModal()}\n['level','team','owner','ownerEmail'].forEach(n=>$('#form').elements[n].addEventListener('input',parentOptions));\n$('#close').onclick=()=>$('#editor').close();$('#form').onsubmit=async e=>{e.preventDefault();let d=Object.fromEntries(new FormData(e.target)),old=state.kpis.find(k=>k.id===editing);let k={...d,id:editing||crypto.randomUUID(),target:Number(d.target),weight:Number(d.weight),ownerEmail:d.ownerEmail.toLowerCase().trim(),parent:d.level==='IID'?null:d.parent,updates:old?.updates||{},targets:old?.targets||{}};if(await mutate({type:'kpi',kpi:k}))$('#editor').close()};\nasync function removeKpi(id){if(confirm('Lưu trữ KPI này vào kho lưu trữ? (KPI con nếu có cần được đổi liên kết trước)'))await mutate({type:'delete',id})}\nasync function restoreKpi(id){await mutate({type:'restore',id})}\nfunction openUpdateMonth(id,m){period={type:'month',value:m};$('#periodType').value='month';periodOptions();render();openUpdate(id)}\nfunction openUpdate(id){if(period.type!=='month'){period={type:'month',value:(period.value-1)*3+1};$('#periodType').value='month';periodOptions();render()}updating=id;let k=state.kpis.find(k=>k.id===id),u=k.updates[period.value],f=$('#updateform');f.reset();$('#updatename').textContent=`${k.name} · ${titlePeriod()} · Đơn vị: ${k.unit} (${modeNames[k.mode]})`;$('#updatehistory').innerHTML=Array.from({length:12},(_,i)=>{let m=i+1,r=KPI.measure(k,{type:'month',value:m});return `<div class=\"monthcell ${m===period.value?'active':''}\" onclick=\"openUpdateMonth(${JSON.stringify(k.id).replaceAll('\"','&quot;')},${m})\">T${m}<small>${num(r.actual)}/${num(r.target)}</small></div>`}).join('');f.elements.actual.value=u?.actual??'';f.elements.note.value=u?.note||'';f.elements.periodTarget.value=k.targets[period.value]??'';f.elements.periodTarget.disabled=!manage(k);$('#update').showModal()}\n$('#updateform').onsubmit=async e=>{e.preventDefault();let f=e.target,k=state.kpis.find(k=>k.id===updating);if(manage(k)){let value=f.elements.periodTarget.value;let targets={...k.targets};if(value==='')delete targets[period.value];else targets[period.value]=Number(value);if(JSON.stringify(targets)!==JSON.stringify(k.targets)){if(!await mutate({type:'kpi',kpi:{...k,targets}}))return}}let act=f.elements.actual.value.trim();if(act!==''){if(await mutate({type:'update',id:updating,month:period.value,actual:Number(act),note:f.elements.note.value}))$('#update').close()}else{$('#update').close()}};\nfunction mixForm(key,title,labels,bounds){return `<form onsubmit=\"saveMix(event,'${key}')\"><h3>${title}</h3>${labels.map((l,i)=>`<label>${l} (${bounds[i][0]}–${bounds[i][1]}%)<input name=\"v${i}\" type=\"number\" min=\"${bounds[i][0]}\" max=\"${bounds[i][1]}\" value=\"${state.mix[key][i]}\" required ${user.role!=='admin'?'disabled':''}></label>`).join('')}${user.role==='admin'?'<p style=\"margin:12px 0 0\"><button>Lưu cơ cấu</button></p>':''}</form>`}\nasync function saveMix(e,key){e.preventDefault();let mix={...state.mix,[key]:[...new FormData(e.target).values()].map(Number)};try{KPI.validate({...state,mix});await mutate({type:'mix',mix})}catch(e){toast(e.message)}}\nasync function reviewSave(i,q,key,status){if(status==='Đã đánh giá'&&!confirm('Chốt đánh giá và khóa dữ liệu quý này?'))return;await mutate({type:'review',quarter:q,group:decodeURIComponent(key),note:$('#review'+i).value,status})}\nasync function changeAction(id,status){let a=state.actions.find(a=>a.id===decodeURIComponent(id));await mutate({type:'action',action:{...a,status}})}\nasync function deleteAction(id){if(!confirm('Xóa công việc này khỏi kế hoạch hành động?'))return;await mutate({type:'delete_action',id:decodeURIComponent(id)})}\nfunction periodOptions(){let count=period.type==='month'?12:4;$('#month').innerHTML=Array.from({length:count},(_,i)=>`<option value=\"${i+1}\" ${i+1===period.value?'selected':''}>${period.type==='month'?'Tháng':'Quý'} ${i+1} / 2027</option>`).join('')}\n$('#periodType').onchange=e=>{period={type:e.target.value,value:e.target.value==='quarter'?Math.ceil(period.value/3):period.value*3};periodOptions();render()};$('#month').onchange=e=>{period.value=Number(e.target.value);render()};$('#refresh').onclick=sync;document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{view=b.dataset.view;render()});\nfunction download(text,type,name){let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}$('#backup').onclick=()=>{if(state)download(JSON.stringify(state,null,2),'application/json','iid-kpi-shared-2027.json')};$('#export').onclick=()=>{if(!state)return;let cell=v=>'\"'+String(v??'').replaceAll('\"','\"\"').replace(/^[=+@\\-]/,\"'$&\")+'\"';download('\\ufeff'+[['KPI','Cấp','Bộ phận','Owner','Email','Trọng số','Kỳ','Mục tiêu kỳ','Thực tế','Điểm %','Nguồn','Ghi chú'],...state.kpis.map(k=>{let r=result(k);return[k.name,k.level,k.team,k.owner,k.ownerEmail,k.weight,titlePeriod(),r.target,r.actual,r.score,k.source,period.type==='month'?k.updates[period.value]?.note||'':'']})].map(r=>r.map(cell).join(',')).join('\\r\\n'),'text/csv;charset=utf-8','iid-kpi-report.csv')};\n$('#import').onchange=async e=>{try{if(user.role!=='admin')throw Error('Chỉ quản trị được nhập dữ liệu.');let s=JSON.parse(await e.target.files[0].text());KPI.validate(s);if(confirm('Thay dữ liệu kho chung bằng bản sao? Hãy xuất bản sao hiện tại trước.'))await mutate({type:'replace',state:KPI.migrate(s)})}catch(e){toast(e.message)}finally{e.target.value=''}};\n\n\n\r\n","/accounts.js":"let setupEmail=null;\nconst scopeNames={all:'Toàn hệ thống',iid:'Cấp IID',department:'Bộ phận được giao',personal:'Cá nhân được giao'},opNames={initialize:'Khởi tạo kho KPI',replace:'Nhập toàn bộ dữ liệu',kpi:'Cập nhật định nghĩa KPI',delete:'Lưu trữ KPI',restore:'Khôi phục KPI',update:'Cập nhật kết quả tháng',mix:'Đổi cơ cấu trọng số',review:'Đánh giá quý',action:'Cập nhật công việc',delete_action:'Xóa công việc',member:'Cập nhật tài khoản',login:'Đăng nhập',password_setup:'Thiết lập mật khẩu QT',password_change:'Đổi mật khẩu',password_reset:'Cấp lại mật khẩu tạm'};\nfunction totalScore(ks,p){if(!ks.length)return null;return user.role==='admin'?KPI.composite(state,ks,p):state.scopeScores?.[p.type+'|'+p.value+'|'+KPI.key(ks[0])]??null;}\nfunction ownScore(ks,p){if(!ks.length)return null;return user.role==='admin'?KPI.weighted(ks,p):state.ownScores?.[p.type+'|'+p.value+'|'+KPI.key(ks[0])]??KPI.weighted(ks,p);}\nfunction applyMenus(){document.querySelectorAll('nav button').forEach(b=>{b.hidden=!user||b.dataset.view==='members'&&user.role!=='admin'||user.mustChange&&b.dataset.view!=='account';b.classList.toggle('active',b.dataset.view===view)});$('#import').parentElement.hidden=!user||user.role!=='admin';$('#backup').hidden=!user||user.mustChange;$('#logout').hidden=!user;$('.avatar').textContent=user?`${user.name||user.email.split('@')[0]} · ${roleNames[user.role]}`:'Khách';}\nfunction logoutUI(){user=null;state=null;version=0;stale=false;view='overview';document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.body.classList.add('signedout');applyMenus();}\nfunction renderLogin(){logoutUI();$('#app').innerHTML=`<div class=\"loginbox\"><div class=\"eyebrow\">IID · KPI WORKSPACE 2027</div><h1>${setupEmail?'Thiết lập mật khẩu quản trị':'Đăng nhập tài khoản KPI'}</h1><p>${setupEmail?'Xác thực quản trị hiện có đã hoàn tất. Hãy tự đặt mật khẩu để dùng tài khoản email/mật khẩu.':'Sử dụng email và mật khẩu được quản trị cấp.'}</p><form id=\"loginform\"><label>Email<input name=\"email\" type=\"email\" autocomplete=\"username\" required value=\"${esc(setupEmail||'')}\" ${setupEmail?'readonly':''}></label><label>${setupEmail?'Mật khẩu mới':'Mật khẩu'}<input name=\"password\" type=\"password\" autocomplete=\"${setupEmail?'new-password':'current-password'}\" required ${setupEmail?'minlength=\"15\"':''}></label>${setupEmail?'<label>Nhập lại mật khẩu mới<input name=\"confirm\" type=\"password\" autocomplete=\"new-password\" required></label><p class=\"mini\">Ít nhất 15 ký tự; tối đa 72 byte UTF-8.</p>':''}<p id=\"loginerror\" role=\"alert\"></p><button class=\"primary\">${setupEmail?'Thiết lập & đăng nhập':'Đăng nhập'}</button></form>${setupEmail?'<p><button onclick=\"setupEmail=null;renderLogin()\">Dùng tài khoản đã có mật khẩu</button></p>':'<p class=\"mini\">Quên mật khẩu? Liên hệ quản trị để cấp lại mật khẩu tạm.</p><a class=\"mini\" href=\"/signin-with-chatgpt?return_to=%2F\" target=\"_top\">Thiết lập mật khẩu lần đầu cho quản trị hiện có</a>'}</div>`;$('#loginform').onsubmit=async e=>{e.preventDefault();let f=e.target,b=f.querySelector('button');if(setupEmail&&f.elements.password.value!==f.elements.confirm.value){$('#loginerror').textContent='Hai mật khẩu chưa khớp.';return}b.disabled=true;try{let x=await req(setupEmail?'/auth/setup':'/auth/login','POST',{email:f.elements.email.value,password:f.elements.password.value});setupEmail=null;user=x.user;await enterWorkspace()}catch(e){$('#loginerror').textContent=e.message}finally{b.disabled=false}};}\nasync function enterWorkspace(){document.body.classList.remove('signedout');applyMenus();if(user.mustChange){view='account';render();return}let x=await req('/api/workspace');state=x.state?KPI.migrate(x.state):null;version=x.version;view='overview';render();}\nfunction renderAccount(){if(!user)return renderLogin();$('#app').innerHTML=head('Tài khoản & mật khẩu','Tự quản lý mật khẩu và bảo mật phiên đăng nhập cho tài khoản của bạn.')+`<div class=\"panel\"><h2>${esc(user.name)}</h2><p>${esc(user.email)} · <span class=\"badge\">${esc(roleNames[user.role])}</span><br>Phạm vi dữ liệu: <strong>${esc(scopeNames[user.scope_level])}</strong>${user.team?' · Bộ phận: <strong>'+esc(user.team)+'</strong>':''}</p>${user.mustChange?'<div class=\"alert\">Bạn đang dùng mật khẩu tạm. Hãy đổi mật khẩu trước khi xem hoặc cập nhật KPI.</div>':''}<form id=\"passwordform\" class=\"fields\"><label>Mật khẩu hiện tại<input name=\"currentPassword\" type=\"password\" autocomplete=\"current-password\" required></label><label>Mật khẩu mới<input name=\"newPassword\" type=\"password\" minlength=\"15\" autocomplete=\"new-password\" required></label><label>Nhập lại mật khẩu mới<input name=\"confirm\" type=\"password\" autocomplete=\"new-password\" required></label><button class=\"primary\">Đổi mật khẩu</button></form><p class=\"mini\">Ít nhất 15 ký tự, tối đa 72 byte UTF-8. Tất cả phiên đăng nhập trước sẽ tự động bị thu hồi khi đổi mật khẩu.</p></div>`;$('#passwordform').onsubmit=async e=>{e.preventDefault();let f=e.target;if(f.elements.newPassword.value!==f.elements.confirm.value)return toast('Hai mật khẩu mới chưa khớp.');let b=f.querySelector('button');b.disabled=true;try{let x=await req('/auth/change-password','POST',{currentPassword:f.elements.currentPassword.value,newPassword:f.elements.newPassword.value});user=x.user;await enterWorkspace();toast('Đã đổi mật khẩu và thu hồi các phiên cũ.')}catch(e){toast(e.message)}finally{b.disabled=false}};}\nfunction showTemporary(email,p){let d=document.createElement('dialog');d.className='temporary';d.innerHTML=`<h2>Mật khẩu tạm đã khởi tạo</h2><p>Tài khoản <strong>${esc(email)}</strong>. Mật khẩu tạm này chỉ hiển thị một lần. Hãy sao chép và gửi riêng cho nhân sự; họ bắt buộc phải đổi mật khẩu ngay lần đăng nhập đầu tiên.</p><input readonly aria-label=\"Mật khẩu tạm\" value=\"${esc(p)}\"><div class=\"flexbetween\" style=\"margin-top:16px\"><button type=\"button\" id=\"copytemp\">📋 Sao chép mật khẩu</button><button class=\"primary\" id=\"closetemp\">Đã ghi nhận</button></div>`;document.body.appendChild(d);d.querySelector('#copytemp').onclick=()=>{navigator.clipboard?.writeText(p);toast('Đã sao chép mật khẩu tạm')};d.querySelector('#closetemp').onclick=()=>d.close();d.onclose=()=>d.remove();d.showModal();}\nfunction renderMembers(){if(user?.role!=='admin'){$('#app').innerHTML=head('Thành viên & quyền','Vai trò hiện tại: '+roleNames[user?.role])+'<div class=\"panel\">Liên hệ quản trị viên để điều chỉnh quyền truy cập.</div>';return}$('#app').innerHTML=head('Tài khoản & phạm vi','Quản trị cấp tài khoản email/mật khẩu và phân quyền phạm vi dữ liệu cho từng thành viên.')+`<form id=\"memberform\" class=\"panel fields\"><label>Email<input name=\"email\" type=\"email\" required placeholder=\"ten@congty.com\"></label><label>Họ tên hiển thị<input name=\"name\" required placeholder=\"Nguyễn Văn A\"></label><label>Vai trò<select name=\"role\"><option value=\"contributor\">Cá nhân (Nhân viên)</option><option value=\"manager\">Quản lý bộ phận</option><option value=\"leader\">Cấp IID</option><option value=\"viewer\">Chỉ xem</option><option value=\"admin\">Quản trị</option></select></label><label>Bộ phận<input name=\"team\" placeholder=\"VD: Kinh doanh, Vận hành\"></label><label>Cấp được xem (cho vai trò Chỉ xem)<select name=\"scope_level\"><option value=\"personal\">Cá nhân theo email tài khoản</option><option value=\"department\">Bộ phận được giao</option><option value=\"iid\">Cấp IID</option></select></label><label class=\"check\"><input name=\"disabled\" type=\"checkbox\"> Khóa tài khoản (thu hồi phiên)</label><button class=\"primary\">Cấp tài khoản / lưu quyền</button></form><p class=\"mini\">Tài khoản mới được tạo mật khẩu tạm tự động (24 ký tự). Với tài khoản đã tồn tại, dùng nút <em>Cấp lại mật khẩu</em> khi cần đặt lại. KPI cá nhân được ánh xạ tự động theo đúng email tài khoản.</p><div id=\"memberlist\" class=\"sectionspace\">Đang tải…</div><div id=\"auditlist\" class=\"sectionspace\"></div>`;$('#memberform').onsubmit=async e=>{e.preventDefault();let data=Object.fromEntries(new FormData(e.target));data.disabled=e.target.elements.disabled.checked;try{let x=await req('/api/members','POST',data);await loadAccountList();if(x.temporaryPassword)showTemporary(x.email,x.temporaryPassword);else toast('Đã lưu quyền; các phiên đăng nhập cũ của tài khoản này đã được thu hồi.');if(data.email.toLowerCase()===user.email){setupEmail=null;renderLogin()}}catch(e){toast(e.message)}};loadAccountList();}\nlet accountList=[];\nfunction formatAuditDetails(l){try{let d=JSON.parse(l.details||'{}');let parts=[];if(d.email)parts.push('Tài khoản: '+d.email);if(d.role)parts.push('Vai trò: '+(roleNames[d.role]||d.role));if(d.id)parts.push('ID: '+d.id);if(d.month)parts.push('Tháng '+d.month);if(d.quarter)parts.push('Quý '+d.quarter);return parts.join(' · ')||'—'}catch{return '—'}}\nasync function loadAccountList(){try{let [ms,logs]=await Promise.all([req('/api/members'),req('/api/audit')]);if(view!=='members')return;accountList=ms;$('#memberlist').innerHTML=`<div class=\"tablewrap\"><table><thead><tr><th>TÀI KHOẢN</th><th>VAI TRÒ / PHẠM VI</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>${ms.map((m,i)=>`<tr><td><strong>${esc(m.name)}</strong><small>${esc(m.email)}</small></td><td><span class=\"badge neutral\">${esc(roleNames[m.role])}</span><small>${esc(scopeNames[m.scope_level])}${m.team?' · '+esc(m.team):''}</small></td><td><span class=\"badge ${m.disabled?'bad':m.passwordReady?m.mustChange?'warn':'':'warn'}\">${m.disabled?'Đã khóa':m.passwordReady?m.mustChange?'Cần đổi MK tạm':'Đang hoạt động':'Chưa đặt mật khẩu'}</span></td><td><button onclick=\"editMember(${i})\">Sửa quyền</button>${m.email!==user.email?` <button onclick=\"resetMember(${i})\">Cấp lại mật khẩu</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;$('#auditlist').innerHTML='<div class=\"paneltitle\" style=\"margin-top:28px\"><h2>Nhật ký kiểm toán (Audit Log)</h2><small>100 thao tác gần nhất trên hệ thống</small></div><div class=\"tablewrap\"><table><thead><tr><th>THỜI GIAN</th><th>NGƯỜI THỰC HIỆN</th><th>THAO TÁC</th><th>CHI TIẾT</th></tr></thead><tbody>'+logs.map(l=>`<tr><td>${esc(new Date(l.at).toLocaleString('vi-VN'))}</td><td><strong>${esc(l.actor)}</strong></td><td><span class=\"badge neutral\">${esc(opNames[l.operation]||l.operation)}</span></td><td><small style=\"margin:0\">${esc(formatAuditDetails(l))}</small></td></tr>`).join('')+'</tbody></table></div>'}catch(e){toast(e.message)}}\nfunction editMember(i){let m=accountList[i],f=$('#memberform');for(let n of ['email','name','role','team'])f.elements[n].value=m[n]||'';f.elements.scope_level.value=['iid','department','personal'].includes(m.scope_level)?m.scope_level:'personal';f.elements.disabled.checked=m.disabled;f.elements.email.focus();window.scrollTo({top:0,behavior:'smooth'});}\nasync function resetMember(i){let m=accountList[i];if(!confirm('Cấp lại mật khẩu tạm cho '+m.email+' và thu hồi các phiên đăng nhập cũ?'))return;try{let x=await req('/auth/reset-password','POST',{email:m.email});await loadAccountList();showTemporary(x.email,x.temporaryPassword)}catch(e){toast(e.message)}}\nconst renderScopedCascade=renderCascadeView;\n$('#logout').onclick=async()=>{try{await req('/auth/logout','POST',{});setupEmail=null;renderLogin()}catch(e){toast(e.message)}};\nperiodOptions();(async()=>{try{let x=await req('/auth/me');setupEmail=x.setupEmail;user=x.user;if(user)await enterWorkspace();else renderLogin()}catch(e){logoutUI();$('#app').innerHTML='<div class=\"panel\"><h1>Kết nối tài khoản</h1><p>'+esc(e.message)+'</p><button onclick=\"location.reload()\">Thử lại</button></div>'}})();\n","/":"<!doctype html><html lang=\"vi\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>IID · KPI 2027</title><link rel=\"stylesheet\" href=\"style.css\"></head><body><aside><div class=\"brand\"><span>↗</span> IID<span class=\"year\">2027</span></div><small>PERFORMANCE WORKSPACE</small><nav><button data-view=\"overview\" class=\"active\">◫ &nbsp; Tổng quan</button><button data-view=\"kpis\">◎ &nbsp; Sổ KPI</button><button data-view=\"cascade\">⊞ &nbsp; Liên kết mục tiêu</button><button data-view=\"review\">▤ &nbsp; Đánh giá quý</button><button data-view=\"members\">♧ &nbsp; Thành viên & quyền</button><button data-view=\"actions\">✓ &nbsp; Kế hoạch hành động</button><button data-view=\"trend\">↗ &nbsp; Tiến độ 12 tháng</button><button data-view=\"account\">⚿ &nbsp; Tài khoản & mật khẩu</button><button data-view=\"guide\">◇ &nbsp; Nguyên tắc & hướng dẫn</button></nav><div class=\"sidebottom\"><span class=\"dot\"></span> Kho dữ liệu chung<p>Đăng nhập và kiểm tra quyền</p><button id=\"backup\">↓ Xuất bản sao JSON</button><label class=\"import\">↑ Nhập bản sao<input type=\"file\" id=\"import\" accept=\"application/json\" hidden></label></div></aside><main><header><div class=\"headleft\"><strong>KHỐI IID</strong><span>/</span>Quản trị hiệu suất 2027</div><div class=\"headright\"><button id=\"refresh\" title=\"Tải dữ liệu mới nhất từ máy chủ\">↻ Đồng bộ</button><select id=\"periodType\" aria-label=\"Loại kỳ\"><option value=\"month\">Tháng</option><option value=\"quarter\">Quý</option></select><select id=\"month\" aria-label=\"Tháng\"></select><button id=\"export\" title=\"Xuất báo cáo CSV theo kỳ đang chọn\">↓ Xuất CSV</button><span class=\"avatar\">ID</span><button id=\"logout\">Đăng xuất</button></div></header><section id=\"app\"></section><footer>KPI 2027 · Cùng hướng mục tiêu chung <span>IID → Bộ phận → Cá nhân</span></footer></main><dialog id=\"editor\"><form id=\"form\"><div class=\"dialogtitle\"><h2 id=\"formtitle\">Tạo KPI</h2><button type=\"button\" id=\"close\">×</button></div><div class=\"fields\"><label>Tên KPI<input name=\"name\" required maxlength=\"120\" placeholder=\"VD: Doanh thu khách hàng mới\"></label><label>Cấp KPI<select name=\"level\"><option>IID</option><option>Bộ phận</option><option>Cá nhân</option></select></label><label>Bộ phận / nhóm<input name=\"team\" required placeholder=\"VD: Kinh doanh\"></label><label>Chủ sở hữu<input name=\"owner\" required placeholder=\"Họ tên người phụ trách\"></label><label>Email nhân viên được giao<input name=\"ownerEmail\" type=\"email\" placeholder=\"email tài khoản nhân viên\"></label><label>Cách tổng hợp quý<select name=\"mode\"><option value=\"last\">Giá trị cuối quý / lũy kế</option><option value=\"sum\">Cộng kết quả các tháng</option><option value=\"average\">Trung bình 3 tháng</option></select></label><label>Phân bổ mục tiêu<select name=\"plan\"><option value=\"annual\">Giữ mức mục tiêu năm</option><option value=\"linear\">Lũy kế đều theo tháng</option><option value=\"monthly\">Chia đều cho 12 tháng</option></select></label><label>Mục tiêu cấp trên<select name=\"parent\"></select></label><label>Trọng số (%) <small id=\"weighthint\" class=\"mini\"></small><input name=\"weight\" type=\"number\" min=\"0\" max=\"100\" step=\"0.1\" required></label><label>Mục tiêu năm<input name=\"target\" type=\"number\" min=\"0.000001\" step=\"any\" required></label><label>Đơn vị<input name=\"unit\" required placeholder=\"VD: tỷ VNĐ, %, KH\"></label><label>Chiều đánh giá<select name=\"direction\"><option value=\"up\">Càng cao càng tốt (↑)</option><option value=\"down\">Càng thấp càng tốt (↓)</option></select></label><label>Nguồn dữ liệu<input name=\"source\" required placeholder=\"VD: Báo cáo tài chính, CRM\"></label><label>Tần suất<select name=\"frequency\"><option>Hàng tháng</option><option>Hàng quý</option></select></label></div><p class=\"hint\">Trọng số được kiểm tra theo từng cấp, nhóm và chủ sở hữu (tổng = 100%). KPI bộ phận/cá nhân phải liên kết trực tiếp với cấp trên.</p><button class=\"primary\" type=\"submit\">Lưu KPI</button></form></dialog><dialog id=\"update\"><form id=\"updateform\"><div class=\"dialogtitle\"><h2>Cập nhật kết quả</h2><button type=\"button\" onclick=\"document.querySelector('#update').close()\">×</button></div><p id=\"updatename\"></p><div id=\"updatehistory\" class=\"monthstrip\"></div><label>Kết quả thực tế trong kỳ<input name=\"actual\" type=\"number\" min=\"0\" step=\"any\" required></label><label>Mục tiêu tháng riêng (để trống dùng phân bổ mặc định)<input name=\"periodTarget\" type=\"number\" min=\"0\" step=\"any\"></label><label>Ghi chú / minh chứng<textarea name=\"note\" rows=\"3\" placeholder=\"Link báo cáo, giải trình nguyên nhân tăng/giảm...\"></textarea></label><p class=\"hint\">Kết quả được so với mục tiêu tháng. Chỉ tiêu lũy kế nhập giá trị lũy kế; chỉ tiêu cộng hoặc trung bình nhập kết quả riêng của tháng.</p><button class=\"primary\">Lưu kết quả</button></form></dialog><div id=\"toast\" role=\"status\"></div><script src=\"core.js\"></script><script src=\"seed.js\"></script><script src=\"main.js\"></script><script src=\"accounts.js\"></script></body></html>\n\r\n\r\n\r\n\r\n"};
export default {async fetch(request,env){const p=new URL(request.url).pathname;if(p.startsWith('/api/')||p.startsWith('/auth/'))return api(request,env);if(!assets[p])return new Response('Not found',{status:404});return new Response(assets[p],{headers:{'Content-Type':p.endsWith('.js')?'text/javascript; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}})}};