/**
 * This file is part of the geena package.
 * Copyright (c) 2014 Rhinostone <geena@rhinostone.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */
//'use strict';
var Logger;

var util = require('util');
var merge = require('../merge');

/**
 * @class Logger
 *
 * @package geena.utils
 * @namesame geena.utils.logger
 * @author Rhinostone <geena@rhinostone.com>
 *
 * @api Public
 * */
Logger = function(opt) {
    var self = this;
    var defaultOptions = {
        template: '%d [ %l ] %m',
        levels : { // based on Sylog
            emerg: {
                code: 0,
                label: 'Emergency',
                desciption: 'System is unusable.',
                color: 'magenta'
            },
            alert: {
                code: 1,
                label: 'Alert',
                desciption: 'Action must be taken immediately.',
                color:'red'
            },

            crit: {
                code: 2,
                label: '',
                desciption: 'Critical conditions.',
                color: 'magenta'
            },
            error : {
                code: 3,
                label: '',
                desciption: '',
                color : 'orange'
            },
            warn : {
                code: 4,
                label: '',
                desciption: '',
                color: 'yellow'
            },
            notice: {
                code: 5,
                label: '',
                desciption: '',
                color: 'black'
            },
            info : {
                code: 6,
                label: '',
                desciption: '',
                color: 'blue'
            },
            debug : {
                code: 7,
                label: '',
                desciption: '',
                color: 'cyan'
                //'format' : '',
                //'pipe' : []
            }
        }
    };
    opt = merge(true, defaultOptions, opt);



    /**
     * init
     * @constructor
     * */
    var init = function() {
        setDefaultLevels();
        console.info('logger ready');
    }

    var setDefaultLevels = function() {

        for (var l in opt.levels) {
            if ( typeof(self[l]) != 'undefined' )
                delete self[l];

            self[l] = new Function('return '+write+'('+JSON.stringify(opt)+', '+parse+', "'+l+'", arguments);');
        }
    }

    var write = function(opt, parse, l, args) {
        var content = '';
        //console.log("arg: ", args);
        //To handle logs with coma speparated arguments.
        for (var i=0; i<args.length; ++i) {
            if (args[i] instanceof Function) {
                content += args[i].toString() + ' '
            } else if (args[i] instanceof Object) {
                content += parse(args[i], '')
            } else {
                content += args[i] + ' '
            }
        }

        if (content != '') {

            var repl = {
                '%l': l,
                '%d': new Date(),
                '%m': content
            };

            var patt = opt.template.match(/\%[a-z A-Z]/g);
            content = opt.template;
            for(var p=0; p<patt.length; ++p) {
                content = content.replace(new RegExp(patt[p], 'g'), repl[patt[p]])
            }
            return process.stdout.write(content + '\n')
        }
    }

    var parse = function(obj, str) {
        var l = 0, len = obj.count(), isArray = (obj instanceof Array) ? true : false;
        str += (isArray) ? '[ ' : '{ ';

        for (var attr in obj) {
            ++l;
            if (obj[attr] instanceof Function) {
                str += attr +': [Function]';
                // if you want ot have it all replace by the fllowing line
                //str += attr +':'+ obj[attr].toString();
                str += (l<len) ? ', ' : ''
            } else if (obj[attr] instanceof Object && !isArray) {
                str += attr+': ';
                str = parse(obj[attr], str) + ' '
            } else {
                if (!isArray && typeof(obj[attr]) == 'string') {
                    str += attr +": '"+ obj[attr] +"'"
                } else if (isArray) {
                    str += ( typeof(obj[attr]) != 'string' ) ? obj[attr] : "'"+ obj[attr] +"'"
                } else {
                    str += attr +': '+ obj[attr]
                }
                str += (l<len) ? ', ' : ''
            }
        }

        str += (isArray) ? ' ]' : ' }';
        return str + ' '
    }

//    /**
//     * Add or override existing level(s)
//     * @param {object} levels
//     * */
//    this.addLevel = function(levels) {
//        for (var l in levels) {
//            self[l] = new Function('return '+write+'('+JSON.stringify(opt)+', "'+l+'", arguments);');
//        }
//    }

    this.setLevels = function(levels) {
        try {
            //remove default.
            for (var l in opt.levels) {
                delete self[l]
            }


            for (var l in levels) {
                self[l] = new Function('return '+write+'('+JSON.stringify(opt)+', "'+l+'", arguments);');
            }
        } catch(e) {
            setDefaultLevels();
            self.error('Cannot set type: ', e.stack|| e.message)
        }
    }


    init();
    return this
};


module.exports = Logger()
