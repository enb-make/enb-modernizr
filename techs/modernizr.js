var vow = require('vow');
var vowFs = require('enb/lib/fs/async-fs');
var yaml = require('js-yaml');
var modernizr = require('ym-modernizr');
var File = require('enb-source-map/lib/file');

module.exports = require('enb/lib/build-flow').create()
    .name('modernizr-js')
    .target('target', '?.js')
    .defineOption('useSourceMap', true)
    .useSourceText('source', '?.source.js')
    .useFileList('deps.yaml')
    .builder(function (source, depFiles) {
        var modernizrFeatureIndex = {};
        var file = new File(this.node.resolvePath(this._target), this._useSourceMap);
        var sourcePath = this._source;
        var cache = this.node.getNodeCache(this._target);

        return vow.all(depFiles.map(function (fileInfo) {
            return vowFs.read(fileInfo.fullname, 'utf8').then(function (data) {
                var result = [];
                yaml.safeLoad(data).forEach(function (dep) {
                    if (typeof dep === 'object' && dep.modernizr) {
                        ([].concat(dep.modernizr)).forEach(function (feature) {
                            modernizrFeatureIndex[feature] = true;
                        });
                    }
                });
                return result;
            });
        })).then(function () {
            var modernizrFeatures = Object.keys(modernizrFeatureIndex);
            modernizrFeatures.sort(function (a, b) {
                return a > b ? 1 : -1;
            });
            var modernizrFeatureKey = modernizrFeatures.join(',');
            var prevModernizrFeatureKey = cache.get('modernizr-features');
            var prevModernizrResult = cache.get('modernizr-result');
            var modernizrPromise;

            if (prevModernizrFeatureKey === modernizrFeatureKey) {
                modernizrPromise = vow.when(prevModernizrResult);
            } else {
                if (modernizrFeatures.length > 0) {
                    var modernizrDefer = vow.defer();
                    modernizrPromise = modernizrDefer.promise();
                    modernizr.build({
                        'classPrefix': 'm-',
                        'options': [
                            'prefixedCSS',
                            'setClasses'
                        ],
                        'feature-detects': modernizrFeatures.map(function (feature) {
                            return 'test/' + feature;
                        })
                    }, function (result) {
                        modernizrDefer.resolve(result.code);
                    });
                } else {
                    modernizrPromise = vow.when('');
                }
            }
            return modernizrPromise.then(function (modernizrResult) {
                cache.set('modernizr-features', modernizrFeatureKey);
                cache.set('modernizr-result', modernizrResult);
                file.writeFileContent(sourcePath, source);
                file.writeContent(
                    'modules.define(\'modernizr\', function(provide) {\n' +
                        '(function(){' + modernizrResult + '})();\n' +
                        'var Modernizr = window.Modernizr;\n' +
                        'try { delete window.Modernizr; } catch (e) {}\n' +
                        'provide(Modernizr);\n' +
                    '});'
                );
                return file.render();
            });
        });
    })
    .createTech();
