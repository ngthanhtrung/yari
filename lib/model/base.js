'use strict';

var shien = require('shien'),

    when = require('when'),
    nodeFn = require('when/node/function'),

    ObjectId = require('../type').ObjectId,
    Query = require('../query').Query;

var BaseModel = exports.BaseModel = function (obj) {
    if (typeof obj !== 'object' || !obj || !obj._id) {
        this._id = new ObjectId();
    }

    shien.assign(this, obj);
};

shien.assign(BaseModel, new function () {

    function createId(id) {
        return (id instanceof ObjectId ? id : new ObjectId(id));
    }

    this.find = function (cond) {
        return new Query(this, cond);
    };

    this.findOne = function (cond) {
        return new Query(this, cond, true);
    };

    this.findOneById = function (id) {
        return this.findOne({
            _id: createId(id)
        });
    };

    this.findByIds = function (ids) {
        if (!Array.isArray(ids)) {
            throw new Error('Bad ID array!');
        }

        return this.find({
            _id: { $in: ids.map(createId) }
        });
    };

    function count(crit, single) {
        /* jshint validthis: true */

        var fn = this.collection.count.bind(this.collection),
            args = [],
            opts = {};

        if (typeof crit !== 'undefined') {
            args.push(crit);
        }

        if (single) {
            opts.limit = 1;
        }

        args.push(opts);

        return nodeFn.apply(fn, args);
    }

    this.count = function (crit) {
        return count.call(this, crit);
    };

    this.countOne = function (crit) {
        return count.call(this, crit, true);
    };

    this.insert = function (docs) {
        var fn = this.collection.insert.bind(this.collection),
            p = nodeFn.call(fn, docs, { w: 1 });

        if (!Array.isArray(docs)) {
            p = p.then(function (docs) {
                return (Array.isArray(docs) && docs.length ? docs[0] : docs);
            });
        }

        return p;
    };

    function update(crit, upd, single) {
        /* jshint validthis: true */

        var fn = this.collection.update.bind(this.collection),
            opts = { w: 1 };

        if (!single) {
            opts.multi = true;
        }

        return nodeFn.call(fn, crit, upd, opts)
            .then(function (res) {
                return (Array.isArray(res) && res.length ? res[0] : res);
            });
    }

    this.update = function (crit, upd) {
        return update.call(this, crit, upd);
    };

    this.updateOne = function (crit, upd) {
        return update.call(this, crit, upd, true);
    };

    this.save = function (doc) {
        var fn = this.collection.save.bind(this.collection);
        return nodeFn.call(fn, doc, { w: 1 });
    };

    function remove(crit, single) {
        /* jshint validthis: true */

        var collection = this.collection,
            args = [],
            opts = { w: 1 };

        if (typeof crit !== 'undefined') {
            args.push(crit);
        }

        if (single) {
            opts.single = true;
        }

        args.push(opts);

        return when.promise(function (resolve, reject) {
            args.push(function (err, res) {
                if (err) {
                    return reject(err);
                }
                resolve(res);
            });

            collection.remove.apply(collection, args);
        });
    }

    this.remove = function (crit) {
        return remove.call(this, crit);
    };

    this.removeOne = function (crit) {
        return remove.call(this, crit, true);
    };

});

BaseModel.prototype = new function () {

    this.base = function () {
        /* jshint proto: true */
        return this.__proto__.constructor;
    };

    this.toJSON = function () {
        /* jshint forin: false */

        var obj = {};

        for (var prop in this) {
            obj[prop] = this[prop];
        }

        return obj;
    };

};
