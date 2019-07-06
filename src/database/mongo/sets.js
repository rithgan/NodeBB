'use strict';

module.exports = function (db, module) {
	var helpers = require('./helpers');

	module.setAdd = async function (key, value) {
		if (!Array.isArray(value)) {
			value = [value];
		}

		value = value.map(v => helpers.valueToString(v));

		await db.collection('objects').updateOne({
			_key: key,
		}, {
			$addToSet: {
				members: {
					$each: value,
				},
			},
		}, {
			upsert: true,
			w: 1,
		});
	};

	module.setsAdd = async function (keys, value) {
		if (!Array.isArray(keys) || !keys.length) {
			return;
		}

		if (!Array.isArray(value)) {
			value = [value];
		}

		value = value.map(v => helpers.valueToString(v));

		var bulk = db.collection('objects').initializeUnorderedBulkOp();

		for (var i = 0; i < keys.length; i += 1) {
			bulk.find({ _key: keys[i] }).upsert().updateOne({ $addToSet: {
				members: {
					$each: value,
				},
			} });
		}
		try {
			await bulk.execute();
		} catch (err) {
			if (err && err.message.startsWith('E11000 duplicate key error')) {
				return module.setsAdd(keys, value);
			}
			throw err;
		}
	};

	module.setRemove = async function (key, value) {
		if (!Array.isArray(value)) {
			value = [value];
		}

		value = value.map(v => helpers.valueToString(v));

		await db.collection('objects').updateMany({ _key: Array.isArray(key) ? { $in: key } : key }, { $pullAll: { members: value } });
	};

	module.setsRemove = async function (keys, value) {
		if (!Array.isArray(keys) || !keys.length) {
			return;
		}
		value = helpers.valueToString(value);

		await db.collection('objects').updateMany({ _key: { $in: keys } }, { $pull: { members: value } });
	};

	module.isSetMember = function (key, value, callback) {
		if (!key) {
			return callback(null, false);
		}
		value = helpers.valueToString(value);

		db.collection('objects').findOne({ _key: key, members: value }, { projection: { _id: 0, members: 0 } }, function (err, item) {
			callback(err, item !== null && item !== undefined);
		});
	};

	module.isSetMembers = function (key, values, callback) {
		if (!key || !Array.isArray(values) || !values.length) {
			return callback(null, []);
		}

		for (var i = 0; i < values.length; i += 1) {
			values[i] = helpers.valueToString(values[i]);
		}

		db.collection('objects').findOne({ _key: key }, { projection: { _id: 0, _key: 0 } }, function (err, items) {
			if (err) {
				return callback(err);
			}

			const membersSet = new Set(items && Array.isArray(items.members) ? items.members : []);
			values = values.map(value => membersSet.has(value));
			callback(null, values);
		});
	};

	module.isMemberOfSets = function (sets, value, callback) {
		if (!Array.isArray(sets) || !sets.length) {
			return callback(null, []);
		}
		value = helpers.valueToString(value);

		db.collection('objects').find({ _key: { $in: sets }, members: value }, { projection: { _id: 0, members: 0 } }).toArray(function (err, result) {
			if (err) {
				return callback(err);
			}
			var map = {};
			result.forEach(function (item) {
				map[item._key] = true;
			});

			result = sets.map(function (set) {
				return !!map[set];
			});

			callback(null, result);
		});
	};

	module.getSetMembers = function (key, callback) {
		if (!key) {
			return callback(null, []);
		}

		db.collection('objects').findOne({ _key: key }, { projection: { _id: 0, _key: 0 } }, function (err, data) {
			callback(err, data ? data.members : []);
		});
	};

	module.getSetsMembers = function (keys, callback) {
		if (!Array.isArray(keys) || !keys.length) {
			return callback(null, []);
		}
		db.collection('objects').find({ _key: { $in: keys } }, { projection: { _id: 0 } }).toArray(function (err, data) {
			if (err) {
				return callback(err);
			}

			var sets = {};
			data.forEach(function (set) {
				sets[set._key] = set.members || [];
			});

			var returnData = new Array(keys.length);
			for (var i = 0; i < keys.length; i += 1) {
				returnData[i] = sets[keys[i]] || [];
			}
			callback(null, returnData);
		});
	};

	module.setCount = function (key, callback) {
		if (!key) {
			return callback(null, 0);
		}
		db.collection('objects').findOne({ _key: key }, { projection: { _id: 0 } }, function (err, data) {
			callback(err, data ? data.members.length : 0);
		});
	};

	module.setsCount = function (keys, callback) {
		module.getSetsMembers(keys, function (err, setsMembers) {
			if (err) {
				return callback(err);
			}

			var counts = setsMembers.map(function (members) {
				return (members && members.length) || 0;
			});
			callback(null, counts);
		});
	};

	module.setRemoveRandom = function (key, callback) {
		callback = callback || function () {};
		db.collection('objects').findOne({ _key: key }, function (err, data) {
			if (err || !data) {
				return callback(err);
			}

			var randomIndex = Math.floor(Math.random() * data.members.length);
			var value = data.members[randomIndex];
			module.setRemove(data._key, value, function (err) {
				callback(err, value);
			});
		});
	};
};
