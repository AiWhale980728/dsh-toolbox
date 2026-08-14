#!/usr/bin/env node
import { runCli } from '../src/cli.js'

runCli(process.argv.slice(2)).catch(error => {
  process.stderr.write(`dsh-switchboard: ${error.message}\n`)
  if (error.transactionId) process.stderr.write(`transaction: ${error.transactionId}\n`)
  process.exitCode = 1
})

