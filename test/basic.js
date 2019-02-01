var tape = require('tape')
var sodium = require('sodium-universal')
var create = require('./helpers/create')

tape('write and read', function (t) {
  var archive = create()

  archive.writeFile('/hello.txt', 'world', function (err) {
    t.error(err, 'no error')
    archive.readFile('/hello.txt', function (err, buf) {
      t.error(err, 'no error')
      t.same(buf, Buffer.from('world'))
      t.end()
    })
  })
})

tape('write and read, with encoding', function (t) {
  var archive = create()

  archive.writeFile('/hello.txt', 'world', { encoding: 'utf8' }, function (err) {
    t.error(err, 'no error')
    archive.readFile('/hello.txt', { encoding: 'utf8' }, function (err, str) {
      t.error(err, 'no error')
      t.same(str, 'world')
      t.end()
    })
  })
})

tape('write and read (2 parallel)', function (t) {
  t.plan(6)

  var archive = create()

  archive.writeFile('/hello.txt', 'world', function (err) {
    t.error(err, 'no error')
    archive.readFile('/hello.txt', function (err, buf) {
      t.error(err, 'no error')
      t.same(buf, Buffer.from('world'))
    })
  })

  archive.writeFile('/world.txt', 'hello', function (err) {
    t.error(err, 'no error')
    archive.readFile('/world.txt', function (err, buf) {
      t.error(err, 'no error')
      t.same(buf, Buffer.from('hello'))
    })
  })
})

tape('write and read (sparse)', function (t) {
  t.plan(2)

  var archive = create()
  archive.on('ready', function () {
    var clone = create(archive.key, {sparse: true})

    archive.writeFile('/hello.txt', 'world', function (err) {
      t.error(err, 'no error')
      var stream = clone.replicate()
      stream.pipe(archive.replicate()).pipe(stream)

      var readStream = clone.createReadStream('/hello.txt')
      readStream.on('data', function (data) {
        t.same(data.toString(), 'world')
      })
    })
  })
})

tape('write and unlink', function (t) {
  var archive = create()

  archive.writeFile('/hello.txt', 'world', function (err) {
    t.error(err, 'no error')
    archive.unlink('/hello.txt', function (err) {
      t.error(err, 'no error')
      archive.readFile('/hello.txt', function (err) {
        t.ok(err, 'had error')
        t.end()
      })
    })
  })
})

tape('root is always there', function (t) {
  var archive = create()

  archive.access('/', function (err) {
    t.error(err, 'no error')
    archive.readdir('/', function (err, list) {
      t.error(err, 'no error')
      t.same(list, [])
      t.end()
    })
  })
})

tape('provide keypair', function (t) {
  var publicKey = Buffer.allocUnsafe(sodium.crypto_sign_PUBLICKEYBYTES)
  var secretKey = Buffer.allocUnsafe(sodium.crypto_sign_SECRETKEYBYTES)

  sodium.crypto_sign_keypair(publicKey, secretKey)

  var archive = create(publicKey, {secretKey: secretKey})

  archive.on('ready', function () {
    t.ok(archive.writable)
    t.ok(archive.metadataFeed.writable)
    t.ok(archive.contentFeed.writable)
    t.ok(publicKey.equals(archive.key))

    archive.writeFile('/hello.txt', 'world', function (err) {
      t.error(err, 'no error')
      archive.readFile('/hello.txt', function (err, buf) {
        t.error(err, 'no error')
        t.same(buf, Buffer.from('world'))
        t.end()
      })
    })
  })
})

tape('write and read, no cache', function (t) {
  var archive = create({
    metadataStorageCacheSize: 0,
    contentStorageCacheSize: 0,
    treeCacheSize: 0
  })

  archive.writeFile('/hello.txt', 'world', function (err) {
    t.error(err, 'no error')
    archive.readFile('/hello.txt', function (err, buf) {
      t.error(err, 'no error')
      t.same(buf, Buffer.from('world'))
      t.end()
    })
  })
  var self = this
})

// TODO: Re-enable the following tests once the `download` and `fetchLatest` APIs are reimplemented.

tape.skip('download a version', function (t) {
  var src = create()
  src.on('ready', function () {
    t.ok(src.writable)
    t.ok(src.metadataFeed.writable)
    t.ok(src.contentFeed.writable)
    src.writeFile('/first.txt', 'number 1', function (err) {
      t.error(err, 'no error')
      src.writeFile('/second.txt', 'number 2', function (err) {
        t.error(err, 'no error')
        src.writeFile('/third.txt', 'number 3', function (err) {
          t.error(err, 'no error')
          t.same(src.version, 3)
          testDownloadVersion()
        })
      })
    })
  })

  function testDownloadVersion () {
    var clone = create(src.key, { sparse: true })
    clone.on('content', function () {
      t.same(clone.version, 3)
      clone.checkout(2).download(function (err) {
        t.error(err)
        clone.readFile('/second.txt', { cached: true }, function (err, content) {
          t.error(err, 'block not downloaded')
          t.same(content && content.toString(), 'number 2', 'content does not match')
          clone.readFile('/third.txt', { cached: true }, function (err, content) {
            t.same(err && err.message, 'Block not downloaded')
            t.end()
          })
        })
      })
    })
    var stream = clone.replicate()
    stream.pipe(src.replicate()).pipe(stream)
  }
})

tape.skip('closing a read-only, latest clone', function (t) {
  // This is just a sample key of a dead dat
  var clone = create('1d5e5a628d237787afcbfec7041a16f67ba6895e7aa31500013e94ddc638328d', {
    latest: true
  })
  clone.on('error', function (err) {
    t.fail(err)
  })
  clone.close(function (err) {
    t.error(err)
    t.end()
  })
})

tape('simple watch', function (t) {
  const db = create(null)

  var watchEvents = 0
  db.ready(err => {
    t.error(err, 'no error')
    db.watch('/a/path/', () => {
      if (++watchEvents === 2) {
        t.end()
      }
    })
    doWrites()
  })

  function doWrites () {
    db.writeFile('/a/path/hello', 't1', err => {
      t.error(err, 'no error')
      db.writeFile('/b/path/hello', 't2', err => {
        t.error(err, 'no error')
        db.writeFile('/a/path/world', 't3', err => {
          t.error(err, 'no error')
        })
      })
    })
  }
})

tape('simple checkout', function (t) {
  const drive = create(null)

  drive.writeFile('/hello', 'world', err => {
    t.error(err, 'no error')
    let version = drive.version
    drive.readFile('/hello', (err, data) => {
      t.error(err, 'no error')
      t.same(data, Buffer.from('world'))
      drive.unlink('/hello', err => {
        t.error(err, 'no error')
        drive.readFile('/hello', (err, data) => {
          t.true(err)
          t.same(err.code, 'ENOENT')
          testCheckout(version)
        })
      })
    })
  })

  function testCheckout (version) {
    let oldVersion = drive.checkout(version)
    oldVersion.readFile('/hello', (err, data) => {
      t.error(err, 'no error')
      t.same(data, Buffer.from('world'))
      t.end()
    })
  }
})

tape('can read a single directory', async function (t) {
  const drive = create(null)

  let files = ['a', 'b', 'c', 'd', 'e', 'f']
  let fileSet = new Set(files)

  for (let file of files) {
    await insertFile(file, 'a small file')
  }

  drive.readdir('/', (err, files) => {
    t.error(err, 'no error')
    for (let file of files) {
      t.true(fileSet.has(file), 'correct file was listed')
      fileSet.delete(file)
    }
    t.same(fileSet.size, 0, 'all files were listed')
    t.end()
  })

  function insertFile (name, content) {
    return new Promise((resolve, reject) => {
      drive.writeFile(name, content, err => {
        if (err) return reject(err)
        return resolve()
      })
    })
  }
})

tape('can stream a large directory', async function (t) {
  const drive = create(null)

  let files = new Array(1000).fill(0).map((_, idx) => '' + idx)
  let fileSet = new Set(files)

  for (let file of files) {
    await insertFile(file, 'a small file')
  }

  let stream = drive.createDirectoryStream('/')
  stream.on('data', ({ path, stat }) => {
    if (!fileSet.has(path)) {
      return t.fail('an incorrect file was streamed')
    }
    fileSet.delete(path)
  })
  stream.on('end', () => {
    t.same(fileSet.size, 0, 'all files were streamed')
    t.end()
  })

  function insertFile (name, content) {
    return new Promise((resolve, reject) => {
      drive.writeFile(name, content, err => {
        if (err) return reject(err)
        return resolve()
      })
    })
  }
})
