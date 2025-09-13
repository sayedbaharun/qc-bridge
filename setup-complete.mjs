#!/usr/bin/env node
/**
 * Complete Domain Setup - Create tables and seed data
 * Run this after clean-slate to establish the new architecture
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

console.log('🏗️  COMPLETE DOMAIN SETUP');
console.log('==========================\n');

// Domain and Venture definitions
const DOMAINS = [
  { slug: 'health', name: 'Health', description: 'Physical and mental wellbeing' },
  { slug: 'work', name: 'Work', description: 'Professional and business activities' },
  { slug: 'finance', name: 'Finance', description: 'Financial management and investments' },
  { slug: 'family', name: 'Family', description: 'Family relationships and activities' },
  { slug: 'home', name: 'Home', description: 'Home management and maintenance' },
  { slug: 'travel', name: 'Travel', description: 'Travel planning and experiences' },
  { slug: 'learning', name: 'Learning', description: 'Continuous learning and skill development' },
  { slug: 'relationships', name: 'Relationships', description: 'Social connections and community' },
  { slug: 'play', name: 'Play', description: 'Recreation and entertainment' }
];

const VENTURES = {
  work: [
    { slug: 'hikma', name: 'Hikma', description: 'Strategic consulting and advisory services' },
    { slug: 'aivant-realty', name: 'Aivant Realty', description: 'Real estate development and management' },
    { slug: 'amo-syndicate', name: 'AMO Syndicate', description: 'Investment syndication platform' },
    { slug: 'arab-money', name: 'Arab Money', description: 'Financial media and content' },
    { slug: 'mydub', name: 'MyDub', description: 'Dubai lifestyle and services platform' },
    { slug: 'pressure-play', name: 'Pressure Play', description: 'Gaming and entertainment venture' },
    { slug: 'revolv', name: 'Revolv', description: 'Technology and innovation projects' },
    { slug: 'getmetodubai', name: 'GetMeToDubai', description: 'Relocation and settlement services' }
  ],
  health: [
    { slug: 'gym-training', name: 'Gym Training', description: 'Structured fitness and strength training' },
    { slug: 'nutrition', name: 'Nutrition', description: 'Diet planning and nutritional health' },
    { slug: 'medical', name: 'Medical', description: 'Healthcare and medical appointments' },
    { slug: 'mindset', name: 'Mindset', description: 'Mental health and mindfulness practices' }
  ],
  finance: [
    { slug: 'investments', name: 'Investments', description: 'Portfolio management and investment strategies' },
    { slug: 'personal-finance', name: 'Personal Finance', description: 'Personal budgeting and financial planning' },
    { slug: 'tax-planning', name: 'Tax Planning', description: 'Tax optimization and compliance' }
  ],
  learning: [
    { slug: 'rera-exam', name: 'RERA Exam', description: 'Real Estate Regulatory Agency certification' },
    { slug: 'courses', name: 'Courses', description: 'Online courses and educational programs' },
    { slug: 'reading-list', name: 'Reading List', description: 'Books and reading materials' }
  ]
};

async function createTables() {
  console.log('1. Creating basic table structure (if needed)...\n');
  
  try {
    // We'll create a simple mapping approach since we can't execute complex SQL
    // Let's just work with the existing tables and create our domain/venture data structure as simple inserts
    
    console.log('✅ Working with existing table structure');
    console.log('   - Will use manual data approach for domain/venture mapping');
    return true;
  } catch (error) {
    console.error('❌ Error in table setup:', error.message);
    return false;
  }
}

async function seedDomains() {
  console.log('\n2. Setting up domains (using areas table for storage)...\n');
  
  // We'll store domains in the areas table with a special type
  for (const domain of DOMAINS) {
    try {
      const areaData = {
        key: domain.slug,
        name: domain.name,
        type: 'domain',
        description: domain.description
      };
      
      const { data, error } = await supabase
        .from('areas')
        .upsert(areaData, { 
          onConflict: 'key',
          ignoreDuplicates: false 
        })
        .select()
        .single();
      
      if (error) {
        console.error(`❌ Failed to seed domain ${domain.slug}:`, error.message);
        continue;
      }
      
      console.log(`✅ Domain: ${domain.name} (${domain.slug})`);
    } catch (error) {
      console.error(`❌ Error seeding domain ${domain.slug}:`, error.message);
    }
  }
}

async function seedVentures() {
  console.log('\n3. Setting up ventures (using areas table for storage)...\n');
  
  for (const [domainSlug, ventures] of Object.entries(VENTURES)) {
    console.log(`📂 ${domainSlug.toUpperCase()} ventures:`);
    
    for (const venture of ventures) {
      try {
        const areaData = {
          key: venture.slug,
          name: venture.name,
          type: 'venture',
          description: venture.description,
          parent_domain: domainSlug // Store parent domain reference
        };
        
        const { data, error } = await supabase
          .from('areas')
          .upsert(areaData, { 
            onConflict: 'key',
            ignoreDuplicates: false 
          })
          .select()
          .single();
        
        if (error) {
          console.error(`❌ Failed to seed venture ${venture.slug}:`, error.message);
          continue;
        }
        
        console.log(`   ✅ ${venture.name} (${venture.slug})`);
      } catch (error) {
        console.error(`❌ Error seeding venture ${venture.slug}:`, error.message);
      }
    }
  }
}

async function createLegacyMappings() {
  console.log('\n4. Creating legacy area mappings...\n');
  
  // Get existing areas and update them to have proper domain/venture typing
  try {
    const { data: existingAreas, error } = await supabase
      .from('areas')
      .select('key, name, type');
    
    if (error) {
      console.error('❌ Error fetching existing areas:', error.message);
      return false;
    }
    
    console.log(`📋 Found ${existingAreas?.length || 0} existing areas...\n`);
    
    // Map existing business areas to work domain
    const businessAreas = existingAreas?.filter(a => 
      ['hikma', 'aivant', 'arabmoney', 'amo', 'mydub', 'pressure', 'revolv', 'getmetodubai'].includes(a.key)
    ) || [];
    
    for (const area of businessAreas) {
      try {
        let updatedType = 'venture';
        let parentDomain = 'work';
        
        // Map specific areas to their venture names
        let ventureSlug = area.key;
        if (area.key === 'aivant') ventureSlug = 'aivant-realty';
        if (area.key === 'arabmoney') ventureSlug = 'arab-money';
        if (area.key === 'amo') ventureSlug = 'amo-syndicate';
        
        const { error: updateError } = await supabase
          .from('areas')
          .update({ 
            type: updatedType,
            parent_domain: parentDomain,
            key: ventureSlug // Update key to match venture slug
          })
          .eq('key', area.key);
        
        if (updateError) {
          console.error(`❌ Failed to update area ${area.key}:`, updateError.message);
          continue;
        }
        
        console.log(`✅ ${area.key} → ${updatedType} under ${parentDomain}`);
      } catch (error) {
        console.error(`❌ Error updating area ${area.key}:`, error.message);
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error in legacy mapping:', error.message);
    return false;
  }
}

async function verifySetup() {
  console.log('\n5. Verifying setup...\n');
  
  try {
    // Count domains
    const { count: domainCount, error: domainError } = await supabase
      .from('areas')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'domain');
    
    // Count ventures
    const { count: ventureCount, error: ventureError } = await supabase
      .from('areas')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'venture');
      
    // Count total areas
    const { count: totalCount, error: totalError } = await supabase
      .from('areas')
      .select('*', { count: 'exact', head: true });
    
    if (domainError || ventureError || totalError) {
      console.error('❌ Error verifying setup');
      return false;
    }
    
    console.log(`✅ ${domainCount} domains created`);
    console.log(`✅ ${ventureCount} ventures created`);
    console.log(`✅ ${totalCount} total areas in system`);
    
    // Show some sample mappings
    console.log('\n🧪 Sample area mappings:');
    const { data: sampleAreas } = await supabase
      .from('areas')
      .select('key, name, type, parent_domain')
      .limit(5);
    
    for (const area of sampleAreas || []) {
      const parentInfo = area.parent_domain ? ` (under ${area.parent_domain})` : '';
      console.log(`   ✅ "${area.key}" → ${area.type}${parentInfo}`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    return false;
  }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE environment variables');
    process.exit(1);
  }
  
  console.log('🚀 Setting up complete domain structure...\n');
  
  // Step-by-step setup using existing areas table
  const success = await createTables() &&
                  await seedDomains() &&
                  await seedVentures() &&
                  await createLegacyMappings() &&
                  await verifySetup();
  
  console.log('\n🎯 SETUP SUMMARY');
  console.log('================');
  
  if (success) {
    console.log('✅ Domain structure setup completed successfully!');
    console.log('');
    console.log('📋 Implementation approach:');
    console.log('   - Used existing areas table with type classification');
    console.log('   - Domains stored as type="domain"');
    console.log('   - Ventures stored as type="venture" with parent_domain');
    console.log('   - Legacy areas updated with proper typing');
    console.log('');
    console.log('🔄 Bridge compatibility:');
    console.log('   ✅ Area types enable domain/venture resolution');
    console.log('   ✅ Parent domain mapping established');
    console.log('   ✅ Existing business areas classified properly');
    console.log('');
    console.log('🎯 Next steps:');
    console.log('1. Test bridge: npm run dry-run');
    console.log('2. Create a task in Notion with Area = "health" or "hikma"');
    console.log('3. Run: npm run once');
    console.log('4. Verify tasks are created with proper area classification');
  } else {
    console.log('❌ Setup encountered errors - check messages above');
  }
}

main().catch(console.error);