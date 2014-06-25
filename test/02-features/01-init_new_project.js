var InitProject;

//imports
var fs = require('fs');
var spawn = require('child_process').spawn;
var helpers = require('helpers');

InitProject = function(conf, exports) {
    var self = this;
    var root = conf.root;
    var tmp = conf.tmp;
    var workspace = new _(conf.target);

    var makeProjectDone = false;
    var testProjectStructureDone = false;
    self.projectCreated = false;
    self.projectDefaultStructure = false;

    this.projectName = 'my_project'; // will be shared ib others tests


    var makeProject = function(callback) {
        makeProjectDone = true;

        var path = _( workspace.toString() );
        process.chdir(path);//CD command like.

        var outFile = _(__dirname+'/init_out.log');
        var errFile = _(__dirname+'/init_err.log');
        var out = fs.openSync(outFile, 'a');
        var err = fs.openSync(errFile, 'a');

        var init = spawn('node', [ '.geena', '--init', self.projectName ], {stdio: [ 'ignore', out, err ]});

        //init.stdout.setEncoding('utf8');
        init.on('stdout', function(code, data) {
            var str = data.toString();
            var lines = str.split(/(\r?\n)/g);
            if (/project \[ my_project \] ready/.test(lines) && !code) {
                callback(false)
            } else {
                callback('project init process stopped with error code ' + code)
            }
        });

        init.on('stderr',function (err) {
            var str = err.toString();
            var lines = str.split(/(\r?\n)/g);
            if (!str.match("Already on") ) {
                console.log(lines.join(""))
            }
        });

        init.on('close', function (code) {
            try {
                if (fs.existsSync(errFile)) {
                    init.emit('stderr', code, fs.readFileSync(errFile));
                    fs.unlinkSync(errFile)
                }
                if (fs.existsSync(outFile)) {
                    init.emit('stdout', code, fs.readFileSync(outFile));
                    fs.unlinkSync(outFile)
                }
            } catch (err) {
                callback(err.stack)
            }
        })
    }

    var testProjectStructure = function(callback) {
        try {
            testProjectStructureDone = true;
            var project = require(_(workspace.toString() + '/project.json') );
            var isConform = true;
            if (
                typeof(project['name']) == 'undefined' ||
                typeof(project['name']) != 'undefined' && project['name'] != self.projectName
            ) {
                isConform = false
            }
            callback(false, isConform)
        } catch(err) {
            callback(err)
        }
    }

    exports['Project Init'] = {

        setUp: function (callback) {
            if (!makeProjectDone) {
                makeProject( function(err){
                    if (!err) {
                        self.projectCreated = true
                    }
                    callback()
                })
            } else if (!testProjectStructureDone) {
                testProjectStructure( function(err, isConform) {
                    if (!err) {
                        self.projectDefaultStructure = isConform
                    }
                    callback()
                })
            } else {
                callback()
            }
        },

//        tearDown: function (callback) {
//            // clean up
//            callback();
//        },

        'Had created project file' : function(test) {
            test.equal(self.projectCreated, true);
            test.done()
        },

        'Project has default structure' : function(test) {
            test.equal(self.projectDefaultStructure, true);
            test.done()
        }
    }
};

module.exports = InitProject