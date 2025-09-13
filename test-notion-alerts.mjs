#!/usr/bin/env node
/**
 * Test script for Notion alerts functionality
 */

import { EnhancedLogger } from './enhanced-logger.mjs';
import dotenv from 'dotenv';

dotenv.config();

async function testNotionAlerts() {
  console.log('🧪 Testing Notion Alerts Integration');
  console.log('===================================\n');

  if (!process.env.NOTION_ALERTS_DATABASE_ID) {
    console.log('⚠️  NOTION_ALERTS_DATABASE_ID not set - alerts will be skipped');
    console.log('   Run npm run setup-notion first to create the alerts database\n');
  }

  const logger = new EnhancedLogger({
    level: 'debug',
    serviceName: 'qc-bridge-test',
    environment: 'testing',
    version: '2.1.0',
    enableNotionAlerts: true,
    notionToken: process.env.NOTION_TOKEN,
    notionAlertsDbId: process.env.NOTION_ALERTS_DATABASE_ID
  });

  console.log('Testing different alert levels...\n');

  // Test warning
  logger.warn('Test warning alert', {
    test: true,
    message: 'This is a test warning from the enhanced logger',
    correlation_id: 'test-001'
  });
  console.log('✅ Warning alert sent');

  // Wait a bit to avoid rate limits
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test error
  logger.error('Test error alert', {
    test: true,
    message: 'This is a test error from the enhanced logger',
    error: 'Simulated error for testing purposes',
    correlation_id: 'test-002'
  });
  console.log('✅ Error alert sent');

  // Wait a bit more
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test info (should not create alert)
  logger.info('Test info message', {
    test: true,
    message: 'This info message should NOT create a Notion alert'
  });
  console.log('✅ Info message logged (no alert expected)');

  console.log('\n🎯 Test Results:');
  console.log('- Check your Notion alerts database for 2 new entries');
  console.log('- Warning and Error alerts should be visible');
  console.log('- Info message should only appear in console logs');
  console.log('\n✅ Test completed!');
}

testNotionAlerts().catch(console.error);