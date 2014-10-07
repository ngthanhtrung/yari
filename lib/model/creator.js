'use strict';

var inflection = require('inflection'),

    clone = require('clone'),
    extend = require('extend'),
    shien = require('shien'),

    when = require('when'),

    type = require('../type'),

    util = require('../utils/core'),
    filter = require('../utils/filter'),
    validation = require('../utils/validation'),

    BaseModel = require('./base').BaseModel,

    toString = Object.prototype.toString;

var ModelCreator = exports.ModelCreator = function (name, db, modelize, opts) {
    var o = opts || {};

    this.db = db;
    this.modelize = modelize;

    this.model = function () {
        BaseModel.apply(this, arguments);
    };

    shien.assign(this.model, BaseModel);
    shien.assign(this.model.prototype, BaseModel.prototype);

    this.model.modelName = name;
    this.model.modelize = modelize;

    var cn = o.collection || inflection.pluralize(name);
    cn = inflection.camelize(cn, true);

    this.model.collectionName = cn;
    this.model.collection = db.collection(cn);

    this.filters = [];
    this.validations = [];
};

ModelCreator.prototype = new function () {
    /* jshint latedef: nofunc */

    var defineProperty = Object.defineProperty,
        slice = Array.prototype.slice,

        addons = [{
            singular: 'filter',
            plural: 'filters',
            verb: 'filter',
            handler: filter,
            arrayMethod: applyArrayFiltering
        }, {
            singular: 'validation',
            plural: 'validations',
            verb: 'validate',
            handler: validation,
            arrayMethod: applyArrayValidation
        }],

        singularToPlural = {};

    addons.forEach(function (addon) {
        singularToPlural[addon.singular] = addon.plural;
    });

    this.constant = function (constants) {
        shien.assign(this, constants);
        shien.assign(this.model, constants);
    };

    function defineNestedProperty(path, property) {
        /* jshint validthis: true */

        for (var field in property) {
            if (property.hasOwnProperty(field)) {
                this.property(path + '.' + field, property[field]);
            }
        }
    }

    function defineSimpleProperty(path, property) {
        /* jshint validthis: true */

        var t = type.get(property.type);

        if (property.required) {
            this.validations.push({
                path: path,
                humanized: property.humanized,
                method: validation.validateRequired
            });
        }

        if (typeof property.enum === 'object' &&
                Array.isArray(property.enum.enum) &&
                        typeof property.enum.translate === 'function') {
            property.translate = property.enum.translate;
            property.enum = property.enum.enum;
        }

        if (Array.isArray(property.enum)) {
            var e = property.enum.filter(function iterateEnumerationValues(item) {
                return item;
            });

            if (!e.length) {
                throw new Error('Empty enumeration array!');
            }

            this.validations.push({
                path: path,
                humanized: property.humanized,
                method: validation.validateEnum.bind(validation, e, property.translate)
            });
        }

        property.bypass || (property.bypass = []);

        addons.forEach(function iterateAddonTypes(addon) {
            // Filter and validation of the type of the property itself
            if (property.bypass.indexOf(addon.singular) < 0 &&
                    typeof t[addon.verb] === 'function') {
                this[addon.plural].push({
                    path: path,
                    humanized: property.humanized,
                    method: t[addon.verb]
                });
            }

            // Additional user-defined filters and validations
            var udas = property[addon.plural];

            if (!Array.isArray(udas)) {
                udas = (udas ? [ udas ] : []);
            }

            udas.forEach(function iterateUserDefinedAddons(uda) {
                var method;
                if (typeof uda === 'string') {
                    method = addon.handler[uda];
                } else {
                    method = uda;
                }

                if (typeof method === 'function') {
                    this[addon.plural].push({
                        path: path,
                        humanized: property.humanized,
                        method: method
                    });
                }
            }, this);
        }, this);
    }

    function defineArrayProperty(path, property) {
        /* jshint validthis: true */

        if (property.type.length !== 1) {
            throw new Error('Bad array property');
        }

        var count = {};

        addons.forEach(function iterateAddonTypes(addon) {
            count[addon.plural] = this[addon.plural].length;
        }, this);

        this.property(path + '.0', property.type[0]);

        addons.forEach(function iterateAddonTypes(addon) {
            var arrayAddons = this[addon.plural].splice(count[addon.plural]);
            if (!arrayAddons.length) {
                return;
            }

            var prefixPattern = '^' + path.replace('.', '\\.') + '\\.0\\.?',
                prefixRegex = new RegExp(prefixPattern);

            arrayAddons.forEach(function (arrayAddon) {
                arrayAddon.path = arrayAddon.path.replace(prefixRegex, '');
            });

            this[addon.plural].push({
                path: path,
                humanized: property.humanized,
                method: addon.arrayMethod.bind(this, arrayAddons)
            });
        }, this);
    }

    this.property = function (path, property) {
        if (typeof path !== 'string') {
            throw new Error('Invalid property path!');
        }

        var t = type.get(property);

        if (t) {
            property = {
                type: property
            };

        } else if (typeof property !== 'object') {
            throw new Error('Bad property!');
        }

        t || (t = type.get(property.type));

        if (!t) {
            defineNestedProperty.call(this, path, property);
            return;
        }

        if (!property.humanized) {
            var h = path;

            h = h.replace(/\.0(\.|$)/, '\'s element$1');
            h = h.replace('.', ' ');
            h = inflection.transform(h, [ 'tableize', 'singularize' ]);
            h = inflection.humanize(h, true);

            property.humanized = h;
        }

        defineSimpleProperty.call(this, path, property);

        if (t === type.CustomArray) {
            defineArrayProperty.call(this, path, property);
        }

        // TODO: Indexes and more validations
    };

    this.schema = function (schema) {
        for (var field in schema) {
            if (schema.hasOwnProperty(field)) {
                this.property(field, schema[field]);
            }
        }
    };

    function isString(value) {
        return toString.call(value) === '[object String]';
    }

    function isObject(value) {
        return toString.call(value) === '[object Object]';
    }

    function compileMapping(mapping, prefix, compiledPrefix) {
        prefix = prefix || '';
        compiledPrefix = compiledPrefix || '';

        var compiled = { _: mapping._ || {} };

        delete mapping._;
        delete mapping._$;

        for (var key in mapping) {
            if (!mapping.hasOwnProperty(key)) {
                continue;
            }

            var value = mapping[key];
            var fullKey = prefix + key;

            if (isString(value) && key !== '$') {
                if (key === '$') {
                    compiled[prefix.slice(0, -1)] = compiledPrefix.slice(0, -1);
                }
                else {
                    compiled[fullKey] = compiledPrefix + value;
                }
            }
            else if (isObject(value)) {
                compiled[fullKey] = compiledPrefix + (value.$ || key);

                extend(
                    compiled,
                    compileMapping(
                        value,
                        fullKey + '.',
                        compiled[fullKey] + '.'
                    )
                );
            }
        }

        return compiled;
    }

    function compileInverseMapping(mapping) {
        var ret = { _: mapping._$ || {} };

        delete mapping._;
        delete mapping._$;

        var compiled = compileMapping(mapping);

        for (var key in compiled) {
            if (compiled.hasOwnProperty(key) && key !== '_') {
                ret[compiled[key]] = key;
            }
        }

        return ret;
    }

    this.map = function (mapping) {
        var m1 = clone(mapping);
        var m2 = clone(mapping);

        shien.assign(this.model, {
            mapping: compileMapping(m1),
            inverseMapping: compileInverseMapping(m2)
        });
    };

    function transform(object, mapping, prefix) {
        prefix = prefix || '';

        var transformed = {};

        for (var key in object) {
            if (!object.hasOwnProperty(key)) {
                continue;
            }

            var value = object[key];

            var isSystemKey = !key.indexOf('$');
            var fullKey;

            if (isSystemKey) {
                fullKey = key;
            }
            else {
                fullKey = prefix + key;

                if (mapping[fullKey]) {
                    fullKey = mapping[fullKey];
                }
            }

            if (!~key.indexOf('.')) {
                fullKey = fullKey.split('.').pop();
            }

            if (isObject(value) &&
                !(value instanceof type.ObjectId)) {

                value = transform(
                    value,
                    mapping,
                    prefix + (isSystemKey ? '' : key + '.')
                );
            }

            var fn = (mapping._ && mapping._[fullKey]);

            if (typeof fn === 'function') {
                value = fn(value);
            }

            transformed[fullKey] = value;
        }

        return transformed;
    }

    function defineIdProperty(field, opts) {
        /* jshint validthis: true */

        var property = { type: type.ObjectId };

        opts.required && (property.required = true);
        opts.humanized && (property.humanized = opts.humanized);

        this.property(field, property);
    }

    function pluckIds(docs, field) {
        field = field || '_id';

        if (Array.isArray(docs)) {
            return docs.map(function iterateDocuments(doc) {
                return doc[field];
            });
        }

        return docs[field];
    }

    function createIdCondition(field, ids) {
        var cond = {};
        cond[field] = (Array.isArray(ids) ? { $in: ids } : ids);
        return cond;
    }

    this.belongsTo = function (target, opts) {
        var o = opts || {},

            field = o.field || util.field(target),
            method = util.method(field),

            queryOpts = o.query;

        defineIdProperty.call(this, field, o);

        this.staticMethod(method, function (docs, opts) {
            var targetModel = this.modelize(target),

                multi = Array.isArray(docs),
                ids = pluckIds(docs, field),
                cond = createIdCondition('_id', ids),

                query = targetModel[multi ? 'find' : 'findOne']
                    .call(targetModel, cond);

            if (multi) {
                query.limit(+Infinity);
            }

            return query.apply(
                    shien.assign({}, queryOpts, opts)
                )
                .exec()
                .then(function foundTargetDocuments(targetDocs) {
                    if (!multi) {
                        docs[field] = targetDocs;
                        return docs;
                    }

                    if (!Array.isArray(targetDocs)) {
                        targetDocs = (targetDocs ? [ targetDocs ] : []);
                    }

                    var hash = {};

                    targetDocs.forEach(function iterateTargetDocuments(targetDoc) {
                        if (targetDoc) {
                            hash[targetDoc._id.toString()] = targetDoc;
                        }
                    });

                    docs.forEach(function iterateDocuments(doc) {
                        var targetDocId = doc[field],
                            targetDoc = (targetDocId ? hash[targetDocId.toString()] : null);

                        doc[field] = (targetDoc ? targetDoc : null);
                    });

                    return docs;
                });
        });

        this.instantiate(method);
    };

    function has(target, opts, many) {
        /* jshint validthis: true */

        var inverseField = opts.inverse || util.field(this.model.modelName),

            field = opts.field || util.field(target, many),
            method = util.method(field),

            queryOpts = opts.query;

        this.staticMethod(method, function (docs, opts) {
            var targetModel = this.modelize(target),

                multi = Array.isArray(docs),
                ids = pluckIds(docs),
                cond = createIdCondition(inverseField, ids),

                query = targetModel[many || multi ? 'find' : 'findOne']
                    .call(targetModel, cond);

            if (many || multi) {
                query.limit(+Infinity);
            }

            return query.apply(
                    shien.assign({}, queryOpts, opts)
                )
                .exec()
                .then(function foundTargetDocuments(targetDocs) {
                    if (!multi) {
                        docs = [ docs ];
                    }

                    if (targetDocs && !Array.isArray(targetDocs)) {
                        targetDocs = [ targetDocs ];
                    }

                    var hash = {};

                    docs.forEach(function iterateDocuments(doc) {
                        doc[field] = (many ? [] : null);
                        hash[doc._id.toString()] = doc;
                    });

                    if (targetDocs) {
                        targetDocs.forEach(function iterateTargetDocuments(targetDoc) {
                            var docId = targetDoc[inverseField],
                                doc = (docId ? hash[docId.toString()] : null);

                            if (doc) {
                                if (many) {
                                    doc[field].push(targetDoc);
                                } else {
                                    doc[field] = targetDoc;
                                }
                            }
                        });
                    }

                    if (!multi) {
                        docs = docs[0];
                    }

                    return docs;
                });
        });

        this.instantiate(method);
    }

    this.hasOne = function (target, opts) {
        return has.call(this, target, opts || {});
    };

    this.hasMany = function (target, opts) {
        return has.call(this, target, opts || {}, true);
    };

    this.index = function () {
    };

    this.plugin = function (plugin, opts) {
        if (typeof plugin !== 'function') {
            throw new Error('Invalid plugin!');
        }

        plugin.call(this, opts || {});
    };

    this.get = function (path, fn) {
        defineProperty(this.model.prototype, path, {
            configurable: true,
            enumerable: true,
            get: fn
        });
    };

    this.set = function (path, fn) {
        defineProperty(this.model.prototype, path, {
            configurable: true,
            enumerable: true,
            writable: true,
            set: fn
        });
    };

    this.staticMethod = function (method, fn) {
        if (this.model[method]) {
            throw new Error('Conflict occurred! Static method\'s name is already used!');
        }

        this.model[method] = fn;
    };

    this.method = function (method, fn) {
        var proto = this.model.prototype;

        if (proto[method]) {
            throw new Error('Conflict occurred! Method name is already used!');
        }

        proto[method] = fn;
    };

    this.instantiate = function (method) {
        var model = this.model;

        model.prototype[method] = function () {
            var args = slice.call(arguments);
            args.unshift(this);
            return model[method].apply(model, args);
        };
    };

    function processErrorPromises(promises) {
        return when.settle(promises)
            .then(function mergeValues(descriptors) {
                var errs = [];

                descriptors.forEach(function (descriptor) {
                    errs = errs.concat(descriptor.value || descriptor.reason);
                });

                return errs;
            })
            .then(function truncateEmptyValues(errs) {
                return errs.filter(function (err) {
                    return err;
                });
            });
    }

    function applyArrayFiltering(filters, v) {
        if (!Array.isArray(v)) {
            return;
        }

        return v.map(function (item) {
            if (typeof item !== 'undefined') {
                return applyFiltering(item, filters, true);
            }
        });
    }

    function applyArrayValidation(validations, v) {
        if (!Array.isArray(v)) {
            return;
        }

        var promises = [];

        v.forEach(function (item) {
            promises.push(
                applyValidation(item, validations)
            );
        });

        return processErrorPromises(promises);
    }

    function applyFiltering(obj, filters, allowRoot) {
        filters.forEach(function (filter) {
            var v = shien.object.get(obj, filter.path);

            if (typeof v !== 'undefined') {
                v = filter.method(v);
            }

            if (typeof v !== 'undefined') {
                if (filter.path.length) {
                    shien.object.set(obj, filter.path, v);
                } else if (allowRoot) {
                    obj = v;
                }
            }
        });

        return obj;
    }

    function applyValidation(obj, validations) {
        var promises = [];

        validations.forEach(function (validation) {
            var v = shien.object.get(obj, validation.path),
                ret = validation.method(v);

            ret = when.resolve(ret)
                .then(function transformMessage(err) {
                    if (err instanceof Error) {
                        err.message = shien.format(err.message, { field: validation.humanized });
                    }
                    return err;
                });

            promises.push(ret);
        });

        return processErrorPromises(promises);
    }

    this.create = function () {
        if (!this.model.normalize) {
            var self = this;

            this.model.normalize = function (obj) {
                return applyFiltering(obj, self.filters);
            };

            this.model.validate = function (obj) {
                this.normalize(obj);
                return applyValidation(obj, self.validations);
            };

            this.model.transform = function (obj) {
                return transform(obj, this.mapping || {});
            };

            this.model.inverseTransform = function (obj) {
                return transform(obj, this.inverseMapping || {});
            };

            this.model.prototype.normalize = function () {
                return self.model.normalize(this);
            };

            this.model.prototype.validate = function () {
                return self.model.validate(this);
            };
        }

        return this.model;
    };

};
