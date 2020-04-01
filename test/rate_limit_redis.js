const assert = require('assert');
const RateLimitRedis = require('../lib/rate_limit_redis');

const TEST_IP = '192.168.0.1';
const TIMEFRAME_SEC = 6;
const RATE_LIMIT = 100;

describe('Rate Limit Redis Object Test', function() {

	const options = {
		// redis: {},
		timeframe: TIMEFRAME_SEC,
		limit: RATE_LIMIT,
		ignore: [
			{
				path: '/some/path/to/ignore',
				method: 'get'
			}
		],
		whitelist: [ '192.168.20.20' ]
	};
	
	const rateLimitRedis = new RateLimitRedis(options);
	
	after ( function ()  {
		return rateLimitRedis.reset(TEST_IP);
	});
	

	it('should create a new request record', async function() {
		
		let result;
		
		try {
			result = await rateLimitRedis.setNewRequestCount(TEST_IP);
		} catch (err) {
			return Promise.reject(err);
		}
		
		assert.strictEqual(result, true);
		
	});

	it('should retrieve request count', async function() {
		
		let result;
		
		try {
			result = await rateLimitRedis.getRequestCount(TEST_IP);
		} catch (err) {
			return Promise.reject(err);
		}
		
		assert.strictEqual(result, 1);
		
	});

	it('should increment request count', async function() {
		
		let result;
		
		try {
			result = await rateLimitRedis.incrementRequestCount(TEST_IP);
		} catch (err) {
			return Promise.reject(err);
		}
		
		assert.strictEqual(result, 2);
		
	});

	it('should retrieve time left before rate limit expires', async function() {
		
		let result;
		
		try {
			result = await rateLimitRedis.getTimeLeft(TEST_IP);
		} catch (err) {
			return Promise.reject(err);
		}

		assert.ok(result);
		
	});

	it('should reset the request count', async function() {
		
		let result;
		
		try {
			result = await rateLimitRedis.reset(TEST_IP);
		} catch (err) {
			return Promise.reject(err);
		}

		assert.strictEqual(result, true);
		
	});

	it('should have reset the request count', async function() {
		
		let result;
		
		try {
			result = await rateLimitRedis.getRequestCount(TEST_IP);
		} catch (err) {
			return Promise.reject(err);
		}
		
		assert.strictEqual(result, null);
		
	});

	it('should make a single request', async function() {
		
		const request = {
			ip: TEST_IP
		};
		
		let result;

		try {
			result = await rateLimitRedis.process(request);
		} catch (err) {
			return Promise.reject(err);
		}
		
		assert.ok(result);
		assert.strictEqual(result.hasOwnProperty('status'), true);
		assert.strictEqual(result.hasOwnProperty('limit'), true);
		assert.strictEqual(result.hasOwnProperty('remaining'), true);
		assert.strictEqual(result.hasOwnProperty('retry'), false);
		assert.strictEqual(result.hasOwnProperty('error'), false);
		assert.strictEqual(result.status, 200);
		assert.strictEqual(result.limit, RATE_LIMIT);
		assert.strictEqual(result.remaining, RATE_LIMIT-1);
		

	});

	it('should ignore rate limit at path', async function() {

		const request = {
			ip: TEST_IP,
			url: options.ignore[0].path,
			method: options.ignore[0].method,
		};
		
		let result;

		try {
			result = await rateLimitRedis.process(request);
		} catch (err) {
			return Promise.reject(err);
		}
		
		assert.ok(result);
		assert.strictEqual(result.hasOwnProperty('status'), true);
		assert.strictEqual(result.hasOwnProperty('limit'), false);
		assert.strictEqual(result.hasOwnProperty('remaining'), false);
		assert.strictEqual(result.hasOwnProperty('retry'), false);
		assert.strictEqual(result.hasOwnProperty('error'), false);
		assert.strictEqual(result.status, 200);

	});

	it('should ignore rate limit on ip', async function() {

		const request = {
			ip: options.whitelist[0],
		};
		
		let result;

		try {
			result = await rateLimitRedis.process(request);
		} catch (err) {
			return Promise.reject(err);
		}
		
		assert.ok(result);
		assert.strictEqual(result.hasOwnProperty('status'), true);
		assert.strictEqual(result.hasOwnProperty('limit'), false);
		assert.strictEqual(result.hasOwnProperty('remaining'), false);
		assert.strictEqual(result.hasOwnProperty('retry'), false);
		assert.strictEqual(result.hasOwnProperty('error'), false);
		assert.strictEqual(result.status, 200);

	});

	it('should violate rate limit', async function ()  {
		
		// this.timeout(2000);
		
		// reset the test
		try {
			await rateLimitRedis.reset(TEST_IP);
		} catch (err) {
			return Promise.reject(err);
		}
		
		const request = {
			ip: TEST_IP
		};
		
		for (let i = 1; i <= RATE_LIMIT; i++) {

			let response;

			try {
				response = await rateLimitRedis.process(request);
			} catch (err) {
				return Promise.reject(err);
			}
			
			// console.log(i, response.status, response.remaining);
			
			assert.strictEqual(response.hasOwnProperty('status'), true);
			assert.strictEqual(response.hasOwnProperty('limit'), true);
			assert.strictEqual(response.hasOwnProperty('remaining'), true);
			assert.strictEqual(response.limit, RATE_LIMIT);

			
			if (i < RATE_LIMIT) {
				assert.strictEqual(response.status, 200);
				assert.strictEqual(response.remaining, RATE_LIMIT-i);
				assert.strictEqual(response.hasOwnProperty('retry'), false);
				assert.strictEqual(response.hasOwnProperty('error'), false);
			} else {
				assert.strictEqual(response.status, 429);
				assert.strictEqual(response.remaining, 0);
				assert.strictEqual(response.hasOwnProperty('retry'), true);
				assert.strictEqual(response.hasOwnProperty('error'), true);
				assert.strictEqual( isNaN( response.retry ), false );
			}

		}
		
		
	});

	
	

});
