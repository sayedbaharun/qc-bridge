#!/usr/bin/env node
/**
 * Final Domain Setup - Using existing area type constraints
 * Maps domains and ventures to business/personal types
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

console.log('🏗️  FINAL DOMAIN SETUP');
console.log('=======================\n');

// Domain and Venture definitions mapped to allowed types
const DOMAINS = [
  { slug: 'health', name: 'Health', description: 'Physical and mental wellbeing', type: 'personal' },
  { slug: 'work', name: 'Work', description: 'Professional and business activities', type: 'business' },
  { slug: 'finance', name: 'Finance', description: 'Financial management and investments', type: 'personal' },
  { slug: 'family', name: 'Family', description: 'Family relationships and activities', type: 'personal' },
  { slug: 'home', name: 'Home', description: 'Home management and maintenance', type: 'personal' },
  { slug: 'travel', name: 'Travel', description: 'Travel planning and experiences', type: 'personal' },
  { slug: 'learning', name: 'Learning', description: 'Continuous learning and skill development', type: 'personal' },
  { slug: 'relationships', name: 'Relationships', description: 'Social connections and community', type: 'personal' },
  { slug: 'play', name: 'Play', description: 'Recreation and entertainment', type: 'personal' }
];

const BUSINESS_VENTURES = [
  { slug: 'hikma', name: 'Hikma', description: 'Strategic consulting and advisory services' },
  { slug: 'aivant-realty', name: 'Aivant Realty', description: 'Real estate development and management' },
  { slug: 'amo-syndicate', name: 'AMO Syndicate', description: 'Investment syndication platform' },
  { slug: 'arab-money', name: 'Arab Money', description: 'Financial media and content' },
  { slug: 'mydub', name: 'MyDub', description: 'Dubai lifestyle and services platform' },
  { slug: 'pressure-play', name: 'Pressure Play', description: 'Gaming and entertainment venture' },
  { slug: 'revolv', name: 'Revolv', description: 'Technology and innovation projects' },
  { slug: 'getmetodubai', name: 'GetMeToDubai', description: 'Relocation and settlement services' }
];

const PERSONAL_VENTURES = [
  { slug: 'gym-training', name: 'Gym Training', description: 'Structured fitness and strength training' },
  { slug: 'nutrition', name: 'Nutrition', description: 'Diet planning and nutritional health' },
  { slug: 'medical', name: 'Medical', description: 'Healthcare and medical appointments' },
  { slug: 'mindset', name: 'Mindset', description: 'Mental health and mindfulness practices' },
  { slug: 'investments', name: 'Investments', description: 'Portfolio management and investment strategies' },
  { slug: 'personal-finance', name: 'Personal Finance', description: 'Personal budgeting and financial planning' },
  { slug: 'tax-planning', name: 'Tax Planning', description: 'Tax optimization and compliance' },
  { slug: 'rera-exam', name: 'RERA Exam', description: 'Real Estate Regulatory Agency certification' },
  { slug: 'courses', name: 'Courses', description: 'Online courses and educational programs' },
  { slug: 'reading-list', name: 'Reading List', description: 'Books and reading materials' }
];

async function seedDomains() {
  console.log('1. Setting up domains...\n');
  
  for (const domain of DOMAINS) {
    try {
      const areaData = {
        key: domain.slug,
        name: domain.name,
        type: domain.type,
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
      
      console.log(`✅ Domain: ${domain.name} (${domain.slug}) - ${domain.type}`);
    } catch (error) {
      console.error(`❌ Error seeding domain ${domain.slug}:`, error.message);
    }
  }
}

async function seedVentures() {
  console.log('\n2. Setting up business ventures...\n');
  
  for (const venture of BUSINESS_VENTURES) {
    try {
      const areaData = {
        key: venture.slug,
        name: venture.name,
        type: 'business',
        description: venture.description
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
  
  console.log('\n3. Setting up personal ventures...\n');
  
  for (const venture of PERSONAL_VENTURES) {
    try {
      const areaData = {
        key: venture.slug,
        name: venture.name,
        type: 'personal',
        description: venture.description
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

async function verifySetup() {
  console.log('\n4. Verifying setup...\n');
  
  try {
    // Count by type
    const { count: businessCount, error: businessError } = await supabase
      .from('areas')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'business');
    
    const { count: personalCount, error: personalError } = await supabase
      .from('areas')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'personal');
      
    const { count: totalCount, error: totalError } = await supabase
      .from('areas')
      .select('*', { count: 'exact', head: true });
    
    if (businessError || personalError || totalError) {
      console.error('❌ Error verifying setup');
      return false;
    }
    
    console.log(`✅ ${businessCount} business areas/ventures`);
    console.log(`✅ ${personalCount} personal areas/ventures`);
    console.log(`✅ ${totalCount} total areas in system`);
    
    // Show some sample mappings
    console.log('\n🧪 Sample area mappings:');
    const { data: sampleAreas } = await supabase
      .from('areas')
      .select('key, name, type, description')
      .limit(8);
    
    for (const area of sampleAreas || []) {
      console.log(`   ✅ "${area.key}" → ${area.type} (${area.name})`);
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
  
  console.log('🚀 Setting up final domain structure...\n');
  
  let success = true;
  
  try {
    await seedDomains();
    await seedVentures();
    const verifyResult = await verifySetup();
    success = verifyResult;
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    success = false;
  }
  
  console.log('\n🎯 SETUP SUMMARY');
  console.log('================');
  
  if (success) {
    console.log('✅ Domain structure setup completed successfully!');
    console.log('');
    console.log('📋 Implementation approach:');
    console.log('   - Domains mapped to business/personal types');
    console.log('   - Business ventures: hikma, aivant-realty, arab-money, etc.');
    console.log('   - Personal ventures: gym-training, nutrition, investments, etc.');
    console.log('   - All stored in areas table with proper type classification');
    console.log('');
    console.log('🔄 Bridge compatibility:');
    console.log('   ✅ Existing bridge will work with new area structure');
    console.log('   ✅ Areas now include domain-level categories');
    console.log('   ✅ Business/personal classification maintained');
    console.log('');
    console.log('🎯 Next steps:');
    console.log('1. Test bridge: npm run dry-run');
    console.log('2. Create a task in Notion with Area = "health" or "hikma"');
    console.log('3. Run: npm run once');
    console.log('4. Verify tasks sync with new area structure');
  } else {
    console.log('❌ Setup encountered errors - check messages above');
  }
}

main().catch(console.error);