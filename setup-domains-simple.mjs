#!/usr/bin/env node
/**
 * Setup Domains Structure - Create the new 3-layer model (Simple Version)
 * Run this after clean-slate to establish the new architecture
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

console.log('🏗️  SETUP DOMAINS STRUCTURE (SIMPLE)');
console.log('=====================================\n');

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

async function seedDomains() {
  console.log('1. Seeding domains...\n');
  
  for (const domain of DOMAINS) {
    try {
      const { data, error } = await supabase
        .from('domains')
        .upsert(domain, { 
          onConflict: 'slug',
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
  console.log('\n2. Seeding ventures...\n');
  
  for (const [domainSlug, ventures] of Object.entries(VENTURES)) {
    console.log(`📂 ${domainSlug.toUpperCase()} ventures:`);
    
    // Get domain ID
    const { data: domain, error: domainError } = await supabase
      .from('domains')
      .select('id')
      .eq('slug', domainSlug)
      .single();
    
    if (domainError || !domain) {
      console.error(`❌ Domain ${domainSlug} not found`);
      continue;
    }
    
    for (const venture of ventures) {
      try {
        const ventureData = {
          ...venture,
          primary_domain_id: domain.id
        };
        
        const { data, error } = await supabase
          .from('ventures')
          .upsert(ventureData, { 
            onConflict: 'slug',
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

async function createCompatibilityMappings() {
  console.log('\n3. Creating area compatibility mappings...');
  
  // First, get all existing areas from your current areas table
  try {
    const { data: existingAreas, error } = await supabase
      .from('areas')
      .select('key, name, type');
    
    if (error) {
      console.error('❌ Error fetching existing areas:', error.message);
      return false;
    }
    
    console.log(`\n📋 Found ${existingAreas?.length || 0} existing areas to map...\n`);
    
    // Create mappings for existing areas
    for (const area of existingAreas || []) {
      try {
        let insertData = { legacy_area_key: area.key };
        
        // Map based on area key to new structure
        if (area.key === 'hikma') {
          const { data: venture } = await supabase.from('ventures').select('id').eq('slug', 'hikma').single();
          if (venture) insertData.venture_id = venture.id;
        } else if (area.key === 'aivant') {
          const { data: venture } = await supabase.from('ventures').select('id').eq('slug', 'aivant-realty').single();
          if (venture) insertData.venture_id = venture.id;
        } else if (area.key === 'arabmoney') {
          const { data: venture } = await supabase.from('ventures').select('id').eq('slug', 'arab-money').single();
          if (venture) insertData.venture_id = venture.id;
        } else if (area.key === 'amo') {
          const { data: venture } = await supabase.from('ventures').select('id').eq('slug', 'amo-syndicate').single();
          if (venture) insertData.venture_id = venture.id;
        } else if (['health', 'work', 'finance', 'family', 'home', 'travel', 'learning', 'relationships', 'play'].includes(area.key)) {
          // Map to domain
          const { data: domain } = await supabase.from('domains').select('id').eq('slug', area.key).single();
          if (domain) insertData.domain_id = domain.id;
        } else {
          // Default business areas to work domain
          if (area.type === 'business') {
            const { data: domain } = await supabase.from('domains').select('id').eq('slug', 'work').single();
            if (domain) insertData.domain_id = domain.id;
          } else {
            // Personal areas to relationships domain
            const { data: domain } = await supabase.from('domains').select('id').eq('slug', 'relationships').single();
            if (domain) insertData.domain_id = domain.id;
          }
        }
        
        const { error: insertError } = await supabase
          .from('area_compat_map')
          .upsert(insertData, { onConflict: 'legacy_area_key' });
        
        if (insertError) {
          console.error(`❌ Failed to create mapping for ${area.key}:`, insertError.message);
          continue;
        }
        
        const mappingType = insertData.venture_id ? 'venture' : 'domain';
        console.log(`✅ ${area.key} (${area.name}) → ${mappingType}`);
        
      } catch (error) {
        console.error(`❌ Error creating mapping for ${area.key}:`, error.message);
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error in compatibility mapping:', error.message);
    return false;
  }
}

async function verifySetup() {
  console.log('\n4. Verifying setup...\n');
  
  try {
    // Count domains
    const { count: domainCount, error: domainError } = await supabase
      .from('domains')
      .select('*', { count: 'exact', head: true });
    
    // Count ventures
    const { count: ventureCount, error: ventureError } = await supabase
      .from('ventures')
      .select('*', { count: 'exact', head: true });
      
    // Count mappings
    const { count: mappingCount, error: mappingError } = await supabase
      .from('area_compat_map')
      .select('*', { count: 'exact', head: true });
    
    if (domainError || ventureError || mappingError) {
      console.error('❌ Error verifying setup');
      return false;
    }
    
    console.log(`✅ ${domainCount} domains created`);
    console.log(`✅ ${ventureCount} ventures created`);
    console.log(`✅ ${mappingCount} compatibility mappings created`);
    
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
  
  console.log('🚀 Setting up the new 3-layer domain structure (Simple Version)...\n');
  
  // Step-by-step setup
  const success = await seedDomains() &&
                  await seedVentures() &&
                  await createCompatibilityMappings() &&
                  await verifySetup();
  
  console.log('\n🎯 SETUP SUMMARY');
  console.log('================');
  
  if (success) {
    console.log('✅ Domain structure setup completed successfully!');
    console.log('');
    console.log('📋 New structure:');
    console.log('   Domains (9) → Life areas like Health, Work, Finance');
    console.log('   Ventures (18) → Specific activities under domains');
    console.log('   Projects → Can link to ventures');
    console.log('   Tasks → Inherit area from project hierarchy');
    console.log('');
    console.log('🔄 Bridge compatibility:');
    console.log('   ✅ Area compatibility mappings created');
    console.log('   ✅ Existing areas mapped to new structure');
    console.log('');
    console.log('🎯 Next steps:');
    console.log('1. Test bridge: npm run dry-run');
    console.log('2. Create a task in Notion with Area = "health" or "hikma"');
    console.log('3. Run: npm run once');
    console.log('4. Check the database to see the new domain/venture structure');
  } else {
    console.log('❌ Setup encountered errors - check messages above');
  }
}

main().catch(console.error);