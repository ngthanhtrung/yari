'use strict';

var path = require('path'),
    blanket = require('blanket');

module.exports = function (grunt) {

    require('load-grunt-tasks')(grunt);

    grunt.initConfig({
        jshint: {
            options: {
                jshintrc: '.jshintrc'
            },
            all: [
                '{lib,test}/**/*.js',
                'Gruntfile.js',
            ]
        },
        mochaTest: {
            all: {
                options: {
                    require: function instrumentFiles() {
                        blanket({
                            pattern: path.join(__dirname, 'lib')
                        });
                    }
                },
                src: [ 'test/**/*.js' ]
            },
            'htmlCov': {
                options: {
                    reporter: 'html-cov',
                    quiet: true,
                    captureFile: 'coverage.html'
                },
                src: '<%= mochaTest.all.src %>'
            },
            'travisCov': {
                options: {
                    reporter: 'travis-cov'
                },
                src: '<%= mochaTest.all.src %>'
            }
        }
    });

    var exitProcess;

    grunt.registerTask('coverage:before', function () {
        exitProcess = process.exit;
        process.exit = function (code) {
            if (code) {
                process.exit = exitProcess;
                grunt.warn('Coverage does not be satisfied!');
            }
        };
    });

    grunt.registerTask('coverage:after', function () {
        process.exit = exitProcess;
    });

    grunt.registerTask('test', 'Run JSHint and tests', [
        'jshint:all',

        'mochaTest:all',
        'mochaTest:htmlCov',

        'coverage:before',
        'mochaTest:travisCov',
        'coverage:after'
    ]);

    grunt.registerTask('default', [ 'test' ]);

};
