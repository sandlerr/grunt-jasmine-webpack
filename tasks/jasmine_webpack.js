/**
 * grunt-jasmine-webpack
 */

'use strict';

var path = require('path'),
    fs = require('fs'),

    _ = require('underscore'),
    rimraf = require('rimraf'),
    webpack = require('webpack'),

    jasmine = require('jasmine-core'),

    tempDir = '.grunt/grunt-jasmine-webpack';

module.exports = function(grunt) {

    var getTabs = function getTabs(indentLevel) {
        var ret = [];
        for (var i = 0; i < indentLevel; i++) {
            ret.push('  ');
        }

        return ret.join('');
    }

    grunt.registerMultiTask('jasmine_webpack', 'A plugin to run webpack tests via jasmine', function() {
        var done = this.async(),
            phantomjs = require('grunt-lib-phantomjs').init(grunt),

            options = this.options({
                specRunnerDest: '_SpecRunner.html',
                keepRunner: false,
                styles: [],
                specs: [],
                helpers: [],
                vendor: [],
                polyfills: []
            }),

            outdir = path.dirname(options.specRunnerDest),

            webpackConfig = _.defaults(options.webpack || {}, {
                devtool: 'eval',
                output: {
                    path: tempDir + '/specs',
                    filename: '[name].js',
                    libraryTarget: 'var'
                }
            }),

            entries = {},
            specFiles = [];

        // Webpack the test files.
        this.filesSrc.forEach(function(f) {
            var filename = path.basename(f, '.js');
            specFiles.push(
                path.relative(outdir, path.join(tempDir + '/specs', path.basename(f)))
            );
            entries[filename] = f;
        });

        webpackConfig.entry = entries;

        webpack(webpackConfig, function (err, stats) {
            if (stats.hasErrors()) {
                grunt.log.writeln("Got error when building webpack files: " + stats.toJson().errors);
                done();
                return;
            }

            var indentLevel = 0,
                totalSpecs = 0,
                failedSpecs = [];

            // Copy Jasmine files into temp dir.
            [].concat(
                jasmine.files.cssFiles,
                jasmine.files.jsFiles,
                jasmine.files.bootFiles
            ).forEach(function (file) {
                grunt.file.copy(
                    path.join(jasmine.files.path, file),
                    path.join(tempDir, file)
                );
            });

            grunt.file.copy(
                __dirname + '/reporters/phantom-reporter.js',
                path.join(tempDir, 'reporter.js')
            );

            grunt.file.write(
                options.specRunnerDest,
                _.template(grunt.file.read(__dirname + '/templates/SpecRunner.tmpl'))({
                    css: jasmine.files.cssFiles.map(function (cssFile) {
                        return path.relative(outdir, path.join(tempDir, cssFile));
                    }),
                    scripts: {
                        polyfills: options.polyfills,
                        jasmine: jasmine.files.jsFiles.map(function (jsFile) {
                            return path.relative(outdir, path.join(tempDir, jsFile));
                        }),
                        specs: specFiles,
                        helpers: options.helpers,
                        vendor: options.vendor,
                        src: options.src,
                        boot: jasmine.files.bootFiles.map(function (bootFile) {
                            return path.relative(outdir, path.join(tempDir, bootFile));
                        }),
                        reporters: [path.relative(outdir, path.join(tempDir, 'reporter.js'))]
                    }
                })
            );

            // RUN TESTS HERE.
            phantomjs.spawn(options.specRunnerDest, {
                failCode: 90,
                options: {},
                done: function (err) {
                    if (err) {
                        grunt.log.error(err);
                    }

                    // Clean up.
                    if (!options.keepRunner) {
                        fs.unlink(options.specRunnerDest);
                        rimraf.sync(tempDir);
                    }

                    done();
                }
            });

            phantomjs.on('jasmine.done', function () {
                grunt.log.ok('Jasmine suite finished.');
                grunt.log.ok('Results: ' + (totalSpecs - failedSpecs.length) + '/' + totalSpecs + ' passed. There was ' + failedSpecs.length + ' failure.');
                grunt.log.writeln('');

                failedSpecs.forEach(function (failedSpec) {
                    grunt.log.error(failedSpec.fullName);
                    failedSpec.failedExpectations.forEach(function (fe) {
                        grunt.log.error(fe.message);
                    });
                    grunt.log.writeln('');
                });
                phantomjs.halt();
            });

            phantomjs.on('jasmine.started', function () {
                grunt.log.ok('Jasmine suite started');
            });

            phantomjs.on('jasmine.suiteStarted', function (suiteMetadata) {
                // Increment indent level.
                indentLevel++;
                grunt.log.writeln(getTabs(indentLevel) + suiteMetadata.description);
            });

            phantomjs.on('jasmine.suiteDone', function (suiteMetadata) {
                indentLevel--;
                if (indentLevel < 2) {
                    grunt.log.writeln('');
                }
            });

            phantomjs.on('jasmine.specStarted', function (specMetadata) {
                indentLevel++;
                totalSpecs++;
            });

            phantomjs.on('jasmine.specDone', function (specMetadata) {
                specMetadata.passedExpectations.forEach(function (expectation) {
                    grunt.log.writeln(getTabs(indentLevel) + "OK: " + specMetadata.description);
                });

                specMetadata.failedExpectations.forEach(function (expectation) {
                    grunt.log.writeln(getTabs(indentLevel) + "FAIL: " + specMetadata.description);
                });

                if (specMetadata.failedExpectations.length !== 0) {
                    failedSpecs.push(specMetadata);
                }

                indentLevel--;
            });
        });
    });
};
