import {createReadStream} from 'node:fs'
import {stat} from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectDirectory = path.resolve(scriptDirectory, '..')
const portArgumentIndex = process.argv.indexOf('--port')
const port = Number(portArgumentIndex >= 0 ? process.argv[portArgumentIndex + 1] : 3999)

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.xml', 'application/xml; charset=utf-8'],
])

function getRequestedPath(requestUrl = '/') {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname)
  const relativePath = pathname.replace(/^[/\\]+/, '')
  const resolvedPath = path.resolve(projectDirectory, relativePath)

  if (resolvedPath !== projectDirectory && !resolvedPath.startsWith(`${projectDirectory}${path.sep}`)) {
    return null
  }

  return resolvedPath
}

const server = http.createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, {'Content-Type': 'text/plain; charset=utf-8'})
    response.end('Method not allowed')
    return
  }

  try {
    let filePath = getRequestedPath(request.url)
    if (!filePath) {
      response.writeHead(403, {'Content-Type': 'text/plain; charset=utf-8'})
      response.end('Forbidden')
      return
    }

    let fileStats = await stat(filePath)
    if (fileStats.isDirectory()) {
      filePath = path.join(filePath, 'index.html')
      fileStats = await stat(filePath)
    }

    if (!fileStats.isFile()) throw new Error('Not a file')

    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': fileStats.size,
      'Content-Type': contentTypes.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream',
    })

    if (request.method === 'HEAD') {
      response.end()
      return
    }

    createReadStream(filePath).pipe(response)
  } catch {
    response.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'})
    response.end('Not found')
  }
})

server.listen(port, () => {
  console.log(`Career Unified static server listening on port ${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => process.exit(0)))
}
