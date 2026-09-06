#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const targetUrl = process.env.TARGET_URL || 'http://localhost:3000/workspace';
const prompt = process.env.GOLDEN_PROMPT;
const clarification = process.env.GOLDEN_CLARIFICATION || '';
const outputPath = process.env.GOLDEN_OUTPUT || path.join(os.tmpdir(), 'golden-ui-result.json');
if (!prompt) {
  console.error('GOLDEN_PROMPT is required');
  process.exit(2);
}

const browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' });
try {
  const page = await browser.newPage();
  const startedAt = new Date().toISOString();
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  const composer = page.getByLabel('Agent message');
  await composer.fill(prompt);
  await page.getByRole('button', { name: /send|gửi|start agent thread/i }).click();

  const pending = page.getByRole('region', { name: 'Pending agent interrupt' });
  const clarificationCard = page.getByRole('region', { name: 'Pending agent interrupt' }).getByRole('group');
  let clarificationSeen = false;
  if (await pending.waitFor({ state: 'visible', timeout: Number(process.env.GOLDEN_WAIT_MS || 120000) }).then(() => true).catch(() => false)) {
    clarificationSeen = true;
    if (!clarification) throw new Error('Agent requested clarification but GOLDEN_CLARIFICATION is empty');
    const choice = clarificationCard.getByRole('button', { name: new RegExp(clarification, 'i') });
    if (await choice.count()) {
      await choice.first().click();
    } else {
      await pending.getByRole('button', { name: /khác/i }).click();
      await pending.getByLabel('Clarification answer').fill(clarification);
      await pending.getByRole('button', { name: /trả lời/i }).click();
    }
  }

  await page.locator('[data-agent-response-stack="true"]').last().waitFor({ state: 'visible', timeout: Number(process.env.GOLDEN_WAIT_MS || 120000) }).catch(() => {});
  const result = {
    prompt,
    clarification,
    clarificationSeen,
    url: page.url(),
    title: await page.title(),
    bodyText: (await page.locator('body').innerText()).slice(-12000),
    capturedAt: new Date().toISOString(),
  };
  await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await page.screenshot({ path: outputPath.replace(/\.json$/i, '.png'), fullPage: true });
  console.log(JSON.stringify({ outputPath, screenshot: outputPath.replace(/\.json$/i, '.png'), startedAt, clarificationSeen }));
} finally {
  await browser.close();
}
