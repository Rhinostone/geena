/*
 * This file is part of the geena package.
 * Copyright (c) 2014 Rhinostone <geena@rhinostone.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * @class Model class
 *
 *
 * @package     Geena
 * @namespace
 * @author      Rhinostone <geena@rhinostone.com>
 * @api         Public
 */

var Model;

//Imports.
var fs      = require('fs');
var Module  = require('module');
var utils   = require('geena').utils;
var inherits = utils.inherits;
    //UtilsConfig = Utils.Config(),
//dev     = require(_(getPath('geena.core')'/dev') ),
var util    = require('util'),
    EventEmitter  = require('events').EventEmitter;

/**
 * Model Constructor
 * @constructor
 * */
Model = function(namespace) {
    var _this = this;
    var _configuration = null;
    var _connector = null;
    var _locals = null;
    var config = getContext('geena.config');
    var utilsConfig = getContext('geena.utils.config');


    /**
     * Init
     *
     * @param {string} namesapce
     *
     * @private
     * */
    var init = function(namespace) {
        //TODO - if instance...


        if ( typeof(namespace) == "undefined" || namespace == "") {
            log.error('geena', 'MODEL:ERR:1', 'EEMPTY: Model namespace', __stack);
        }

        var namespace = namespace.split(/\//g);
        var bundle = namespace[0];
        namespace.shift();
        //Capitalize - Normalize
        if (namespace.length > 1) {
            for (var i; i<namespace.length; ++i)
                namespace[i] = namespace[i].substring(0, 1).toUpperCase() + namespace[i].substring(1);

            var model = namespace.join(".");
        } else {
            //Dir name.
            var modelDirName = namespace[0];
            namespace[0] = namespace[0].substring(0, 1).toUpperCase() + namespace[0].substring(1);
            var model = namespace[0];
        }
        _connector = model.toLowerCase();

        console.log("\nBundle", bundle);
        console.log("Model", model);
        _this.name = model;


        getConfig(bundle, function onGetConfigDone(err, conf){

            if (!err) {
                _configuration = conf.connector;
                console.log("CONF READY ", model, conf.path);
                //TODO - More controls...

                //For now, I just need the F..ing entity name.
                var modelPath       = _(conf.path + '/' + modelDirName);
                var entitiesPath    = _(modelPath + '/entities');
                console.log('models scaning... ', entitiesPath, fs.existsSync(entitiesPath));
                if (!fs.existsSync(entitiesPath)) {
                    _this.emit('model#ready', 'no entities found for your model: [ ' + model + ' ]', model);
                    //console.log("[ "+model+" ]no entities found...")
                } else {
                    var connectorPath   = _(modelPath + '/lib/connector.js');
                    //Getting Entities Manager.
                    var exists = fs.existsSync(connectorPath);
                    //fs.exists(connectorPath, function (exists){
                    if (exists) {
                        if (process.env.IS_CACHELESS)
                            delete require.cache[_(connectorPath, true)];

                        var Connector = require(connectorPath);

                        _this.connect( Connector, function onConnect(err, conn){
                            if (err) {
                                console.error(err.stack);
                                _this.emit('model#ready', err.stack, null);
                            } else {
                                //Getting Entities Manager.
                                if (process.env.IS_CACHELESS)
                                    delete require.cache[_(conf.path, true)];

                                var entitiesManager = new require(conf.path)()[model];
                                getModel(entitiesManager, modelPath, entitiesPath, conn)
                            }
                        });
                    } else {
                        //Means that no connector was found in models.
                        if (process.env.IS_CACHELESS)
                            delete require.cache[_(conf.path, true)];

                        var entitiesManager = new require(conf.path)()[model];
                        getModel(entitiesManager, modelPath, entitiesPath, undefined)
                    }
                    //});
                }

            } else {
                _this.emit('model#ready', 'no configuration found for your model: ' + model, model);
                console.log("no configuration found...")
            }
        });


    };

    this.connect = function(Connector, callback) {

        var connector = new Connector( _this.getConfig(_connector) );
        connector.onReady( function(err, conn){
            callback(err, conn);
        })
    };

    /**
     * Get Model configuration
     *
     * @param {string} bundle
     *
     * @callback callback
     * @param {boolean|string} err - Error Status response
     * @param {object} conf - Configuration response
     *
     * @private
     * */
    var getConfig = function(bundle, callback) {
        var configuration = config.getInstance(bundle);

        //console.log("getting for bundle ", bundle, configuration);
        utilsConfig.get('geena', 'locals.json', function(err, locals){
            _locals = locals;
            if ( typeof(configuration) != 'undefined' ) {
                var tmp = JSON.stringify(configuration);
                tmp = JSON.parse(tmp);
                console.log("getting config for bundle ", bundle);
                //Response.
                var confObj = {
                    connector   : tmp.content.connector,
                    path        : tmp.modelsPath,
                    locals      : locals
                };
                callback(false, confObj);
            } else {
                callback('Config not instantiated');
            }
        });
    };

    /**
     * Get Model Configuration
     *
     * @return {object|undefined} configuration
     * */
    this.getConfig = function(connector){
        var connector = ( typeof(connector) == 'undefined' ) ?  _connector : connector;

        if (_configuration) {
            return ( typeof(connector) != 'undefined' ) ? _configuration[connector] : undefined;
        } else {
            return undefined;
        }
    };



    /**
     * Get model
     *
     * @param {object} entitiesManager
     * @param {string} modelPath
     * @param {string} entitiesPath
     * @param {object} [conn]
     * */
    var getModel = function(entitiesManager, modelPath, entitiesPath, conn) {
        var suffix = 'Entity';

        var that = this;
        var i = that.i = that.i || 0;
        var files = fs.readdirSync(entitiesPath);
        //fs.readdir(entitiesPath, function(err, files){

            var entityName, exluded = ['index.js'];

            var produce = function(entityName, i){
                console.log("producing ", _this.name,":",entityName, i);
                if (_locals == undefined) {
                    throw new Error("geena/utils/.gna not found.");
                }
                //if (err) log.error('geena', 'MODEL:ERR:2', 'EEMPTY: EntitySuper' + err, __stack);

                var filename = _locals.paths.geena + '/model/entity.js';
                try {
                    if (process.env.IS_CACHELESS)
                        delete require.cache[_(filename, true)];

                    var ModelEntityClass = require(filename);
                    //var modelEntity = new ModelEntityClass( _this.getConfig(_connector), conn );

                    if (process.env.IS_CACHELESS)
                        delete require.cache[_(entitiesPath + '/' + files[i], true)];

                    var EntityClass = require( _(entitiesPath + '/' + files[i]) );
                    //var entity = new EntityClass();


                    var ab = inherits(EntityClass, ModelEntityClass);
                    //Inherits.
                    entity = new  ab( _this.getConfig(_connector), conn);

                    //Overriding.
                    entitiesManager[entityName] = entity;
                    //console.log("show me ", entityName, entitiesManager[entityName],"\n\n");
                } catch (err) {
                    console.error(err.stack);
                    _this.emit('model#ready', err, undefined);
                }
                console.log('::::i '+i+' vs '+(files.length-1))
                if (i == files.length-1) {
                    //finished.
                    _this.emit('model#ready', false, entitiesManager);
                }
                ++that.i;


                //console.log("EntityManager  \n",  entitiesManager,"\n VS \n",  Entity);

            };//EO produce.

            if (that.i < files.length) {
                    while (that.i < files.length) {
                        //console.log("TEsting entity exclusion ",  i + ": ", exluded.indexOf(files[i]) != -1 && files[i].match(/.js/), files[i]);
                        if ( files[that.i].match(/.js/) && exluded.indexOf(files[that.i]) == -1 && !files[that.i].match(/.json/)) {
                            entityName = files[that.i].replace(/.js/, "") + suffix;
                            entityName = entityName.substring(0, 1).toUpperCase() + entityName.substring(1);
                            console.log("entityName  : ", entityName );
                            produce(entityName, that.i);
                        } else if (that.i == files.length-1) {
                            //console.log("All done !");
                            _this.emit('model#ready', false, entitiesManager);
                        } else {
                            ++that.i;
                        }
                    }//EO while.
            }
        //});//EO Fs.readdir.
    };


    return {
        onReady : function(callback) {

            _this.on('model#ready', function(err, entities) {
                //entities == null when the database server isn't start.
                if ( err ) {
                    //var entityName = entities;
                    console.log(err.stack)
                    //console.log('No entities found for [ '+ _this.name +':'+ entityName +'].\n 1) Check if the database is started.\n2) Check if exists: /models/entities/'+ entityName);
                } else {
                    console.log('!! found entities ', entities);
                }
                callback(err, entities );
            });
            init(namespace)
        }
    }
};

util.inherits(Model, EventEmitter);
module.exports = Model;
