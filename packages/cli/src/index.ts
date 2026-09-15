#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { scan, createFetchFetcher, type ScanOptions, type ScanResult } from "@wplens/core";
import { formatReport, formatHtml, setColor } from "./format.js";

const VERSION = "0.1.0";

interface CliArgs {
  urls: string[];
  input?: string;
  html?: string;
  json: boolean;
  active: boolean;
  users: boolean;
  color: boolean;
  timeout?: number;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    urls: [],
    json: false,
    active: false,
    users: false,
    color: process.stdout.isTTY === true && !process.env.NO_COLOR,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--json": args.json = true; break;
      case "-a":
      case "--active": args.active = true; break;
      case "--users": args.users = true; break;
      case "--no-color": args.color = false; break;
      case "--color": args.color = true; break;
      case "-h":
      case "--help": args.help = true; break;
      case "-V":
      case "--version": args.version = true; break;
      case "-t":
      case "--timeout": args.timeout = Number(argv[++i]); break;
      case "-i":
      case "--input": args.input = argv[++i]; break;
      case "-o":
      case "--html": args.html = argv[++i]; break;
      default:
        if (a.startsWith("-") && a !== "-") {
          process.stderr.write(`Unknown option: ${a}\n`);
          process.exit(2);
        } else {
          args.urls.push(a);
        }
    }
  }
  return args;
}

const HELP = `
wplens ${VERSION} - fast WordPress stack profiler

USAGE
  wplens <url> [more urls...] [options]
  wpl <url> [options]                     (short alias)

INPUT
  <url> ...              One or more targets
  -i, --input <file>     Read targets from a file (one per line, '#' = comment).
                         Use '-' to read from stdin.

OUTPUT
      --json             Emit raw JSON (an array when multiple targets)
  -o, --html <file>      Also write a standalone HTML report to <file>
      --no-color         Disable colored output

SCAN
  -a, --active           Active mode: read readme.txt/style.css for exact
                         versions, probe sitemap, login page and debug.log
      --users            Attempt REST-API user enumeration (authorised sites only)
  -t, --timeout <ms>     Per-request timeout (default 10000)

  -h, --help             Show this help
  -V, --version          Show version

EXAMPLES
  wplens example.com
  wplens example.com --active --html client-report.html
  wplens -i sites.txt --active --json > results.json
  cat sites.txt | wplens -i - --active

Passive mode is the default and stays polite (a handful of requests).
Only scan sites you own or are authorised to test.
`;

/** Collect targets from positional args and/or --input (file or stdin). */
function collectTargets(args: CliArgs): string[] {
  const targets = [...args.urls.filter((u) => u !== "-")];
  if (args.input) {
    const raw =
      args.input === "-"
        ? readFileSync(0, "utf8")
        : readFileSync(args.input, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.replace(/#.*$/, "").trim();
      if (t) targets.push(t);
    }
  }
  // De-duplicate while preserving order.
  return [...new Set(targets)];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    process.stdout.write(VERSION + "\n");
    return;
  }

  const targets = args.help ? [] : collectTargets(args);
  if (args.help || targets.length === 0) {
    process.stdout.write(HELP);
    process.exit(targets.length ? 0 : 1);
  }

  setColor(args.color);

  const options: ScanOptions = {
    mode: args.active ? "active" : "passive",
    enumerateUsers: args.users,
    timeoutMs: args.timeout,
  };
  const fetcher = createFetchFetcher({ defaultTimeoutMs: args.timeout ?? 10000 });
  const multi = targets.length > 1;

  const results: ScanResult[] = [];
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const prefix = multi ? `[${i + 1}/${targets.length}] ` : "";
    const onProgress = args.json
      ? undefined
      : (msg: string) =>
          process.stderr.write(`\x1b[90m… ${prefix}${target} — ${msg}\x1b[0m\r\x1b[K`);
    try {
      const r = await scan(target, fetcher, { ...options, onProgress });
      results.push(r);
      if (!args.json) {
        process.stderr.write("\r\x1b[K");
        if (!multi) process.stdout.write(formatReport(r) + "\n");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`\x1b[31m× ${target}: ${msg}\x1b[0m\n`);
    }
  }

  // Batch summary for multiple targets (pretty mode).
  if (multi && !args.json) process.stdout.write(batchSummary(results) + "\n");

  if (args.json) {
    process.stdout.write(JSON.stringify(multi ? results : results[0], null, 2) + "\n");
  }

  if (args.html) {
    writeFileSync(args.html, formatHtml(results), "utf8");
    process.stderr.write(`\x1b[32m✓ HTML report written to ${args.html}\x1b[0m\n`);
  }

  const reachable = results.filter((r) => r.homeStatus !== 0).length;
  process.exit(reachable > 0 ? 0 : 1);
}

/** Compact one-line-per-site summary table for batch runs. */
function batchSummary(results: ScanResult[]): string {
  const rows = results.map((r) => {
    const wp = r.homeStatus === 0 ? "unreachable" : r.isWordPress ? "WP" : "not WP";
    const ver = r.wpVersion?.value ?? "-";
    const host = new URL(r.finalUrl).host;
    return `  ${host.padEnd(30)} ${wp.padEnd(12)} ${String(ver).padEnd(10)} ${r.plugins.length} plugins`;
  });
  return `\nSummary (${results.length})\n` + rows.join("\n");
}

main();
