#!/usr/bin/env node

/**
 * Market Data Fetcher
 * 
 * Fetches current market data for major indices:
 * - S&P 500 (^GSPC)
 * - Dow Jones Industrial Average (^DJI)
 * - NASDAQ Composite (^IXIC)
 * - Russell 2000 (^RUT)
 * 
 * Uses Yahoo Finance public API (no API key required)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const SYMBOLS = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^DJI', name: 'Dow Jones Industrial Average' },
  { symbol: '^IXIC', name: 'NASDAQ Composite' },
  { symbol: '^RUT', name: 'Russell 2000' },
  { symbol: '^VIX', name: 'CBOE Volatility Index (VIX)' }
];

const OUTPUT_DIR = path.join(__dirname, '..', 'workspace', 'market-data');
const LOG_FILE = path.join(OUTPUT_DIR, 'fetch.log');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Log a message with timestamp
 */
function log(message, isError = false) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  // Append to log file
  fs.appendFileSync(LOG_FILE, logMessage);
  
  // Also output to console
  if (isError) {
    console.error(logMessage.trim());
  } else {
    console.log(logMessage.trim());
  }
}

/**
 * Get current date info for Pacific timezone
 */
function getPacificDateInfo() {
  const now = new Date();
  
  // Format for Pacific timezone
  const pacificFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  
  const pacificDate = pacificFormatter.format(now);
  
  // Get day of week in Pacific time
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short'
  });
  const dayOfWeek = dayFormatter.format(now);
  
  // Get date string for filename (YYYY-MM-DD in Pacific)
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const dateString = dateFormatter.format(now);
  
  return {
    fullDate: pacificDate,
    dayOfWeek,
    dateString,
    isWeekend: dayOfWeek === 'Sat' || dayOfWeek === 'Sun'
  };
}

/**
 * Fetch quote data from Yahoo Finance
 */
function fetchQuote(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };
    
    https.get(url, options, (res) => {
      let data = '';
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          
          if (json.chart && json.chart.result && json.chart.result[0]) {
            const result = json.chart.result[0];
            const meta = result.meta;
            const indicators = result.indicators;
            
            // Get current price
            const currentPrice = meta.regularMarketPrice;
            
            // Try to get previous close from meta, or calculate from quote data
            let previousClose = meta.previousClose || meta.chartPreviousClose;
            
            // If no previous close in meta, try to get from quote data
            if (!previousClose && indicators && indicators.quote && indicators.quote[0]) {
              const closes = indicators.quote[0].close;
              if (closes && closes.length >= 2) {
                // Get second-to-last valid close
                for (let i = closes.length - 2; i >= 0; i--) {
                  if (closes[i] !== null) {
                    previousClose = closes[i];
                    break;
                  }
                }
              }
            }
            
            // Calculate change
            let change = 0;
            let changePercent = 0;
            
            if (previousClose && !isNaN(previousClose)) {
              change = currentPrice - previousClose;
              changePercent = (change / previousClose) * 100;
            }
            
            resolve({
              symbol: meta.symbol,
              price: currentPrice,
              previousClose: previousClose || 0,
              change: change,
              changePercent: changePercent,
              marketState: meta.marketState || 'UNKNOWN',
              exchangeName: meta.exchangeName || '',
              currency: meta.currency || 'USD'
            });
          } else {
            reject(new Error(`Invalid response for ${symbol}`));
          }
        } catch (e) {
          reject(new Error(`Parse error for ${symbol}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Format number with commas and decimals
 */
function formatNumber(num, decimals = 2) {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Format change with arrow indicator
 */
function formatChange(change, percent) {
  const arrow = change >= 0 ? '▲' : '▼';
  const sign = change >= 0 ? '+' : '';
  return `${arrow} ${sign}${formatNumber(change)} (${sign}${formatNumber(percent)}%)`;
}

/**
 * Main function
 */
async function main() {
  log('=== Starting Market Data Fetch ===');
  
  const dateInfo = getPacificDateInfo();
  log(`Pacific Time: ${dateInfo.fullDate}`);
  
  // Check for weekend
  if (dateInfo.isWeekend) {
    log(`Today is ${dateInfo.dayOfWeek} - Markets are closed for the weekend`);
    log('Fetching last available data...');
  }
  
  const results = [];
  const errors = [];
  
  // Fetch all symbols
  for (const { symbol, name } of SYMBOLS) {
    try {
      log(`Fetching ${name} (${symbol})...`);
      const quote = await fetchQuote(symbol);
      results.push({ name, ...quote });
      log(`  ${name}: ${formatNumber(quote.price)} ${formatChange(quote.change, quote.changePercent)}`);
    } catch (error) {
      errors.push({ name, symbol, error: error.message });
      log(`  ERROR fetching ${name}: ${error.message}`, true);
    }
  }
  
  // Generate markdown report
  let markdown = `# Daily Market Report\n\n`;
  markdown += `**Generated:** ${dateInfo.fullDate} (Pacific Time)  \n`;
  markdown += `**UTC Time:** ${new Date().toISOString()}\n\n`;
  
  if (dateInfo.isWeekend) {
    markdown += `> ⚠️ **Weekend Notice:** Markets are closed. Data shown is from last trading day.\n\n`;
  }
  
  markdown += `## Major Indices\n\n`;
  markdown += `| Index | Price | Change | % Change | Status |\n`;
  markdown += `|-------|------:|-------:|---------:|--------|\n`;
  
  for (const result of results) {
    const changeSign = result.change >= 0 ? '+' : '';
    const emoji = result.change >= 0 ? '🟢' : '🔴';
    markdown += `| ${result.name} | ${formatNumber(result.price)} | ${changeSign}${formatNumber(result.change)} | ${changeSign}${formatNumber(result.changePercent)}% | ${emoji} ${result.marketState} |\n`;
  }
  
  if (errors.length > 0) {
    markdown += `\n## Errors\n\n`;
    for (const err of errors) {
      markdown += `- **${err.name}** (${err.symbol}): ${err.error}\n`;
    }
  }
  
  markdown += `\n---\n\n`;
  markdown += `*Data source: Yahoo Finance*  \n`;
  markdown += `*This report is automatically generated at 5:00 AM Pacific Time daily.*\n`;
  
  // Save to date-stamped file
  const dailyFile = path.join(OUTPUT_DIR, `${dateInfo.dateString}.md`);
  fs.writeFileSync(dailyFile, markdown);
  log(`Saved daily report to: ${dailyFile}`);
  
  // Also save to latest.md for easy access
  const latestFile = path.join(OUTPUT_DIR, 'latest.md');
  fs.writeFileSync(latestFile, markdown);
  log(`Updated latest.md`);
  
  // Summary
  log(`=== Fetch Complete ===`);
  log(`  Successful: ${results.length}/${SYMBOLS.length}`);
  log(`  Errors: ${errors.length}`);
  
  if (errors.length > 0) {
    process.exit(1);
  }
}

// Run
main().catch(err => {
  log(`FATAL ERROR: ${err.message}`, true);
  process.exit(1);
});
