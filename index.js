var https = require('https'),
    http = require('http'),
    fs = require('fs'),
    cheerio = require('cheerio'),
    async = require('async');

// list to store already processed links.
var LINKS = [];

// store results in this file.
var OUTPUTFILE = "./urls.txt";


/**
 * Extract URLS from a given HTML
 */
var extractLinks = function(data) {
    var $ = cheerio.load(data);
    var links = [];

    $('a').each(function() {
        var href = $(this).attr('href');
        if (href) {
            links.push(href);
        }
    });

    $('link').each(function() {
        var href = $(this).attr('href');
        if (href) {
            links.push(href);
        }
    });

    $('script').each(function() {
        var href = $(this).attr('src');
        if (href) {
            links.push(href);
        }
    });
    return links;
};

/**
 * Download a given URL and get HTML links
 */
var getRelatedLinks = function(url, callback) {
    var method = null;

    // process on HTTP or HTTPS urls
    if (url.indexOf('https') == 0) { method = https; }
    else if (url.indexOf('http') == 0) { method = http; }
    else {
        return callback(null, []);
    }

    var request = method.request(url, function(res) {
        var data = '';
        res.on('data', function(chunk) {
            data += chunk;
        });

        res.on('end', function() {
            var links = extractLinks(data);
            return callback(null, links);
        });
    });

    request.on('error', function(e) {
        return callback(e);
    });
    request.end();
};

/**
 * Check if given links have already been traversed.
 * This function uses an in memory hash to store traversed links (permantly stored
 * in a text file). For practical purposes a store like MongoDb should be used.
 */
var filterLinks = function(links) {
    var filteredLinks = [];
    links.forEach(function(link) {
        if (!LINKS.hasOwnProperty(link)) {
            LINKS[link] = true;
            filteredLinks.push(link);
        }
    });
    return filteredLinks;
};

/**
 * Given a list of items, convert it into batches.
 */
var batchify = function(itemList, batchSize) {
  var batchSize = batchSize || 5;
  var batches = [], currentBatch = [];

  itemList.forEach(function(item) {
      currentBatch.push(item);
      if (currentBatch.length == batchSize) {
        batches.push(currentBatch);
        currentBatch = [];
      }
  });
  if (currentBatch.length > 0) { batches.push(currentBatch); }

  return batches;
};

var crawlBatch = function(batch, callback) {
    async.each(batch, function(url, cb) {
        crawl(url, function() {
            return cb();
        });
    }, function() {
        return callback();
    })
}

/**
 * Crawl a given set of links. Divide into batches of 5 and parse in parallel.
 */
var crawlBatches = function(batches, callback) {
    async.eachSeries(batches, function(batch, cb) {
        crawlBatch(batch, function() {
            return cb();
        });
    }, function () {
        return callback();
    });
};

/**
 * Save links to a text file.
 */
var saveLinks = function(links) {
    fs.appendFile(OUTPUTFILE, links.join('\n'), function(err) {
        if (err) {
          console.error(err);
          process.exit(1);
        }
    });
}

/**
 * Crawl a given URL. Get links contained in that URL and crawl those links
 */
var crawl = function(url, callback) {
    console.log(url);

    getRelatedLinks(url, function(err, links) {
        if (err) {
            console.error(err);
            return callback();
        }
        links = filterLinks(links);
        if (links.length == 0) {
            return callback();
        }

        saveLinks(links);

        // divide links into batches.
        var batches = batchify(links);
        crawlBatches(batches, function() {
            return callback();
        });
    });
};

// Accept initial URL from command line. 1st positionl argument will be the name
// of initial URL.
var args = process.argv;
if (args.length < 3) {
    console.error("Initial URL not provided");
    process.exit(1);
}

// delete old file.
try {
    fs.unlinkSync(OUTPUTFILE);
} catch(e) { }

// start crawling.
crawl(args[2], function() {
    console.log('Execution completed.')
});
