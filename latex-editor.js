#!/usr/bin/env node
/* global process, global, __dirname */
'use strict'

var path = require('path')
var fs = require('fs-extra')
var exec = require('child_process').exec
var express = require('express')
var app = express()
var server = require('http').createServer(app)
var io = require('socket.io')(server)

app.set('views', path.join(__dirname, 'views'))
app.use('/bower_components', express.static(path.join(__dirname, 'bower_components')))
app.use('*', function (req, res, next) {
  // sanitize and validate path
  var _location = path.normalize(req.params[0])
  if (_location.endsWith('/') || _location.endsWith('\\')) {
    _location = _location.slice(0, -1)
  }
  _location = path.join('/', _location)
  _location = _location.split('\\').join('/')

  var location = path.join(process.cwd(), _location)
  var ext = path.extname(location)
  // check for file type (dir or file)
  fs.stat(location, function (err, stats) {
    if (err != null && ext !== '.pdf') {
      // Note: we want to handle ext === '.pdf' later
      next()
    } else if (err == null && stats.isDirectory()) {
      fs.readdir(location, function (err, files) {
        if (err == null) {
          files = files.map(function (f) {
            return {
              href: path.join('/', _location, f),
              name: f
            }
          })
          if (_location.length > 1) {
            files.unshift({
              href: '..',
              name: '..'
            })
          }
          res.render('folder.jade', {files: files, folder: _location})
        } else {
          next()
        }
      })
    } else {
      // There is a file on _location, or there is no file but the extention is .pdf
      if (ext === '.tex') {
        // serve editor
        res.render('tex.jade', {})
      } else if (ext === '.pdf') {
        // if there is a .tex file too (with the same basename) we render tex first before serving
        var texfile = location.slice(0, -4) + '.tex'
        fs.stat(texfile, function (err, stats) {
          if (err != null) {
            // There is no tex file
            // just hand over to the static file server
            // if the pdf file doesnt exist the next middleware will show an error
            next()
          } else {
            var executePdfLatex = function () {
              exec(`pdflatex -interaction=nonstopmode ${path.basename(location, '.pdf') + '.tex'}`, { cwd: path.dirname(location) }, function (error, stdout, stderr) {
                if (error != null) {
                  // send the .log file instead
                  res.redirect(path.join('/', _location.slice(0, -4) + '.log'))
                } else {
                  // send pdf file
                  next()
                }
              })
            }
            // check if the content already exitst in yInstances. If so, write the content to the tex file first
            var sharedContent = yInstances[path.join('/', (_location.slice(0, -4) + '.tex')).split('\\').join('/')]
            if (sharedContent != null) {
              sharedContent.then(function (y) {
                fs.writeFile(location.slice(0, -4) + '.tex', y.share.editor.toString(), executePdfLatex)
              })
            } else {
              executePdfLatex()
            }
          }
        })
      } else {
        next()
      }
    }
  })
})

// serve static files (i.e. pdf file, log files, ..)
app.use(express.static(process.cwd()))

/*
  Here we set up a yjs backend that saves the state and propagates messages.
  This is only a slight adaption of the default behavior of y-websockets-server
*/
var Y = require('yjs')
var yInstances = {}

function getInstanceOfY (room) {
  if (yInstances[room] == null) {
    yInstances[room] = Y({
      db: {
        name: 'memory'
      },
      connector: {
        name: 'websockets-server',
        room: room,
        io: io
      },
      share: {
        editor: 'Text'
      }
    }).then(function (y) {
      fs.readFile(path.join(process.cwd(), room), 'utf8', function (err, data) {
        if (err) {
          console.error(err)
        } else if (data != null) {
          y.share.editor.insert(0, data)
        }
      })
      return y
    })
  }
  return yInstances[room]
}

io.on('connection', function (socket) {
  var rooms = []
  socket.on('joinRoom', function (room) {
    console.log('User', socket.id, 'joins room:', room)
    socket.join(room)
    getInstanceOfY(room).then(function (y) {
      if (rooms.indexOf(room) === -1) {
        y.connector.userJoined(socket.id, 'slave')
        rooms.push(room)
      }
    })
  })
  socket.on('yjsEvent', function (msg) {
    if (msg.room != null) {
      getInstanceOfY(msg.room).then(function (y) {
        y.connector.receiveMessage(socket.id, msg)
      })
    }
  })
  socket.on('disconnect', function () {
    for (var i = 0; i < rooms.length; i++) {
      let room = rooms[i]
      getInstanceOfY(room).then(function (y) {
        var i = rooms.indexOf(room)
        if (i >= 0) {
          y.connector.userLeft(socket.id)
          rooms.splice(i, 1)
        }
      })
    }
  })
  socket.on('leaveRoom', function (room) {
    getInstanceOfY(room).then(function (y) {
      var i = rooms.indexOf(room)
      if (i >= 0) {
        y.connector.userLeft(socket.id)
        rooms.splice(i, 1)
      }
    })
  })
})

server.listen(3000)
console.log('Started server on instance on port 3000')
try {
  require('open')('http://localhost:3000')
} catch (err) {}
