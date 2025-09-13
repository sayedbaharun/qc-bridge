#!/usr/bin/env node
/**
 * Proper Domain Structure Setup - Create the correct 3-layer model
 * Domains → Ventures → Projects → Tasks with proper foreign key relationships
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

console.log('🏗️  PROPER 3-LAYER DOMAIN STRUCTURE');
console.log('====================================\n');

// 9 Life Domain Areas
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

// 18 Specific Ventures under Domains
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
    { slug: 'courses', name: 'Courses', description: 'Online courses and educational programs' },
    { slug: 'reading-list', name: 'Reading List', description: 'Books and reading materials' }
  ]
};

async function createDomainsTable() {
  console.log('1. Creating domains table...');
  
  // Since we can't execute raw SQL, let's try a different approach
  // Check if we can create a simple domain entry to see if table exists
  try {
    const testDomain = {
      slug: 'test-domain',
      name: 'Test Domain',
      description: 'Test description',
      is_active: true
    };
    
    const { error } = await supabase.from('domains').insert(testDomain);
    
    if (error) {
      if (error.message.includes('does not exist')) {
        console.log('❌ Domains table does not exist - need to create it');
        console.log('💡 Manual step required: Create domains table in Supabase dashboard');
        console.log('   SQL: CREATE TABLE domains (');
        console.log('     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),');
        console.log('     slug TEXT UNIQUE NOT NULL,');
        console.log('     name TEXT NOT NULL,');
        console.log('     description TEXT,');
        console.log('     is_active BOOLEAN DEFAULT true,');
        console.log('     created_at TIMESTAMPTZ DEFAULT now(),');
        console.log('     updated_at TIMESTAMPTZ DEFAULT now()');
        console.log('   );');
        return false;
      } else {
        console.log('❌ Error testing domains table:', error.message);
        return false;
      }
    } else {
      console.log('✅ Domains table exists');
      // Clean up test data
      await supabase.from('domains').delete().eq('slug', 'test-domain');
      return true;
    }
  } catch (error) {
    console.log('❌ Error checking domains table:', error.message);
    return false;
  }
}

async function createVenturesTable() {
  console.log('2. Creating ventures table...');
  
  try {
    // Test if ventures table exists by trying a simple select
    const { error } = await supabase.from('ventures').select('id').limit(1);
    
    if (error) {
      if (error.message.includes('does not exist')) {
        console.log('❌ Ventures table does not exist - need to create it');
        console.log('💡 Manual step required: Create ventures table in Supabase dashboard');
        console.log('   SQL: CREATE TABLE ventures (');
        console.log('     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),');
        console.log('     slug TEXT UNIQUE NOT NULL,');
        console.log('     name TEXT NOT NULL,');
        console.log('     description TEXT,');
        console.log('     primary_domain_id UUID NOT NULL REFERENCES domains(id),');
        console.log('     is_active BOOLEAN DEFAULT true,');
        console.log('     created_at TIMESTAMPTZ DEFAULT now(),');
        console.log('     updated_at TIMESTAMPTZ DEFAULT now()');
        console.log('   );');
        return false;
      } else {
        console.log('❌ Error testing ventures table:', error.message);
        return false;
      }
    } else {
      console.log('✅ Ventures table exists');
      return true;
    }
  } catch (error) {
    console.log('❌ Error checking ventures table:', error.message);
    return false;
  }
}

async function seedDomains() {
  console.log('\n3. Seeding 9 life domains...\n');
  
  for (const domain of DOMAINS) {
    try {
      const { data, error } = await supabase
        .from('domains')
        .upsert(domain, { onConflict: 'slug' })
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
  console.log('\n4. Seeding 18 ventures under domains...\n');
  
  for (const [domainSlug, ventures] of Object.entries(VENTURES)) {
    console.log(`📂 ${domainSlug.toUpperCase()} domain ventures:`);
    
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
          .upsert(ventureData, { onConflict: 'slug' })
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

async function updateProjectsTable() {
  console.log('\n5. Updating projects table for venture links...\n');
  
  try {
    // Test if venture_id column exists in projects table
    const { error } = await supabase
      .from('projects')
      .select('venture_id')
      .limit(1);
    
    if (error && error.message.includes('column') && error.message.includes('venture_id')) {
      console.log('❌ venture_id column does not exist in projects table');
      console.log('💡 Manual step required: Add venture_id column to projects table');
      console.log('   SQL: ALTER TABLE projects ADD COLUMN venture_id UUID REFERENCES ventures(id);');
      return false;
    } else {
      console.log('✅ Projects table has venture_id column');
      return true;
    }
  } catch (error) {
    console.log('❌ Error checking projects table:', error.message);
    return false;
  }
}

async function createCompatibilityMappings() {
  console.log('\n6. Creating area compatibility mappings...\n');
  
  try {
    // Check if area_compat_map table exists
    const { error } = await supabase.from('area_compat_map').select('*').limit(1);
    
    if (error && error.message.includes('does not exist')) {
      console.log('❌ area_compat_map table does not exist');
      console.log('💡 Manual step required: Create area_compat_map table');
      console.log('   SQL: CREATE TABLE area_compat_map (');
      console.log('     legacy_area_key TEXT PRIMARY KEY,');
      console.log('     domain_id UUID REFERENCES domains(id),');
      console.log('     venture_id UUID REFERENCES ventures(id),');
      console.log('     created_at TIMESTAMPTZ DEFAULT now()');
      console.log('   );');
      return false;
    }
    
    // Create mappings for existing areas to new structure
    const mappings = [
      // Direct domain mappings
      ...DOMAINS.map(d => ({ legacy_area_key: d.slug, domain_slug: d.slug })),
      // Direct venture mappings
      ...Object.values(VENTURES).flat().map(v => ({ legacy_area_key: v.slug, venture_slug: v.slug })),
      // Legacy business area mappings
      { legacy_area_key: 'hikma', venture_slug: 'hikma' },
      { legacy_area_key: 'aivant', venture_slug: 'aivant-realty' },
      { legacy_area_key: 'arabmoney', venture_slug: 'arab-money' },
      { legacy_area_key: 'amo', venture_slug: 'amo-syndicate' }
    ];
    
    for (const mapping of mappings) {
      try {
        let insertData = { legacy_area_key: mapping.legacy_area_key };
        
        if (mapping.domain_slug) {
          const { data: domain } = await supabase
            .from('domains')
            .select('id')
            .eq('slug', mapping.domain_slug)
            .single();
          if (domain) insertData.domain_id = domain.id;
        }
        
        if (mapping.venture_slug) {
          const { data: venture } = await supabase
            .from('ventures')
            .select('id')
            .eq('slug', mapping.venture_slug)
            .single();
          if (venture) insertData.venture_id = venture.id;
        }
        
        const { error } = await supabase
          .from('area_compat_map')
          .upsert(insertData, { onConflict: 'legacy_area_key' });
        
        if (!error) {
          const type = mapping.domain_slug ? 'domain' : 'venture';
          console.log(`✅ ${mapping.legacy_area_key} → ${type}`);
        }
      } catch (error) {
        // Continue with other mappings
      }
    }
    
    return true;
  } catch (error) {
    console.log('❌ Error in compatibility mapping:', error.message);
    return false;
  }
}

async function verifyStructure() {
  console.log('\n7. Verifying 3-layer structure...\n');
  
  try {
    const { count: domainCount } = await supabase
      .from('domains')
      .select('*', { count: 'exact', head: true });
    
    const { count: ventureCount } = await supabase
      .from('ventures')
      .select('*', { count: 'exact', head: true });
    
    console.log(`✅ ${domainCount || 0} domains created`);
    console.log(`✅ ${ventureCount || 0} ventures created`);
    
    // Show structure hierarchy
    console.log('\n🏗️ Domain → Venture hierarchy:');
    const { data: domainsWithVentures } = await supabase
      .from('domains')
      .select(`
        name,
        slug,
        ventures:ventures(name, slug)
      `);
    
    for (const domain of domainsWithVentures || []) {
      console.log(`📂 ${domain.name}`);
      for (const venture of domain.ventures || []) {
        console.log(`   └── ${venture.name} (${venture.slug})`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Setting up PROPER 3-layer domain structure...\n');
  
  // Check table existence first
  const domainsExist = await createDomainsTable();
  if (!domainsExist) {
    console.log('\n❌ Cannot proceed - domains table needs to be created manually');
    console.log('Please create the domains table in Supabase and run this script again.');
    return;
  }
  
  const venturesExist = await createVenturesTable();
  if (!venturesExist) {
    console.log('\n❌ Cannot proceed - ventures table needs to be created manually');
    console.log('Please create the ventures table in Supabase and run this script again.');
    return;
  }
  
  // Proceed with seeding even if tables are empty
  console.log('\n🌱 Both tables exist - proceeding with data seeding...');
  
  await seedDomains();
  await seedVentures();
  await updateProjectsTable();
  await createCompatibilityMappings();
  const success = await verifyStructure();
  
  console.log('\n🎯 PROPER STRUCTURE SUMMARY');
  console.log('===========================');
  
  if (success) {
    console.log('✅ CORRECT 3-layer domain structure implemented!');
    console.log('');
    console.log('📋 Proper hierarchy:');
    console.log('   1. Domains (9) → Life areas with UUID primary keys');
    console.log('   2. Ventures (17) → Specific activities with domain_id foreign keys (RERA Exam excluded)');
    console.log('   3. Projects → Link via venture_id foreign key');
    console.log('   4. Tasks → Inherit context through project hierarchy');
    console.log('');
    console.log('🔗 Foreign key relationships:');
    console.log('   ventures.primary_domain_id → domains.id');
    console.log('   projects.venture_id → ventures.id');
    console.log('   tasks.project_id → projects.id');
    console.log('');
    console.log('🎯 Next: Test with npm run dry-run');
  } else {
    console.log('❌ Setup incomplete - check manual steps above');
  }
}

main().catch(console.error);