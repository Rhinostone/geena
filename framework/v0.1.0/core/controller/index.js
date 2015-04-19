var lib = require('../../lib') || require.cache[require.resolve('../../lib')];
var inherits = lib.inherits;
var helpers = lib.helpers;
var context = helpers.context;
try {
    //first load only
    //if (process.argv[3]) {
    //    context.configure( JSON.parse(process.argv[3]) );
    //}

} catch (err) {
    throw new Error('no context found !\n'+ err.stack)
}

var cacheless = (process.env.IS_CACHELESS == 'false') ? false : true;
var mainPath = './controller';
var frameworkPath = './controller.framework';

if (cacheless) {
    delete require.cache[require.resolve(mainPath)];
    delete require.cache[require.resolve(frameworkPath)];
}

var Controller = require(mainPath);
Controller.prototype.framework = require(frameworkPath);

module.exports = Controller