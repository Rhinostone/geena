/*
 * This file is part of the gina package.
 * Copyright (c) 2014 Rhinostone <gina@rhinostone.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var os = require('os');
var merge = require('./../merge');
var console = require('./../logger');

/**
 * ContextHelper
 *
 * @package     Gina.Utils.Helpers
 * @author      Rhinostone <gina@rhinostone.com>
 * @api public
 * */
function ContextHelper(contexts) {

    var self = this;

    /**
     * ContextHelper Constructor
     * */
    var init = function(contexts) {
        if ( typeof(ContextHelper.initialized) != "undefined" ) {
            return ContextHelper.instance
        } else {
            ContextHelper.initialized = true;
            ContextHelper.instance = self
        }

        if ( typeof(contexts) == 'undefined' ) {
            var contexts = {
                paths : {}
            }
        }
        self.contexts = contexts;
        return self
    }

    this.configure = function(contexts) {
        joinContext(contexts)
    }

    joinContext = function(context) {
        merge(true, self.contexts, context)
    }

    setContext = function(name, obj) {

        if (arguments.length > 1) {
            //console.log("Globla setter active ", name, obj);
            //if (type)
            if ( typeof(name) == 'undefined' || name == '' ) {
                var name = 'global'
            }

            if ( typeof(self.contexts[name]) != "undefined") {
                merge(self.contexts[name], obj)
            } else {
                self.contexts[name] = obj
            }
        } else {
            //console.log("setting context ", arguments[0]);
            self.contexts = arguments[0]
        }
    }

    getContext = function(name) {
        //console.log("getting ", name, self.contexts.content[name], self.contexts);
        if ( typeof(name) != 'undefined' ) {
            try {
                return self.contexts[name]
            } catch (err) {
                return undefined
            }
        } else {
            return self.contexts
        }
    }

    /**
     * Whisper
     * Convert replace constant names dictionary by its value
     *
     * @param {object} dictionary
     * @param {object} replaceable
     *
     * @return {object} revealed
     * */
    whisper = function(dictionary, replaceable, rule) {
        var s, key;
        if ( typeof(rule) != 'undefined') {
            return replaceable.replace(rule, function(s, key) {
                return dictionary[key] || s;
            })
        } else {

            if ( typeof(replaceable) == 'object' &&  !/\[native code\]/.test(replaceable.constructor) ||  typeof(replaceable) == 'function' /** && /Object/.test(replaceable.constructor) */ ) { // /Object/.test(replaceable.constructor)
                for (var attr in replaceable) {
                    if ( typeof(replaceable[attr]) != 'function') {
                        replaceable[attr] = (typeof(replaceable[attr]) != 'string' && typeof(replaceable[attr]) != 'object') ? JSON.stringify(replaceable[attr], null, 2) : replaceable[attr];
                        if (replaceable[attr] && typeof(replaceable[attr]) != 'object') {
                            replaceable[attr] = replaceable[attr].replace(/\{(\w+)\}/g, function(s, key) {
                                return dictionary[key] || s;
                            })
                        }
                    }
                }
                return replaceable
            } else { // mixing with classes
                replaceable = JSON.stringify(replaceable, null, 2);

                return JSON.parse(
                    replaceable.replace(/\{(\w+)\}/g, function(s, key) {
                        return dictionary[key] || s;
                    })
                )
            }
        }
    }

    /**
     * Define constants
     *
     * @param {string} name
     * @param {string} value
     * */
    define = function(name, value){
        if ( name.indexOf('GINA_') < 0 && name.indexOf('USER_') < 0 ) {
            name = 'USER_' + name;
        }
        try {
            Object.defineProperty(global, name.toUpperCase(), {
                value: value,
                writable: false,
                enumerable: true,
                configurable: false
            })
        } catch (err) {
            throw new Error('Cannot redefined constant [ '+ name.toUpperCase() +' ].')
        }
    }

    /**
     * Get defiend constants
     *
     * @return {array} constants
     * */
    getDefined = function(){
        var a = [];
        for (var n in global) {
            if (n.indexOf('GEENA_') > -1 || n.indexOf('USER_') > -1) {
                a[n] = global[n]
            }
        }
        return a
    }

    init(contexts)

    return init(contexts)
};

module.exports = ContextHelper;