var fs = require('fs')
var parse = require('parse-diff')
var pep440 = require('@renovate/pep440')

var diff = fs.readFileSync('/tmp/1.diff', 'utf8')

const PEP440_SUFFIXES =
  '[._-]?' +
  '((?!post)(?:beta|b|c|pre|RC|alpha|a|patch|pl|p|dev)(?:(?:[.-]?\\d+)*)?)?' +
  '([+-]?([0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*))?'

const PEP440_VERSION =
  '(\\d+)(?:\\.(\\d+))?(?:\\.(\\d+))?(?:\\.(\\d+))?' + PEP440_SUFFIXES +
  '(?:\\+[^\\s]+)?'

const SEMVER =
  '(0|[1-9]\\d*)\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)' +
  '(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)' +
  '(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?' +
  '(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?'

let verPattern = '__version__\\s*=\\s*(?:[\'"])([[:PEP440:]])(?:[\'"])'

let regexp = new RegExp(
  verPattern
    .replace('[[:PEP440:]]', PEP440_VERSION)
    .replace('[[:SEMVER:]]', SEMVER)
)

let newVersion = ''
let oldVersion = ''

for (const file of parse(diff)) {
  if (file.to == 'edgedb/_version.py') {
    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type == 'del') {
          const match = regexp.exec(change.content, 'g')
          if (match) {
            oldVersion = match[1]
          }
        }
        if (change.type == 'add') {
          const match = regexp.exec(change.content, 'g')
          if (match) {
            newVersion = match[1]
            break
          }
        }
      }

      if (newVersion !== '') {
        break
      }
    }
  }
}

console.log(pep440.explain(newVersion))