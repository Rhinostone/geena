/*
 * This file is part of the gina package.
 * Copyright (c) 2016 Rhinostone <gina@rhinostone.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

//Imports.
var fs              = require('fs');
var EventEmitter    = require('events').EventEmitter;
const dns           = require('dns');
// const tls = require('tls');
// const crypto = require('crypto');

var lib             = require('./../../lib') || require.cache[require.resolve('./../../lib')];
var merge           = lib.merge;
var inherits        = lib.inherits;
var console         = lib.logger;
var Collection      = lib.Collection;
var swig            = require('swig');


/**
 * @class SuperController
 *
 *
 * @package     Gina
 * @namespace
 * @author      Rhinostone <gina@rhinostone.com>
 *
 * @api         Public
 */
function SuperController(options) {

    this.name = 'SuperController';
        
    //private
    var self = this;
    var local = {
        req     : null,
        res     : null,
        next    : null,
        options : options || null,
        query   : {},
        _data   : {},
        view    : {}
    };

    // var ports = {
    //     'http': 80,
    //     'https': 443
    // };


    /**
     * SuperController Constructor
     * @constructor
     * */
    var init = function() {

        if ( typeof(SuperController.initialized) != 'undefined' ) {
            return getInstance()
        } else {
            
            SuperController.initialized = true;
            SuperController.instance = self;
            
            if (local.options) {
                SuperController.instance._options = local.options;
            }
        }
    }

    var getInstance = function() {
        local.options = SuperController.instance._options = options;
        return SuperController.instance
    }

    var hasViews = function() {
        return ( typeof(local.options.templates) != 'undefined' ) ? true : false;
    }

    /**
     * Check if env is running cacheless
     * */
    this.isCacheless = function() {
        return local.options.cacheless
    }

    this.setOptions = function(req, res, next, options) {
        local.options = SuperController.instance._options = options;
        local.options.renderingStack = (local.options.renderingStack) ? local.options.renderingStack : [];

        // N.B.: Avoid setting `page` properties as much as possible from the routing.json
        // It will be easier for the framework if set from the controller.
        //
        // Here is a sample if you choose to set  `page.view.title` from the rule
        // ------rouging rule sample -----
        // {
        //    "default": {
        //        "url": ["", "/"],
        //            "param": {
        //            "control": "home",
        //            "title": "My Title"
        //        }
        // }
        //
        // ------controller action sample -----
        // Here is a sample if you decide to set `page.view.title` from your controller
        //
        // this.home = function(req, res, next) {
        //      var data = { page: { view: { title: "My Title"}}};
        //      self.render(data)
        // }
        
        if ( typeof(options.conf.content.routing[options.rule].param) !=  'undefined' ) {
            var str = 'page.'
            , p = options.conf.content.routing[options.rule].param;
            
            for (var key in p) {
                if ( p.hasOwnProperty(key) && !/^(control)$/.test(key) ) {
                    str += key + '.';
                    var obj = p[key], value = '';
                    for (var prop in obj) {
                        if (obj.hasOwnProperty(prop)) {
                            value += obj[prop]
                        } else {

                            if ( /^:/.test(value) ) {
                                str = 'page.view.params.'+ key + '.';
                                set(str.substr(0, str.length-1), req.params[value.substr(1)]);
                            } else if (/^(file|title)$/.test(key)) {
                                str = 'page.view.'+ key + '.';
                                set(str.substr(0, str.length-1), value);
                            } else {
                                set(str.substr(0, str.length-1), value)
                            }


                            str = 'page.'
                        }
                    }
                }
            }
        }

        local.req = req;
        local.res = res;
        local.next = next;

        getParams(req);
        if ( typeof(local.options.templates) != 'undefined' && typeof(local.options.control) != 'undefined' ) {


            var  action     = local.options.control
                , rule      = local.options.rule
                , ext       = 'html'
                , namespace = local.options.namespace || '';


            if ( typeof(local.options.templates.common) != 'undefined' ) {
                ext = local.options.templates.common.ext || ext;
            }
            if( !/\./.test(ext) ) {
                ext = '.' + ext;
                local.options.templates.common.ext = ext
            }

            var ctx = getContext('gina');
            // new declaration && overrides
            var version = {
                "number"        : ctx.version,
                "platform"      : process.platform,
                "arch"          : process.arch,
                "nodejs"        : process.versions.node,
                "middleware"    : ctx.middleware
            };

            set('page.environment.gina', version.number);
            set('page.environment.nodejs', version.nodejs +' '+ version.platform +' '+ version.arch);
            set('page.environment.engine', options.conf.server.engine);//version.middleware
            set('page.environment.env', GINA_ENV);
            set('page.environment.envIsDev', GINA_ENV_IS_DEV);
            
            //console.debug('hostname is ', ctx.config.envConf[options.conf.bundle][GINA_ENV].hostname);
            set('page.environment.routing', escape(JSON.stringify(options.conf.content.routing))); // export for GFF
            set('page.environment.hostname', ctx.config.envConf[options.conf.bundle][GINA_ENV].hostname);
            set('page.environment.webroot', options.conf.server.webroot);
            set('page.environment.bundle', options.conf.bundle);
            set('page.environment.project', options.conf.projectName);
            set('page.environment.protocol', options.conf.server.protocol);
            set('page.environment.scheme', options.conf.server.scheme);
            set('page.environment.port', options.conf.server.port);

            set('page.view.ext', ext);
            set('page.view.control', action);
            set('page.view.controller', local.options.controller.replace(options.conf.bundlesPath, ''), true);
            if (typeof (local.options.controlRequired) != 'undefined' ) {
                set('page.view.controlRequired', local.options.controlRequired);
            }            
            set('page.view.method', local.options.method);
            set('page.view.namespace', namespace); // by default
            set('page.view.html.properties.mode.javascriptsDeferEnabled', local.options.templates.common.javascriptsDeferEnabled);
            set('page.view.html.properties.mode.routeNameAsFilenameEnabled', local.options.templates.common.routeNameAsFilenameEnabled);
            
            var parameters = JSON.parse(JSON.stringify(req.getParams()));//merge(options.params, options.conf.content.routing[rule].param);
            parameters = merge(parameters, options.conf.content.routing[rule].param);
            // excluding default page properties
            delete parameters[0];            
            delete parameters.file;
            delete parameters.control;
            delete parameters.title;

            if (parameters.count() > 0)
                set('page.view.params', parameters); // view parameters passed through URI or route params

            set('page.view.route', rule);

            set('page.forms', options.conf.content.forms);
            
            var acceptLanguage = 'en-US'; // by default
            if ( typeof(req.headers['accept-language']) != 'undefined' ) {
                acceptLanguage = req.headers['accept-language']
            } else if ( typeof(local.options.conf.server.response.header['accept-language']) != 'undefined' ) {
                acceptLanguage = local.options.conf.server.response.header['accept-language']
            }

            // set user locale
            var userCulture     = acceptLanguage.split(',')[0];
            var userCultureCode = userCulture.split(/\-/);
            var userLangCode    = userCultureCode[0];
            var userCountryCode = userCultureCode[1];

            var locales         = new Collection( getContext('gina').locales );
            var userLocales     = null;

            try {
                userLocales = locales.findOne({ lang: userLangCode }).content
            } catch (err) {
                console.warn('language code `'+ userLangCode +'` not handled to setup locales: replacing by `en`');
                userLocales = locales.findOne({ lang: 'en' }).content // by default
            }

            // user locales list
            local.options.conf.locales = userLocales;

            // user locale
            options.conf.locale = new Collection(userLocales).findOne({ short: userCountryCode }) || {};

            set('page.view.locale', options.conf.locale);
            set('page.view.lang', userCulture);
        }

        if ( hasViews() ) {

            if ( typeof(local.options.file) == 'undefined') {
                local.options.file = 'index'
            }

            if ( typeof(local.options.isWithoutLayout) == 'undefined' ) {
                local.options.isWithoutLayout = false;
            }

            var rule        = local.options.rule
                , namespace = local.options.namespace || rule;


            set('page.view.file', local.options.file);
            set('page.view.title', rule.replace(new RegExp('@' + options.conf.bundle), ''));
            set('page.view.namespace', namespace);

            //TODO - detect when to use swig
            var dir = self.templates || local.options.templates.common.templates;
            var swigOptions = {
                autoescape: ( typeof(local.options.autoescape) != 'undefined') ? local.options.autoescape: false,
                loader: swig.loaders.fs(dir),
                cache: (local.options.cacheless) ? false : 'memory'
            };
            swig.setDefaults(swigOptions);
            self.engine = swig;
        }
    }



    this.renderWithoutLayout = function (data, displayToolbar) {

        // preventing multiple call of self.renderWithoutLayout() when controller is rendering from another required controller
        if (local.options.renderingStack.length > 1) {
            return false
        }

        local.options.isWithoutLayout = true;
        
        self.render(data, displayToolbar)
    }

    /**
     * Render HTML templates : Swig is the default template engine
     *
     *  Extend default filters
     *  - length
     *
     * Avilable filters:
     *  - getWebroot()
     *  - getUrl()
     *
     *  N.B.: Filters can be extended through your `<project>/src/<bundle>/controllers/setup.js`
     *
     *
     * @param {object} userData
     * @param {boolean} [displayToolbar]
     * @return {void}
     * */
    this.render = function(userData, displayToolbar) {

        local.options.renderingStack.push( self.name );
        // preventing multiple call of self.render() when controller is rendering from another required controller
        if ( local.options.renderingStack.length > 1 ) {
            return false
        }
        
        local.options.debugMode = (typeof(displayToolbar) != 'undefined' ) ? displayToolbar : undefined; // only active for dev env

        try {
            var data        = getData()
                , template  = null
                , file      = null
                , path      = null
                , plugin    = null
            ;

            if (!userData) {
                userData = { page: { view: {}}}
            } else if ( userData && !userData['page']) {

                if ( typeof(data['page']['data']) == 'undefined' )
                    data['page']['data'] = userData;
                else
                    data['page']['data'] = merge( userData, data['page']['data'] );
            } else {
                data = merge(userData, data)
            }

            template = local.options.rule.replace('\@'+ local.options.bundle, '');
            setResources(local.options.templates, template);
            
            var file = data.page.view.file;

            // pre-compiling variables
            data = merge(data, getData()); // needed !!

            if  (typeof(data.page.data) == 'undefined' ) {
                data.page.data = {}
            }

            if ( typeof(data.page.data.status) != 'undefined' && !/^2/.test(data.page.data.status) && typeof(data.page.data.error) != 'undefined' ) {
                self.throwError(data.page.data.status, data.page.data.error)
            }

            // making path thru [namespace &] file
            if ( typeof(local.options.namespace) != 'undefined' ) {
                file = ''+ file.replace(local.options.namespace+'-', '');
                // means that rule name === namespace -> pointing to root namespace dir
                if (!file || file === local.options.namespace) {
                    file = 'index'
                }
                path = _(local.options.templates[template].html +'/'+ local.options.namespace + '/' + file)
            } else {
                if ( local.options.path && !/(\?|\#)/.test(local.options.path) ) {
                    path = _(local.options.path);
                    var re = new RegExp( data.page.view.ext+'$');
                    if ( data.page.view.ext && re.test(data.page.view.file) ) {
                        data.page.view.path = path.replace('/'+ data.page.view.file, '');

                        path            = path.replace(re, '');
                        data.page.view.file  = data.page.view.file.replace(re, '');

                    } else {
                        data.page.view.path = path.replace('/'+ data.page.view.file, '');
                    }

                } else {
                    path = _(local.options.templates[template].html +'/'+ file)
                }
            }

            if (data.page.view.ext) {
                path += data.page.view.ext
            }

            data.page.view.path = path;

            var dic = {}, msg = '';
            for (var d in data.page) {
                dic['page.'+d] = data.page[d]
            }


            // please, do not put any slashes when including...
            // ex.:
            //      /html/inc/_partial.html (BAD)
            //      html/inc/_partial.html (GOOD)
            //      ./html/namespace/page.html (GOOD)
            fs.readFile(path, function (err, content) {

                if (err) {
                    msg = 'could not open "'+ path +'"' +
                            '\n1) The requested file does not exists in your views/html (check your template directory). Can you find: '+path +
                            '\n2) Check the following rule in your `'+local.options.conf.bundlePath+'/config/routing.json` and look around `param` to make sure that nothing is wrong with your declaration: '+
                            '\n' + options.rule +':'+ JSON.stringify(options.conf.content.routing[options.rule], null, 4) +
                            '\n3) At this point, if you still have problems trying to run this portion of code, you can contact us telling us how to reproduce the bug.' +
                            '\n\r[ stack trace ] '+ err.stack;

                    console.error(err);
                    self.throwError(local.res, 500, new Error(msg));
                }

                try {
                    // Extends default `length` filter
                    swig.setFilter('length', function (input, obj) {

                        if ( typeof(input.count) != 'undefined' ) {
                            return input.count()
                        } else {
                            return input.length
                        }
                    });


                    // Allows you to get a bundle web root
                    swig.setFilter('getWebroot', function (input, obj) {
                        var prop = options.envObj.getConf(obj, options.conf.env),
                            url = prop.server.scheme + '://'+ prop.host +':'+ prop.port[prop.server.protocol][prop.server.scheme];
                        if ( typeof(prop.server['webroot']) != 'undefined') {
                            url += prop.server['webroot']
                        }
                        return url
                    });

                    /**
                     * getUrl filter
                     *
                     * Usage:
                     *      <a href="{{ '/homepage' | getUrl() }}">Homepage</a>
                     *      <a href="{{ 'users-add' | getUrl({ id: user.id }) }}">Add User</a>
                     *      <a href="{{ 'users-edit' | getUrl({ id: user.id }) }}">Edit user</a>
                     *      <a href="{{ 'users-list' | getUrl(null, 'http://domain.com') }}">Display all users</a>
                     *      <a href="{{ '/dashboard' | getUrl(null, 'admin') }}">Go to admin bundle's dashboard page</a>
                     *      <a href="{{ 'home@admin' | getUrl() }}">Go to admin bundle's dashboard page</a>
                     *
                     *      // can also be used with standalone mode: will add webroot if current bundle is not master
                     *      <script src="{{ '/js/vendor/modernizr-2.8.3.min.js' | getUrl() }}"></script>
                     *      compiled as => <script src="/my-bundle/js/vendor/modernizr-2.8.3.min.js"></script>
                     *
                     * @param {string} route
                     * @param {object} params - can't be left blank if base is required -> null if not defined
                     * @param {string} [base] - can be a CDN, the http://domain.com or a bundle name
                     *
                     * @return {string} relativeUrl|absoluteUrl - /sample/url.html or http://domain.com/sample/url.html
                     * */
                    var config              = null
                        , hostname          = null
                        , wroot             = null
                        , isStandalone      = null
                        , isMaster          = null
                        , routing           = null
                        , isWithoutLayout   = null
                        , rule              = null
                        , url               = NaN
                        , urlStr            = null
                    ;


                    swig.setFilter('getUrl', function (route, params, base) {
                        // if no route, returns current route
                        if ( typeof(route) == 'undefined') {
                            var route = local.options.rule
                        }

                        if (/\@/.test(route) && typeof(base) == 'undefined') {
                            var r = route.split(/\@/);
                            route = r[0];
                            base = config.bundle = r[1];
                        }

                        // setting default config
                        config          = local.options.conf;
                        hostname        = '';
                        wroot           = config.server.webroot;

                        isStandalone    = (config.bundles.length > 1) ? true : false;
                        isMaster        = (config.bundles[0] === config.bundle) ? true : false;
                        routing         = config.content.routing;
                        isWithoutLayout = (local.options.isWithoutLayout) ? true : false;

                        if ( typeof(base) != 'undefined' ) {

                            // if base is not an URL, must be a bundle
                            if ( !/^http\:/.test(base) ) {
                                var mainConf = getContext('gina').Config.instance;
                                // is real bundle ?
                                if ( mainConf.allBundles.indexOf(base) > -1 ) {
                                    // config override
                                    config          = mainConf.Env.getConf(base, mainConf.env);
                                    
                                    // retrieve hostname, webroot & routing
                                    hostname        = config.hostname;
                                    // rewrite hostname vs local.req.headers.host
                                    if ( typeof(local.req.headers.host) != 'undefined' && !/\:d+/.test(local.req.headers.host) ) {
                                        hostname = hostname.replace(/\:\d+/, '');
                                    }
                                    routing         = config.content.routing;
                                    wroot           = config.server.webroot;

                                    config.bundle   = base;
                                    isStandalone    = (mainConf.bundles.length > 1) ? true : false;
                                    isMaster        = (mainConf.bundles[0] === config.bundle) ? true : false;

                                } else {
                                    self.throwError(local.res, 500, new Error('bundle `'+ base +'` not found: Swig.getUrl() filter encountered a problem while trying to compile base `'+base+'` and route `'+route+'`').stack)
                                }
                            }
                        }

                        // is path ?
                        if (/\//.test(route)) {

                            if (route.substr(0,1) == '/')
                                route = route.substr(1);


                            if (wroot.length == 1)
                                wroot = '';

                            return hostname + wroot +'/'+ route;
                        }

                        // rules are now unique per bundle : rule@bundle
                        rule = route + '@' + config.bundle;
                        

                        if ( typeof(routing[rule]) != 'undefined' ) { //found
                            url = routing[rule].url;
                            if ( typeof(routing[rule].requirements) != 'undefined' ) {
                                
                                for (var p in routing[rule].requirements) {
                                    if ( Array.isArray(url) ) {
                                        for (var i= 0, len = url.length; i< len; ++i) {
                                            if ( params && /:/.test(url[i]) ) {
                                                urlStr = url[i].replace(new RegExp(':'+p+'(\\W|$)', 'g'), params[p]+'$1');
                                                break
                                            }
                                        }

                                        if (urlStr != null) {
                                            url = urlStr
                                        } else { // just take the first one by default
                                            url = url[0]
                                        }
                                    } else {
                                        try {
                                            url = url.replace(new RegExp(':'+p+'(\\W|$)', 'g'), params[p]+'$1')
                                        } catch (err) {
                                            self.throwError(local.res, 500, new Error('template compilation exception encoutered: [ '+path+' ]\nsounds like you are having troubles with the following call `{{ "'+route+'" | getUrl() }}` where `'+p+'` parameter is expected according to your `routing.json`'  +'\n'+ (err.stack||err.message)));
                                        }

                                    }
                                }
                            } else {
                                if ( Array.isArray(url) ) {
                                    url = url[0] || url[1] // just taking the default one: using the first element unless it is empty.
                                    if (!url) {
                                        self.throwError(local.res, 500, new Error('please check your `routing.json` at the defined rule `'+rule+'` : `url` attribute cannot be empty').stack)
                                    }
                                }
                            }

                            if ( /^\//.test(url) )
                                url = hostname + url;
                            else
                                url = hostname +'/'+ url;

                        } else {
                            if ( typeof(routing['404']) != 'undefined' && typeof(routing['404'].url) != 'undefined' ) {
                                if (routing["404"].url.substr(0,1) == '/')
                                    routing["404"].url = routing["404"].url.substr(1);

                                url = hostname + wroot +'/'+ routing["404"].url
                            } else {
                                url = hostname + wroot +'/404.html'
                            }
                        }

                        return url
                    });

                } catch (err) {
                    // [ martin ]
                    // i sent an email to [ paul@paularmstrongdesigns.com ] on 2014/08 to see if there is
                    // a way of retrieving swig compilation stack traces
                    //var stack = __stack.splice(1).toString().split(',').join('\n');
                    self.throwError(local.res, 500, new Error('template compilation exception encoutered: [ '+path+' ]\n'+(err.stack||err.message)));
                }

                dic['page.content'] = content;
                
                var layoutPath = null;
                
                if ( local.options.isWithoutLayout || !local.options.isWithoutLayout && typeof(local.options.templates[template].layout) != 'undefined' && fs.existsSync(local.options.templates[template].layout) ) {
                    layoutPath = (local.options.isWithoutLayout) ? local.options.templates[template].noLayout : local.options.templates[template].layout;
                } else {
                    var layoutRoot = ( typeof(local.options.namespace) != 'undefined' && local.options.namespace != '') ? local.options.templates[template].templates + '/'+ local.options.namespace  : local.options.templates[template].templates;
                    layoutPath = layoutRoot +'/'+ local.options.file + local.options.templates[template].ext;    
                }                
                
                
                fs.readFile(layoutPath, function onLoadingLayout(err, layout) {

                    if (err) {
                        self.throwError(local.res, 500, err);
                    } else {
                        var assets = { assets: "${asset}"}, XHRData = null;                        
                        var mapping = { filename: local.options.templates[template].layout };         
                        
                        var isDeferModeEnabled = local.options.templates.common.javascriptsDeferEnabled;
                        layout = layout.toString();
                        
                        // adding stylesheets
                        if (data.page.view.stylesheets && !/\{\{\s+(page\.view\.stylesheets)\s+\}\}/.test(layout) ) {
                            layout = layout.replace(/\<\/head\>/i, '\n{{ page.view.stylesheets }}\n</head>')
                        }
                                                
                        
                        // if (
                        //     hasViews() && GINA_ENV_IS_DEV && !local.options.isWithoutLayout
                        //     || hasViews() && local.options.debugMode
                        //     || hasViews() && GINA_ENV_IS_DEV && self.isXMLRequest() 
                        // ) {
                        //     try {
                        //         // assets string
                        //         assets = getAssets(swig, template, layout, data); 
                        //     } catch (err) {
                        //         self.throwError(local.res, 500, new Error('Controller::render(...) calling getAssets(...) \n' + (err.stack||err.message||err) ));
                        //     }
                        // }
                        
                        // adding plugins
                        if (hasViews() && GINA_ENV_IS_DEV && !local.options.isWithoutLayout || hasViews() && local.options.debugMode ) {
                            

                            layout = ''
                                + '{%- set ginaDataInspector                    = JSON.parse(JSON.stringify(page)) -%}'
                                + '{%- set ginaDataInspector.view.assets        = {} -%}'
                                + '{%- set ginaDataInspector.view.scripts       = "ignored-by-toolbar" -%}'
                                + '{%- set ginaDataInspector.view.stylesheets   = "ignored-by-toolbar" -%}'
                                + layout
                            ;
                            
                            
                                
                            plugin = '\t'
                                + '{# Gina Toolbar #}'
                                + '{%- set userDataInspector                    = JSON.parse(JSON.stringify(page)) -%}'
                                + '{%- set userDataInspector.view.scripts        = "ignored-by-toolbar"  -%}'
                                + '{%- set userDataInspector.view.stylesheets   = "ignored-by-toolbar"  -%}'
                                + '{%- set userDataInspector.view.assets        = '+ JSON.stringify(assets) +' -%}'
                                + '{%- include "'+ getPath('gina').core +'/asset/js/plugin/src/gina/toolbar/toolbar.html" with { gina: ginaDataInspector, user: userDataInspector } -%}'
                                + '{# END Gina Toolbar #}'

                                // + '\n\t<script type="text/javascript">'
                                // + ' \n<!--'
                                // + '\n' + local.options.templates.common.pluginLoader.toString()
                                // + '\t\t//-->'
                                // + '\n\t\t</script>'

                                //+ '\n\t\t<script type="text/javascript" src="{{ \'/js/vendor/gina/gina.min.js\' | getUrl() }}"></script>'

                                //+ '\t\t{{ page.view.scripts }}'                              
                            ;
                            
                            // adding javascripts
                            if ( isDeferModeEnabled ) {
                                
                                
                                var ginaLoader = 
                                    '\n\t\t<script defer type="text/javascript">'
                                    + ' \n\t\t<!--'
                                    + '\n\t\t\t' + local.options.templates.common.pluginLoader.toString().replace(/\;(\n|\r)/g, ';').replace(/\,(\n|\r)/g, ',')
                                    + '\n\t\t//-->'
                                    + '\n\t\t</script>'
                                ;
                                layout = layout.replace(/\<\/head\>/i, '\t'+ ginaLoader +'\n</head>');
                                
                                layout.replace('{{ page.view.scripts }}', '');
                                layout = layout.replace(/\<\/head\>/i, '\t{{ page.view.scripts }}\n</head>');
                                
                            }

                            if (local.options.isWithoutLayout && local.options.debugMode == true || local.options.debugMode == true ) {

                                XHRData = '\t<input type="hidden" id="gina-without-layout-xhr-data" value="'+ encodeURIComponent(JSON.stringify(data.page.data)) +'">\n\r';
                                
                                layout = layout.replace(/<\/body>/i, XHRData + '\n\t</body>');
                            }
                            
                            if (GINA_ENV_IS_DEV || local.options.debugMode == true ) {
                                layout = layout.replace(/<\/body>/i, plugin + '\n\t</body>');
                            }
                            

                        } else if ( hasViews() && GINA_ENV_IS_DEV && self.isXMLRequest() ) {

                            // means that we don't want GFF context or we already have it loaded
                            var viewInfos  = JSON.parse(JSON.stringify(data.page.view));
                            viewInfos.assets = assets;
                            //viewInfos.scripts       = userScripts.split(/,/g);
                            //viewInfos.stylesheets   = userStylesheets.split(/,/g);

                            XHRData = '\n<input type="hidden" id="gina-without-layout-xhr-data" value="'+ encodeURIComponent(JSON.stringify(data.page.data)) +'">';
                            var XHRView = '\n<input type="hidden" id="gina-without-layout-xhr-view" value="'+ encodeURIComponent(JSON.stringify(viewInfos)) +'">';


                            layout += XHRData + XHRView;

                        } else { // production env

                            plugin = '\t'
                                + '\n\t<script type="text/javascript">'
                                + ' \n\t<!--'
                                + '\n\t' + local.options.templates.common.pluginLoader.toString()
                                + '\t//-->'
                                + '\n</script>'

                                //+ '\n\t<script type="text/javascript" src="{{ \'/js/vendor/gina/gina.min.js\' | getUrl() }}"></script>'
                            ;

                            if ( !/page\.view\.scripts/.test(layout) ) {
                                layout = layout.replace(/<\/body>/i, plugin + '\t{{ page.view.scripts }}\n\t</body>');
                            } else {
                                layout = layout.replace(/{{ page.view.scripts }}/i, plugin + '\t{{ page.view.scripts }}');
                            }

                        }

                        layout = whisper(dic, layout, /\{{ ([a-zA-Z.]+) \}}/g );
                        
                        
                        try {
                            
                            layout = swig.compile(layout, mapping)(data);
                            if (
                                hasViews() && GINA_ENV_IS_DEV && !local.options.isWithoutLayout
                                || hasViews() && local.options.debugMode
                                || hasViews() && GINA_ENV_IS_DEV && self.isXMLRequest() 
                            ) {
                                try {
                                    // assets string
                                    assets = getAssets(swig, template, layout, data); 
                                    layout = layout.replace('"assets":{"assets":"${asset}"}', '"assets": '+JSON.stringify(assets) );
                                } catch (err) {
                                    self.throwError(local.res, 500, new Error('Controller::render(...) calling getAssets(...) \n' + (err.stack||err.message||err) ));
                                }
                            }
                            
                            
                            // special case for template without layout in debug mode - dev only
                            if ( hasViews() && local.options.debugMode == true  && GINA_ENV_IS_DEV && !/\{\# Gina Toolbar \#\}/.test(layout) ) {
                                
                                layout = layout.replace(/<\/body>/i, plugin + '\n\t</body>');
                                layout = whisper(dic, layout, /\{{ ([a-zA-Z.]+) \}}/g );
                                layout = swig.compile(layout, mapping)(data);
                            }

                        } catch (err) {
                            var filename = local.options.templates[template].html;
                            filename += ( typeof(data.page.view.namespace) != 'undefined' && data.page.view.namespace != '' && new RegExp('^' + data.page.view.namespace +'-').test(data.page.view.file) ) ? '/' + data.page.view.namespace + data.page.view.file.split(data.page.view.namespace +'-').join('/') + ( (data.page.view.ext != '') ? data.page.view.ext: '' ) : '/' + data.page.view.file+ ( (data.page.view.ext != '') ? data.page.view.ext: '' );
                            self.throwError(local.res, 500, new Error('Compilation error encountered while trying to process template `'+ filename + '`\n'+(err.stack||err.message)))
                        }

                        if ( !local.res.headersSent ) {
                            local.res.statusCode = ( typeof(local.options.conf.server.coreConfiguration.statusCodes[data.page.data.status])  != 'undefined' ) ? data.page.data.status : 200; // by default
                            //catching errors
                            if (
                                typeof(data.page.data.errno) != 'undefined' && /^2/.test(data.page.data.status) && typeof(local.options.conf.server.coreConfiguration.statusCodes[data.page.data.status]) != 'undefined'
                                || typeof(data.page.data.status) != 'undefined' && !/^2/.test(data.page.data.status) && typeof(local.options.conf.server.coreConfiguration.statusCodes[data.page.data.status]) != 'undefined'
                            ) {

                                try {
                                    local.res.statusMessage = local.options.conf.server.coreConfiguration.statusCodes[data.page.data.status];
                                } catch (err){
                                    local.res.statusCode    = 500;
                                    local.res.statusMessage = err.stack||err.message||local.options.conf.server.coreConfiguration.statusCodes[local.res.statusCode];
                                }
                            }

                            local.res.setHeader("Content-Type", local.options.conf.server.coreConfiguration.mime['html']);

                            console.info(local.req.method +' ['+local.res.statusCode +'] '+ local.req.url);
                            
                            // var aCount = 0, aLen = assets.count();
                            // for (var asset in assets) {
                            //     local.res.stream.pushStream({':path': asset}, function onStreamPush(err, pushStream, headers) {
                            //         ++aCount;
                            //         if (err) {
                            //             self.throwError(local.res, 500, err)
                            //         }
                                    
                            //         if ( assets[asset].filename != 404 )
                            //             pushStream.respondWithFile( assets[asset].filename );
                            //         //pushStream.respond({ ':status': 200 });
                            //         // if (aCount == aLen) {
                            //         //     pushStream.end(); 
                            //         //     local.res.end(layout);
                            //         // }                                    
                            //     });
                            // }
                            
                            /**
                            // avoiding multiple binding for the same event when using cacheless env
                            if ( typeof(self.serverOn) != 'undefined' && !self._http2streamEventInitalized ) {
                                
                                self.emit('http2streamEventInitalized', true);
                                
                                self.serverOn('stream', function onHttp2Stream(stream, headers){
                                    
                                    if (!stream.pushAllowed) { 
                                        stream.respond({ ':status': 200 });
                                        stream.end();
                                        return; 
                                    }
                                    
                                    stream.on('closed', (isClosed) => {
                                        
                                        console.debug('http2 closed: '+ isClosed);
                                    });
                                    
                                    stream.on('error', (err) => {
                                        
                                        // const isRefusedStream = err.code === 'ERR_HTTP2_STREAM_ERROR' && stream.rstCode === NGHTTP2_REFUSED_STREAM;
                                        
                                        // if (!isRefusedStream)
                                        //     throw err;
                                        
                                        if (err.code === 'ENOENT') {
                                            stream.respond({ ':status': 404 });
                                        } else {
                                            stream.respond({ ':status': 500 });
                                        }
                                        
                                        console.error(err.stack||err.message||err);
                                        stream.end();
                                        
                                        
                                    });                          
                                    
                                    
                                    
                                    var asset = headers[':path'];
                                    // if (asset == local.req.url) {
                                    //     stream.respond({
                                    //         'Content-Type': local.options.conf.server.coreConfiguration.mime['html'],
                                    //         ':status': 200
                                    //     });
                                    //     stream.write(layout);
                                    //     stream.end();
                                    // }
                                    
                                    if ( asset != local.req.url && typeof(assets[ asset ]) != 'undefined' && !/404/.test(assets[asset].filename) ) {      
                                        stream.pushStream({ ':path': asset }, function onPushStream(err, pushStream, headers){
                                            
                                            if ( err ) {
                                                //throw err;
                                                if (err.code === 'ENOENT') {
                                                    stream.respond({ ':status': 404 });
                                                } else {
                                                    stream.respond({ ':status': 500 });
                                                }
                                                
                                                stream.end();
                                            }
                                            console.debug('h2 push: '+ headers[':path'] + ' -> '+ assets[ headers[':path'] ].filename);
                                            pushStream.respondWithFile( 
                                                assets[ headers[':path'] ].filename
                                                , { 'content-type': assets[ headers[':path'] ].mime }
                                                //, { onError }
                                            );
                                            
                                        });
                                    }  
                                    
                                    
                                                            
                                        
                                });    
                            }*/
                            
                            

                            
                            local.res.end(layout);
                                                        
                        } else {
                            if (typeof(local.next) != 'undefined')
                                local.next();
                            else
                                return;
                        }
                    }
                })
            })
        } catch (err) {
            self.throwError(local.res, 500, err)
        }
    }
    
    this.onHttp2Stream = function(url, stream, headers) {
                
        if (!stream.pushAllowed) { 
            stream.respond({ ':status': 200 });
            stream.end();
            return; 
        }
        
        console.debug('h2 push detected: '+' [ '+url+' ] '+ headers[':path']);
        
        
    }

    this.isXMLRequest = function() {
        return local.options.isXMLRequest;
    }

    this.isWithCredentials = function() {
        return ( /true/.test(local.options.withCredentials) ) ? true : false;
    }

    /**
     * Render JSON
     *
     * @param {object|string} jsonObj
     * @param {object} [req]
     * @param {object} [res]
     *
     * @callback {function} [next]
     *
     * */
    this.renderJSON = function(jsonObj) {

        // preventing multiple call of self.renderJSON() when controller is rendering from another required controller
        if (local.options.renderingStack.length > 1) {
            return false
        }

        var request     = local.req;
        var response    = local.res;
        var next        = local.next;


        if (!jsonObj) {
            var jsonObj = {}
        }
        
        try {
            // just in case
            if ( typeof(jsonObj) == 'string') {
                jsonObj = JSON.parse(jsonObj)
            }

            if( typeof(local.options) != "undefined" && typeof(local.options.charset) != "undefined" ){
                response.setHeader("charset", local.options.charset);
            }
            

            //catching errors
            if (
                typeof(jsonObj.errno) != 'undefined' && response.statusCode == 200
                || typeof(jsonObj.status) != 'undefined' && jsonObj.status != 200 && typeof(local.options.conf.server.coreConfiguration.statusCodes[jsonObj.status]) != 'undefined'
            ) {

                try {
                    response.statusCode    = jsonObj.status;
                    response.statusMessage = local.options.conf.server.coreConfiguration.statusCodes[jsonObj.status];
                } catch (err){
                    response.statusCode    = 500;
                    response.statusMessage = err.stack;
                }
            }


            // Internet Explorer override
            if ( /msie/i.test(request.headers['user-agent']) ) {
                response.setHeader("Content-Type", "text/plain")
            } else {
                response.setHeader("Content-Type", local.options.conf.server.coreConfiguration.mime['json'])
            }

            if ( !response.headersSent ) {
                console.info(request.method +' ['+ response.statusCode +'] '+ request.url);

                if ( local.options.isXMLRequest && self.isWithCredentials() )  {

                    var data = JSON.stringify(jsonObj);
                    var len = 0;
                    // content length must be the right size !
                    if ( typeof(data) === 'string') {
                        len = Buffer.byteLength(data, 'utf8')
                    } else {
                        len = data.length
                    }

                    response.setHeader("Content-Length", len);

                    response.write(data);
                    response.headersSent = true;

                    // required to close connection
                    setTimeout(function () {
                        response.end()
                    }, 200);

                    return // force completion

                } else { // normal case
                    response.end(JSON.stringify(jsonObj));
                    response.headersSent = true
                }
            }
        } catch (err) {
            self.throwError(response, 500, err)
        }

    }


    this.renderTEXT = function(content) {

        // preventing multiple call of self.renderTEXT() when controller is rendering from another required controller
        if (local.options.renderingStack.length > 1) {
            return false
        }

        if ( typeof(content) != "string" ) {
            var content = content.toString();
        }

        if (typeof(options) != "undefined" && typeof(options.charset) !="undefined") {
            local.res.setHeader("charset", options.charset);
        }
        if ( !local.res.get('Content-Type') ) {
            local.res.setHeader("Content-Type", "text/plain");
        }

        if ( !local.res.headersSent ) {
            console.info(local.req.method +' ['+local.res.statusCode +'] '+ local.req.url);
            local.res.end(content);
            local.res.headersSent = true
        }
    }

    var parseDataObject = function(o, obj, override) {

        for (var i in o) {
            if ( o[i] !== null && typeof(o[i]) == 'object' || override && o[i] !== null && typeof(o[i]) == 'object' ) {
                parseDataObject(o[i], obj);
            } else if (o[i] == '_content_'){
                o[i] = obj
            }
        }

        return o
    }

    /**
     * Set data
     *
     * @param {string} nave -  variable name to set
     * @param {string|object} value - value to set
     * @param {boolean} [override]
     *
     * @return {void}
     * */
    var set = function(name, value, override) {

        var override = ( typeof(override) != 'undefined' ) ? override : false;

        if ( typeof(name) == 'string' && /\./.test(name) ) {
            var keys        = name.split(/\./g)
                , newObj    = {}
                , str       = '{'
                , _count    = 0;

            for (var k = 0, len = keys.length; k<len; ++k) {
                str +=  "\""+ keys.splice(0,1)[0] + "\":{";

                ++_count;
                if (k == len-1) {
                    str = str.substr(0, str.length-1);
                    str += "\"_content_\"";
                    for (var c = 0; c<_count; ++c) {
                        str += "}"
                    }
                }
            }

            newObj = parseDataObject(JSON.parse(str), value, override);
            local.userData = merge(local.userData, newObj);

        } else if ( typeof(local.userData[name]) == 'undefined' ) {
            local.userData[name] = value.replace(/\\/g, '')
        }
    }

    /**
     * Get data
     *
     * @param {String} variable Data name to set
     * @return {Object | String} data Data object or String
     * */
    var get = function(variable) {
        return local.userData[variable]
    }

    /**
     * Set resources
     *
     * @param {object} viewConf - template configuration
     * @param {string} localRessouces - rule name
     * */
    var setResources = function(viewConf, localRessource) {
        if (!viewConf) {
            self.throwError(500, new Error('No views configuration found. Did you try to add views before using Controller::render(...) ? Try to run: ./gina.sh -av '+ options.conf.bundle))
        }

        var res     = '',
            tmpRes  = {},
            css     = {
                media   : "screen",
                rel     : "stylesheet",
                type    : "text/css",
                content : {}
            },
            cssStr  = '',
            js      = {
                type    : "text/javascript",
                content : {}
            },
            jsStr   = '',
            exclude  = null;

        //intercept errors in case of malformed config
        if ( typeof(viewConf) != "object" ) {
            cssStr  = viewConf;
            jsStr   = viewConf
        }


        //cascading merging
        if (localRessource !== 'common') {
            if ( typeof(viewConf[localRessource]) != 'undefined') {

                var noneDefaultJs   = (viewConf[localRessource]['javascripts']) ? JSON.parse(JSON.stringify(viewConf[localRessource]['javascripts'])) : [] ;
                var noneDefaultCss  = (viewConf[localRessource]['stylesheets']) ? JSON.parse(JSON.stringify(viewConf[localRessource]['stylesheets'])) : [] ;
               
                viewConf[localRessource] = merge(viewConf.common, viewConf[localRessource]);

                if ( viewConf[localRessource]["javascriptsExclude"] ) {

                    if ( Array.isArray(viewConf[localRessource]["javascriptsExclude"]) && !/(all|\*)/.test(viewConf[localRessource]["javascriptsExclude"][0]) || typeof(viewConf[localRessource]["javascriptsExclude"]) == 'string' && !/(all|\*)/.test(viewConf[localRessource]["javascriptsExclude"]) ) {

                        for (var i = 0, len = viewConf.common['javascripts'].length; i<len; ++i) {
                            if ( viewConf.common['javascripts'] && viewConf[localRessource]['javascripts'].indexOf(viewConf.common['javascripts'][i]) ) {
                                viewConf[localRessource]['javascripts'].splice(viewConf[localRessource]['javascripts'].indexOf(viewConf.common['javascripts'][i]), 1)
                            }
                        }
                    } else {// else means that we exclude all common
                        viewConf[localRessource]['javascripts'] = noneDefaultJs;
                    }
                }

                if ( viewConf[localRessource]["stylesheetsExclude"] ) {

                    if ( Array.isArray(viewConf[localRessource]["stylesheetsExclude"]) && !/(all|\*)/.test(viewConf[localRessource]["stylesheetsExclude"][0]) || typeof(viewConf[localRessource]["stylesheetsExclude"]) == 'string' && !/(all|\*)/.test(viewConf[localRessource]["stylesheetsExclude"]) ) {

                        for (var i = 0, vcLen = viewConf.common['stylesheets'].length; i<vcLen; ++i) {
                            if ( viewConf.common['stylesheets'] && viewConf[localRessource]['stylesheets'].indexOf(viewConf.common['stylesheets'][i]) ) {
                                viewConf[localRessource]['stylesheets'].splice(viewConf[localRessource]['stylesheets'].indexOf(viewConf.common['stylesheets'][i]), 1)
                            }
                        }
                    } else {// else means that we exclude all common
                        viewConf[localRessource]['stylesheets'] = noneDefaultCss;
                    }
                }


            } else {
                viewConf[localRessource] = viewConf.common
            }
        }

        //Get css
        if( viewConf[localRessource]["stylesheets"] ) {
            tmpRes  = getNodeRes('css', cssStr, viewConf[localRessource]['stylesheets'], css);

            cssStr  = tmpRes.cssStr;
            css     = tmpRes.css;
            //tmpRes  = {}
        }
        //Get js
        if( viewConf[localRessource]['javascripts'] ) {
            tmpRes  = getNodeRes('js', jsStr, viewConf[localRessource]['javascripts'], js);

            jsStr   = tmpRes.jsStr;
            js      = tmpRes.js;
            //tmpRes  = {}
        }

        set('page.view.stylesheets', cssStr);
        set('page.view.scripts', jsStr);
    }

    /**
     * Get node resources
     *
     * @param {string} type
     * @param {string} resStr
     * @param {array} resArr
     * @param {object} resObj
     *
     * @return {object} content
     *
     * @private
     * */
    var getNodeRes = function(type, resStr, resArr, resObj) {
        
        var r = 0, rLen = resArr.length;
        switch(type){
            case 'css':
                var css = {};
                for (; r < rLen; ++r) {                    
                    //means that you will find options.
                    if (typeof(resArr[r]) == "object") {
                        css = merge(resArr[r], resObj);
                        if (!css.content[css.url]) {
                            css.content[css.url] = '\n\t\t<link href="'+ css.url +'" media="'+ css.media +'" rel="'+ css.rel +'" type="'+ css.type +'">';
                            resStr += css.content[resArr[r].url]
                        } else {
                            resStr += css.content[resArr[r].url]
                        }
                        
                    } else {
                        css = merge(css, resObj);
                        css.content[resArr[r]] = '\n\t\t<link href="'+ resArr[r] +'" media="screen" rel="'+ css.rel +'" type="'+ css.type +'">';
                        resStr += css.content[resArr[r]]
                    }
                }
                
                return { css : css, cssStr : resStr }
            break;

            case 'js':
                var js          = {}
                    , deferMode = (local.options.templates.common.javascriptsDeferEnabled) ? ' defer' : ''
                ;
                for (; r < rLen; ++r) {
                    
                    //means that you will find options                    
                    if ( typeof(resArr[r]) == "object" ) {     
                        js = merge(resArr[r], resObj);                   
                        //js.type = (resArr[r].options.type) ? resArr[res].options.type : js.type;
                        if (!js.content[resArr[r].url]) {
                            js.content[resArr[r].url] = '\n\t\t<script'+ deferMode +' type="'+ js.type +'" src="'+ resArr[r].url +'"></script>';
                            resStr += js.content[resArr[r].url];
                        } else {
                            resStr += js.content[resArr[r].url]
                        }
                        
                    } else {
                        js = merge(js, resObj);
                        js.content[resArr[r]] = '\n\t\t<script'+ deferMode +' type="'+ js.type +'" src="'+ resArr[r] +'"></script>';
                        resStr += js.content[resArr[r]]
                    }
                }
                
                return { js : js, jsStr : resStr }
            break;
        }
    }

    /**
     * TODO -  SuperController.setMeta()
     * */
    // this.setMeta = function(metaName, metacontent) {
    //
    // }

    var getData = function() {
        return refToObj( local.userData )
    }
    
    var getAssetFilenameFromUrl = function(url) {
        
        var conf        = local.options.conf;
        var staticsArr  = conf.publicResources;
        var staticProps = {
            firstLevel  : '/'+ url.split(/\//g)[1] + '/',
            isFile      :  /^\/[A-Za-z0-9_-]+\.(.*)$/.test(url)
        };
        
        if ( 
            staticProps.isFile && staticsArr.indexOf(url) > -1 
            || staticsArr.indexOf(staticProps.firstLevel) > -1
        ) {
            
            var request         = local.req
                , response      = local.res
                , next          = local.next
                , bundleConf    = conf
            ;
            
            var cacheless       = bundleConf.cacheless;  
            // by default
            var filename        = bundleConf.publicPath + url;
            
            // catch `statics.json` defined paths
            var staticIndex     = bundleConf.staticResources.indexOf(url);
            if ( staticProps.isFile && staticIndex > -1 ) {
                filename =  bundleConf.content.statics[ bundleConf.staticResources[staticIndex] ]
            } else {
                var s = 0, sLen = bundleConf.staticResources.length;
                for ( ; s < sLen; ++s ) {
                    //if ( new RegExp('^'+ bundleConf.staticResources[s]).test(url) ) {                 
                    if ( eval('/^' + bundleConf.staticResources[s].replace(/\//g,'\\/') +'/').test(url) ) {
                        filename = bundleConf.content.statics[ bundleConf.staticResources[s] ] +'/'+ url.replace(bundleConf.staticResources[s], '');
                        break;
                    }
                } 
            }
            
            if ( !fs.existsSync(filename) )
                return 404;
                
            return filename
            
        } else {
            return 404
        }
    }

    var getAssets = function (swig, template, layout, data) {
        
        // layout search for <link|script|img>
        var layoutStr           = layout.toString(); 
        var layoutAssets        = layoutStr.match(/<link .*?<\/link>|<link .*?(rel\=\"(stylesheet|icon|manifest|(.*)\-icon))(.*)|<script.*?<\/script>|<img .*?(.*)/g) || [];
        
        var assets      = {}
            , cssFiles  = []
            , aCount    = 0
            , i         = 0
            , len       = 0
            , domain    = null
            , key       = null // [ code ] url
            , ext       = null
            , url       = null
            , filename  = null
            , isObject  = null
        ;
        
        // user's defineds assets
        var userScripts         = local.options.templates[template].javascripts
            , usersStylesheets  = local.options.templates[template].stylesheets
            , layoutClasses     = []
        ;
                        
        // i = 0;
        // len = userScripts.length;
        // if (len > 0) {
        //     if ( typeof(userScripts[0].url) != 'undefined' ) {
        //         isObject = true
        //     } 
            
        //     for (; i < len; ++i) {
                
        //         domain = null;
        //         url = (isObject) ? userScripts[i].url : userScripts[i]
        //         if ( /^\{\{/.test(url) )
        //             url = swig.compile(url)(data);
                
        //         if (!/(\:\/\/|^\/\/)/.test(url) ) {
        //             filename = getAssetFilenameFromUrl(url);
        //         } else {
        //             domain      = url.match(/^.*:\/\/[a-z0-9._-]+\/?/);
        //             url         = url.replace(domain, '/');
        //             filename    = url
        //         }
        //         key =  (( /404/.test(filename) ) ? '[404]' : '[200]') +' '+ url; 
                
        //         ext = url.substr(url.lastIndexOf('.')).match(/(\.[A-Za-z0-9]+)/)[0];                
        //         assets[key] = {
        //             type        : 'javascript',
        //             url         : url,
        //             ext         : ext,
        //             mime        : local.options.conf.server.coreConfiguration.mime[ext.substr(1)] || 'NA',
        //             filename    : ( /404/.test(filename) ) ? 'not found' : filename
        //         }; 
                
        //         if (domain)
        //             assets[key].domain = domain;      
                                          
        //         //++aCount
        //     }
        // }
            
        
        // i   = 0;
        // len = usersStylesheets.length;
        // if (len > 0) {
        //     if ( typeof(usersStylesheets[0].url) != 'undefined' ) {
        //         isObject = true
        //     } 
            
        //     for (; i < len; ++i) {
                
        //         domain = null;
        //         url = (isObject) ? usersStylesheets[i].url : usersStylesheets[i];      
        //         if ( /^\{\{/.test(url) )
        //             url = swig.compile(url)(data);
                
        //         if (!/(\:\/\/|^\/\/)/.test(url) ) {
        //             filename = getAssetFilenameFromUrl(url);
        //         } else {
        //             domain      = url.match(/^.*:\/\/[a-z0-9._-]+\/?/);
        //             url         = url.replace(domain, '/');
        //             filename    = url
        //         }
        //         key =  (( /404/.test(filename) ) ? '[404]' : '[200]') +' '+ url; 
        //         ext = url.substr(url.lastIndexOf('.')).match(/(\.[A-Za-z0-9]+)/)[0];
        //         assets[key] = {
        //             type        : 'stylesheet',
        //             url         : url,
        //             ext         : ext,
        //             media       : ( isObject ) ? usersStylesheets[i].media: 'screen',
        //             mime        : local.options.conf.server.coreConfiguration.mime[ext.substr(1)] || 'NA',
        //             filename    : ( /404/.test(filename) ) ? 'not found' : filename
        //         };
                
        //         if (domain)
        //             assets[key].domain = domain;
                
        //         if ( !/not found/.test(assets[key].filename) ) {
        //             cssFiles.push(assets[key].filename)
        //         }                
                
        //         //++aCount
        //     }
        // }
            
            
        // layout assets
        i   = 0;
        len = layoutAssets.length;         
        var type            = null
            , tag           = null
            , properties    = null
            , p             = 0
            , pArr          = []            
        ;
        for (; i < len; ++i) {
            
            if ( !/(\<img|\<link|\<script)/g.test(layoutAssets[i]) )
                continue;
            
            if ( /\<img/.test(layoutAssets[i]) ) {
                type    = 'image';
                tag     = 'img'; 
            }
            
            if ( /\<script/.test(layoutAssets[i]) ) {
                type    = 'javascript';
                tag     = 'script'; 
            }
            
            if ( /\<link/.test(layoutAssets[i]) ) {
                if ( /rel\=\"stylesheet/.test(layoutAssets[i]) ) {
                    type    = 'stylesheet';
                } else if ( /rel\=\"(icon|(.*)\-icon)/.test(layoutAssets[i]) ) {
                    type    = 'image';
                } else {
                    type = 'file';
                }
                
                tag     = 'link'; 
            }
            
            domain  = null;
            try {
                url     = layoutAssets[i].match(/(src|href)\=\".*?\"/)[0];
            } catch (err) {
                console.error('Problem with this asset ('+ i +'/'+ len +'): '+ layoutAssets[i]);
                continue;
            }
            
            
            if ( /data\:/.test(url) ) { // ignoring "data:..."
                continue
            }
            url = url.replace(/((src|href)\=\"|\")/g, '');
            if ( /^\{\{/.test(url) )
                url = swig.compile(url)(data);
            
            if (!/(\:\/\/|^\/\/)/.test(url) ) {
                filename = getAssetFilenameFromUrl(url);
            } else {
                domain      = url.match(/^.*:\/\/[a-z0-9._-]+\/?/);
                url         = url.replace(domain, '/');
                filename    = url
            }
            key =  (( /404/.test(filename) ) ? '[404]' : '[200]') +' '+ url;
            ext = url.substr(url.lastIndexOf('.')).match(/(\.[A-Za-z0-9]+)/)[0];
            assets[key] = {
                type        : type,
                url         : url,
                ext         : ext,
                mime        : local.options.conf.server.coreConfiguration.mime[ext.substr(1)] || 'NA',
                filename    : ( /404/.test(filename) ) ? 'not found' : filename
            };
            
            if (domain)
                assets[key].domain = domain;
            
            if ( type == 'stylesheet' && !/not found/.test(assets[key].filename) ) {
                cssFiles.push(assets[key].filename)
            }
            
            properties = layoutAssets[i].replace( new RegExp('(\<'+ tag +'\\s+|\>$|\/\>)', 'g'), '').split(/\"\s+/g);
            p = 0;
            
            for (; p < properties.length; ++p ) {
                pArr = properties[p].split(/\=/g);
                if ( /(src|href)/.test(pArr[0]) )
                    continue;
                    
                assets[key][pArr[0]] = pArr[1].replace(/\"/g, '');              
            }            
            //++aCount
            
        }
        
        // getting layout css classes in order to retrieve active css assets from <asset>.css
        var classesArr = layoutStr.match(/class=\"([A-Za-z0-9_-\s+]+)\"?/g);
        
        if ( classesArr ) {
            var cCount      = 0
                , cArr      = null
                , cArrI     = null
                , cArrLen   = null
            ;
            i = 0;
            len = classesArr.length;
            for (; i < len; ++i) {
                classesArr[i] = classesArr[i].replace(/(\"|class\=)/g, '').trim();
                
                if ( /\s+/g.test(classesArr[i]) ) {
                    cArrI   = 0;                
                    cArr    = classesArr[i].replace(/\s+/g, ',').split(/\,/g);
                    //cArr    = classesArr[i].split(/\s+/g);
                    cArrLen = cArr.length;
                    
                    for (; cArrI < cArrLen; ++cArrI) {
                        
                        if ( layoutClasses.indexOf( cArr[cArrI] ) < 0) {
                            layoutClasses[cCount] = cArr[cArrI];
                            
                            ++cCount
                        }
                    }
                    continue;
                }
                
                if ( layoutClasses.indexOf( classesArr[i] ) < 0) {
                    layoutClasses[cCount] = classesArr[i];
                    ++cCount
                }            
            }
            assets._classes = { 
                total: layoutClasses.length,
                list: layoutClasses.join(', ')
            };
            
            // parsing css files
            i = 0, len = cssFiles.length;
            var cssContent = null
                , hasUrls   = null
                , definition = null
                , defName   = null
                , d = null
                , dLen = null
            ;
            var cssArr = null, classNames = null, assetsInClassFound = {};
            for (; i < len; ++i) {
                cssContent = fs.readFileSync(cssFiles[i]).toString();
                hasUrls = ( /(url\(|url\s+\()/.test(cssContent) ) ? true : false;
                if (!hasUrls) continue;
                
                cssArr = cssContent.split(/}/g);
                for (let c = 0; c < cssArr.length; ++c) {
                    //if ( !/(url\(|url\s+\()/.test(cssArr[c]) || /(url\(data|url\s+\(data)/ ) continue;
                    if ( /(url\(|url\s+\()/.test(cssArr[c]) && !/data\:|\@font-face/.test(cssArr[c]) ) {
                        
                        url = cssArr[c].match(/((background\:url|url)+\()([A-Za-z0-9-_.,:"'%/\s+]+).*?\)+/g)[0].replace(/((background\:url|url)+\(|\))/g, '').trim();                    
                        if ( typeof(assetsInClassFound[url]) != 'undefined') continue; // already defined
                        
                        definition = cssArr[c].match(/((\.[A-Za-z0-9-_.,;:"'%\s+]+)(\s+\{|{))/)[0].replace(/\{/g, '');
                        
                        classNames = definition.replace(/\./g, '').split(/\s+/);
                                        
                        
                        for( let clss = 0; clss < classNames.length; ++clss) {
                            // this asset is in use
                            if ( layoutClasses.indexOf(classNames[clss] < 0 && typeof(assetsInClassFound[url]) == 'undefined') ) {
                                console.debug(' found -> (' +  url +')');
                                assetsInClassFound[url] = true;
                                // assetsInClassFound[url] = {
                                //     cssFile: cssFiles[i],
                                //     definition: definition,
                                //     url: url
                                // }     
                                if (!/(\:\/\/|^\/\/)/.test(url) ) {
                                    filename = getAssetFilenameFromUrl(url);
                                } else {
                                    domain      = url.match(/^.*:\/\/[a-z0-9._-]+\/?/);
                                    url         = url.replace(domain, '/');
                                    filename    = url
                                }
                                
                                key =  (( /404/.test(filename) ) ? '[404]' : '[200]') +' '+ url;
                                ext = url.substr(url.lastIndexOf('.')).match(/(\.[A-Za-z0-9]+)/)[0];
                                assets[key] = {
                                    referrer    : cssFiles[i],
                                    definition  : definition,
                                    type        : type,
                                    url         : url,
                                    ext         : ext,
                                    mime        : local.options.conf.server.coreConfiguration.mime[ext.substr(1)] || 'NA',
                                    filename    : ( /404/.test(filename) ) ? 'not found' : filename
                                };  
                                
                                if (domain)
                                    assets[key].domain = domain;
                                
                                break;                    
                            }
                        }
                    }
                    //font-family: source-sans-pro, sans-serif;
                    
                    
                }
                
                // match all definitions .xxx {}
                //definitions = cssContent.match(/((\.[A-Za-z0-9-_.\s+]+)+(\s+\{|{))([A-Za-z0-9-@'"/._:;()\s+]+)\}/g);
                //definitions = cssContent.match(/((\.[A-Za-z0-9-_.\s+]+)+(\s+\{|{))?/g);
                // d = 0, dLen = definitions.length;
                // for (; d < dLen; ++d) {
                //     if ( definitions[d] )
                // }
                
                // fonts, images, background - attention required to relative paths !!
                //var inSourceAssets = cssContent.match(/((background\:url|url)+\()([A-Za-z0-9-_."']+).*?\)+/g);
            }
            
            assets._cssassets = assetsInClassFound.count();
        } // EO if (classesArr) {
        
            
        
        // TODO - report
        /**
         * assets._report = {
         *      total   : ${int: aCount}, // assets count
         *      warning : [
         *          {
         *              message: "too many requests",
         *              hint: "you should lower this"
         *          },
         *          {...}
         *      ],
         *      error: [
         *          {
         *              message: "${int: eCount} asset(s) not found",
         *              hint: "check your assets location"
         *          },
         *          {
         *              
         *          }
         *      ]
         * }
         */
        
        var assetsStr = JSON.stringify(assets);        
        assets = swig.compile( assetsStr.substring(1, assetsStr.length-1) )(data);
        
        return JSON.parse('{'+ assets +'}')
    }

    var isValidURL = function(url){
        var re = /(http|ftp|https|sftp):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?/;
        return (re.test(url)) ? true : false
    }

    /**
     * redirect
     *
     * TODO - improve redirect based on `utils.routing`
     * e.g.: self.redirect('project-get', { companyId: companyId, clientId: clientId, id: projectId }, true)
     *
     * You have to ways of using this method
     *
     * 1) Through routing.json
     * ---------------------
     * Allows you to redirect to an internal [ route ], an internal [ path ], or an external [ url ]
     *
     * For this to work you have to set in your routing.json a new route using  "param":
     * { "control": "redirect", "route": "one-valid-route" }
     * OR
     * { "control": "redirect", "url": "http://www.somedomain.com/page.html" }
     *
     * OR
     * { "control": "redirect", "path": "/", "ignoreWebRoot": true }
     *
     * OR
     * { "control": "redirect", "url": "http://home@public/production", "ignoreWebRoot": true }
     *
     * if you are free to use the redirection [ code ] of your choice, we've set it to 301 by default
     *
     *
     * 2) By calling this.redirect(rule, [ignoreWebRoot]):
     * ------------------------------------------------
     * where `this` is :
     *  - a Controller instance
     *
     * Where `rule` is either a string defining
     *  - the rule/route name
     *      => home (will use same bundle, same protocol scheme & same environment)
     *      => home@public (will use same protocol scheme & same environment)
     *      => http://home@public/dev (port style for more precision)
     *
     *  - an URI
     *      => /home
     *
     *  - a URL
     *      => http://www.google.com/
     *
     *
     * And Where `ignoreWebRoot` is an optional parameter used to ignore web root settings (Standalone mode or user set web root)
     * `ignoreWebRoot` behaves the like set to `false` by default
     *
     * N.B.: Gina will tell browsers not to cache redirections if you are using `dev` environement
     *
     * @param {object|string} req|rule - Request Object or Rule/Route name
     * @param {object|boolean} res|ignoreWebRoot - Response Object or Ignore WebRoot & start from domain root: /
     * @param {object} [params] TODO
     *
     * @callback [ next ]
     * */
    this.redirect = function(req, res, next) {
        var conf    = self.getConfig();
        var wroot   = conf.server.webroot;
        var routing = conf.content.routing;
        var route   = '', rte = '';
        var ignoreWebRoot = null;

        if ( typeof(req) === 'string' ) {

            if ( typeof(res) == 'undefined') {
                // nothing to do
            } else if (typeof(res) === 'string' || typeof(res) === 'number' || typeof(res) === 'boolean') {
                if ( /true|1/.test(res) ) {
                    ignoreWebRoot = true
                } else if ( /false|0/.test(res) ) {
                    ignoreWebRoot = false
                } else {
                    res = local.res;
                    var stack = __stack.splice(1).toString().split(',').join('\n');
                    self.throwError(res, 500, new Error('RedirectError: @param `ignoreWebRoot` must be a boolean\n' + stack));
                }
            }

            if ( req.substr(0,1) === '/') { // is relative (not checking if the URI is defined in the routing.json)
                if (wroot.substr(wroot.length-1,1) == '/') {
                    wroot = wroot.substr(wroot.length-1,1).replace('/', '')
                }
                rte     = ( ignoreWebRoot != null && ignoreWebRoot) ? req : wroot + req;
                req     = local.req;
                res     = local.res;
                next    = local.next;
                var isRelative = true;
                req.routing.param.path = rte
            } else if ( isValidURL(req) ) { // might be an URL
                rte     = req;
                req     = local.req;
                res     = local.res;
                next    = local.next;
                req.routing.param.url = rte
            } else { // is by default a route name
                rte = route = ( new RegExp('^/'+conf.bundle+'-$').test(req) ) ? req : wroot.match(/[^/]/g).join('') +'-'+ req;
                req     = local.req;
                res     = local.res;
                next    = local.next;
                req.routing.param.route = routing[rte]
            }
        } else {
            route = req.routing.param.route;
        }

        var path        = req.routing.param.path || '';
        var url         = req.routing.param.url;
        var code        = req.routing.param.code || 301;

        var keepParams  = req.routing.param['keep-params'] || false;

        var condition   = true; //set by default for url @ path redirect

        if (route) { // will go with route first
            condition = ( typeof(routing[route]) != 'undefined') ? true : false;
        }

        if ( !self.forward404Unless(condition, req, res) ) { // forward to 404 if bad route

            if (wroot.substr(wroot.length-1,1) == '/') {
                wroot = wroot.substr(wroot.length-1,1).replace('/', '')
            }


            if (route) { // will go with route first
                path = (ignoreWebRoot) ? routing[route].url.replace(wroot, '') : routing[route].url;
                if (path instanceof Array) {
                    path = path[0] //if it is an array, we just take the first one
                }
            } else if (url && !path) {
                path = ( (/\:\/\//).test(url) ) ? url : req.scheme + '://' + url;

                if (/\@/.test(path)) {
                    path = lib.routing.getRoute(path).toUrl(ignoreWebRoot);
                }

            //} else if(path && typeof(isRelative) !=  'undefined') {
            // nothing to do, just ignoring
            //} else {
            } else if ( !path && typeof(isRelative) ==  'undefined' ) {
                //path = conf.server.scheme + '://' +conf.hostname + path
                path = conf.hostname + path
            }
            
            
            // rewrite path vs local.req.headers.host
            if ( typeof(local.req.headers.host) != 'undefined' && !/\:d+/.test(local.req.headers.host) ) {
                path = path.replace(/\:\d+/, '');
            }
            
            if (req.headersSent) {
                if (typeof(next) != 'undefined')
                    return next();
                else
                    return;
            }
            
            // retrieve original request cookie
            // if ( 
            //     typeof(res._headers['set-cookie']) == 'undefined' 
            //     && typeof(req.headers.cookie) != 'undefined' 
            //     && typeof(req.session) != 'undefined'
            //     && typeof(req.session.cookie) != 'undefined'
            //     //&& typeof(local.req.sessionID) != 'undefined'
            // ) {
            //     var reqCookie = req.headers.cookie.split(/\;/);                    
            //     var cookieOpt = JSON.parse(reqCookie[0]), cookieValue = reqCookie[1];
                
            //     for (var cKey in cookieOpt ) {
            //         cookieValue += '; '+ cKey +'='+ cookieOpt[cKey]
            //     }
            //     console.debug('[ Controller::query() ][ responseCookie ] '+ cookieValue);
            //     res.setHeader('Set-Cookie', cookieValue);
            // }

            if (GINA_ENV_IS_DEV) {
                res.writeHead(code, {
                    'Location': path,
                    'Cache-Control': 'no-cache, no-store, must-revalidate', // preventing browsers from using cache
                    'Pragma': 'no-cache',
                    'Expires': '0'
                })
            } else {
                res.writeHead(code, { 'Location': path })
            }


            console.info(local.req.method +' ['+local.res.statusCode +'] '+ path);
            res.end();
            local.res.headersSent = true;// done for the render() method
        }
        
        if ( typeof(next) != 'undefined' )
            next();
        else
            return;
    }

    /**
     * Move files to assets dir
     *
     * @param {object} res
     * @param {collection} files
     *
     * @callback cb
     * @param {object} [err]
     * */
    var movefiles = function (i, res, files, cb) {
        if (!files.length || files.length == 0) {
            cb(false)
        } else {
            if ( fs.existsSync(files[i].target) ) new _(files[i].target).rmSync();

            var sourceStream = fs.createReadStream(files[i].source);
            var destinationStream = fs.createWriteStream(files[i].target);

            sourceStream
                .pipe(destinationStream)
                .on('error', function () {
                    var err = 'Error on SuperController::copyFile(...): Not found ' + files[i].source + ' or ' + files[i].target;
                    cb(err)
                })
                .on('close', function () {

                    try {
                        fs.unlinkSync(files[i].source);
                        files.splice(i, 1);
                    } catch (err) {
                        cb(err)
                    }

                    movefiles(i, res, files, cb)
                })
        }
    }
    
    /**
     * downloadFromURL
     * Download from an URL
     *  - attachment/inline
     *  OR
     *  - locally: `Controller.store(target, cb)` must be called to store on `onComplete` event  
     * 
     * @param {string} url - eg.: https://upload.wikimedia.org/wikipedia/fr/2/2f/Firefox_Old_Logo.png
     * @param {object} [options]
     * 
     * 
     * */
    this.downloadFromURL = function(url, options) {
        
        var defaultOptions = { 
            // only if you want to store locally the downloaded file
            toLocalDir: false, // this option will disable attachment download
            // Content-Disposition (https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Disposition)
            contentDisposition: 'attachment',
            // Content-type (https://developer.mozilla.org/en-US/docs/Web/Security/Securing_your_site/Configuring_server_MIME_types)
            contentType: 'application/octet-stream',
            
            agent: false,
            // set to false to ignore certificate verification
            rejectUnauthorized: true,
            port: 80,
            method: 'GET',
            keepAlive: true,
            headers: {}
        };
        
        var opt = ( typeof(options) != 'undefined' ) ? merge(options, defaultOptions) : defaultOptions;
        
        var requestOptions = {};
        for (var o in opt) {
            if ( !/(toLocalDir|contentDisposition|contentType)/.test(o) )
                requestOptions[o] = opt[o];
        }

        // defining protocol & scheme
        var protocol    = null;
        var scheme      = null;   
        
        if ( /\:\/\//.test(url) ) {
            scheme = url.match(/^\w+\:/)[0];
            scheme = scheme.substr(0, scheme.length-1);
            
            if ( !/^http/.test(scheme) )
                self.throwError(local.res, 500, new Error('[ '+ scheme +' ] Scheme not supported. Ref.: `http` or `https` only'));
                
        } else { // by default
            scheme = 'http';
        }
        
        requestOptions.scheme = scheme +':';
        
        //defining port
        var port = url.match(/\:\d+\//) || null;
        if ( port != null ) {
            port = port[0].substr(1, port[0].length-2);
            requestOptions.port = ~~port;            
        }
        
        // defining hostname & path
        var parts = url.replace(new RegExp( scheme + '\:\/\/'), '').split(/\//g);
        requestOptions.host = parts[0].replace(/\:\d+/, '');
        requestOptions.path = '/' + parts.splice(1).join('/');
        
        
        // extension and mime
        var filename    = url.split(/\//g).pop(); 
        if ( !/\.\w+$/.test(filename) )
                self.throwError(local.res, 500, new Error('[ '+ filename +' ] Extension not found.'));
        
        if ( opt.contentDisposition == 'attachment')
            opt.contentDisposition += '; filename=' + filename;
        
        var ext         = filename.match(/\.\w+$/)[0].substr(1)
        , contentType   = null
        , tmp           = _(GINA_TMPDIR +'/'+ filename, true);
        
        if ( typeof(local.options.conf.server.coreConfiguration.mime[ext]) != 'undefined' ) {

            contentType = (opt.contentType != defaultOptions.contentType) ? opt.contentType : local.options.conf.server.coreConfiguration.mime[ext];
            
        } else { // extension not supported
            self.throwError(local.res, 500, new Error('[ '+ ext +' ] Extension not supported. Ref.: gina/core mime.types'));
        }
        
        // defining responseType
        requestOptions.headers['Content-Type'] = contentType;
        requestOptions.headers['Content-Disposition'] = opt.contentDisposition;
        
        //'Content-Type': 'application/json',
        //var file = fs.createWriteStream(tmp);
        var browser = require(''+ scheme);
        console.debug('requestOptions: \n', JSON.stringify(requestOptions, null, 4));
        browser.get(requestOptions, function(response) {

            local.res.setHeader('Content-Type', contentType);
            local.res.setHeader('Content-Disposition', opt.contentDisposition);  
            response.pipe(local.res);
               
            /**
            var data = '', dataLength = 0;
            
            
            response.on('data', (chunk) => {
                data += chunk;
                dataLength += chunk.length;
            });
            
            response.on('end', () => {
                
                local.res.setHeader('Content-Type', contentType);
                local.res.setHeader('Content-Disposition', opt.contentDisposition);     
                local.res.setHeader('Content-Length', dataLength);  
                
                // var data = 'toto la menace';
                // local.res.setHeader('Content-Type', 'text/plain');
                // //local.res.setHeader('Content-Length', data.length);  
                // local.res.setHeader('Content-Disposition', 'attachment; filename=test.txt');          
                
                local.res.end( Buffer.from(data) );
                
                local.res.headersSent = true;       
                
                if ( typeof(local.next) != 'undefined')
                    local.next();
                else
                    return;
            });*/
            
            
            
        //     response.pipe(file);

        //     file
        //         .on('finish', function() {
        //             file.close( function onDownloaded(){
                        
                    
        //             local.res.setHeader('Content-Type', contentType);
        //             local.res.setHeader('Content-Disposition', opt.contentDisposition);            
                    
        //             local.res.end(  )
        //             // var filestream = fs.createReadStream(filename);
        //             // filestream.pipe(local.res);

                    
        //             // if (fs.existsSync(target))
        //             //     fs.unlinkSync(target);

        //             // fs.writeFile(target, JSON.stringify(newFonts), function onWrite(err) {
        //             //     if (err) {
        //             //         console.error('[ controller ] [ downloadFromURL ] ' + err.stack);
        //             //     } else {
        //             //         fs.unlinkSync(tmp);
        //             //         console.info('[ controller ] [ downloadFromURL ] Fonts download complete');  
        //             //     }
        //             // })

        //         });
        //     });
        // })
        // .on('error', function(err) {
        //     console.error('[ controller ] [ downloadFromURL ] '+ err.stack );
        //     fs.unlinkSync(tmp);
        //     self.throwError(local.res, 500, err);
        });
        
        

    }

    
    /**
     * Download to targeted filename.ext - Will create target if new
     * Use `cb` callback or `onComplete` event
     *
     * @param {string} filename
     * @param {object} options
     **/
    this.downloadFromLocal = function(filename) {
        
        var file        = filename.split(/\//g).pop(); 
        var ext         = file.split(/\./g).pop()
        , contentType   = null;
        
        if ( typeof(local.options.conf.server.coreConfiguration.mime[ext]) != 'undefined' ) {

            contentType = local.options.conf.server.coreConfiguration.mime[ext];
            local.res.setHeader('Content-Type', contentType);
            local.res.setHeader('Content-Disposition', 'attachment; filename=' + file);            

            var filestream = fs.createReadStream(filename);
            filestream.pipe(local.res);

        } else { // extension not supported
            self.throwError(local.res, 500, new Error('[ '+ ext +' ] Extension not supported. Ref.: gina/core mime.types'));
        }
        
    }


    /**
     * Store file to a targeted directory - Will create target if new
     * You only need to provide the destination path
     * Use `cb` callback or `onComplete` event
     *
     * @param {string} target is the upload dir destination
     *
     * @callback [cb]
     *  @param {object} error
     *  @param {array} files
     *
     * @event
     *  @param {object} error
     *  @param {array} files
     *
     * */
    this.store = function(target, cb) {

        var start = function(target, cb) {
            var files = local.req.files, uploadedFiles = [];

            if ( typeof(files) == 'undefined' || files.count() == 0 ) {
                if (cb) {
                    cb(new Error('No file to upload'))
                } else {
                    self.emit('uploaded', new Error('No file to upload'))
                }
            } else {
                // saving files
                var uploadDir   = new _(target)
                    , list      = []
                    , i         = 0
                    , folder    = uploadDir.mkdirSync();

                if (folder instanceof Error) {
                    if (cb) {
                        cb(folder)
                    } else {
                        self.emit('uploaded', folder)
                    }
                } else {
                    // files list                    
                    for (var len = files.length; i < len; ++i ){
                        list[i] = {
                            source: files[i].path,
                            target: _(uploadDir.toString() + '/' + files[i].originalFilename)
                        };
                        
                        uploadedFiles[i] = { 
                            file        : files[i].originalFilename,
                            filename    : list[i].target, 
                            size        : files[i].size,
                            type        : files[i].type,
                            encoding    : files[i].encoding
                        };
                        
                    }

                    movefiles(0, local.res, list, function (err) {
                        if (err) {
                            if (cb) {
                                cb(new Error('No file to upload'))
                            } else {
                                self.emit('uploaded', new Error('No file to upload'))
                            }
                        } else {
                            if (cb) {
                                cb(false, uploadedFiles)
                            } else {
                                self.emit('uploaded', false, uploadedFiles)
                            }
                        }
                    })
                }
            }
        }

        if ( typeof(cb) == 'undefined' ) {

            return {
                onComplete : function(cb){
                    self.on('uploaded', cb);
                    start(target)
                }
            }
        } else {
            start(target, cb)
        }
    }


    /**
     * Query
     *
     * Allows you to act as a proxy between your frontend and a 1/3 API
     * */
    function sha256(s) {
        return crypto.createHash('sha256').update(s).digest('base64');
    }
    local.query.data = {};
    local.query.options = {
        host    : undefined, // Must be an IP
        hostname  : undefined, // cname of the host e.g.: `www.google.com` or `localhost`
        path    : undefined, // e.g.: /test.html
        port    : 80, // #80 by default but can be 3000 or <bundle>@<project>/<environment>
        method  : 'GET', // POST | GET | PUT | DELETE
        keepAlive: true,
        auth: undefined, // use `"username:password"` for basic authentification
        rejectUnauthorized: null, // false to ignore verification when requesting on https (443)
        headers: {
            'Content-Type': 'application/json',
            // 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',

            // 'X-Requested-With': 'XMLHttpRequest' // to convert into an XHR query
            'Content-Length': local.query.data.length
        },
        agent   : false/**,
        checkServerIdentity: function(host, cert) {
            // Make sure the certificate is issued to the host we are connected to
            const err = tls.checkServerIdentity(host, cert);
            if (err) {
                return err;
            }

            // Pin the public key, similar to HPKP pin-sha25 pinning
            const pubkey256 = 'pL1+qb9HTMRZJmuC/bB/ZI9d302BYrrqiVuRyW+DGrU=';
            if (sha256(cert.pubkey) !== pubkey256) {
                const msg = 'Certificate verification error: ' +
                    `The public key of '${cert.subject.CN}' ` +
                    'does not match our pinned fingerprint';
                return new Error(msg);
            }

            // Pin the exact certificate, rather then the pub key
            const cert256 = '25:FE:39:32:D9:63:8C:8A:FC:A1:9A:29:87:' +
                'D8:3E:4C:1D:98:DB:71:E4:1A:48:03:98:EA:22:6A:BD:8B:93:16';
            if (cert.fingerprint256 !== cert256) {
                const msg = 'Certificate verification error: ' +
                    `The certificate of '${cert.subject.CN}' ` +
                    'does not match our pinned fingerprint';
                return new Error(msg);
            }

            // This loop is informational only.
            // Print the certificate and public key fingerprints of all certs in the
            // chain. Its common to pin the public key of the issuer on the public
            // internet, while pinning the public key of the service in sensitive
            // environments.
            do {
                console.log('Subject Common Name:', cert.subject.CN);
                console.log('  Certificate SHA256 fingerprint:', cert.fingerprint256);

                hash = crypto.createHash('sha256');
                console.log('  Public key ping-sha256:', sha256(cert.pubkey));

                lastprint256 = cert.fingerprint256;
                cert = cert.issuerCertificate;
            } while (cert.fingerprint256 !== lastprint256);

        }*/
        
    };

    this.query = function(options, data, callback) {

        // preventing multiple call of self.query() when controller is rendering from another required controller
        if (local.options.renderingStack.length > 1) {
            return false
        }

        var queryData           = {}
            , defaultOptions    = local.query.options
            , path              = options.path
            , browser           = null
            // options must be used as a copy in case of multiple calls of self.query(options, ...)
            , options           = merge(JSON.parse(JSON.stringify(options)), defaultOptions)
        ;

        for (var o in options) {//cleaning
            if ( typeof(options[o]) == 'undefined' || options[o] == undefined) {
                delete options[o]
            }
        }

        if ( !options.host && !options.hostname ) {
            self.emit('query#complete', new Error('SuperController::query() needs at least a `host IP` or a `hostname`'))
        }

        

        if (arguments.length <3) {
            if ( typeof(data) == 'function') {
                var callback = data;
                var data = undefined;
            } else {
                callback = undefined;
            }
        }
        if ( typeof(data) != 'undefined' &&  data.count() > 0) {

            queryData = '?';
            // TODO - if 'application/json' && method == (put|post)
            if ( ['put', 'post'].indexOf(options.method.toLowerCase()) >-1 && /(text\/plain|application\/json|application\/x\-www\-form)/i.test(options.headers['Content-Type']) ) {
                // replacing
                queryData = encodeURIComponent(JSON.stringify(data))

            } else {
                //Sample request.
                //options.path = '/updater/start?release={"version":"0.0.5-dev","url":"http://10.1.0.1:8080/project/bundle/repository/archive?ref=0.0.5-dev","date":1383669077141}&pid=46493';

                for (var d in data) {
                    if ( typeof(data[d]) == 'object') {
                        data[d] = JSON.stringify(data[d]);
                    }
                    queryData += d + '=' + data[d] + '&';
                }

                queryData = queryData.substring(0, queryData.length-1);
                queryData = queryData.replace(/\s/g, '%20');
                options.path += queryData;
            }

        } else {
            queryData = ''
        }

        
        // Internet Explorer override
        if ( /msie/i.test(local.req.headers['user-agent']) ) {
            options.headers['Content-Type'] = 'text/plain';
        } else {
            options.headers['Content-Type'] = local.options.conf.server.coreConfiguration.mime['json'];
        }

        // if ( typeof(local.req.headers.cookie) == 'undefined' && typeof(local.res._headers['set-cookie']) != 'undefined' ) { // useful for CORS : forward cookies from the original request
        //     //options.headers.cookie = local.req.headers.cookie;
        //     var originalResponseCookies = local.res._headers['set-cookie'];
        //     options.headers.cookie = [];
        //     for (var c = 0, cLen = originalResponseCookies.length; c < cLen; ++c) {
        //         options.headers.cookie.push(originalResponseCookies[c])
        //     }
        // }

        //you need this, even when empty.
        options.headers['Content-Length'] = queryData.length;

        var ctx         = getContext()
            , protocol  = null
            , scheme    = null;
        
        // if (/\:\/\//.test(options.hostname)) {
        //     var hArr = options.host.split('://');

        //     options.protocol = hArr[0];

        //     var pArr = hArr[1].split(/\//g);

        //     options.port = pArr.pop();
        //     options.host = hArr[0]
        // }
        
        // retrieve protocol & scheme: if empty, take the bundles protocol
        protocol    = options.protocol || ctx.gina.config.envConf[ctx.bundle][ctx.env].server.protocol;// bundle servers's protocol by default
        protocol    = protocol.match(/[.a-z 0-9]+/ig)[0];
        scheme      = options.scheme || ctx.gina.config.envConf[ctx.bundle][ctx.env].server.scheme;// bundle servers's scheme by default
        scheme      = scheme.match(/[a-z 0-9]+/ig)[0];
        
        //retrieving dynamic host, hostname & port
        if ( /\@/.test(options.hostname) ) {
            
            var bundle = ( options.hostname.replace(/(.*)\:\/\//, '') ).split(/\@/)[0];
            
            // No shorcut possible because conf.hostname might differ from user inputs
            options.host        = ctx.gina.config.envConf[bundle][ctx.env].host.replace(/(.*)\:\/\//, '').replace(/\:\d+/, '');
            options.hostname    = ctx.gina.config.envConf[bundle][ctx.env].hostname;
            options.port        = ctx.gina.config.envConf[bundle][ctx.env].server.port;
            
            options.protocol    = ctx.gina.config.envConf[bundle][ctx.env].server.protocol;
            options.scheme      = ctx.gina.config.envConf[bundle][ctx.env].server.scheme;
            // might be != from the bundle requesting
            //options.protocol    = ctx.gina.config.envConf[bundle][ctx.env].content.settings.server.protocol || ctx.gina.config.envConf[bundle][ctx.env].server.protocol;
            //options.scheme    = ctx.gina.config.envConf[bundle][ctx.env].content.settings.server.scheme || ctx.gina.config.envConf[bundle][ctx.env].server.scheme;
        }
                
        if ( typeof(options.protocol) == 'undefined' ) {
            options.protocol = protocol
        }
        if ( typeof(options.scheme) == 'undefined' ) {
            options.scheme = scheme
        }
             
        // reformating scheme
        if( !/\:$/.test(options.scheme) )
            options.scheme += ':';
        
        try {            
            var protocolVersion = ~~options.protocol.match(/\/(.*)$/)[1].replace(/\.\d+/, '');
            var httpLib =  options.protocol.match(/^(.*)\//)[1] + ( (protocolVersion >= 2) ? protocolVersion : '' );
            if ( !/http2/.test(httpLib) && /https/.test(options.scheme) ) {
                httpLib += 's';
            }
            //delete options.protocol;
            browser = require(''+ httpLib);   
            if ( /http2/.test(httpLib) ) {                
                options.queryData = queryData;
                return handleHTTP2ClientRequest(browser, options, callback);
            } else {
                
                var altOpt = JSON.parse(JSON.stringify(options));
                altOpt.protocol = options.scheme;
                altOpt.hostname = options.host;
                altOpt.port     = 443;
                if ( typeof(altOpt.encKey) != 'undefined' ) {
                    try {
                        altOpt.encKey = fs.readFileSync(options.encKey);
                    } catch(err) {
                        self.emit('query#complete', err);
                    }
                    
                } else {
                    console.warn('[ CONTROLLER ][ HTTP/2.0#query ] options.encKey not found !');
                }
                
                if ( typeof(altOpt.encCert) != 'undefined' ) {
                    try {
                        altOpt.encCert = fs.readFileSync(options.encCert);
                    } catch(err) {
                        self.emit('query#complete', err);
                    }
                    
                } else {
                    console.warn('[ CONTROLLER ][ HTTP/2.0#query ] options.encCert not found !');
                }
                
                altOpt.agent = new browser.Agent(altOpt);
            }         
            
        } catch(err) {
            //throw err;
            //throw new Error('Scheme `'+ scheme +'` not supported')
            self.emit('query#complete', err)
        }
           
        
        
        
        
        var req = browser.request(altOpt, function(res) {

            res.setEncoding('utf8');

            // upgrade response headers to handler
            if ( typeof(res.headers['access-control-allow-credentials']) != 'undefined' )
                local.options.withCredentials = res.headers['access-control-allow-credentials'];


            var data = '';

            res.on('data', function onData (chunk) {
                data += chunk;
            });

            res.on('end', function onEnd(err) {
                
                // retrieve original request cookie
                // if ( 
                //     typeof(local.res._headers['set-cookie']) == 'undefined' 
                //     && typeof(local.req.headers.cookie) != 'undefined' 
                //     && typeof(local.req.session) != 'undefined'
                //     && typeof(local.req.session.cookie) != 'undefined'
                //     //&& typeof(local.req.sessionID) != 'undefined'
                // ) {
                //     var reqCookie = local.req.headers.cookie.split(/\;/);                    
                //     var cookieOpt = JSON.parse(reqCookie[0]), cookieValue = reqCookie[1];
                    
                //     for (var cKey in cookieOpt ) {
                //         cookieValue += '; '+ cKey +'='+ cookieOpt[cKey]
                //     }
                //     console.debug('[ Controller::query() ][ responseCookie ] '+ cookieValue);
                //     local.res.setHeader('Set-Cookie', cookieValue);
                // }
                
                // exceptions filter
                if ( typeof(data) == 'string' && /^Unknown ALPN Protocol/.test(data) ) {
                    var err = {
                        status: 500,
                        error: new Error(data)
                    };
                    
                    if ( typeof(callback) != 'undefined' ) {
                        callback(err)
                    } else {
                        self.emit('query#complete', err)
                    }
                    
                    return
                }
                
                //Only when needed.
                if ( typeof(callback) != 'undefined' ) {
                    if ( typeof(data) == 'string' && /^(\{|%7B|\[{)/.test(data) ) {
                        try {
                            data = JSON.parse(data)
                        } catch (err) {
                            data = {
                                status    : 500,
                                error     : data
                            }
                        }
                    }

                    if ( data.status && !/^2/.test(data.status) && typeof(local.options.conf.server.coreConfiguration.statusCodes[data.status]) != 'undefined' ) {
                        callback(data)
                    } else {
                        callback( false, data )
                    }

                } else {
                    if ( typeof(data) == 'string' && /^(\{|%7B|\[{)/.test(data) ) {
                        try {
                            data = JSON.parse(data)
                        } catch (err) {
                            data = {
                                status    : 500,
                                error     : data
                            }
                            self.emit('query#complete', data)
                        }
                    }

                    if ( data.status && !/^2/.test(data.status) && typeof(local.options.conf.server.coreConfiguration.statusCodes[data.status]) != 'undefined' ) {
                        self.emit('query#complete', data)
                    } else {
                        self.emit('query#complete', false, data)
                    }
                }
            })
        });


        //starting from from >0.10.15
        req.on('error', function onError(err) {
            
            
            if (
                typeof(err.code != 'undefined') && /ECONNREFUSED|ECONNRESET/.test(err.code) 
                || typeof(err.cause != 'undefined') && typeof(err.cause.code != 'undefined') &&  /ECONNREFUSED|ECONNRESET/.test(err.cause.code) 
            ) {

                var port = getContext('gina').ports[options.protocol][options.scheme.replace(/\:/, '')][ options.port ];//err.port || err.cause.port 
                if ( typeof(port) != 'undefined' ) {
                    err.accessPoint = port;
                    err.message = '`Controller::query()` could not connect to [ ' + err.accessPoint + ' ] using port '+options.port+'.\n';
                }
            }


            console.error(err.stack||err.message);
            // you can get here if :
            //  - you are trying to query using: `enctype="multipart/form-data"`
            //  -
            if ( typeof(callback) != 'undefined' ) {

                callback(err)

            } else {
                var data = {
                    status    : 500,
                    error     : err.stack || err.message
                };

                self.emit('query#complete', data)
            }
        });


        if (req) { // don't touch this please
            if (req.write) req.write(queryData);
            if (req.end) req.end();
        }

        return {
            onComplete  : function(cb) {
                self.once('query#complete', function(err, data){

                    if ( typeof(data) == 'string' && /^(\{|%7B|\[{)/.test(data) ) {
                        try {
                            data = JSON.parse(data)
                        } catch (err) {
                            data = {
                                status    : 500,
                                error     : data
                            }
                        }
                    }

                    if ( data.status && !/^2/.test(data.status) && typeof(local.options.conf.server.coreConfiguration.statusCodes[data.status]) != 'undefined') {
                        cb(data)
                    } else {
                        cb(err, data)
                    }
                })
            }
        }
    }
    
    var handleHTTP2ClientRequest = function(browser, options, callback) {
        
        //cleanup
        /**if ( typeof(options[':authority']) == 'undefined' && typeof(options.host) != 'undefined' ) {
            options[':authority'] = options.host;            
        } else {
            options[':authority'] = options.hostname;
        }*/
        options[':authority'] = options.hostname;
        
        delete options.host;
        
        if ( typeof(options[':path']) == 'undefined' ) {
            options[':path'] = options.path;
            delete options.path;
        } 
        if ( typeof(options[':method']) == 'undefined' ) {
            options[':method'] = options.method.toUpperCase();
            delete options.method;
        }
        
        // only if binary !! 
        // if ( typeof(options['content-length']) == 'undefined' ) {
        //     options['content-length'] = options.headers['Content-Length'] ;
        //     delete options.headers['Content-Length'];
        // }
        // if ( typeof(options['content-type']) == 'undefined' ) {
        //     options['content-type'] = options.headers['Content-Type'] ;
        //     delete options.headers['Content-Type'];
        // }
        
        if ( typeof(options[':scheme']) == 'undefined' ) {
            options[':scheme'] = options.scheme ;
        }
                
        if ( typeof(options.ca) != 'undefined' ) {
            try {
                options.ca = fs.readFileSync(options.ca);
            } catch(err) {
                self.emit('query#complete', err);
                return;
            }
            
        } else {
            console.warn('[ CONTROLLER ][ HTTP/2.0#query ] options.ca not found !');
        }
        
        var body = Buffer.from(options.queryData);
        options.headers['Content-Length'] = body.length;
        delete options.queryData;
                
        const client = browser.connect(options.hostname, options);
        
        client.on('error', (err) => {
            
            console.error(err.stack||err.message);
           
            if ( typeof(callback) != 'undefined' ) {

                callback(err)

            } else {
                var data = {
                    status    : 500,
                    error     : err.stack || err.message
                };

                self.emit('query#complete', data)
            }
        });
        
        const {
            HTTP2_HEADER_SCHEME,
            HTTP2_HEADER_AUTHORITY,
            HTTP2_HEADER_PATH,
            HTTP2_HEADER_METHOD,
            HTTP2_HEADER_STATUS
          } = browser.constants;

        const req = client.request( merge({ 
            [HTTP2_HEADER_METHOD]: options[':method'],
            [HTTP2_HEADER_PATH]: options[':path'] 
        }, options.headers) );
        //const req = client.request({ [HTTP2_HEADER_PATH]: options[':path'] });
        //const req = client.request(options);
        //const req = client.request(options);
        // getting headers infos
        // req.on('response', (headers, flags) => {
        //     for (const name in headers) {
        //         console.log(`${name}: ${headers[name]}`);
        //     }
        // });

        req.setEncoding('utf8');
        let data = '';
        req.on('response', (headers, flags) => {   });
        
        req.on('data', (chunk) => { 
            data += chunk; 
        });
        
        req.on('error', (err) => {
                
            //if ( /(127\.0\.0\.1|localhost|127\.0\.0\.2)/.test(err.address) ) {
            if ( 
                typeof(err.cause != 'undefined') && /ECONNREFUSED/.test(err.cause.code) 
                || /ECONNREFUSED/.test(err.code) 
            ) {
                
                var port = getContext('gina').ports[options.protocol][options.scheme.replace(/\:/, '')][ options.port ];//err.port || err.cause.port 
                if ( typeof(port) != 'undefined' ) {
                    err.accessPoint = port;
                    err.message = 'Could not connect to [ ' + err.accessPoint + ' ].\n' + err.message;
                }                    
            }


            console.error(err.stack||err.message);
            // you can get here if :
            //  - you are trying to query using: `enctype="multipart/form-data"`
            //  -
            if ( typeof(callback) != 'undefined' ) {

                callback(err)

            } else {
                var data = {
                    status    : 500,
                    error     : err.stack || err.message
                };

                self.emit('query#complete', data)
            }
        });
        
        req.on('end', () => {   
            
            // exceptions filter
            if ( typeof(data) == 'string' && /^Unknown ALPN Protocol/.test(data) ) {
                var err = {
                    status: 500,
                    error: new Error(data)
                };
                
                if ( typeof(callback) != 'undefined' ) {
                    callback(err)
                } else {
                    self.emit('query#complete', err)
                }
                
                client.close();         
                return
            }
            
            //Only when needed.
            if ( typeof(callback) != 'undefined' ) {
                if ( typeof(data) == 'string' && /^(\{|%7B|\[{)/.test(data) ) {
                    try {
                        data = JSON.parse(data)
                    } catch (err) {
                        data = {
                            status    : 500,
                            error     : data
                        }
                    }
                }

                if ( data.status && !/^2/.test(data.status) && typeof(local.options.conf.server.coreConfiguration.statusCodes[data.status]) != 'undefined' ) {
                    callback(data)
                } else {
                    callback( false, data )
                }

            } else {
                if ( typeof(data) == 'string' && /^(\{|%7B|\[{)/.test(data) ) {
                    try {
                        data = JSON.parse(data)
                    } catch (err) {
                        data = {
                            status    : 500,
                            error     : data
                        }
                        self.emit('query#complete', data)
                    }
                }

                if ( data.status && !/^2/.test(data.status) && typeof(local.options.conf.server.coreConfiguration.statusCodes[data.status]) != 'undefined' ) {
                    self.emit('query#complete', data)
                } else {
                    self.emit('query#complete', false, data)
                }
            }
            
            client.close();
            
        });
               
        if ( typeof(body) != 'undefined' && body != '' ) {
            req.end(body);
        } else {
            req.end();
        } 
        
        return {
            onComplete  : function(cb) {
                self.once('query#complete', function(err, data){
                    client.close();  
                    if ( typeof(data) == 'string' && /^(\{|%7B|\[{)/.test(data) ) {
                        try {
                            data = JSON.parse(data)
                        } catch (err) {
                            data = {
                                status    : 500,
                                error     : data
                            }
                        }
                    }

                    if ( data.status && !/^2/.test(data.status) && typeof(local.options.conf.server.coreConfiguration.statusCodes[data.status]) != 'undefined') {
                        cb(data)
                    } else {
                        cb(err, data)
                    }
                })
            }
        }
    }


    /**
     * forward404Unless
     *
     * @param {boolean} condition
     * @param {object} req
     * @param {object} res
     *
     * @callback [ next ]
     * @param {string | boolean} err
     *
     * @return {string | boolean} err
     * */
    this.forward404Unless = function(condition, req, res, next) {
        var pathname = req.url;

        if (!condition) {
            self.throwError(res, 404, 'Page not found\n' + pathname);
            var err = new Error('Page not found\n' + pathname);
            if ( typeof(next) != 'undefined')
                next(err)
            else
                return err
        } else {
            if ( typeof(next) != 'undefined' )
                next(false)
            else
                return false
        }
    }

    /**
     * Get all Params
     * */
    var getParams = function(req) {

        req.getParams = function() {
            // copy
            var params = JSON.parse(JSON.stringify(req.params));
            switch( req.method.toLowerCase() ) {
                case 'get':
                    params = merge(params, req.get, true);
                    break;

                case 'post':
                    params = merge(params, req.post, true);
                    break;

                case 'put':
                    params = merge(params, req.put, true);
                    break;

                case 'delete':
                    params = merge(params, req.delete, true);
                    break;
            }

            return params
        }

        req.getParam = function(name) {
            // copy
            var param = null, params = JSON.parse(JSON.stringify(req.params));
            switch( req.method.toLowerCase() ) {
                case 'get':
                    param = req.get[name];
                    break;

                case 'post':
                    param = req.post[name];
                    break;

                case 'put':
                    param= req.put[name];
                    break;

                case 'delete':
                    param = req.delete[name];
                    break;
            }

            return param
        }
    }

    /**
     * Get config
     *
     * @param {string} [name] - Conf name without extension.
     * @return {object} config
     *
     * TODO - Protect result
     * */
    this.getConfig = function(name) {
        var config = null;

        if ( typeof(name) != 'undefined' ) {
            try {
                // needs to be read only
                config = JSON.stringify(local.options.conf.content[name]);
                return JSON.parse(config)
            } catch (err) {
                return undefined
            }
        } else {
            config = JSON.stringify(local.options.conf);
            return JSON.parse(config)
        }
    }

    /**
     * Get locales
     *
     * @param {string} [shortCountryCode] - e.g. EN
     *
     * @return {object} locales
     * */
    this.getLocales = function (shortCountryCode) {

        var userLocales = local.options.conf.locales;

        if ( typeof(shortCountryCode) != 'undefined' ) {

            var locales         = new Collection( getContext('gina').locales );

            try {
                userLocales = locales.findOne({ lang: userLangCode }).content
            } catch (err) {
                console.warn('language code `'+ userLangCode +'` not handled to setup locales: replacing by `en`');
                userLocales = locales.findOne({ lang: 'en' }).content // by default
            }
        }


        /**
         * Get countries list
         *
         * @param {string} [code] - e.g.: short, long, fifa, m49
         *
         * @return {object} countries - countries code & value list
         * */
        var getCountries = function (code) {
            var list = {}, cde = 'short', name = null;

            if ( typeof(code) != 'undefined' && typeof(userLocales[0][code]) == 'string' ) {
                cde = code
            } else if ( typeof(code) != 'undefined' ) (
                console.warn('`'+ code +'` not supported : sticking with `short` code')
            )

            for ( var i = 0, len = userLocales.length; i< len; ++i ) {

                if (userLocales[i][cde]) {

                    name = userLocales[i].full || userLocales[i].officialName.short;

                    if ( name )
                        list[ userLocales[i][cde] ] = name;
                }
            }

            return list
        }

        return {
            'getCountries': getCountries
        }
    }

    /**
     * Get forms rules
     *
     * @param {string} [formId]
     *
     * @return {object} rules
     *
     * */
    this.getFormsRules = function (formId) {
        try {

            if ( typeof(formId) != 'undefined' ) {
                try {
                    formId = formId.replace(/\-/g, '.');
                    return JSON.parse(JSON.stringify(local.options.conf.content.forms)).rules[formId]
                } catch (err) {
                    self.throwError(err)
                }
            } else {
                return JSON.parse(JSON.stringify(local.options.conf.content.forms)).rules
            }

        } catch (err) {
            self.throwError(local.res, 500, err)
        }
    }

    /**
     * Throw error
     *
     * @param {object} [ res ]
     * @param {number} code
     * @param {string} msg
     *
     * @return {void}
     * */
    this.throwError = function(res, code, msg) {

        // preventing multiple call of self.throwError() when controller is rendering from another required controller
        if (local.options.renderingStack.length > 1) {
            return false
        }

        if (arguments.length == 1 && typeof(res) == 'object' ) {
            var code    = ( res && typeof(res.status) != 'undefined' ) ?  res.status : 500;
                //, msg   = res.stack || res.message || res.error
            var msg = {};

            if ( res instanceof Error) {
                msg.error   = res.message;
                msg.stack   = res.stack;
            } else {
                msg = JSON.parse(JSON.stringify(res))
            }

            var res   = local.res;

        } else if (arguments.length < 3) {
            var msg             = code || null
                , code          = res || 500
                , res           = local.res;
        } /**else if ( typeof(msg) != 'undefined' && msg instanceof Error ) {
            var err = JSON.parse(JSON.stringify(msg));
            msg = err.message;
            code = 
        }*/

        var req     = local.req;
        var next    = local.next;

        if (!res.headersSent) {
            if ( self.isXMLRequest() || !hasViews() || !local.options.isUsingTemplate ) {
                // allowing this.throwError(err)
                if ( typeof(code) == 'object' && !msg && typeof(code.status) != 'undefined' && typeof(code.error) != 'undefined' ) {
                    msg     = code.error || code.message;
                    code    = code.status || 500;
                }

                if ( !req.headers['content-type'] ) {
                    req.headers['content-type'] = local.options.conf.server.coreConfiguration.mime['json']
                }
                // Internet Explorer override
                if ( typeof(req.headers['user-agent']) != 'undefined' ) {
                    if ( /msie/i.test(req.headers['user-agent']) ) {
                        res.writeHead(code, "Content-Type", "text/plain")
                    } else {
                        res.writeHead(code, { 'Content-Type': req.headers['content-type']} )
                    }
                } else if ( typeof(req.headers['content-type']) != 'undefined' ) {
                    res.writeHead(code, { 'Content-Type': req.headers['content-type']} )
                } else {
                    res.writeHead(code, "Content-Type", local.options.conf.server.coreConfiguration.mime['json'])
                }

                console.error('[ BUNDLE ][ '+ local.options.conf.bundle +' ][ Controller ] '+ req.method +' ['+res.statusCode +'] '+ req.url);
                res.end(JSON.stringify({
                    status: code,
                    error: msg.error || msg,
                    stack: msg.stack
                }))
            } else {
                res.writeHead(code, { 'Content-Type': 'text/html'} );
                console.error(req.method +' ['+ res.statusCode +'] '+ req.url);

                //var msgString = msg.stack || msg.error || msg;
                var msgString = '<h1 class="status">Error '+ code +'.</h1>';
                var eCode = code.toString().substr(0,1);
                
                console.error('[ BUNDLE ][ '+ local.options.conf.bundle +' ][ Controller ] '+ req.method +' ['+res.statusCode +'] '+ req.url);
                if ( typeof(msg) == 'object' ) {

                    if (msg.title) {
                        msgString += '<pre class="'+ eCode +'xx title">'+ msg.title +'</pre>';
                    }

                    if (msg.error) {
                        msgString += '<pre class="'+ eCode +'xx message">'+ msg.error +'</pre>';
                    }

                    if (msg.message) {
                        msgString += '<pre class="'+ eCode +'xx message">'+ msg.message +'</pre>';
                    }

                    if (msg.stack) {

                        if (msg.error) {
                            msg.stack = msg.stack.replace(msg.error, '')
                        }

                        if (msg.message) {
                            msg.stack = msg.stack.replace(msg.message, '')
                        }

                        msg.stack = msg.stack.replace('Error:', '').replace(' ', '');
                        msgString += '<pre class="'+ eCode +'xx stack">'+ msg.stack +'</pre>';
                    }

                } else {
                    msgString += '<pre class="'+ eCode +'xx message">'+ msg +'</pre>';
                }

                res.end(msgString)
            }
        } else {
            if (typeof(next) != 'undefined')
                next();
        }
    }

    // converting references to objects
    var refToObj = function (arr){
        var tmp = null,
            curObj = {},
            obj = {},
            count = 0,
            data = {},
            last = null;
        for (var r in arr) {
            tmp = r.split(".");
            //Creating structure - Adding sub levels
            for (var o in tmp) {
                count++;
                if (last && typeof(obj[last]) == "undefined") {
                    curObj[last] = {};
                    if (count >= tmp.length) {
                        // assigning.
                        // !!! if null or undefined, it will be ignored while extending.
                        curObj[last][tmp[o]] = (arr[r]) ? arr[r] : "undefined";
                        last = null;
                        count = 0;
                        break
                    } else {
                        curObj[last][tmp[o]] = {}
                    }
                } else if (tmp.length === 1) { //Just one root var
                    curObj[tmp[o]] = (arr[r]) ? arr[r] : "undefined";
                    obj = curObj;
                    break
                }
                obj = curObj;
                last = tmp[o]
            }
            //data = merge(data, obj, true);
            data = merge(obj, data);
            obj = {};
            curObj = {}
        }
        return data
    }

    init()
};

SuperController = inherits(SuperController, EventEmitter);
module.exports = SuperController