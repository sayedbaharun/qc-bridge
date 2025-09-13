#!/usr/bin/env node
/**
 * Setup script to create enhanced Notion databases for QC Bridge management
 * Run this after creating the databases manually in Notion to verify structure
 */

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database schemas for QC Bridge management
const DATABASE_SCHEMAS = {
  systemAlerts: {
    name: "System Alerts",
    description: "Automated alerts from QC Bridge and other system components",
    properties: {
      "Title": { title: {} },
      "Level": { 
        select: { 
          options: [
            { name: "WARN", color: "yellow" },
            { name: "ERROR", color: "red" },
            { name: "FATAL", color: "red" }
          ]
        }
      },
      "Priority": {
        select: {
          options: [
            { name: "🔴 P1", color: "red" },
            { name: "🟡 P2", color: "yellow" },
            { name: "🟢 P3", color: "green" }
          ]
        }
      },
      "Service": { rich_text: {} },
      "Environment": {
        select: {
          options: [
            { name: "production", color: "red" },
            { name: "staging", color: "yellow" },
            { name: "development", color: "green" }
          ]
        }
      },
      "Error Details": { rich_text: {} },
      "Correlation ID": { rich_text: {} },
      "Status": {
        select: {
          options: [
            { name: "Open", color: "red" },
            { name: "Investigating", color: "yellow" },
            { name: "Resolved", color: "green" }
          ]
        }
      },
      "Created": { date: {} },
      "Resolved At": { date: {} },
      "Notes": { rich_text: {} }
    }
  },

  areasManagement: {
    name: "Areas Management",
    description: "Central management for all areas with templates and configurations",
    properties: {
      "Area Name": { title: {} },
      "Description": { rich_text: {} },
      "Color": {
        select: {
          options: [
            { name: "🔴 Business", color: "red" },
            { name: "🔵 Personal", color: "blue" },
            { name: "🟢 Health", color: "green" },
            { name: "🟡 Learning", color: "yellow" },
            { name: "🟣 Creative", color: "purple" }
          ]
        }
      },
      "Active": { checkbox: {} },
      "Project Count": { number: {} },
      "Task Count": { number: {} },
      "Created": { date: {} },
      "Last Activity": { date: {} },
      "Focus Slots": {
        multi_select: {
          options: [
            { name: "Deep Work", color: "blue" },
            { name: "Admin 1", color: "yellow" },
            { name: "Admin 2", color: "orange" },
            { name: "Learning", color: "green" },
            { name: "Creative", color: "purple" }
          ]
        }
      },
      "Default Priority": {
        select: {
          options: [
            { name: "🔴 P1", color: "red" },
            { name: "🟡 P2", color: "yellow" },
            { name: "🟢 P3", color: "green" }
          ]
        }
      }
    }
  },

  projectTemplates: {
    name: "Project Templates",
    description: "Standardized project templates for different types of work",
    properties: {
      "Template Name": { title: {} },
      "Area": {
        select: {
          options: [
            { name: "business", color: "red" },
            { name: "personal", color: "blue" },
            { name: "health", color: "green" },
            { name: "learning", color: "yellow" }
          ]
        }
      },
      "Description": { rich_text: {} },
      "Default Milestones": { rich_text: {} },
      "Estimated Duration": {
        select: {
          options: [
            { name: "1 week", color: "green" },
            { name: "2-4 weeks", color: "yellow" },
            { name: "1-3 months", color: "orange" },
            { name: "3+ months", color: "red" }
          ]
        }
      },
      "Complexity": {
        select: {
          options: [
            { name: "Simple", color: "green" },
            { name: "Medium", color: "yellow" },
            { name: "Complex", color: "red" }
          ]
        }
      },
      "Required Skills": { multi_select: {} },
      "Success Criteria": { rich_text: {} },
      "Usage Count": { number: {} },
      "Created": { date: {} },
      "Active": { checkbox: {} }
    }
  },

  dashboardView: {
    name: "Executive Dashboard",
    description: "High-level overview of system status and key metrics",
    properties: {
      "Metric": { title: {} },
      "Current Value": { number: {} },
      "Target Value": { number: {} },
      "Status": {
        select: {
          options: [
            { name: "🟢 On Track", color: "green" },
            { name: "🟡 At Risk", color: "yellow" },
            { name: "🔴 Behind", color: "red" }
          ]
        }
      },
      "Category": {
        select: {
          options: [
            { name: "Productivity", color: "blue" },
            { name: "System Health", color: "green" },
            { name: "Focus Areas", color: "purple" },
            { name: "Finance", color: "orange" }
          ]
        }
      },
      "Last Updated": { date: {} },
      "Trend": {
        select: {
          options: [
            { name: "📈 Improving", color: "green" },
            { name: "📊 Stable", color: "gray" },
            { name: "📉 Declining", color: "red" }
          ]
        }
      },
      "Notes": { rich_text: {} },
      "Auto Updated": { checkbox: {} }
    }
  }
};

async function createDatabase(parentPageId, schema) {
  try {
    console.log(`Creating database: ${schema.name}...`);
    
    const response = await notion.databases.create({
      parent: { page_id: parentPageId },
      title: [{ text: { content: schema.name } }],
      description: [{ text: { content: schema.description } }],
      properties: schema.properties
    });
    
    console.log(`✅ Created: ${schema.name}`);
    console.log(`   Database ID: ${response.id}`);
    return response.id;
    
  } catch (error) {
    console.error(`❌ Failed to create ${schema.name}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 QC Bridge Notion Database Setup');
  console.log('===================================\n');
  
  if (!process.env.NOTION_TOKEN) {
    console.error('❌ NOTION_TOKEN environment variable is required');
    process.exit(1);
  }
  
  const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
  if (!parentPageId) {
    console.error('❌ NOTION_PARENT_PAGE_ID environment variable is required');
    console.error('   Create a page in Notion and copy its ID from the URL');
    process.exit(1);
  }
  
  console.log('Creating enhanced Notion databases...\n');
  
  const databaseIds = {};
  
  // Create System Alerts database
  databaseIds.systemAlerts = await createDatabase(parentPageId, DATABASE_SCHEMAS.systemAlerts);
  
  // Create Areas Management database  
  databaseIds.areasManagement = await createDatabase(parentPageId, DATABASE_SCHEMAS.areasManagement);
  
  // Create Project Templates database
  databaseIds.projectTemplates = await createDatabase(parentPageId, DATABASE_SCHEMAS.projectTemplates);
  
  // Create Executive Dashboard
  databaseIds.dashboardView = await createDatabase(parentPageId, DATABASE_SCHEMAS.dashboardView);
  
  console.log('\n📋 Environment Variables to Add:');
  console.log('================================');
  
  if (databaseIds.systemAlerts) {
    console.log(`NOTION_ALERTS_DATABASE_ID=${databaseIds.systemAlerts}`);
  }
  if (databaseIds.areasManagement) {
    console.log(`NOTION_AREAS_DATABASE_ID=${databaseIds.areasManagement}`);
  }
  if (databaseIds.projectTemplates) {
    console.log(`NOTION_TEMPLATES_DATABASE_ID=${databaseIds.projectTemplates}`);
  }
  if (databaseIds.dashboardView) {
    console.log(`NOTION_DASHBOARD_DATABASE_ID=${databaseIds.dashboardView}`);
  }
  
  console.log('\n🎯 Next Steps:');
  console.log('1. Add the environment variables above to your .env file');
  console.log('2. Test the alerts system with: npm run dry-run');
  console.log('3. Create some sample data in the new databases');
  console.log('4. Set up views and filters in Notion for better workflow');
  
  console.log('\n✅ Setup complete!');
}

main().catch(console.error);