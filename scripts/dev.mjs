import {spawn} from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectDirectory = path.resolve(scriptDirectory, '..')
const publicPort = 8888

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once('error', () => resolve(false))
    server.listen({port, exclusive: true}, () => {
      server.close(() => resolve(true))
    })
  })
}

async function findAvailableTargetPort(startPort = 3999, attempts = 100) {
  for (let port = startPort; port < startPort + attempts; port += 1) {
    if (await canListen(port)) return port
  }

  throw new Error(`Could not find a free Netlify target port from ${startPort}.`)
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectDirectory,
      env: process.env,
      stdio: 'inherit',
    })

    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} was stopped by ${signal}.`))
        return
      }

      if (code !== 0) {
        reject(new Error(`${command} failed with exit code ${code}.`))
        return
      }

      resolve()
    })
  })
}

async function start() {
  if (!(await canListen(publicPort))) {
    throw new Error(
      `Port ${publicPort} is already in use. Career Unified may already be running at http://localhost:${publicPort}/.`,
    )
  }

  const targetPort = await findAvailableTargetPort()

  await run(process.execPath, [path.join(scriptDirectory, 'build-cv-generator.mjs')])

  console.log(`\nStarting Career Unified at http://localhost:${publicPort}/`)
  console.log(`Netlify internal target port: ${targetPort}\n`)

  const netlifyCli = path.join(projectDirectory, 'node_modules', 'netlify-cli', 'bin', 'run.js')
  const staticServerCommand = `node scripts/static-server.mjs --port ${targetPort}`
  await run(process.execPath, [
    netlifyCli,
    'dev',
    '--command',
    staticServerCommand,
    '--functions',
    'netlify/functions',
    '--port',
    String(publicPort),
    '--target-port',
    String(targetPort),
    '--no-open',
  ])
}

start().catch((error) => {
  console.error(`\nCould not start Career Unified locally: ${error.message}`)
  process.exitCode = 1
})
