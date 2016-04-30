/* global Y, ace */
'strict mode'

function updatePdfView () {
  document.querySelector('#view').src = window.location.pathname.slice(0, -4) + '.pdf'
}
updatePdfView()

Y({
  db: {
    name: 'memory'
  },
  connector: {
    name: 'websockets-client',
    room: window.location.pathname,
    url: window.location.host,
    debug: true
  },
  sourceDir: '/bower_components',
  share: {
    editor: 'Text'
  }
}).then(function (y) {
  window.y = y
  var editor = ace.edit('ace')
  editor.setTheme('ace/theme/chrome')
  editor.getSession().setMode('ace/mode/latex')
  y.share.editor.bindAce(editor)
  // create a shortcut to update the pdf view
  editor.commands.addCommand({
    name: "updatePdfView",
    bindKey: {win: "Ctrl-s", mac: "Command-s"},
    exec: updatePdfView
  })
})

window.setTimeout(function () {
  document.querySelector('#tooltip').remove()
}, 10000)
