/**
 * Collection cLass
 * Allows you to handle your own collections as you would normaly with mongodb
 * Dependencies :
 *  - lib/merge
 *  - uuid
 *
 *
 * @param {array} collection
 * @param {object} [options]
 *
 * @return {object} instance
 *
 * Collection::find
 *  @param {object} filter
 *      eg.: { uid: 'someUID' }
 *      eg.: { type: 'not null', country: 'France' } // `AND` clause
 *      eg.: { country: 'The Hashemite Kingdom of Jordan' }, { country: 'Libanon'} // `OR` clause 
 *      eg.: { 'obj.prop': true }
 *      eg.: { 'contacts[*].name': 'Doe' } // `WITHIN` (array|collection) clause
 *      eg.: { lastUpdate: '>= 2016-12-01T00:00:00' }
 *      eg.: { activity: null }
 *      eg.: { isActive: false }
 *
 *  @return {array} result
 *
 * Collection::findOne
 *  @param {object} filter
 *  @return {object|array|string} result
 *
 * Collection::update
 *  @param {object} filter
 *  @param {object} set
 *
 *  @return {array} result
 *      rasult.raw will give result without chaining
 *
 * */
function Collection(content, option) {

    var isGFFCtx        = ( ( typeof(module) !== 'undefined' ) && module.exports ) ? false : true;
    var uuid            = (isGFFCtx) ? require('vendor/uuid') : require('uuid');
    var merge           = (isGFFCtx) ? require('lib/merge') : require('../../../lib/merge');

    var instance        = this;

    var defaultOptions = {
        'useLocalStorage': false,
        'locale': 'en' // get settigs.region, or user.region
    };

    var content     = (content) ? JSON.parse(JSON.stringify(content)) : [] // original content -> not to be touched
        , options   = (typeof(options) == 'object') ? merge(options, defaultOptions) : defaultOptions
        , keywords  = ['not null'] // TODO - null, exists (`true` if property is defined)
        ;
    ;

   

    if ( !Array.isArray(content) )
        throw new Error('`new Collection([content] [, option] )`: `content` argument must me an Array !');

    var entryUuid = null;
    this.indexes = []; // uuids are generated for each entry
    

    this['find'] = function() {

        var withOrClause = false;
        if ( typeof(arguments[arguments.length-1]) == 'boolean' ) {
            withOrClause = arguments[arguments.length-1];
            delete arguments[arguments.length-1];
            --arguments.length;
        }

        var filtersStr  = JSON.stringify(arguments);
        var filters     = JSON.parse(filtersStr);

        if ( typeof(filters) != 'undefined' && typeof(filters) !== 'object' ) {
            throw new Error('filter must be an object');
        } else if ( typeof(filters) != 'undefined' && filters.count() > 0 ) {
            
            var filter              = null
                , condition         = null
                , i                 = 0
                , tmpContent        = ( Array.isArray(this) && !withOrClause) ? this : JSON.parse(JSON.stringify(content))
                , resultObj         = {}
                , result            = []
                , localeLowerCase   = ''
                , re                = null
                , field             = null
                , fieldWithin       = null
                , value             = null
                ;

            var matched = null
                , filterIsArray = null
                , searchResult = null;

            var search = function(filter, field, _content, matched) {

                if (filter === null && _content === null) { // null case

                    ++matched;

                } else if (filter && keywords.indexOf(localeLowerCase) > -1 && localeLowerCase == 'not null' && typeof (_content) != 'undefined' && typeof (_content) !== 'object' && _content != 'null' && _content != 'undefined') {
                    
                    if (result.indexOf(_content) < 0) {
                        ++matched;
                    }

                } else if (typeof (_content) != 'undefined' && typeof (_content) !== 'object' && /(<|>|=)/.test(filter) && !/undefined|function/.test(typeof (_content))) { // with operations
                    // looking for a datetime ?
                    if (
                        /(\d{4})\-(\d{2})\-(\d{2})(\s+|T)(\d{2}):(\d{2}):(\d{2})/.test(_content)
                        && /(\d{4})\-(\d{2})\-(\d{2})(\s+|T)(\d{2}):(\d{2}):(\d{2})/.test(filter)
                    ) {

                        if (eval(_content.replace(/(\d{4})\-(\d{2})\-(\d{2})(\s+|T)(\d{2}):(\d{2}):(\d{2})/, 'new Date("$&")') + filter.replace(/(\d{4})\-(\d{2})\-(\d{2})(\s+|T)(\d{2}):(\d{2}):(\d{2})/, 'new Date("$&")'))) {

                            ++matched;
                        }

                    } else if (eval(_content + filter)) {
                        ++matched;
                    }

                } else if (typeof (_content) != 'undefined' && typeof (_content) !== 'object' && _content === filter) {

                    ++matched;
                }

                return {
                    matched: matched
                }
            }

            var searchThroughProp = function(filter, f, _content, matched) {

                var field = f.split(/\./g);
                field = field[field.length - 1];
                re = new RegExp('("' + field + '":\\w+)');
                
                var value = JSON.stringify(_content).match(re);

                if (value && value.length > 0) {
                    value = value[1].split(/:/)[1];
                    //value = value[0].split(/:/)[1];
                    
                    if (/(<|>|=)/.test(filter)) {

                        // looking for a datetime ?
                        if (
                            /(\d{4})\-(\d{2})\-(\d{2})(\s+|T)(\d{2}):(\d{2}):(\d{2})/.test(value)
                            && /(\d{4})\-(\d{2})\-(\d{2})(\s+|T)(\d{2}):(\d{2}):(\d{2})/.test(filter)
                        ) {

                            if (eval(value.replace(/(\d{4})\-(\d{2})\-(\d{2})(\s+|T)(\d{2}):(\d{2}):(\d{2})/, 'new Date("$&")') + filter.replace(/(\d{4})\-(\d{2})\-(\d{2})(\s+|T)(\d{2}):(\d{2}):(\d{2})/, 'new Date("$&")'))) {

                                ++matched;
                            }

                        } else if (eval(value + filter)) {

                            ++matched;
                        }

                    } else {
                        if (value == filter) {
                            ++matched;
                        }
                    }

                }

                

                return {
                    matched: matched
                }
            }

            // if one of the entry matches the given filter, tag the whole entry as matched
            var searchWithin = function(filter, f, _content, matched, i) {
                
                var collectionName  = null
                    , collection    = null
                    , arr           = null
                    , field         = null;

               
                arr = f.split(/\[\*\]/g);
                collectionName = arr[0].replace(/\[\*\]/, '');// only take the first collection
                collection = _content[ collectionName ];
                
                
                field = arr[1];
                if (/^\./.test(field) )
                    field = field.substr(1);

                var subMatched = 0;
                if (collection) {
                    
                    for (var c = 0, cLen = collection.length; c < cLen; ++c) {
                        // cases with _filter.prop
                        if (/\./.test(field)) {

                            searchResult = searchThroughProp(filter, field, collection[c], subMatched);
                            subMatched = searchResult.matched;

                        } else { // normal case

                            searchResult = search(filter, field, collection[c], subMatched);
                            subMatched = searchResult.matched;
                        }

                        if (subMatched > 0) break;
                    }
                }
                
                return {
                    matched: (matched + subMatched)
                }
            }

            

            for (var o in tmpContent) {

                if (!tmpContent[o]) {
                    tmpContent[o] = {}
                }
                
                if (!/undefined|function/.test(typeof (tmpContent[o]))) {
                    for (var l = 0, lLen = filters.count(); l<lLen; ++l) {
                        filter = filters[l];
                        condition = filter.count();

                        matched = 0;
                        for (var f in filter) {
                            if ( typeof(filter[f]) == 'undefined' ) throw new Error('filter `'+f+'` cannot be left undefined');

                            localeLowerCase = ( typeof(filter[f]) != 'boolean' && filter[f] !== null ) ? filter[f].toLocaleLowerCase() : filter[f];
                            
                            // cases with tmpContent.prop
                            if (/\./.test(f)) {
                                //JSON.stringify(tmpContent[o]).match(/("gross":\w+)/)[1].split(/:/)[1]

                                // detect if array|collection case
                                if (/\[\*\]/.test(f)) {

                                    searchResult = searchWithin(filter[f], f, tmpContent[o], matched, 0);
                                    matched = searchResult.matched;

                                } else {

                                    searchResult = searchThroughProp(filter[f], f, tmpContent[o], matched);
                                    matched = searchResult.matched;
                                }

                            } else { // normal case

                                searchResult = search(filter[f], f, tmpContent[o][f], matched);
                                matched = searchResult.matched;
                            }
                        }

                        if (matched == condition) { // all conditions must be fulfilled to match                           
    
                            result[i] = tmpContent[o];
                            // indexing
                            entryUuid                   = uuid.v4();
                            instance.indexes[i]         = JSON.parse(JSON.stringify(tmpContent[o]));
                            instance.indexes[i]._uuid   = entryUuid;
                            
                            ++i;
                        }

                    }
                }
            }
        } else {
            result = content
        }

        
        // TODO - remove this
        if (withOrClause) {
            // merging with previous result (this)
            result  = merge(this, result, true)
        }

        // chaining
        result.insert   = instance.insert;
        result.notIn    = instance.notIn;
        result.find     = instance.find;
        result.update   = instance.update;
        result.replace  = instance.replace;
        result.or       = instance.or;
        result.findOne  = instance.findOne;
        result.limit    = instance.limit;
        result.orderBy  = instance.orderBy;
        result.delete   = instance.delete;
        result.toRaw = instance.toRaw;

        return result
    }

    this['or'] = function () {
        arguments[arguments.length] = true;
        ++arguments.length;

        return instance.find.apply(this, arguments);
    }

    this['limit'] = function(resultLimit) {
        if ( typeof(resultLimit) == 'undefined' || typeof(resultLimit) != 'number' ) {
            throw new Error('[Collection::result->limit(resultLimit)] : `resultLimit` parametter must by a `number`')
        }

        var result = Array.isArray(this) ? this : JSON.parse(JSON.stringify(content));

        //resultLimit
        result = result.splice(0, resultLimit);

        // chaining
        result.insert   = instance.insert;
        result.update   = instance.update;
        result.replace  = instance.replace;
        result.notIn    = instance.notIn;
        result.findOne  = instance.findOne;
        result.orderBy  = instance.orderBy;
        result.delete   = instance.delete;
        result.toRaw    = instance.toRaw;

        return result
    }

    /** 
     * findOne
     * 
     * E.g.: 
     *  - new Collection(projects).findOne({name: 'My Project'})
     *  - new Collection(projects).findOne({name: 'my project'}, {name: { isCaseSensitive: false }})
     * 
     * 
     * Available options :
     *  isCaseSensitive: [true|false] - set to true by default
     * 
     * @param {object} filter
     * @param {object} [options]
     * 
    */
    this['findOne'] = function(filter, options) {
        
        if ( typeof(filter) !== 'object' ) {
            throw new Error('filter must be an object');
        } else {
            
            var condition = filter.count()
                , i                 = 0
                , tmpContent        = Array.isArray(this) ? this : JSON.parse(JSON.stringify(content))
                , result            = []
                , localeLowerCase   = '';

            var re          = null
            , reValidCount  = null
            , searchOptCount = null;

            var optionsRules = {
                isCaseSensitive: {
                    false: {
                        re: '^%s$',
                        modifiers: 'i'
                    },
                    true: {
                        re: '^%s$'
                    }
                }
            }

            if (condition == 0) return null;

            for (var o in tmpContent) {
                for (var f in filter) {
                    if ( typeof(filter[f]) == 'undefined' ) throw new Error('filter `'+f+'` cannot be left undefined');

                    localeLowerCase = ( typeof(filter[f]) != 'boolean' ) ? filter[f].toLocaleLowerCase() : filter[f];
                    // NOT NULL case
                    if ( filter[f] && keywords.indexOf(localeLowerCase) > -1 && localeLowerCase == 'not null' && typeof(tmpContent[o][f]) != 'undefined' && typeof(tmpContent[o][f]) !== 'object' && tmpContent[o][f] === filter[f] && tmpContent[o][f] != 'null' && tmpContent[o][f] != 'undefined' ) {
                        if (result.indexOf(tmpContent[o][f]) < 0 ) {
                            ++i;
                            if (i === condition) result = tmpContent[o]
                        }

                    } else if ( typeof(tmpContent[o][f]) != 'undefined' && typeof(tmpContent[o][f]) !== 'object' ) {
                        
                        if ( typeof(options) != 'undefined' && typeof(options[f]) != 'undefined'  ) {
                            reValidCount    = 0;
                            searchOptCount  = options[f].count();
                            
                            for (var opt in options[f]) {
                                optionsRules[opt][options[f][opt]].re = optionsRules[opt][options[f][opt]].re.replace(/\%s/, filter[f]);

                                if (optionsRules[opt][options[f][opt]].modifiers) {
                                    re = new RegExp(optionsRules[opt][options[f][opt]].re, optionsRules[opt][options[f][opt]].modifiers);   
                                } else {
                                    re = new RegExp(optionsRules[opt][options[f][opt]].re);
                                }
                                
                                if ( re.test(tmpContent[o][f]) ) {
                                    ++reValidCount
                                }
                            }

                            if (reValidCount == searchOptCount) {
                                ++i;
                                if (i === condition) result = tmpContent[o]
                            }
                        } else if ( tmpContent[o][f] === filter[f] ) { // normal case
                            ++i;
                            if (i === condition) result = tmpContent[o]
                        }
                        
                    } else if ( filter[f] === null && tmpContent[o][f] === null ) { // NULL case
                        ++i;
                        if (i === condition) result = tmpContent[o]
                    }
                }
            }
        }

        result.toRaw = instance.toRaw;

        return ( Array.isArray(result) && !result.length ) ? null : result
    }



    /** 
     * notIn
     * 
     * 
     * 
     * @param {object|array} filters|arrayToFilter - works like find filterss
     * @param {string} [key]
    */
    this['notIn'] =  function(filters){

        var key = null; // comparison key
        var result = null;

        if ( typeof(arguments[arguments.length-1]) == 'string' ) {
            key = arguments[arguments.length - 1];
            delete arguments[arguments.length - 1];
        }

        if (typeof (filters) == 'undefined' || typeof(filters) != 'object' ) {
            throw new Error('[ Collection ][ notIn ] `filters` argument must be defined: Array or Filter Object(s) expected');
        }

        var currentResult = JSON.parse(JSON.stringify((Array.isArray(instance.indexes)) ? instance.indexes : this ));
        
        var foundResults = null;
        if ( Array.isArray(arguments[0]) ) {
            foundResults = arguments[0];
        } else {
            foundResults = instance.find.apply(this, arguments) || [];
        }
        
        if (foundResults.length > 0 && currentResult.length > 0) {
            // check key
            if (key && typeof(currentResult[0][key]) == 'undefined' ) {
                throw new Error('[ Collection ][ notIn ] `key` not valid');
            } else if (!key) {
                key = '_uuid'
            }

            // for every single result found
            for (var f = 0, fLen = instance.indexes.length; f < fLen; ++f) {
                onRemoved:
                for (var c = 0, cLen = currentResult.length; c < cLen; ++c) {
                    // when matched, we want to remove those not in current result
                    if (typeof (currentResult[c]) != 'undefined' && currentResult[c].hasOwnProperty(key) && currentResult[c][key] === instance.indexes[f][key]) {
                        currentResult.splice(c,1);
                        break onRemoved;
                    }
                }
            }
        }

        result          = currentResult;
        result.notIn    = instance.notIn;
        result.limit    = instance.limit;
        result.find     = instance.find;
        result.findOne  = instance.findOne;
        result.insert   = instance.insert;
        result.replace  = instance.replace;
        result.update   = instance.update;
        result.orderBy  = instance.orderBy;
        result.delete   = instance.delete;
        result.toRaw    = instance.toRaw;

        return result
    }

    this['insert'] = function (set) {

        if ( typeof(set) !== 'object' ) {
            throw new Error('filter must be an object');
        } else {

            var tmpContent = Array.isArray(this) ? this :  content;
            tmpContent.push(set);

            var index = tmpContent.length-1;
            instance.indexes[index] = tmpContent[index];
            instance.indexes[ index ]._uuid = uuid.v4();

            var result = instance.indexes;
        }

        // chaining
        result.limit    = instance.limit;
        result.find     = instance.find;
        result.findOne  = instance.findOne;
        result.update   = instance.update;
        result.replace  = instance.replace;
        result.orderBy  = instance.orderBy;
        result.notIn    = instance.notIn;
        result.delete   = instance.delete;
        result.toRaw = instance.toRaw;

        return result
    }

    this['update'] = function(filter, set) {
        if ( typeof(filter) !== 'object' ) {
            throw new Error('filter must be an object');
        } else {
            var condition           = filter.count()
                , i                 = 0
                , localeLowerCase   = ''
                , result            = Array.isArray(this) ? this : JSON.parse(JSON.stringify(content));

            for (var o in result) {
                for (var f in filter) {
                    if ( typeof(filter[f]) == 'undefined' ) throw new Error('filter `'+f+'` cannot be left undefined');

                    localeLowerCase = ( typeof(filter[f]) != 'boolean' ) ? filter[f].toLocaleLowerCase() : filter[f];
                    if ( filter[f] && keywords.indexOf(localeLowerCase) > -1 && localeLowerCase == 'not null' && typeof(result[o][f]) != 'undefined' && typeof(result[o][f]) !== 'object' && result[o][f] != 'null' && result[o][f] != 'undefined' ) {

                        result[o] = merge(result[o], set, true);

                    } else if ( typeof(result[o][f]) != 'undefined' && typeof(result[o][f]) !== 'object' && result[o][f] === filter[f] ) {
                        ++i;
                        if (i === condition) result[o] = merge(result[o], set, true);
                    } else if ( typeof(result[o][f]) != 'undefined' && typeof(result[o][f]) !== 'object' && result[o][f] === filter[f]) {

                        result[o] = merge(result[o], set, true);
                    }
                }
            }
        }

        // chaining
        result.limit    = instance.limit;
        result.find     = instance.find;
        result.findOne  = instance.findOne;
        result.insert   = instance.insert;
        result.update   = instance.update;
        result.replace  = instance.replace;
        result.orderBy  = instance.orderBy;
        result.notIn    = instance.notIn;
        result.delete   = instance.delete;
        result.toRaw = instance.toRaw;

        return result
    }

    this['replace'] = function(filter, set) {
        if ( typeof(filter) !== 'object' ) {
            throw new Error('filter must be an object');
        } else {
            var condition           = filter.count()
                , i                 = 0
                , localeLowerCase   = ''
                , result            = Array.isArray(this) ? this : JSON.parse(JSON.stringify(content));

            for (var o in result) {
                for (var f in filter) {
                    if ( typeof(filter[f]) == 'undefined' ) throw new Error('filter `'+f+'` cannot be left undefined');

                    localeLowerCase = ( typeof(filter[f]) != 'boolean' ) ? filter[f].toLocaleLowerCase() : filter[f];
                    if ( filter[f] && keywords.indexOf(localeLowerCase) > -1 && localeLowerCase == 'not null' && typeof(result[o][f]) != 'undefined' && typeof(result[o][f]) !== 'object' && result[o][f] != 'null' && result[o][f] != 'undefined' ) {

                        result[o] = set;

                    } else if ( typeof(result[o][f]) != 'undefined' && typeof(result[o][f]) !== 'object' && result[o][f] === filter[f] ) {
                        ++i;
                        if (i === condition) result[o] = set;
                    } else if ( typeof(result[o][f]) != 'undefined' && typeof(result[o][f]) !== 'object' && result[o][f] === filter[f]) {

                        result[o] = set;
                    }
                }
            }
        }

        // chaining
        result.limit    = instance.limit;
        result.find     = instance.find;
        result.findOne  = instance.findOne;
        result.insert   = instance.insert;
        result.update   = instance.update;
        result.orderBy  = instance.orderBy;
        result.notIn    = instance.notIn;
        result.delete   = instance.delete;
        result.toRaw = instance.toRaw;

        return result
    }

    this['delete'] = function(filter) {

        if ( typeof(filter) !== 'object' ) {
            throw new Error('filter must be an object');
        } else {

            var _content    = Array.isArray(this) ? JSON.parse(JSON.stringify(this)) : JSON.parse(JSON.stringify(content))
                , result    = JSON.parse(JSON.stringify(_content))
            ;

            
            var found = instance.find.apply(this, arguments);

            if (found.length > 0) {
                result = found.notIn(result)
            }

            result.limit = instance.limit;
            result.find = instance.find;
            result.findOne = instance.findOne;
            result.insert = instance.insert;
            result.update = instance.update;
            result.replace = instance.replace;
            result.orderBy = instance.orderBy;
            result.notIn = instance.notIn;
            result.toRaw = instance.toRaw;

            return result
        }
    }


    var sortKeywords = [ 'asc', 'desc' ];
    /**
     * sort
     *
     * @param {object|array} filter
     * */
    this['orderBy'] = function (filter) {

        if ( typeof(filter) == 'undefined' )
            throw new Error('[ Collection->sort(filter) ] where `filter` must not be empty or null' );


        var variableContent = (Array.isArray(this)) ? this : JSON.parse(JSON.stringify(content));
        return sortResult(filter, variableContent)
    }

    /**
     * sortResult
     * ref.:
     *  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort
     *  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/localeCompare#Browser_compatibility
     *
     * e.g.:
     *  .orderBy({ name: 'asc' })
     *
     *  // overriding filters -> last filter is always right
     *  .orderBy([ { updatedAt : 'desc'}, { name: 'asc' } ])
     *
     *  // combining filters -> the first one is always right
     *  .orderBy({ updatedAt : 'desc'}, { name: 'asc' })
     *
     * @param {object|array} filter
     * */
    var sortResult = function (filter, content) {
        if ( typeof(filter) != 'object') {
            throw new Error('`filter` parametter must be an object or an array')
        }

        var condition           = filter.count()
            , sortOp            = {}
            , key               = null
            , prop              = null
            , result            = []
            ;

        if (condition == 0) return null;


        // asc
        sortOp['asc'] = function (prop, content) {
            return content.sort(function onAscSort(a, b) {
                
                if ( typeof(a) == 'string' && a != '') {
                    // var fieldA = a.toUpperCase(); // ignore upper and lowercase
                    // var fieldB = b.toUpperCase(); // ignore upper and lowercase
                    //
                    // if (fieldA < fieldB) {
                    //     return -1;
                    // }
                    //
                    // if (fieldA > fieldB) {
                    //     return 1;
                    // }
                    //
                    // // fields must be equal
                    // return 0;

                    return a.localeCompare(b)

                } else if ( typeof(a) == 'boolean' || typeof(b) == 'boolean' ) {

                    if (typeof(a) == 'boolean' ) {
                        a = (a) ? 1: 0;
                    }
                    if (typeof(b) == 'boolean' ) {
                        b = (b) ? 1: 0;
                    }

                    if (a > b) {
                        return 1;
                    }
                    if (a < b) {
                        return -1;
                    }

                    // a must be equal to b
                    return 0;

                } else if ( typeof(a) == 'object' ) {
                    try {
                        
                        // ?? check if instance of Date ? right now, it seems to be working without ...
                        //if ( /\[object Date\]/.test(Object.prototype.toString.call(a[prop])) ) {
                            
                        if (typeof (a[prop]) == 'number') {

                            a[prop] = '' + a[prop];
                            b[prop] = '' + b[prop];
                        }

                        return a[prop].localeCompare(b[prop], { numeric: true })
                        
                    } catch (err) {
                        return -1
                    }

                } else {
                    if (a > b) {
                        return 1;
                    }
                    if (a < b) {
                        return -1;
                    }
                    // a must be equal to b
                    return 0;
                }
            })
        }

        // desc
        sortOp['desc'] = function (prop, content) {
            return sortOp['asc'](prop, content).reverse()
        }

        if ( Array.isArray(filter) ) {

            for (var f = 0, len = filter.length; f < len; ++f) {

                prop    = Object.keys(filter[f])[0];
                key     = filter[prop];

                result  = sortOp[key](prop, content);
            }
        } else {

            if (filter.count() > 1) {
                
                for (var f in filter) {
                    prop    = f;
                    key     = filter[prop];

                    result  = sortOp[key](prop, content);

                }

            } else {
                prop    = Object.keys(filter)[0];
                key     = filter[prop];

                result  = sortOp[key](prop, content);
            }
        }



        // chaining
        result.find     = instance.find;
        result.findOne  = instance.findOne;
        result.limit    = instance.limit;
        result.notIn    = instance.notIn;
        result.insert   = instance.insert;
        result.update   = instance.update;
        result.replace  = instance.replace;
        result.delete   = instance.delete;
        result.toRaw    = instance.toRaw;
        
        return result
    };

    /**
     * toRaw
     * Trasnform result into a storable format
     *
     * @param {object|array} result
     * */
    this['toRaw'] = function(result) {

        var result = ( Array.isArray(this) ) ? this :  content;
        if (result && typeof (result.length) != 'undefined' && typeof(result[0]._uuid) != 'undefined' ) {
            for (var i = 0, len = result.length; i < len; ++i) {
                delete result[i]._uuid
            }
        }

        return JSON.parse(JSON.stringify(result))
    }

    return this.find();
};

if ( ( typeof(module) !== 'undefined' ) && module.exports ) {
    // Publish as node.js module
    module.exports = Collection
} else if ( typeof(define) === 'function' && define.amd) {
    // Publish as AMD module
    define(function() { return Collection })
}